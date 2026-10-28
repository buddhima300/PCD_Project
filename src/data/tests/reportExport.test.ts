import { afterEach, expect, test, vi } from 'vitest';
import { read, utils } from 'xlsx';
import { exportReport } from '../../utils/reportExport';
import type { ReportResult } from '../../services/api';

const capture=vi.hoisted(()=>({pdf:new ArrayBuffer(0)}));
vi.mock('jspdf',async importOriginal=>{
  const actual=await importOriginal<typeof import('jspdf')>();
  return {...actual,jsPDF:function(options:ConstructorParameters<typeof actual.jsPDF>[0]){
    const doc=new actual.jsPDF(options);
    doc.save=(()=>{capture.pdf=doc.output('arraybuffer');return doc;}) as typeof doc.save;
    return doc;
  }};
});
afterEach(()=>vi.restoreAllMocks());
const report:ReportResult={columns:['Staff','Name','Hours'],rows:[['EMP-1','=Unsafe formula',8]],generatedAt:'2026-10-23T03:00:00Z',filters:{from:'2026-10-01',to:'2026-10-23'},summary:[{label:'Employees',value:1}],sections:[{title:'Inventory summary',columns:['Condition','Count'],rows:[['GOOD',1]]}]};

test('Excel workbook has complete records, typed numbers, literal strings and summary sheets',async()=>{
  let blob:Blob|undefined;
  vi.stubGlobal('URL',{createObjectURL:(b:Blob)=>{blob=b;return 'blob:report';},revokeObjectURL:vi.fn()});
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  await exportReport('employee-directory',report,'XLSX');
  const bytes=await new Promise<ArrayBuffer>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result as ArrayBuffer);reader.onerror=reject;reader.readAsArrayBuffer(blob!);});
  const book=read(bytes,{type:'array'});
  expect(book.SheetNames).toEqual(['Report','Summary','Inventory summary']);
  expect(book.Sheets.Report.C5.v).toBe(8);expect(book.Sheets.Report.B5.t).toBe('s');expect(book.Sheets.Report.B5.f).toBeUndefined();
  expect(utils.sheet_to_json(book.Sheets.Summary,{header:1})).toContainEqual(['Employees',1]);
  vi.unstubAllGlobals();
});

test('PDF is a real paginated document with reference-style sections, filters and totals',async()=>{
  await exportReport('employee-directory',{...report,columns:Array.from({length:15},(_,i)=>`Column ${i}`),rows:Array.from({length:100},(_,i)=>Array.from({length:15},(_,j)=>`Record ${i} value ${j}`))},'PDF');
  const pdf=new TextDecoder().decode(capture.pdf);
  expect(pdf.startsWith('%PDF-')).toBe(true);
  expect(pdf).toContain('PERFORMANCE SUMMARY');expect(pdf).toContain('DETAILED RECORDS');expect(pdf).toContain('PART 3 OF 3');expect(pdf).toContain('Page 1 of');expect(pdf).toContain('from: 2026-10-01');
  expect((pdf.match(/\/Type \/Page\b/g)??[]).length).toBeGreaterThan(3);
});

test('CSV escapes spreadsheet formulas, quotes and line breaks and includes summaries',async()=>{
  let blob:Blob|undefined;
  vi.stubGlobal('URL',{createObjectURL:(b:Blob)=>{blob=b;return 'blob:report';},revokeObjectURL:vi.fn()});
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  await exportReport('employee-directory',{...report,rows:[['EMP-1','=Unsafe formula',8],['EMP-2','A,"B"\r\nC',0]]},'CSV');
  const csv=await new Promise<string>(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.readAsText(blob!);});
  expect(csv).toContain("'=Unsafe formula");expect(csv).toContain('"A,""B""\r\nC"');expect(csv).toContain('Inventory summary');expect(csv).toContain('Employees,1');
  vi.unstubAllGlobals();
});

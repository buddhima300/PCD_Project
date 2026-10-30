import type { ReportKey } from '../data/reports';
import { reportDefinitions } from '../data/reports';
import type { ReportResult } from '../services/api';
import { downloadCsv } from './csv';

export type ReportFormat = 'PDF' | 'CSV' | 'XLSX';
function save(data:BlobPart,type:string,name:string) {
  const url=URL.createObjectURL(new Blob([data],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function exportReport(key:ReportKey,result:ReportResult,format:ReportFormat) {
  const definition=reportDefinitions.find(d=>d.key===key)!;
  const filename=`${key}-${result.generatedAt.slice(0,10)}`;
  const generated=new Date(result.generatedAt).toLocaleString('en-GB',{timeZone:'Asia/Colombo'});
  const filters=Object.entries(result.filters??{}).filter(([,v])=>v!==''&&v!==undefined&&v!==false).map(([k,v])=>`${k}: ${typeof v==='object'?JSON.stringify(v):v}`).join(' | ')||'All records';
  if(format==='CSV') {
    const rows=[...result.rows];
    if(result.summary?.length)rows.push([],['Summary'],['Metric','Value'],...result.summary.map(m=>[m.label,m.value]));
    for(const s of result.sections??[])rows.push([],[s.title],s.columns,...s.rows);
    downloadCsv(result.columns,rows,`${filename}.csv`);return;
  }
  if(format==='XLSX') {
    const {utils,write}=await import('xlsx');
    const book=utils.book_new();book.Props={Author:'PCD Operations',Title:definition.title,CreatedDate:new Date(result.generatedAt)};
    const add=(title:string,columns:string[],rows:Array<Array<string|number>>)=>{
      const sheet=utils.aoa_to_sheet([[definition.title],[`Generated ${generated} Asia/Colombo`],[filters],columns,...rows]);
      sheet['!cols']=columns.map(()=>({wch:24}));
      sheet['!autofilter']={ref:utils.encode_range({r:3,c:0},{r:rows.length+3,c:columns.length-1})};
      utils.book_append_sheet(book,sheet,title.slice(0,31));
    };
    add('Report',result.columns,result.rows);
    if(result.summary?.length)add('Summary',['Metric','Value'],result.summary.map(m=>[m.label,m.value]));
    result.sections?.forEach(s=>add(s.title,s.columns,s.rows));
    save(write(book,{bookType:'xlsx',type:'array'}),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',`${filename}.xlsx`);return;
  }
  const [{jsPDF},{default:autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')]);
  const logoResponse=await fetch(`${import.meta.env.BASE_URL}images/port-city-digital-logo.png`);
  if(!logoResponse.ok)throw new Error('The report logo could not be loaded. Please retry the download.');
  const logo=new Uint8Array(await logoResponse.arrayBuffer());
  const doc=new jsPDF({orientation:result.columns.length>6?'landscape':'portrait',unit:'mm',format:'a4'});
  const logoSize=doc.getImageProperties(logo);
  const width=doc.internal.pageSize.getWidth(),height=doc.internal.pageSize.getHeight();
  const orange:[number,number,number]=[255,90,0];
  const ink:[number,number,number]=[38,38,38];
  const orangeText:[number,number,number]=[163,54,0];
  const clean=(v:unknown)=>String(v??'').replace(/[\u2013\u2014]/g,'-').replace(/\u00b7/g,'|');
  const filterLines=doc.splitTextToSize(clean(filters),width-28).slice(0,6);
  const top=50+filterLines.length*3.4;
  function header(){
    doc.addImage(logo,'PNG',12,10,45,45*logoSize.height/logoSize.width,'port-city-digital-logo');
    doc.setFont('helvetica','bold');doc.setTextColor(...ink);doc.setFontSize(16);doc.text(clean(definition.title.toUpperCase()),64,20,{maxWidth:width-78});doc.setFontSize(8);doc.setFont('helvetica','normal');doc.setTextColor(...orangeText);doc.text('SYSTEM DATA | SUPERVISOR REPORT',64,30);
    doc.setDrawColor(...orange);doc.line(64,35,width-12,35);doc.setFontSize(7);doc.setTextColor(...ink);doc.text(`Generated: ${generated} Asia/Colombo | Records: ${result.rows.length}`,14,42);doc.text(filterLines,14,47);
  }
  header();
  let y=top;
  if(result.summary?.length){autoTable(doc,{startY:y,head:[['PERFORMANCE SUMMARY','VALUE']],body:result.summary.map(m=>[clean(m.label),clean(m.value)]),theme:'grid',headStyles:{fillColor:orange,textColor:ink},styles:{fontSize:8,lineColor:[235,190,164],lineWidth:0.15},margin:{top,bottom:16,left:12,right:12}});y=(doc as unknown as {lastAutoTable:{finalY:number}}).lastAutoTable.finalY+8;}
  const tables=[{title:'Detailed records',columns:result.columns,rows:result.rows},...(result.sections??[])];
  for(const section of tables){
    // Wide tables are divided into readable column groups, repeating the staff / asset identity.
    const bands:number[][]=[];
    if(section.columns.length>9){for(let start=1;start<section.columns.length;start+=6)bands.push([0,...Array.from({length:Math.min(6,section.columns.length-start)},(_,i)=>start+i)]);}
    else bands.push(section.columns.map((_,i)=>i));
    for(let band=0;band<bands.length;band++){
      if(y>height-45){doc.addPage();header();y=top;}
      doc.setFillColor(...orange);doc.rect(12,y,width-24,7,'F');doc.setTextColor(...ink);doc.setFontSize(9);doc.setFont('helvetica','bold');doc.text(`${clean(section.title.toUpperCase())}${bands.length>1?` | PART ${band+1} OF ${bands.length}`:''}`,15,y+4.7);
      const indices=bands[band];
      autoTable(doc,{startY:y+9,head:[indices.map(i=>clean(section.columns[i]))],body:section.rows.length?section.rows.map(r=>indices.map(i=>clean(r[i]))):[indices.map((_,i)=>i===0?'No records match these filters.':'')],theme:'grid',styles:{font:'helvetica',fontSize:8,cellPadding:2.2,lineColor:[235,190,164],lineWidth:0.15,overflow:'linebreak'},headStyles:{fillColor:[255,233,219],textColor:orangeText,fontStyle:'bold'},alternateRowStyles:{fillColor:[255,249,245]},margin:{top,bottom:16,left:12,right:12},rowPageBreak:'avoid',didDrawPage:()=>{if(doc.getCurrentPageInfo().pageNumber>1)header();}});
      y=(doc as unknown as {lastAutoTable:{finalY:number}}).lastAutoTable.finalY+8;
    }
  }
  const count=doc.getNumberOfPages();for(let i=1;i<=count;i++){doc.setPage(i);doc.setDrawColor(...orange);doc.line(12,height-12,width-12,height-12);doc.setFontSize(7);doc.setFont('helvetica','normal');doc.setTextColor(...orangeText);doc.text('PORT CITY DIGITAL | CONFIDENTIAL | Database report',12,height-7);doc.text(`Page ${i} of ${count}`,width-12,height-7,{align:'right'});}
  doc.save(`${filename}.pdf`);
}

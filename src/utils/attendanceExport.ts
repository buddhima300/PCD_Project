import type { AttendanceRow } from '../types/attendance';
import { businessDateTime } from './shiftTime';

export const attendanceHeaders = ['Event date', 'Shift start date', 'Shift', 'Worker ID', 'Worker name', 'Worker type', 'Platform', 'Department', 'Laptop', 'Received from', 'Handed to', 'Receipt time (Colombo)', 'Outgoing time (Colombo)', 'Attendance', 'Self-confirmation reason', 'Notes', 'Equipment issue', 'Corrected', 'Transfer IDs'];
export function attendanceCells(row: AttendanceRow): string[] {
  return [row.eventDate, row.shiftDate, row.shift, row.workerId, row.workerName, row.workerType, row.platformCode, row.dept, row.assetId, row.receivedFrom, row.handedTo, businessDateTime(row.receivedAt), businessDateTime(row.outgoingAt), row.status, row.exceptionReason, row.notes, row.equipmentIssue, row.corrected ? 'Yes' : 'No', row.handoverIds.join(' / ')];
}
function csvCell(value: string): string {
  // Quoting alone does not prevent spreadsheet formula execution.
  const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
export function attendanceCsv(rows: AttendanceRow[]): string {
  return '\uFEFF' + [attendanceHeaders, ...rows.map(attendanceCells)].map(row => row.map(csvCell).join(',')).join('\r\n');
}
function xml(value: string) { return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function column(index: number) { let value = index + 1; let result = ''; while (value) { result = String.fromCharCode(65 + (value - 1) % 26) + result; value = Math.floor((value - 1) / 26); } return result; }
function sheet(rows: AttendanceRow[]) {
  const data = [attendanceHeaders, ...rows.map(attendanceCells)];
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${data.map((row, i) => `<row r="${i + 1}">${row.map((cell, j) => `<c r="${column(j)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(cell)}</t></is></c>`).join('')}</row>`).join('')}</sheetData><autoFilter ref="A1:S${data.length}"/></worksheet>`;
}
const encoder = new TextEncoder();
function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function join(chunks: Uint8Array[]) { const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0)); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; } return result; }

/** A small standards-based, uncompressed ZIP writer for an actual OOXML workbook. */
function zip(files: [string, string][]): Uint8Array {
  const locals: Uint8Array[] = []; const directory: Uint8Array[] = []; let offset = 0;
  for (const [path, content] of files) {
    const name = encoder.encode(path); const data = encoder.encode(content); const crc = crc32(data);
    const local = new Uint8Array(30 + name.length); const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true); l.setUint16(12, 0x21, true); l.setUint32(14, crc, true); l.setUint32(18, data.length, true); l.setUint32(22, data.length, true); l.setUint16(26, name.length, true); local.set(name, 30);
    locals.push(local, data);
    const central = new Uint8Array(46 + name.length); const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true); central.set(name, 46); directory.push(central);
    offset += local.length + data.length;
  }
  const central = join(directory); const end = new Uint8Array(22); const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, central.length, true); e.setUint32(16, offset, true);
  return join([...locals, central, end]);
}
export function attendanceWorkbook(rows: AttendanceRow[]): Uint8Array {
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Morning" sheetId="1" r:id="rId1"/><sheet name="Night" sheetId="2" r:id="rId2"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', sheet(rows.filter(r => r.shift === 'MORNING'))],
    ['xl/worksheets/sheet2.xml', sheet(rows.filter(r => r.shift === 'NIGHT'))]
  ]);
}
export function downloadAttendance(rows: AttendanceRow[], date: string, format: 'csv' | 'xlsx') {
  const content = format === 'csv' ? attendanceCsv(rows) : attendanceWorkbook(rows).buffer as ArrayBuffer;
  const blob = new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `handover-attendance-${date}.${format}`; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

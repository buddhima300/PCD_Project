// Minimal, uncompressed OOXML workbook for development fixtures. Production uses backend jobs.
const encoder = new TextEncoder();
function crc32(bytes: Uint8Array) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1; } return (crc ^ 0xffffffff) >>> 0; }
function header(size: number) { const data = new Uint8Array(size); return { data, view: new DataView(data.buffer) }; }
function zip(files: Record<string, string>) {
  const chunks: Uint8Array[] = []; const directory: Uint8Array[] = []; let offset = 0; let directorySize = 0;
  for (const [path, content] of Object.entries(files)) {
    const name = encoder.encode(path); const body = encoder.encode(content); const crc = crc32(body);
    const local = header(30 + name.length); local.view.setUint32(0, 0x04034b50, true); local.view.setUint16(4, 20, true); local.view.setUint32(14, crc, true); local.view.setUint32(18, body.length, true); local.view.setUint32(22, body.length, true); local.view.setUint16(26, name.length, true); local.data.set(name, 30);
    const central = header(46 + name.length); central.view.setUint32(0, 0x02014b50, true); central.view.setUint16(4, 20, true); central.view.setUint16(6, 20, true); central.view.setUint32(16, crc, true); central.view.setUint32(20, body.length, true); central.view.setUint32(24, body.length, true); central.view.setUint16(28, name.length, true); central.view.setUint32(42, offset, true); central.data.set(name, 46);
    chunks.push(local.data, body); directory.push(central.data); offset += local.data.length + body.length; directorySize += central.data.length;
  }
  const end = header(22); end.view.setUint32(0, 0x06054b50, true); end.view.setUint16(8, directory.length, true); end.view.setUint16(10, directory.length, true); end.view.setUint32(12, directorySize, true); end.view.setUint32(16, offset, true);
  const result = new Uint8Array(offset + directorySize + 22); let position = 0; for (const part of [...chunks, ...directory, end.data]) { result.set(part, position); position += part.length; } return result;
}
export function demoWorkbook(rows: (string | number)[][]) {
  const escape = (s: string) => [...s].filter(c => c.charCodeAt(0) >= 32 || ['\n', '\r', '\t'].includes(c)).join('').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] ?? c);
  const column = (index: number): string => index < 26 ? String.fromCharCode(65 + index) : column(Math.floor(index / 26) - 1) + column(index % 26);
  const xmlRows = rows.map((row, i) => `<row r="${i + 1}">${row.map((cell, j) => typeof cell === 'number' ? `<c r="${column(j)}${i + 1}"><v>${cell}</v></c>` : `<c r="${column(j)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${escape(cell)}</t></is></c>`).join('')}</row>`).join('');
  const bytes = zip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Break history" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xmlRows}</sheetData></worksheet>`,
  });
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${btoa(binary)}`;
}

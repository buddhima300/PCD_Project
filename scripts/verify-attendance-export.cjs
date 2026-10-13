// Create a workbook fixture for validation with an independent OOXML reader.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} };
  cache.set(file, module.exports);
  const javascript = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const relativeRequire = specifier => specifier.startsWith('.') ? load(path.resolve(path.dirname(file), `${specifier}.ts`)) : require(specifier);
  new Function('require', 'module', 'exports', javascript)(relativeRequire, module, module.exports);
  return module.exports;
}
const { attendanceWorkbook } = load('src/utils/attendanceExport.ts');
const base = { id: 'test', workerId: 'EMP-TEST', workerName: 'Validation worker', workerType: 'EMPLOYEE', shift: 'MORNING', shiftDate: '2026-10-13', eventDate: '2026-10-13', platformCode: 'TEST-1', dept: 'DP', assetId: 'LAP-TEST', receivedFrom: 'Previous worker', handedTo: 'Next worker', receivedAt: '2026-10-13T02:00:00Z', outgoingAt: '2026-10-13T14:00:00Z', status: 'ON_TIME', exceptionReason: '', notes: '=SUM(1,1) · Unicode ✓', equipmentIssue: '', corrected: false, handoverIds: ['HO-TEST'] };
const workbook = attendanceWorkbook([base, { ...base, id: 'night', workerId: 'FL-TEST', workerType: 'FREELANCER', shift: 'NIGHT' }]);
const output = path.resolve('node_modules/.cache/attendance-validation.xlsx');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, workbook);
console.log(`Workbook fixture written: ${output}`);

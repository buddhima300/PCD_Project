# Supervisor reports

Supervisors can download PDF, Excel (`.xlsx`) and CSV files from the relevant feature pages and from the report workspace under Insights & tools.

The report workspace includes platform vacancies and capacities, employee directory, individual employee details, attendance confirmations, break summaries and monthly histories, exceeded break allowances, replacements, platform categories, configurations, operations and equipment inventory. Existing operational reports remain available in all three formats.

Downloads request fresh database results using the current filters and include all matching records, independently of the screen's pagination. Individual employee downloads are available in the directory's employee details panel and on the full employee page. For an individual monthly break report, select **Individual monthly break history**, enter the employee's staff number and select a month.

PDFs use navy section headers, summary tables, bordered records, generation time, filter context and numbered pages. Wide datasets are split into column groups with the identifying column repeated. Excel includes separate summary and additional-detail sheets; CSV appends these sections after the detailed records.

Dates in attendance filters refer to the roster's start date, including overnight shifts. Evidence timestamps in exported records are labelled UTC. Report generation time is displayed in Asia/Colombo. Only submitted attendance confirmations are reported; non-submission does not establish absence or completed work hours.

Break summaries total sessions within each employee shift, use the policy effective at shift start and include approved extra minutes. Exceeding an allowance is reported separately from any human review outcome. Break reports retain the existing `reports.export` permission requirement.

The new backend reports execute through the existing authenticated `getReport` workflow, loading operational database records and directly querying attendance confirmation and custody tables. No new database migration or data import is required; attendance reporting needs the existing `009_attendance_confirmations.sql` migration.

Validation: `node --test backend/tests/reports.test.js backend/tests/shift-attendance.test.js` and `npx vitest run src/data/tests/reportExport.test.ts src/data/tests/shiftAttendanceUI.test.tsx src/features/break-management/tests/workflows.test.tsx --maxWorkers=1`.

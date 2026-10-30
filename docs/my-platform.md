# My platform

Employee and freelancer accounts use `getMyPlatformOverview()` to read their own current platform. The endpoint accepts no platform or worker arguments. It aggregates existing operational records and attendance tables; no migration is needed.

Active training assignments resolve through stable registered candidate links and display **Trainee**, even before a production platform is assigned. Completed training awaiting production placement does not fabricate a production assignment. Current dated replacement coverage takes precedence for freelancers.

The page refreshes every 15 seconds and on window focus, with a manual refresh button and a server update timestamp. All displayed activity uses Asia/Colombo. Overnight shifts retain their roster start date. Department cards distinguish scheduled production workers, confirmed attendance, assigned trainees, workstation capacity and physical device counts.

Break activity includes recorded live-shift breaks on the assigned platform. Sessions cannot remain live beyond their shift end. The seven-day off-day calendar spans month boundaries and includes approved records only. Colleague statuses use the roster and attendance evidence; missing attendance is never labelled absent. Personal contact information, leave reasons/types, attendance notes and break review evidence are excluded.

Checks: `backend/tests/my-platform.test.js` covers assignment resolution, scope, privacy, midnight handling, off-days and authorization. `src/data/tests/myPlatform.test.tsx` covers trainee and unassigned rendering.

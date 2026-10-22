# Supervisor dashboard

The supervisor dashboard greets the signed-in user according to the current system time in Asia/Colombo. Break analytics and the Colombo clock/weather card share a two-column desktop layout and stack on smaller screens. The existing operations banner remains below these panels.

Break statistics and active staff names use the existing authenticated Break Management snapshot and monitoring endpoints, with the existing monitoring capability checks. Charts show active breaks relative to scheduled staff across both shifts, pending requests relative to recorded requests, and unreviewed overruns relative to recorded sessions. A separate active-session query supplies the first five names and a link to the complete monitor. Loading, disabled, permission and failure states do not display fabricated counts. Explicit development mock mode is labelled.

The dashboard API now includes analytics for both shifts on the current operational roster date. Schedules come from the shared roster projection, which accounts for approved leave, rotations, production eligibility and dated replacements. Confirmed attendance and needs-review counts come from attendance_confirmations, and laptop use comes from unreleased equipment_custody_sessions. Physical device returns reduce laptop use without deleting attendance. Missing attendance tables return unavailable values rather than manufactured zeroes. Overnight shifts retain the date on which they started.

Four cards compare Morning and Night using radial charts: scheduled workforce against staffing targets, confirmed attendance against scheduled staff, laptops held against configured seats, and staffing vacancies against targets. The current shift is selected from system time using the existing 07:30 / 19:30 boundaries. Operations refresh every 30 seconds; the system clock ticks every second and changing shift/date changes the dashboard query key.

Colombo weather uses Open-Meteo current temperature, weather code, humidity and wind, refreshes every ten minutes, and includes provider attribution and the observation time. Weather service failures leave the operational dashboard available and expose a retry action. Documentation: https://open-meteo.com/en/docs

Platform Coverage hides Status on the dashboard. Other callers of PlatformTable retain their current status column.

Validation includes database attendance/custody and overnight-date tests, dashboard API regression checks, UI analytics and weather-failure tests, and an authenticated Chrome test with isolated PostgreSQL at 1440, 768 and 375 pixels. The browser test stubs weather only and writes screenshots under test-results/dashboard/.

## Employee attendance, absence and cover panels

Employee attendance rings compare distinct confirmed employee declarations with assigned production employees on active platforms for each operational shift. The denominator includes assigned employees with approved time away; trainees and freelancers are excluded. This is separate from the scheduled-workforce charts, whose denominator follows the leave-adjusted working schedule.

A side-by-side panel lists recorded employee absence days over the last 30 calendar days through today. Sources are approved INFORMED_ABSENCE roster requests and informed/uninformed employee profile events. Employee/date pairs are deduplicated. Off-days, pending/rejected leave, future absence declarations and missing attendance confirmations do not count as absence. A bar chart ranks the top eight employees, a histogram groups employees by absence frequency, and a line chart shows absent employees per day. Complete values are available in accessible chart data tables.

Today's off-day panel uses the Colombo calendar date, including after midnight while the night shift retains its prior roster date. It lists approved off-days and shows counts by department.

Replacement planning covers tomorrow through seven days from today, with exact dates displayed. It groups unfilled replacement requests and remaining approved-leave coverage gaps by platform. Fully assigned cover is excluded; partially covered absences retain remaining hours. Employee/date/shift keys deduplicate leave and replacement evidence. A seven-day bar chart shows uncovered shifts, and each platform lists shift count, hours, departments and dates. The midnight date change refreshes the dashboard query as well as its regular 30-second refresh.

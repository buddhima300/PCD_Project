# Platform setup and staffing

## Locked business decisions

- Supervisors create categories and platforms without an approval handoff.
- Backend-ready frontend; production persistence is delivered separately.
- New platforms start in SETUP, configure capacity, optionally assign people, then explicitly activate.
- Physical seats are configured by department and shared across morning/night shifts. Production staffing targets are separate for each shift.
- Training placements consume shift seats but do not satisfy production staffing targets. Qualification and production assignment are separate actions.

## Delivered user flow

Categories, platforms and platform operations expose **Add category** and **Add platform**. Category detail prefills its category. Platform records expose **Manage setup & staffing**.

The centered platform dialog uses five steps: category, platform details, capacity, people, and review. A new category and platform are committed together at step two. Platforms are inactive with lifecycle SETUP. Capacity is saved before people can be assigned. Closing after these commits keeps the saved work; closing with unsaved fields asks about discarding those fields.

Capacity has seats and morning/night production targets per department. Targets cannot exceed seats. Each shift shares the same seats; assignments cannot exceed that shift's seat capacity. Staffing targets describe desired coverage, rather than hard limits on assignment. Training remains separate in the coverage summary.

People selection supports eligible qualified employees and selected/onboarding candidates or available training employees. Existing occupied workforce positions and live training placements must be released through their owning workflow before reassignment. New training placements start at zero completed days, are managed on the training page, and require an explicit production assignment after passing evaluation. Candidate accounts are provisioned at promotion with invited status. Both permanent and freelancer candidates are supported. Staffing gaps do not block activation.

Seat planning does not invent laptop assets or bind people to hardware. Equipment provisioning remains a separate workflow. These allocations represent staffing and training reservations; hardware availability and actual live workstation occupancy remain independent metrics.

## API integration handoff

UI calls only the `api` facade. Shared input contracts are in `src/types/platformSetup.ts`. The mock implementation is in `platformSetupHandlers.ts`; replace it with HTTP methods using the same typed inputs/outputs. Suggested endpoints:

| Facade method | HTTP endpoint | Input / result |
| --- | --- | --- |
| createPlatformCategory | POST /platform-categories | CategoryCreateInput → PlatformCategory |
| createPlatform | POST /platforms | PlatformCreateInput, optional inline category → PlatformSummary |
| configurePlatformCapacity | PUT /platforms/:code/capacity | PlatformCapacityInput → PlatformSummary |
| listPlatformAssignmentOptions | GET /platforms/:code/assignment-options?dept=DP | production employees and training people |
| assignPlatformWorker | POST /platforms/:code/assignments | PlatformAssignmentInput → PlatformSummary |
| activatePlatform | POST /platforms/:code/activate | PlatformSummary |
| promotePlatformTrainee | POST /platform-training/:id/promote | PlatformTrainingAssignment |

Platform additions: optional `name`, `description`, `lifecycle` (SETUP / OPERATIONAL), and `staffingTargets` (department → morning/night counts). Existing platforms retain their current defaults. Operational summaries expose SETUP explicitly. Training additions: `trainingOnly`, `promotedAt`.

Production backend requirements: supervisor authorization, unique normalized category/platform codes, atomic inline category/platform creation, transactionally checked seat reservations, duplicate worker assignment protection, validation before writes, explicit activation, qualification before promotion, audit records, and account provisioning on promotion. Return 422 for invalid input, 409 for duplicate/capacity/assignment conflicts, 403 for unauthorized roles and 404 for missing records. Keep user input visible on errors. Reference data and operational queries refresh after successful mutations.

The current mock store is memory-only and resets on reload. No database migration, real account invitation, external notification, or production persistence is delivered here. The server must implement idempotency and concurrency controls for production writes.

## Verification

Automated workflow tests cover atomic creation, duplicates, activation without staffing, capacity/target validation, authorization, trainee seat accounting, qualification without automatic production activation, explicit promotion, duplicate progress submission and training extension. UI tests cover the full creation wizard, optional staffing, explicit activation, discard protection and role-gated actions.

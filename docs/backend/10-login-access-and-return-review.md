# Staff login toggle and device-return review

## Login access

The employee directory's Employment cell retains the employment badge and adds a solid green/red switch for login access. Enabled means the linked `users.status` is ACTIVE; Blocked means the login is LOCKED or not yet active. This switch does not terminate employment, release a platform, clear custody or change career level. Unlinked records display a disabled No login control; registration/linking must happen first. Clicking or keyboard-operating the switch does not open the employee side panel.

`POST /api/v1/operations/workflows/setEmployeeLoginAccess` accepts `{args:[employeeId,{enabled:boolean,expectedRevision:number}]}`. Supervisors may manage ordinary staff logins. Supervisor logins additionally require `accounts.manage`. Self-administration is rejected and the last active account administrator remains protected. Inactive/suspended SQL worker records cannot be unlocked through this switch.

Changes run in the existing operations transaction/advisory lock with account row locks. They update `users.status`, increment `access_revision`, record `access_changed_at`, `access_changed_by`, and `access_change_reason`, synchronize operational account status, revoke existing sessions, and append operational/foundation audit records. A stale revision returns 409 without changing data. No password or account identity changes. Account administration, worker suspension and SPV access promotion also advance access metadata so competing directory actions become stale.

Migration `005_login_access_controls.sql` adds the four access metadata columns to users. It is additive and does not reset operational or authentication data. Apply using `cd backend` then `npm run migrate`.

Directory/detail account status comes from the real linked SQL login, rather than fixture account fields. Employee responses include `loginAccess: {hasAccount,revision,canManage,disabledReason,changedAt}`. The application uses server-returned capability information for button state; authorization is checked again on every mutation. Account status is synchronized into operational workflow inputs to enforce eligibility consistently.

Login validates the password before returning a specific blocked-account response. A valid password for a non-active account returns 403 / ACCOUNT_BLOCKED:

> Your account is temporarily blocked or deactivated. Please contact your Supervisor to review and unlock your account.

Unknown users and wrong passwords continue to return generic 401 / INVALID_CREDENTIALS. The existing login UI renders the server message. Reactivating permits a fresh login; revoked sessions are not restored.

## Understanding an unassignment blocker

“Complete device return and pending handovers before changing platform membership” means a laptop still names the employee as its current holder or a current/future handover needs a receipt/counterpart confirmation. Past completed handovers remain historical evidence and are not deleted. A valid incoming self-confirmation exception also fulfills the absent outgoing worker's obligation; it no longer leaves an unnecessary blocker.

Open Employee directory → employee → Unassign. The new Device return & handovers section calls `getEmployeeReleaseInfo` with the employee ID and lists exact asset/workstation IDs, pending handover IDs, scheduled times and missing confirmations. Links open the device pool or the supervisor handover view at the corresponding Colombo date (`/handovers?date=YYYY-MM-DD`).

For a current shift, the employee uses My workstation → Return at shift end → outgoing confirmation. Return opens 15 minutes before shift end. If the incoming worker has already selected the asset, that worker confirms receipt too. Then refresh/retry Unassign. If login was deactivated, reactivate it first for the employee to submit their own confirmation.

Older custody entries can lack a usable staff receipt task. For legacy or ended-shift custody, a supervisor with `attendance.correct` may choose Review physical return, physically check that the asset has been returned, select the verification checkbox and supply a reason. `verifyEmployeeDeviceReturn` accepts `{args:[employeeId,{assetId,physicallyReturned:true,reason}]}`. The backend rechecks the holder and timing, rejects current receipts/pending handovers, clears current custody, preserves incidents/maintenance status, and writes DEVICE_RETURN_VERIFIED to both audit stores. It never invents receipt/outgoing confirmations or rewrites historical attendance. A changed holder produces 409.

Training, future off-days, replacements and live equipment reservations still have their own release checks. Resolving device custody does not silently cancel those commitments. The form retains its reason if any check fails.

## Verification

Backend integration covers real login denial/unlock, session revocation, revision races, account ownership/grants, suspended-worker checks, missing logins, database metadata, return permissions, physical-verification validation, history preservation and current-shift protection. Frontend tests cover switch colors/events, protected controls, stale errors, login messaging and the return-review form. Real-browser tests exercise toggle → session denial → blocked login message → reload persistence → unlock, and verified legacy return → successful unassignment.

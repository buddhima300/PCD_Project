# User profiles

Profiles use the existing API facade and handover records. All roles can update their own picture only; registration details are read-only. The supervisor profile provides a leave/absence ledger with mandatory notes and actor/time metadata. Existing attendance corrections remain in Shift overview.

Employee half-days accrue one per calendar month beginning with the joining month. Two half-days fund a full casual day; unused entitlement has no expiry. This is an implementation assumption: historical usage must be migrated before balances can be relied on. Half-day attendance contributes 0.5 days and half the scheduled hours. Freelancer shifts accumulate hours but each date counts once. Overtime is excluded.

Off-day totals reuse approved scheduling records and supervisor ledger entries. Informed absences have a policy maximum of four; its enforcement period remains undefined, so this maximum is displayed but not enforced. Supervisor off-day period is also unresolved. No absence is inferred from a missing handover.

Allowance status is evaluated separately for each calendar month touched by the selected dates. Informed absence, uninformed absence and casual leave disqualify; half-day leave does not. Eligible results remain provisional pending complete monthly review. Freelancers have no leave or allowance entitlement.

Current architecture limitations: profile photos and new ledger records persist in browser localStorage, not a shared backend. Supervisor schedules and supervisor shift attendance are not modeled in existing handover flows; their schedule must be configured before reliable hours can be shown. Production needs authenticated server authorization, shared database persistence, historic balance migration, monthly schedule reconciliation, audited correction/reversal support and image storage. Recommended further profile details: emergency contacts, skills/certification expiry, training completion, assignment history and account access audit.

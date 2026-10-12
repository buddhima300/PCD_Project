import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });

try {
  const { api, setApiAuth } = await server.ssrLoadModule('/src/services/api.ts');
  const { mockConfig } = await server.ssrLoadModule('/src/services/mock/core.ts');
  mockConfig.latencyMs = 0;
  const signIn = (userId, role, name) => setApiAuth({ userId, role, name });
  const denied = async (call, status = 403) => {
    await assert.rejects(call, (error) => error.status === status);
  };
  const caseInput = (approverId = 'USR-MGR-014') => ({
    workerId: 'EMP-00421', workerType: 'EMPLOYEE', incidentAt: new Date().toISOString(), category: 'Process error', severity: 'MODERATE',
    title: 'Verification step missed', description: 'A transaction verification step was not completed before handoff.',
    policyReference: 'Transaction verification procedure', impact: 'A second review was required.', correctiveAction: 'The item was held and checked.',
    evidence: 'Checklist reference', approverId,
  });
  const openAndApprove = async () => {
    signIn('USR-SUP-001', 'SUPERVISOR', 'Leila Haddad');
    const created = await api.createIncidentCase(caseInput());
    await api.submitIncidentForApproval(created.id);
    await denied(() => api.decideIncidentApproval(created.id, 'APPROVE', 'I initiated this case.'), 403);
    signIn('USR-MGR-014', 'SUPERVISOR', 'Daniel Mwangi');
    await api.decideIncidentApproval(created.id, 'APPROVE', 'Independent review completed; request the worker response.');
    signIn('EMP-00421', 'EMPLOYEE', 'Arjun Mehta');
    const statement = { issue: 'I understand the verification step in question.', account: 'I moved the queue item before completing the checklist.', solution: 'I held the item and completed a second review.', prevention: 'I will confirm the checklist before handoff.', factors: '', additional: '', training: '' };
    await api.submitMyIr(created.id, statement);
    signIn('USR-MGR-014', 'SUPERVISOR', 'Daniel Mwangi');
    await api.requestIrAmendment(created.id, 'Please clarify what corrective review was completed.');
    signIn('EMP-00421', 'EMPLOYEE', 'Arjun Mehta');
    await api.submitMyIr(created.id, { ...statement, account: 'I moved the item early, then held it and completed the checklist review.' });
    signIn('USR-MGR-014', 'SUPERVISOR', 'Daniel Mwangi');
    await api.assignInvestigator(created.id);
    await api.submitFinding(created.id, 'SUBSTANTIATED', 'Checklist step was missed.', 'Transaction verification procedure §2', 'The available record supports the finding.');
    await denied(() => api.approveFinding(created.id), 403);
    signIn('USR-SUP-001', 'SUPERVISOR', 'Leila Haddad');
    await api.approveFinding(created.id);
    return created.id;
  };

  const first = await openAndApprove();
  signIn('FL-00124', 'FREELANCER', 'Sofia Reyes');
  assert.equal((await api.listMyDisciplinaryCases()).some((c) => c.id === first), false, 'a worker must not see another worker’s case');
  signIn('USR-SUP-001', 'SUPERVISOR', 'Leila Haddad');
  const afterOne = await api.getRecommendation('EMP-00421');
  assert.equal(afterOne.action, 'NO_ACTION', 'one substantiated event must not reach the first-warning threshold');

  const second = await openAndApprove();
  const recommendation = await api.getRecommendation('EMP-00421');
  assert.equal(recommendation.action, 'FIRST_WARNING');
  assert.equal(recommendation.triggerCaseId, second);
  const warning = await api.createWarningDraft(second, 'Complete checklist validation.', 'Process refresher', 'Leila Haddad · Supervisor');
  assert.equal((await api.getRecommendation('EMP-00421')).action, 'NO_ACTION', 'an open warning draft must prevent duplicate recommendations');
  await api.submitWarningForApproval(warning.id);
  await denied(() => api.decideWarning(warning.id, 'APPROVE'), 403);
  signIn('USR-MGR-014', 'SUPERVISOR', 'Daniel Mwangi');
  await denied(() => api.issueWarning(warning.id), 409);
  await api.decideWarning(warning.id, 'APPROVE');
  await api.issueWarning(warning.id);
  assert.equal((await api.getRecommendation('EMP-00421')).action, 'NO_ACTION', 'a first warning requires a further qualifying incident before a second warning');

  const third = await openAndApprove();
  assert.equal((await api.getRecommendation('EMP-00421')).action, 'SECOND_WARNING');
  signIn('EMP-00421', 'EMPLOYEE', 'Arjun Mehta');
  await api.submitMyAppeal(third, 'Please review the context for this event.');
  signIn('USR-MGR-014', 'SUPERVISOR', 'Daniel Mwangi');
  assert.equal((await api.getRecommendation('EMP-00421')).action, 'NO_ACTION', 'a pending appeal pauses escalation');
  signIn('USR-SUP-001', 'SUPERVISOR', 'Leila Haddad');
  await api.decideAppeal(third, 'REVERSED', 'The appeal evidence changes the finding.');
  assert.equal((await api.getRecommendation('EMP-00421')).action, 'NO_ACTION', 'reversing a finding recalculates the recommendation');

  signIn('EMP-00421', 'EMPLOYEE', 'Arjun Mehta');
  const mine = await api.listMyDisciplinaryCases();
  assert(mine.some((c) => c.id === first && c.responseVersions.length === 2 && c.responseVersions[0].account.includes('before completing')));
  console.log('Disciplinary workflow verification passed: independent approvals, worker IR access, qualifying thresholds, warning approvals, and appeal reversal.');
} finally {
  await server.close();
}

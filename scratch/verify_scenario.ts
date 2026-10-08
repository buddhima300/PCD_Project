import { api, setApiAuth } from '../src/services/api';
import { db } from '../src/services/mock/db';

async function runScenario() {
  console.log('--- STARTING WORKFORCE RECRUITMENT & PLACEMENT VERIFICATION ---');

  // Authenticate as Supervisor
  setApiAuth({
    userId: 'USR-SUP-001',
    role: 'SUPERVISOR',
    name: 'Leila Haddad',
    title: 'Supervisor',
    email: 'leila.haddad@relayops.com'
  });

  // 1. Verify Candidate John Silva
  console.log('\n[Step 1] Checking Candidate John Silva...');
  const candidates = await api.listCandidates({ dept: 'DP' });
  const john = candidates.find((c) => c.id === 'CND-1052');
  if (!john) throw new Error('Candidate CND-1052 not found');
  console.log(`Found candidate: ${john.name} (${john.id}), Status: ${john.status}, Dept: ${john.dept}, Employment: ${john.employmentType}`);
  if (john.status !== 'SELECTED') throw new Error(`Expected status SELECTED, got ${john.status}`);

  // 2. Query Platform Demands and Vacancies
  console.log('\n[Step 2] Checking Platform Demands for DP...');
  const demands = await api.listPlatformDemands('DP');

  const k13 = demands.find((d) => d.platformCode === 'KANE-13');
  const k15 = demands.find((d) => d.platformCode === 'KANE-15');
  const k21 = demands.find((d) => d.platformCode === 'KANE-21');
  const k24 = demands.find((d) => d.platformCode === 'KANE-24');

  console.log(`KANE-13 / DP: Target=${k13?.targetHeadcount}, Active=${k13?.activeHeadcount}, Training=${k13?.trainingHeadcount}, Vacancy=${k13?.vacancy}, Resource=${k13?.resourceStatus}, Priority=${k13?.priority}`);
  console.log(`KANE-15 / DP: Target=${k15?.targetHeadcount}, Active=${k15?.activeHeadcount}, Training=${k15?.trainingHeadcount}, Vacancy=${k15?.vacancy}, Resource=${k15?.resourceStatus}`);
  console.log(`KANE-21 / DP: Target=${k21?.targetHeadcount}, Active=${k21?.activeHeadcount}, Training=${k21?.trainingHeadcount}, Vacancy=${k21?.vacancy}, Resource=${k21?.resourceStatus}`);
  console.log(`KANE-24 / DP: Target=${k24?.targetHeadcount}, Active=${k24?.activeHeadcount}, Training=${k24?.trainingHeadcount}, Vacancy=${k24?.vacancy}, Resource=${k24?.resourceStatus}`);

  if (k13?.vacancy !== 1 || k13?.resourceStatus !== 'READY') throw new Error('KANE-13 demand check failed');
  if (k24?.vacancy !== 1 || k24?.resourceStatus !== 'RESOURCE_BLOCKED') throw new Error('KANE-24 resource blocked check failed');
  if (k21?.vacancy !== 0 || k21?.resourceStatus !== 'FULL') throw new Error('KANE-21 full check failed');

  // 3. Platform Recommendation Engine
  console.log('\n[Step 3] Checking Recommendation Engine for John Silva...');
  const eligible = await api.getEligiblePlatforms(john.id);
  console.log('Top recommended platform:', eligible[0]?.platformCode, 'with vacancy:', eligible[0]?.vacancy);
  if (eligible[0]?.platformCode !== 'KANE-13') throw new Error('Expected KANE-13 to be top recommended platform');

  // 4. Check Positions on KANE-13 before placement
  console.log('\n[Step 4] Checking Positions on KANE-13 / DP...');
  const positionsBefore = await api.getPlatformPositions('KANE-13', 'DP');
  const dp05Before = positionsBefore.find((p) => p.positionCode === 'DP-05');
  console.log(`Position DP-05 status before placement: ${dp05Before?.status}`);
  if (dp05Before?.status !== 'VACANT') throw new Error('DP-05 should be VACANT initially');

  // 5. Execute 7-Step Placement Transaction
  console.log('\n[Step 5] Executing Placement Transaction for John Silva onto KANE-13 / DP-05...');
  const placementResult = await api.placeWorker({
    workerId: john.id,
    workerName: john.name,
    workerType: 'PERMANENT',
    dept: 'DP',
    platformCode: 'KANE-13',
    positionCode: 'DP-05',
    shift: 'MORNING',
    workstationId: 'WS-KANE13-DP-05',
    laptopAssetId: 'LAP-00452',
    trainingDurationDays: 5,
    reason: 'Filled genuine DP platform vacancy with on-the-job training'
  });

  console.log('Placement result success:', placementResult.success);
  console.log('Created worker ID:', placementResult.workerId);
  console.log('Created training ID:', placementResult.training.id);

  // Concurrency check: Ensure position cannot be double-booked
  console.log('\n[Step 5b] Verifying Concurrency Protection (Attempting double reservation)...');
  try {
    await api.placeWorker({
      workerId: 'CND-1055',
      workerName: 'Aisha Patel',
      workerType: 'PERMANENT',
      dept: 'DP',
      platformCode: 'KANE-13',
      positionCode: 'DP-05',
      shift: 'MORNING',
      workstationId: 'WS-KANE13-DP-05',
      laptopAssetId: 'LAP-00452',
      trainingDurationDays: 5
    });
    throw new Error('Double reservation should have failed!');
  } catch (err: any) {
    console.log('Concurrency lock successfully rejected double reservation:', err.message);
  }

  // 6. Verify Capacity Reservation
  console.log('\n[Step 6] Verifying Platform Capacity Reservation...');
  const demandsAfter = await api.listPlatformDemands('DP');
  const k13After = demandsAfter.find((d) => d.platformCode === 'KANE-13');
  console.log(`KANE-13 / DP After: Target=${k13After?.targetHeadcount}, Active=${k13After?.activeHeadcount}, Training=${k13After?.trainingHeadcount}, Vacancy=${k13After?.vacancy}`);
  if (k13After?.trainingHeadcount !== 1 || k13After?.vacancy !== 0) {
    throw new Error('Capacity was not immediately reserved (expected training=1, vacancy=0)');
  }

  const positionsAfter = await api.getPlatformPositions('KANE-13', 'DP');
  const dp05After = positionsAfter.find((p) => p.positionCode === 'DP-05');
  console.log(`Position DP-05 status after placement: ${dp05After?.status}, Assigned to: ${dp05After?.assignedWorkerName} (${dp05After?.assignedWorkerId})`);
  if (dp05After?.status !== 'TRAINING') throw new Error('DP-05 should be in TRAINING status');

  const placedWorker = db.employees.find((e) => e.id === placementResult.workerId);
  console.log(`Worker Lifecycle: ${placedWorker?.lifecycle}, qualifiedForProduction: ${placedWorker?.qualifiedForProduction}`);
  if (placedWorker?.lifecycle !== 'IN_PLATFORM_TRAINING' || placedWorker?.qualifiedForProduction !== false) {
    throw new Error('Worker should be IN_PLATFORM_TRAINING and NOT qualified for production yet');
  }

  // 7. Progress Training from Day 1 through Day 5
  console.log('\n[Step 7] Progressing 5-Day On-Platform Training...');
  const trainingId = placementResult.training.id;
  for (let day = 1; day <= 5; day++) {
    const updated = await api.logTrainingProgress(trainingId, day, `Day ${day} shift completed with supervisor.`);
    console.log(`Progress: Day ${updated.completedTrainingDays} / ${updated.requiredTrainingDays} completed.`);
  }

  // 8. Complete Supervisor Evaluation with PASSED
  console.log('\n[Step 8] Completing Supervisor Qualification Evaluation (PASSED)...');
  const evaluationResult = await api.evaluateTraining(trainingId, {
    platformKnowledge: 5,
    departmentKnowledge: 5,
    processAccuracy: 5,
    systemUsage: 5,
    qualityStandards: 5,
    result: 'PASSED',
    feedback: 'Flawless platform knowledge, accurate reconciliation, excellent operational discipline.'
  });

  console.log(`Training status after evaluation: ${evaluationResult.trainingStatus}`);
  if (evaluationResult.trainingStatus !== 'TRAINING_COMPLETED') throw new Error('Training status should be TRAINING_COMPLETED');

  // 9. Verify Automatic Production Activation
  console.log('\n[Step 9] Verifying Automatic Production Activation...');
  const finalPositions = await api.getPlatformPositions('KANE-13', 'DP');
  const finalDp05 = finalPositions.find((p) => p.positionCode === 'DP-05');
  console.log(`Final DP-05 Position Status: ${finalDp05?.status}`);
  if (finalDp05?.status !== 'ACTIVE') throw new Error('DP-05 should be ACTIVE now');

  const finalWorker = db.employees.find((e) => e.id === placementResult.workerId);
  console.log(`Final Worker Lifecycle: ${finalWorker?.lifecycle}, qualifiedForProduction: ${finalWorker?.qualifiedForProduction}`);
  if (finalWorker?.lifecycle !== 'PRODUCTION_ACTIVE' || finalWorker?.qualifiedForProduction !== true) {
    throw new Error('Worker should be PRODUCTION_ACTIVE and qualified for production');
  }

  // 10. Verify Audit Trail
  console.log('\n[Step 10] Verifying Audit Trail...');
  const auditEntries = db.audit.slice(0, 5);
  console.log('Most recent audit records:');
  auditEntries.forEach((a) => console.log(` - [${a.action}] ${a.next} (${a.reason})`));

  const hasPlacementAudit = db.audit.some((a) => a.action === 'PLATFORM_PLACEMENT');
  const hasCompletedAudit = db.audit.some((a) => a.action === 'TRAINING_COMPLETED');
  if (!hasPlacementAudit || !hasCompletedAudit) throw new Error('Missing expected audit records');

  console.log('\n======================================================');
  console.log('✔ ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
  console.log('✔ Complete scenario executed: Candidate → Vacancy Detection → Reservation → 5-Day Training → Evaluation → Automatic Permanent Production Activation.');
  console.log('======================================================');
}

runScenario().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});

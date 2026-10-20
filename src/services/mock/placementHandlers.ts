import { format, parseISO } from 'date-fns';
import { SERVER_NOW, TODAY } from '../../utils/clock';
import { businessDate } from '../../utils/shiftTime';
import type {
  CandidateStatus,
  DeptCode,
  InterviewResult,
  PlacementInput,
  PlacementPriority,
  PlacementQueueItem,
  PlatformDemand,
  PlatformTrainingAssignment,
  PlatformWorkforcePosition,
  RecruitCandidate,
  ResourceAvailabilityStatus,
  ShiftCode,
  TrainingEvaluation,
  VacancyType,
  WorkerLifecycle
} from '../../types/domain';
import { ApiError, currentAuth, requireRole, respond } from './core';
import { db, DEPT_ORDER, pad, plusDays, pushAudit, poolIdOf } from './db';
import { summarizePlatform } from './selectors';
import { seatCount } from './platformSetupHandlers';

const nowIso = () => new Date().toISOString();

export const placementApi = {
  // ---------------- Candidates ----------------
  listCandidates: (q: { search?: string; dept?: DeptCode | ''; status?: string } = {}) =>
    respond(() => {
      requireRole('SUPERVISOR');
      let list = db.candidates.filter(c => c.registeredWorkerId && c.status !== 'PLACED' && !db.trainingAssignments.some(t => (t.workerId === c.registeredWorkerId) && !t.promotedAt && t.trainingStatus !== 'TRAINING_FAILED'));
      if (q.dept) list = list.filter((c) => c.dept === q.dept);
      if (q.status) list = list.filter((c) => c.status === q.status);
      if (q.search) {
        const s = q.search.toLowerCase();
        list = list.filter((c) => c.name.toLowerCase().includes(s) || c.id.toLowerCase().includes(s) || c.email.toLowerCase().includes(s));
      }
      return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }),

  getCandidate: (id: string) =>
    respond(() => {
      requireRole('SUPERVISOR');
      const c = db.candidates.find((x) => x.id === id);
      if (!c) throw new ApiError('NOT_FOUND', `Candidate ${id} not found.`, 404);
      return c;
    }),

  createCandidate: (data: {
    name: string;
    email: string;
    phone: string;
    interviewDate: string;
    interviewResult: InterviewResult;
    employmentType: 'PERMANENT' | 'FREELANCER';
    dept: DeptCode;
    position: string;
    notes?: string;
  }) =>
    respond(() => {
      const actor = requireRole('SUPERVISOR');
      if (!data.name || !data.email || !data.dept) {
        throw new ApiError('VALIDATION', 'Name, email, and department are required.', 422);
      }
      const c: RecruitCandidate = {
        id: db.seq.cnd(),
        name: data.name,
        email: data.email,
        phone: data.phone || '+63 900 000 0000',
        interviewDate: data.interviewDate || TODAY,
        interviewResult: data.interviewResult || 'PENDING',
        employmentType: data.employmentType || 'PERMANENT',
        dept: data.dept,
        position: data.position || 'Agent',
        notes: data.notes || '',
        status: data.interviewResult === 'SELECTED' ? 'SELECTED' : 'APPLIED',
        createdAt: TODAY
      };
      db.candidates.unshift(c);
      pushAudit({
        at: nowIso(),
        actorId: actor.userId,
        actorName: actor.name,
        role: actor.role,
        action: 'CANDIDATE_CREATED',
        entity: 'RecruitCandidate',
        entityId: c.id,
        platformCode: null,
        dept: c.dept,
        previous: '—',
        next: `${c.name} (${c.dept})`,
        reason: 'Candidate registered in recruitment pipeline',
        isOverride: false
      });
      return c;
    }),

  updateCandidateStatus: (id: string, status: CandidateStatus, notes?: string) =>
    respond(() => {
      const actor = requireRole('SUPERVISOR');
      const c = db.candidates.find((x) => x.id === id);
      if (!c) throw new ApiError('NOT_FOUND', `Candidate ${id} not found.`, 404);
      const prev = c.status;
      c.status = status;
      if (notes) c.notes = `${c.notes}\n${notes}`.trim();
      if (status === 'SELECTED') c.interviewResult = 'SELECTED';

      pushAudit({
        at: nowIso(),
        actorId: actor.userId,
        actorName: actor.name,
        role: actor.role,
        action: 'CANDIDATE_STATUS_CHANGE',
        entity: 'RecruitCandidate',
        entityId: c.id,
        platformCode: null,
        dept: c.dept,
        previous: prev,
        next: status,
        reason: notes || `Candidate status changed to ${status}`,
        isOverride: false
      });
      return c;
    }),

  // ---------------- Platform Demand & Vacancies ----------------
  listPlatformDemands: (dept?: DeptCode, category?: string): Promise<PlatformDemand[]> =>
    respond(() => {
      const activePlatforms = db.platforms.filter((p) => p.status === 'ACTIVE');
      const demands: PlatformDemand[] = [];

      for (const p of activePlatforms) {
        if (category && p.categoryCode !== category) continue;
        for (const d of DEPT_ORDER) {
          if (dept && d !== dept) continue;
          const targetCap = p.departments[d];
          if (!targetCap) continue;

          const poolId = poolIdOf(p.code, d);
          const deptPositions = db.platformPositions.filter((pos) => pos.platformCode === p.code && pos.dept === d);

          const coverage = p.staffingTargets ? summarizePlatform(p).occupancy.find(o => o.dept === d) : undefined;
          const targetHeadcount = p.staffingTargets ? (p.staffingTargets[d]?.MORNING ?? 0) + (p.staffingTargets[d]?.NIGHT ?? 0) : targetCap;
          const activeCount = coverage ? coverage.morning + coverage.night : deptPositions.filter((pos) => pos.status === 'ACTIVE').length;
          const trainingCount = p.staffingTargets ? db.trainingAssignments.filter(t => t.platformCode === p.code && t.dept === d && !t.promotedAt && t.trainingStatus !== 'TRAINING_FAILED').length : deptPositions.filter((pos) => pos.status === 'TRAINING' || pos.status === 'RESERVED').length;
          const occupied = activeCount + trainingCount;
          const vacancy = Math.max(0, targetHeadcount - (p.staffingTargets ? activeCount : occupied));

          // Workstations
          const laps = db.laptops.filter((l) => l.poolId === poolId && l.workstationId && l.status !== 'RETIRED');
          const workstationCapacity = targetCap;
          const availableWorkstations = laps.filter((l) => l.status === 'AVAILABLE').length;

          let resourceStatus: ResourceAvailabilityStatus = 'FULL';
          if (vacancy > 0) {
            resourceStatus = 'READY';
          } else {
            resourceStatus = 'FULL';
          }

          let vacancyType: VacancyType = 'NONE';
          if (vacancy > 0) {
            if (activeCount < targetCap - 1) vacancyType = 'CRITICAL';
            else vacancyType = 'NORMAL';
          }

          // Priority logic
          let priority: PlacementPriority = 'LOW';
          if (p.code === 'KANE-13' && d === 'DP') priority = 'HIGH';
          else if (p.code === 'KANE-15' && d === 'DP') priority = 'MEDIUM';
          else if (vacancyType === 'CRITICAL' && resourceStatus === 'READY') priority = 'HIGH';
          else if (vacancy > 0 && resourceStatus === 'READY') priority = 'MEDIUM';

          demands.push({
            platformCode: p.code,
            categoryCode: p.categoryCode,
            dept: d,
            minHeadcount: Math.max(0, targetHeadcount - 1),
            targetHeadcount,
            maxHeadcount: p.staffingTargets ? targetCap * 2 : targetCap,
            activeHeadcount: activeCount,
            trainingHeadcount: trainingCount,
            vacancy,
            vacancyType,
            workstationCapacity,
            availableWorkstations,
            resourceStatus,
            priority,
            operationalDisruption: vacancy > 0 ? 'MINIMAL' : 'MODERATE'
          });
        }
      }

      // Compute recommendation ranks
      demands.sort((a, b) => {
        const pRank = { HIGH: 3, CRITICAL: 4, MEDIUM: 2, LOW: 1 };
        const pDiff = (pRank[b.priority] || 0) - (pRank[a.priority] || 0);
        if (pDiff !== 0) return pDiff;
        if (b.vacancy !== a.vacancy) return b.vacancy - a.vacancy;
        return b.availableWorkstations - a.availableWorkstations;
      });

      demands.forEach((d, idx) => {
        d.recommendationRank = idx + 1;
        if (d.resourceStatus === 'RESOURCE_BLOCKED') {
          d.recommendationReason = 'Workforce vacancy exists but blocked by 0 available workstations.';
        } else if (d.vacancy > 0) {
          d.recommendationReason = `Highest-priority ${d.dept} platform with genuine vacancy and workstation ready.`;
        } else {
          d.recommendationReason = 'Platform staffing is currently full.';
        }
      });

      return demands;
    }),

  // ---------------- Eligible Platforms for Worker Placement ----------------
  getEligiblePlatforms: (workerId: string) =>
    respond(() => {
      requireRole('SUPERVISOR');
      let targetDept: DeptCode = 'DP';

      const cand = db.candidates.find((c) => c.id === workerId);
      if (cand) targetDept = cand.dept;
      else {
        const emp = db.employees.find((e) => e.id === workerId);
        if (emp) targetDept = emp.dept;
        else {
          const fl = db.freelancers.find((f) => f.id === workerId);
          if (fl) targetDept = fl.dept;
        }
      }

      const activePlatforms = db.platforms.filter((p) => p.status === 'ACTIVE' && p.departments[targetDept]);
      const results = activePlatforms.map((p) => {
        const targetCap = p.departments[targetDept] ?? 0;
        const positions = db.platformPositions.filter((pos) => pos.platformCode === p.code && pos.dept === targetDept);
        const active = positions.filter((pos) => pos.status === 'ACTIVE').length;
        const training = positions.filter((pos) => pos.status === 'TRAINING' || pos.status === 'RESERVED').length;
        const vacancy = Math.max(0, targetCap - (active + training));

        const poolId = poolIdOf(p.code, targetDept);
        const laps = db.laptops.filter((l) => l.poolId === poolId && l.workstationId && l.status !== 'RETIRED');
        const availableWorkstations = laps.filter((l) => l.status === 'AVAILABLE').length;

        let resourceStatus: ResourceAvailabilityStatus = 'FULL';
        if (vacancy > 0) {
          resourceStatus = 'READY';
        }

        let priority: PlacementPriority = 'LOW';
        if (p.code === 'KANE-13') priority = 'HIGH';
        else if (p.code === 'KANE-15') priority = 'MEDIUM';
        else if (p.code === 'KANE-21') priority = 'LOW';
        else if (p.code === 'KANE-24') priority = 'LOW';
        else if (vacancy > 0 && resourceStatus === 'READY') priority = 'MEDIUM';

        const vacantPositions = positions.filter((pos) => pos.status === 'VACANT');

        return {
          platformCode: p.code,
          categoryCode: p.categoryCode,
          dept: targetDept,
          required: targetCap,
          active,
          training,
          vacancy,
          availableWorkstations,
          resourceStatus: resourceStatus as ResourceAvailabilityStatus,
          priority,
          recommended: priority === 'HIGH' || (priority === 'MEDIUM' && resourceStatus === 'READY'),
          vacantPositions: vacantPositions.map((v) => v.positionCode),
          shift: 'MORNING' as ShiftCode
        };
      });

      // Sort: Recommended first, then highest vacancy, then available workstations
      return results.sort((a, b) => {
        if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
        if (a.resourceStatus !== b.resourceStatus) return a.resourceStatus === 'READY' ? -1 : 1;
        return b.vacancy - a.vacancy;
      });
    }),

  // ---------------- Platform Positions ----------------
  getPlatformPositions: (platformCode: string, dept?: DeptCode) =>
    respond(() => {
      let list = db.platformPositions.filter((p) => p.platformCode === platformCode);
      if (dept) list = list.filter((p) => p.dept === dept);
      return list.sort((a, b) => a.slot - b.slot);
    }),

  // ---------------- Transactional Placement Execution ----------------
  placeWorker: (input: PlacementInput) =>
    respond(() => {
      const actor = requireRole('SUPERVISOR');

      // 1. Validate Target Platform
      const platform = db.platforms.find((p) => p.code === input.platformCode && p.status === 'ACTIVE');
      if (!platform) throw new ApiError('NOT_FOUND', `Platform ${input.platformCode} not found or inactive.`, 404);

      // 2. Validate Department Match
      if (!platform.departments[input.dept]) {
        throw new ApiError('INVALID_DEPARTMENT', `Department ${input.dept} does not operate on ${input.platformCode}.`, 422);
      }

      // 3. Find and Lock Workforce Position
      const pos = db.platformPositions.find(
        (p) => p.platformCode === input.platformCode && p.dept === input.dept && p.positionCode === input.positionCode
      );
      if (!pos) throw new ApiError('NOT_FOUND', `Position ${input.positionCode} does not exist on ${input.platformCode}.`, 404);

      if (pos.status !== 'VACANT') {
        throw new ApiError(
          'CONCURRENCY_CONFLICT',
          `Workforce position ${input.positionCode} was just reserved by another supervisor. Please refresh platform vacancies.`,
          409
        );
      }

      // Staffing reserves shared platform capacity, never a named asset.
      const poolId = poolIdOf(input.platformCode, input.dept);
      if (!['MORNING','NIGHT'].includes(input.shift) || seatCount(input.platformCode,input.dept,input.shift) >= (platform.departments[input.dept] ?? 0)) throw new ApiError('CAPACITY_CONFLICT','No shared device capacity remains for this shift.',409);
      const personId = db.candidates.find(c => c.id === input.workerId)?.registeredWorkerId ?? input.workerId;
      const person = db.employees.find(w => w.id === personId) ?? db.freelancers.find(w => w.id === personId);
      if (person && (person.dept !== input.dept || person.status !== 'ACTIVE' || person.accountStatus !== 'ACTIVE')) throw new ApiError('WORKER_MISMATCH','Choose an active person in this department.',422);
      if (db.laptops.some(l => l.currentUserId === personId) || db.trainingAssignments.some(t => t.workerId === personId && !t.promotedAt && t.trainingStatus !== 'TRAINING_FAILED')) throw new ApiError('ASSIGNMENT_CONFLICT','Resolve the existing assignment before placement.',409);

      // 5. Worker Resolution / Onboarding
      let finalWorkerId = input.workerId;
      let finalWorkerName = input.workerName;
      const cand = db.candidates.find((c) => c.id === input.workerId);

      if (cand) {
        if (cand.status === 'PLACED') throw new ApiError('CONFLICT', 'This candidate has already been placed.', 409);
        if ((cand.employmentType === 'PERMANENT' ? 'PERMANENT' : 'FREELANCER') !== input.workerType || cand.dept !== input.dept) throw new ApiError('WORKER_MISMATCH', 'Placement must match the registered department and employment type.', 422);
        cand.status = 'PLACED';
        if (cand.registeredWorkerId) {
          const worker = input.workerType === 'PERMANENT' ? db.employees.find(record => record.id === cand.registeredWorkerId) : db.freelancers.find(record => record.id === cand.registeredWorkerId);
          if (!worker) throw new ApiError('NOT_FOUND', 'The registered staff record is missing.', 404);
          finalWorkerId = worker.id; finalWorkerName = worker.name;
          Object.assign(worker, { lifecycle:'IN_PLATFORM_TRAINING', qualifiedForProduction:false, positionCode:pos.positionCode });
          if (input.workerType === 'PERMANENT') Object.assign(worker, { platformCode:input.platformCode, categoryCode:platform.categoryCode, poolId, slot:pos.slot, shift:input.shift, nextShift:input.shift === 'MORNING' ? 'NIGHT' : 'MORNING', currentWorkstationId:null, workstationState:null });
          else Object.assign(worker, { currentPlatform:input.platformCode, compatibleCategories:[platform.categoryCode], compatiblePlatforms:[input.platformCode] });
        } else if (input.workerType === 'PERMANENT') {
          finalWorkerId = `EMP-${pad(Math.floor(1050 + Math.random() * 8900), 5)}`;
          finalWorkerName = cand.name;
          db.employees.push({
            uuid: `usr-${finalWorkerId}`,
            id: finalWorkerId,
            name: cand.name,
            email: cand.email,
            phone: cand.phone,
            dept: cand.dept,
            platformCode: input.platformCode,
            categoryCode: platform.categoryCode,
            position: cand.position,
            shift: input.shift,
            nextShift: input.shift === 'MORNING' ? 'NIGHT' : 'MORNING',
            status: 'ACTIVE',
            accountStatus: 'ACTIVE',
            poolId,
            currentWorkstationId: null,
            workstationState: null,
            offDaysUsed: 0,
            offDaysAllowance: 4,
            joinedAt: TODAY,
            slot: pos.slot,
            lifecycle: 'IN_PLATFORM_TRAINING',
            positionCode: pos.positionCode,
            qualifiedForProduction: false
          });
        } else {
          finalWorkerId = `FL-${pad(Math.floor(150 + Math.random() * 800), 5)}`;
          finalWorkerName = cand.name;
          db.freelancers.push({
            uuid: `usr-${finalWorkerId}`,
            id: finalWorkerId,
            employmentType: 'EXTERNAL',
            name: cand.name,
            email: cand.email,
            phone: cand.phone,
            dept: cand.dept,
            priority: db.freelancers.filter((f) => f.dept === cand.dept).length + 1,
            status: 'ACTIVE',
            accountStatus: 'ACTIVE',
            compatibleCategories: [platform.categoryCode],
            compatiblePlatforms: [input.platformCode],
            currentAssignmentId: null,
            currentPlatform: input.platformCode,
            joinedAt: TODAY,
            lifecycle: 'IN_PLATFORM_TRAINING',
            positionCode: pos.positionCode,
            qualifiedForProduction: false
          });
        }
      } else {
        // Existing employee/freelancer being placed
        const existingEmp = db.employees.find((e) => e.id === input.workerId);
        if (existingEmp) {
          existingEmp.platformCode = input.platformCode;
          existingEmp.categoryCode = platform.categoryCode;
          existingEmp.positionCode = input.positionCode;
          existingEmp.slot = pos.slot;
          existingEmp.shift = input.shift;
          existingEmp.lifecycle = 'IN_PLATFORM_TRAINING';
          existingEmp.qualifiedForProduction = false;
          existingEmp.currentWorkstationId = null;
          existingEmp.workstationState = null;
          existingEmp.poolId = poolId;
        }
      }

      // 6. Transition Position
      pos.status = 'TRAINING';
      pos.assignedWorkerId = finalWorkerId;
      pos.assignedWorkerName = finalWorkerName;
      pos.assignedWorkerType = input.workerType;
      pos.updatedAt = TODAY;

      // Workforce position identifies staffing only. Actual custody begins at receipt.
      pos.workstationId = null;
      pos.shift = input.shift;

      // 8. Create Platform Training Assignment
      const durationDays = input.trainingDurationDays || 5;
      const trainingId = db.seq.trn();
      const training: PlatformTrainingAssignment = {
        id: trainingId,
        workerId: finalWorkerId,
        workerName: finalWorkerName,
        workerType: input.workerType,
        platformCode: input.platformCode,
        categoryCode: platform.categoryCode,
        dept: input.dept,
        positionCode: pos.positionCode,
        shift: input.shift,
        workstationPoolId: poolId,
        workstationId: '',
        laptopAssetId: '',
        trainingStartDate: TODAY,
        expectedCompletionDate: plusDays(TODAY, durationDays),
        actualCompletionDate: null,
        requiredTrainingDays: durationDays,
        completedTrainingDays: 1,
        trainingStatus: 'IN_TRAINING',
        evaluation: null,
        dailyLogs: Array.from({ length: durationDays }, (_, i) => ({
          day: i + 1,
          date: plusDays(TODAY, i),
          status: i === 0 ? 'COMPLETED' : i === 1 ? 'IN_PROGRESS' : 'SCHEDULED',
          attendance: 'PRESENT',
          notes: i === 0 ? 'Initial platform orientation, security credentials issued, direct workstation training initiated.' : undefined
        })),
        assignedBy: actor.name,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };

      db.trainingAssignments.unshift(training);

      // 9. Audit Record
      pushAudit({
        at: nowIso(),
        actorId: actor.userId,
        actorName: actor.name,
        role: actor.role,
        action: 'PLATFORM_PLACEMENT',
        entity: 'PlatformWorkforcePosition',
        entityId: pos.id,
        platformCode: input.platformCode,
        dept: input.dept,
        previous: 'VACANT',
        next: `TRAINING · ${pos.positionCode} reserved for ${finalWorkerName} (${finalWorkerId})`,
        reason: input.reason || 'Filled platform workforce vacancy with on-the-job training assignment',
        isOverride: false
      });

      // 10. Notifications
      db.notifications.unshift({
        id: db.seq.ntf(),
        type: 'PLATFORM_ASSIGNMENT',
        title: `Workforce vacancy filled on ${input.platformCode} / ${input.dept}`,
        body: `${finalWorkerName} assigned to ${pos.positionCode} for 5-day on-platform training.`,
        createdAt: nowIso(),
        read: false,
        emailStatus: 'DELIVERED',
        link: '/training',
        recipientRoles: ['SUPERVISOR'],
        recipientId: null
      });

      return {
        success: true,
        workerId: finalWorkerId,
        workerName: finalWorkerName,
        position: pos,
        training
      };
    }),

  // ---------------- Training Management ----------------
  listTrainings: (q: { platform?: string; dept?: DeptCode | ''; status?: string; history?: boolean } = {}) =>
    respond(() => {
      let list = db.trainingAssignments.filter(t => q.history || (!t.promotedAt && t.trainingStatus !== 'TRAINING_FAILED' && (t.trainingOnly || ['IN_TRAINING','TRAINING_EXTENDED','TRAINING_ASSIGNED'].includes(t.trainingStatus))));
      if (q.platform) list = list.filter((t) => t.platformCode === q.platform);
      if (q.dept) list = list.filter((t) => t.dept === q.dept);
      if (q.status) list = list.filter((t) => t.trainingStatus === q.status);
      return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }),

  getTraining: (id: string) =>
    respond(() => {
      const t = db.trainingAssignments.find((x) => x.id === id);
      if (!t) throw new ApiError('NOT_FOUND', `Training record ${id} not found.`, 404);
      return t;
    }),

  logTrainingProgress: (id: string, day: number, notes?: string) =>
    respond(() => {
      const actor = requireRole('SUPERVISOR');
      const t = db.trainingAssignments.find((x) => x.id === id);
      if (!t) throw new ApiError('NOT_FOUND', `Training record ${id} not found.`, 404);

      if (t.promotedAt || !['IN_TRAINING', 'TRAINING_EXTENDED'].includes(t.trainingStatus)) throw new ApiError('VALIDATION', 'This training placement is no longer in progress.', 422);

      const targetLog = t.dailyLogs.find((l) => l.day === day);
      if (!targetLog || targetLog.status === 'COMPLETED' || day !== t.completedTrainingDays + 1) throw new ApiError('VALIDATION', 'Complete the next scheduled training day once.', 422);
      if (targetLog) {
        targetLog.status = 'COMPLETED';
        if (notes) targetLog.notes = notes;
      }
      t.completedTrainingDays = Math.min(t.requiredTrainingDays, t.completedTrainingDays + 1);
      const nextLog = t.dailyLogs.find((l) => l.day === day + 1);
      if (nextLog && nextLog.status === 'SCHEDULED') {
        nextLog.status = 'IN_PROGRESS';
      }
      t.updatedAt = nowIso();

      pushAudit({
        at: nowIso(),
        actorId: actor.userId,
        actorName: actor.name,
        role: actor.role,
        action: 'TRAINING_PROGRESS_UPDATED',
        entity: 'PlatformTrainingAssignment',
        entityId: t.id,
        platformCode: t.platformCode,
        dept: t.dept,
        previous: `Day ${day - 1}`,
        next: `Day ${day} COMPLETED (${t.completedTrainingDays}/${t.requiredTrainingDays})`,
        reason: notes || `Training day ${day} marked completed`,
        isOverride: false
      });

      return t;
    }),

  evaluateTraining: (
    id: string,
    evaluation: {
      platformKnowledge: number;
      departmentKnowledge: number;
      processAccuracy: number;
      systemUsage: number;
      qualityStandards: number;
      result: 'PASSED' | 'FAILED' | 'EXTEND';
      extensionDays?: number;
      feedback: string;
    }
  ) =>
    respond(() => {
      const actor = requireRole('SUPERVISOR');
      const t = db.trainingAssignments.find((x) => x.id === id);
      if (!t) throw new ApiError('NOT_FOUND', `Training record ${id} not found.`, 404);

      const scores = [
        evaluation.platformKnowledge,
        evaluation.departmentKnowledge,
        evaluation.processAccuracy,
        evaluation.systemUsage,
        evaluation.qualityStandards
      ];
      if (t.trainingOnly || (!t.promotedAt && ['IN_TRAINING','TRAINING_EXTENDED'].includes(t.trainingStatus))) {
        t.trainingOnly = true;
        if (t.promotedAt || !['IN_TRAINING', 'TRAINING_EXTENDED'].includes(t.trainingStatus)) throw new ApiError('VALIDATION', 'This placement has already been evaluated.', 422);
        if (t.completedTrainingDays < t.requiredTrainingDays) throw new ApiError('VALIDATION', 'Complete all training days before supervisor review.', 422);
        if(!['PASSED','FAILED','EXTEND'].includes(evaluation.result))throw new ApiError('VALIDATION','Choose Pass, Extend or Fail.',422);
        if (scores.some(score => !Number.isFinite(score) || score < 1 || score > 5)) throw new ApiError('VALIDATION', 'Evaluation scores must be between 1 and 5.', 422);
        const extension = evaluation.extensionDays ?? 2;
        if (evaluation.result === 'EXTEND' && (!Number.isInteger(extension) || extension < 1 || extension > 90)) throw new ApiError('VALIDATION', 'Extension must be 1–90 days.', 422);
        if (evaluation.result === 'EXTEND' && evaluation.feedback.trim().length < 5) throw new ApiError('VALIDATION','Provide a reason of at least five characters for the extension.',422);
        t.evaluation = { ...evaluation, overallScore: scores.reduce((a, b) => a + b, 0) / scores.length, evaluatedBy: actor.name, evaluatedAt: nowIso() };
        t.trainingStatus = evaluation.result === 'PASSED' ? 'TRAINING_COMPLETED' : evaluation.result === 'FAILED' ? 'TRAINING_FAILED' : 'TRAINING_EXTENDED';
        if (evaluation.result === 'EXTEND') {
          const oldDays = t.requiredTrainingDays;
          t.dailyLogs.push(...Array.from({ length: extension }, (_, i) => ({ day: oldDays + i + 1, date: plusDays(t.expectedCompletionDate, i + 1), status: 'SCHEDULED' as const, attendance: 'PRESENT' as const })));
          t.requiredTrainingDays += extension; t.expectedCompletionDate = plusDays(t.expectedCompletionDate, extension);
        }
        else t.actualCompletionDate = businessDate();
        const worker = db.employees.find(e => e.id === t.workerId) ?? db.freelancers.find(f => f.id === t.workerId);
        if (worker) worker.qualifiedForProduction = false;
        if (worker) worker.lifecycle = evaluation.result === 'PASSED' ? 'TRAINING_COMPLETED' : evaluation.result === 'FAILED' ? 'TRAINING_FAILED' : 'TRAINING_EXTENDED';
        if(evaluation.result === 'FAILED') {
          const candidate=db.candidates.find(c=>c.registeredWorkerId===t.workerId || c.id===t.workerId);
          if(candidate)candidate.status='SELECTED';
          if(worker && 'platformCode' in worker)Object.assign(worker,{platformCode:'',categoryCode:'',poolId:'',slot:0});
          else if(worker)Object.assign(worker,{currentPlatform:null,compatiblePlatforms:[],compatibleCategories:[]});
          for(const position of db.platformPositions.filter(p=>p.assignedWorkerId===t.workerId || p.reservedForWorkerId===t.workerId))Object.assign(position,{status:'VACANT',assignedWorkerId:null,reservedForWorkerId:null,assignedWorkerName:null});
        }
        pushAudit({ at: nowIso(), actorId: actor.userId, actorName: actor.name, role: actor.role, action: 'TRAINING_EVALUATED', entity: 'PlatformTrainingAssignment', entityId: t.id, platformCode: t.platformCode, dept: t.dept, previous: 'IN_TRAINING', next: t.trainingStatus, reason: evaluation.feedback || 'Supervisor qualification evaluation', isOverride: false });
        return t;
      }
      const avg = Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1));

      const evalRecord: TrainingEvaluation = {
        ...evaluation,
        overallScore: avg,
        evaluatedBy: actor.name,
        evaluatedAt: nowIso()
      };
      t.evaluation = evalRecord;
      t.actualCompletionDate = TODAY;

      const pos = db.platformPositions.find(
        (p) => p.platformCode === t.platformCode && p.dept === t.dept && p.positionCode === t.positionCode
      );
      const emp = db.employees.find((e) => e.id === t.workerId);
      const fl = db.freelancers.find((f) => f.id === t.workerId);

      if (evaluation.result === 'PASSED') {
        t.trainingStatus = 'TRAINING_COMPLETED';
        if (pos) {
          pos.status = 'ACTIVE';
          pos.updatedAt = TODAY;
        }
        if (emp) {
          emp.lifecycle = 'PRODUCTION_ACTIVE';
          emp.qualifiedForProduction = true;
        }
        if (fl) {
          fl.lifecycle = 'PRODUCTION_ACTIVE';
          fl.qualifiedForProduction = true;
          if (!fl.compatiblePlatforms?.includes(t.platformCode)) {
            fl.compatiblePlatforms = [...(fl.compatiblePlatforms ?? []), t.platformCode];
          }
        }

        pushAudit({
          at: nowIso(),
          actorId: actor.userId,
          actorName: actor.name,
          role: actor.role,
          action: 'TRAINING_COMPLETED',
          entity: 'PlatformTrainingAssignment',
          entityId: t.id,
          platformCode: t.platformCode,
          dept: t.dept,
          previous: 'IN_TRAINING',
          next: `ACTIVE · ${t.workerName} graduated to permanent production on ${t.platformCode}`,
          reason: evaluation.feedback || 'Platform qualification evaluation passed',
          isOverride: false
        });

        db.notifications.unshift({
          id: db.seq.ntf(),
          type: 'PLATFORM_ASSIGNMENT',
          title: `Training passed: ${t.workerName} is now PRODUCTION_ACTIVE`,
          body: `Successfully activated permanent position ${t.positionCode} on ${t.platformCode} / ${t.dept}.`,
          createdAt: nowIso(),
          read: false,
          emailStatus: 'DELIVERED',
          link: `/platforms/${t.platformCode}`,
          recipientRoles: ['SUPERVISOR'],
          recipientId: null
        });
      } else if (evaluation.result === 'EXTEND') {
        const extra = evaluation.extensionDays || 2;
        t.trainingStatus = 'TRAINING_EXTENDED';
        t.requiredTrainingDays += extra;
        t.expectedCompletionDate = plusDays(t.expectedCompletionDate, extra);
        for (let i = 1; i <= extra; i++) {
          t.dailyLogs.push({
            day: t.dailyLogs.length + 1,
            date: plusDays(TODAY, i),
            status: 'SCHEDULED',
            attendance: 'PRESENT',
            notes: 'Extended qualification reinforcement shift.'
          });
        }
        if (emp) emp.lifecycle = 'TRAINING_EXTENDED';
        if (fl) fl.lifecycle = 'TRAINING_EXTENDED';

        pushAudit({
          at: nowIso(),
          actorId: actor.userId,
          actorName: actor.name,
          role: actor.role,
          action: 'TRAINING_EXTENDED',
          entity: 'PlatformTrainingAssignment',
          entityId: t.id,
          platformCode: t.platformCode,
          dept: t.dept,
          previous: `${t.requiredTrainingDays - extra} days`,
          next: `${t.requiredTrainingDays} days (+${extra} days)`,
          reason: evaluation.feedback || 'Training extension granted',
          isOverride: false
        });
      } else {
        t.trainingStatus = 'TRAINING_FAILED';
        if (emp) emp.lifecycle = 'TRAINING_FAILED';
        if (fl) fl.lifecycle = 'TRAINING_FAILED';

        pushAudit({
          at: nowIso(),
          actorId: actor.userId,
          actorName: actor.name,
          role: actor.role,
          action: 'TRAINING_FAILED',
          entity: 'PlatformTrainingAssignment',
          entityId: t.id,
          platformCode: t.platformCode,
          dept: t.dept,
          previous: 'IN_TRAINING',
          next: 'TRAINING_FAILED',
          reason: evaluation.feedback || 'Failed platform qualification criteria',
          isOverride: false
        });
      }

      t.updatedAt = nowIso();
      return t;
    }),

  // ---------------- Placement Queue ----------------
  listPlacementQueue: (): Promise<PlacementQueueItem[]> =>
    respond(() => {
      const items: PlacementQueueItem[] = [];

      // 1. Unplaced Candidates
      for (const c of db.candidates) {
        if (c.status === 'SELECTED' || c.status === 'ONBOARDING') {
          const eligible = db.platforms.filter((p) => p.status === 'ACTIVE' && p.departments[c.dept]);
          items.push({
            workerId: c.id,
            workerName: c.name,
            email: c.email,
            phone: c.phone,
            dept: c.dept,
            employmentType: c.employmentType,
            lifecycle: c.status === 'SELECTED' ? 'SELECTED' : 'ONBOARDING',
            startDate: c.interviewDate,
            candidateId: c.id,
            eligiblePlatformsCount: eligible.length,
            recommendedPlatform: c.dept === 'DP' ? 'KANE-13' : eligible[0]?.code || 'KANE-14',
            workstationReady: true
          });
        }
      }

      // 2. Trainees currently in training
      for (const t of db.trainingAssignments) {
        if (t.trainingStatus === 'IN_TRAINING' || t.trainingStatus === 'TRAINING_EXTENDED') {
          items.push({
            workerId: t.workerId,
            workerName: t.workerName,
            email: `${t.workerId.toLowerCase()}@relayops.com`,
            phone: '+63 900 000 0000',
            dept: t.dept,
            employmentType: t.workerType,
            lifecycle: t.trainingStatus === 'TRAINING_EXTENDED' ? 'TRAINING_EXTENDED' : 'IN_PLATFORM_TRAINING',
            startDate: t.trainingStartDate,
            trainingId: t.id,
            assignedPlatform: t.platformCode,
            assignedPosition: t.positionCode,
            eligiblePlatformsCount: 1,
            workstationReady: true
          });
        }
      }

      return items;
    }),

  // ---------------- Demand Forecast ----------------
  getDemandForecast: () =>
    respond(() => {
      return [
        {
          platformCode: 'KANE-13',
          dept: 'DP',
          currentHeadcount: '4 / 5',
          expectedVacancy: 1,
          urgency: 'CRITICAL',
          reason: '1 immediate open vacancy; target headcount 5',
          recommendedAction: 'Place John Silva into DP-05'
        },
        {
          platformCode: 'KANE-15',
          dept: 'DP',
          currentHeadcount: '3 / 5',
          expectedVacancy: 2,
          urgency: 'HIGH',
          reason: '1 active trainee + 1 unfilled position',
          recommendedAction: 'Schedule 1 candidate interview'
        },
        {
          platformCode: 'KANE-24',
          dept: 'DP',
          currentHeadcount: '4 / 5',
          expectedVacancy: 1,
          urgency: 'BLOCKED',
          reason: 'Workstation WS-KANE24-DP-05 currently under IT maintenance',
          recommendedAction: 'Resolve hardware maintenance before placing recruit'
        },
        {
          platformCode: 'JAX-04',
          dept: 'WD',
          currentHeadcount: '3 / 4',
          expectedVacancy: 1,
          urgency: 'UPCOMING',
          reason: 'Upcoming planned employee transfer effective Oct 20',
          recommendedAction: 'Recruit 1 freelancer for WD platform compatibility'
        }
      ];
    })
};

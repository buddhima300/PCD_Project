import { ApiError } from '../../shared/errors.js';

export function workforceVacancies(auth,state) {
  if (auth.user.role !== 'SUPERVISOR') throw new ApiError(403,'FORBIDDEN','Only supervisors can browse workforce vacancies.');
  return state.platforms.filter(p=>p.status==='ACTIVE' && p.lifecycle!=='SETUP').map(p=>({
    code:p.code,name:p.name??p.code,categoryCode:p.categoryCode,
    departments:Object.entries(p.departments).filter(([,capacity])=>capacity>0).map(([dept,capacity])=>({dept,capacity,shifts:Object.fromEntries(['MORNING','NIGHT'].map(shift=>{
      const production=new Set(state.employees.filter(w=>w.platformCode===p.code && w.dept===dept && w.shift===shift && w.qualifiedForProduction!==false && ['ACTIVE','ON_LEAVE'].includes(w.status)).map(w=>w.id));
      for(const f of state.freelancers.filter(f=>f.currentPlatform===p.code && f.dept===dept && f.qualifiedForProduction && ['ACTIVE','ON_LEAVE'].includes(f.status))) if(state.trainingAssignments.some(t=>t.workerId===f.id && t.promotedAt && (t.productionShift??t.shift)===shift))production.add(f.id);
      const training=new Set(state.trainingAssignments.filter(t=>t.platformCode===p.code && t.dept===dept && t.shift===shift && !t.promotedAt && t.trainingStatus!=='TRAINING_FAILED' && (t.trainingOnly || ['IN_TRAINING','TRAINING_EXTENDED','TRAINING_ASSIGNED'].includes(t.trainingStatus))).map(t=>t.workerId));
      const used=new Set([...production,...training]).size;
      return [shift,{capacity,production:production.size,training:training.size,used,available:Math.max(0,capacity-used)}];
    }))}))
  }));
}

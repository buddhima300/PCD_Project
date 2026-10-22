export async function projectShiftAttendanceProfile(client,result,workerId,from,to) {
  if(!(await client.query("SELECT to_regclass('attendance_confirmations') AS name")).rows[0].name)return result;
  const records=(await client.query(`SELECT o.roster_date::text AS date,o.shift,o.effective_start,o.effective_end,c.status,c.revision,
    coalesce(c.device_timestamp,c.accepted_at) AS attendance_at,s.released_at
    FROM attendance_confirmations c JOIN work_occurrences o ON o.id=c.occurrence_id JOIN workers w ON w.id=o.worker_id
    LEFT JOIN equipment_custody_sessions s ON s.confirmation_id=c.id
    WHERE w.worker_number=$1 AND o.roster_date BETWEEN $2 AND $3`,[workerId,from,to])).rows;
  if(!records.length)return result;
  const replaced=new Set(records.map(r=>`${r.date}-${r.shift}`));
  const legacy=(result.attendance??[]).filter(r=>!replaced.has(`${r.date}-${r.shift}`));
  const present=records.filter(r=>r.status==='CONFIRMED').map(r=>({date:r.date,shift:r.shift,corrected:r.revision>1,
    hours:r.released_at?Math.max(0,Math.min(Date.parse(r.released_at),Date.parse(r.effective_end))-Math.max(Date.parse(r.attendance_at),Date.parse(r.effective_start)))/3600000:0,
    awaitingReturn:!r.released_at,source:'SHIFT_CONFIRMATION'}));
  const fraction=row=>{const e=result.events?.find(e=>e.date===row.date);return e?.kind==='HALF_DAY'?.5:e&&e.kind!=='OFF_DAY'?0:1;};
  const days=new Map();
  for(const row of [...legacy,...present])days.set(row.date,Math.max(days.get(row.date)??0,row.source==='SHIFT_CONFIRMATION'?1:fraction(row)));
  return {...result,attendance:[...legacy,...present].sort((a,b)=>b.date.localeCompare(a.date)),days:[...days.values()].reduce((a,b)=>a+b,0),
    hours:legacy.reduce((n,r)=>n+r.hours*fraction(r),0)+present.reduce((n,r)=>n+r.hours,0)};
}

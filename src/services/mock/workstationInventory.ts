import type { DeptCode } from '../../types/domain';
import type { WorkstationInventoryRow } from '../../types/equipment';
import { db, DEPT_ORDER, poolIdOf } from './db';

// Seats come from saved platform capacity; a seat exists even without a laptop.
// Accept both historical WS-KANE13-DP-01 and current WS-KANE13-DP01 links.
export function workstationSlot(id: string | null | undefined): number {
  return Number(id?.match(/(\d+)$/)?.[1] ?? 0);
}

export function workstationInventory(): WorkstationInventoryRow[] {
  const devices = new Map<string, typeof db.laptops[number]>();
  for (const laptop of db.laptops) {
    const slot = workstationSlot(laptop.workstationId);
    if (!slot || laptop.status === 'RETIRED') continue;
    const key = `${laptop.platformCode}/${laptop.dept}/${slot}`;
    const previous = devices.get(key);
    if (!previous || (!previous.currentUserId && laptop.currentUserId)) devices.set(key, laptop);
  }
  return [...db.platforms].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })).flatMap(platform =>
    DEPT_ORDER.flatMap((dept: DeptCode) => Array.from({ length: platform.departments[dept] ?? 0 }, (_, index) => ({
      workstationId: `WS-${platform.code.replace(/-/g, '')}-${dept}${String(index + 1).padStart(2, '0')}`,
      poolId: poolIdOf(platform.code, dept), platformCode: platform.code, categoryCode: platform.categoryCode, dept,
      laptop: devices.get(`${platform.code}/${dept}/${index + 1}`) ?? null,
    }))),
  );
}

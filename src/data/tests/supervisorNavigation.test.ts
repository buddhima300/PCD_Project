import { describe, expect, it } from 'vitest';
import { legacyNavByRole, navByRole } from '../navigation';
import { areaLinks, contextualDestination, supervisorAreaFor, supervisorAreas, visibleNavigation } from '../supervisorNavigation';
import type { BreakSnapshot } from '../../features/break-management/contracts';

const snapshot = (monitor = true, policy = true, view = true) => ({ capabilities: { monitor, policy, view, export: false } }) as BreakSnapshot;

describe('supervisor information architecture', () => {
  it('has five unique primary destinations and preserves both staff navigations', () => {
    expect(navByRole.SUPERVISOR).toHaveLength(5);
    expect(new Set(navByRole.SUPERVISOR.map(i => i.to)).size).toBe(5);
    expect(navByRole.EMPLOYEE).toEqual(legacyNavByRole.EMPLOYEE);
    expect(navByRole.FREELANCER).toEqual(legacyNavByRole.FREELANCER);
  });
  it.each(legacyNavByRole.SUPERVISOR)('retains $label in exactly one area', item => {
    const owners = supervisorAreas.filter(area => area.routes.includes(item.to));
    expect(owners).toHaveLength(1);
    expect([...areaLinks(owners[0], snapshot()), owners[0]].some(link => link.to === item.to)).toBe(true);
  });
  it.each(['/employees/E-1', '/freelancers/F-1', '/platforms/P-1', '/laptops/L-1', '/pools/1', '/categories/C-1', '/replacements/R-1', '/platform-config/P-1', '/breaks/reports', '/breaks/policy'])('highlights the parent for deep link %s', path => {
    expect(supervisorAreaFor(path)).toBeDefined();
  });
  it('does not match unrelated route prefixes', () => {
    expect(supervisorAreaFor('/employees-other')).toBeUndefined();
    expect(supervisorAreaFor('/my/assignments')).toBeUndefined();
  });
  it('fails closed for breaks and respects monitor and policy permissions', () => {
    const area = supervisorAreas.find(area => area.id === 'workforce');
    if (!area) throw new Error('Operations area is missing');
    expect(areaLinks(area).filter(i => i.to.startsWith('/breaks'))).toEqual([]);
    expect(areaLinks(area, snapshot(false)).filter(i => i.to.startsWith('/breaks'))).toEqual([]);
    expect(areaLinks(area, snapshot(true, false)).map(i => i.to)).not.toContain('/breaks/policy');
    expect(areaLinks(area, snapshot()).map(i => i.to)).toContain('/breaks/policy');
    expect(visibleNavigation(legacyNavByRole.EMPLOYEE, 'EMPLOYEE', snapshot(false)).map(i => i.to)).toContain('/my/breaks');
    expect(visibleNavigation(legacyNavByRole.EMPLOYEE, 'EMPLOYEE').map(i => i.to)).not.toContain('/my/breaks');
  });
  it('shares compatible scope without leaking tabs or unrelated filters', () => {
    expect(contextualDestination('/off-days', '/roster', '?dept=DP&platform=KANE-13&view=daily&date=2026-10-12')).toBe('/off-days?dept=DP&platform=KANE-13');
    expect(contextualDestination('/employees', '/roster', '?dept=DP')).toBe('/employees');
    expect(contextualDestination('/off-days', '/scheduling', '?dept=DP&platform=KANE-13&view=daily')).toBe('/off-days?dept=DP&platform=KANE-13');
  });
});

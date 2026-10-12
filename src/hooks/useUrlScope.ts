import { useSearchParams } from 'react-router-dom';
import type { Scope } from '../components/ui/ScopeFilters';

export function useUrlScope(includeShift = false): [Scope, (scope: Scope) => void] {
  const [params, setParams] = useSearchParams();
  const department = params.get('dept') ?? '';
  const shift = params.get('shift') ?? '';
  const scope: Scope = {
    category: params.get('category') ?? '', platform: params.get('platform') ?? '',
    dept: department === 'GS' || department === 'DP' || department === 'WD' || department === 'SAFETY' ? department : '',
    ...(includeShift ? { shift: shift === 'MORNING' || shift === 'NIGHT' ? shift : '' } : {}),
  };
  const update = (next: Scope) => setParams(previous => {
    const result = new URLSearchParams(previous);
    for (const key of ['category', 'platform', 'dept', ...(includeShift ? ['shift'] : [])] as (keyof Scope)[]) {
      const value = next[key];
      if (value) result.set(key, value); else result.delete(key);
    }
    return result;
  });
  return [scope, update];
}

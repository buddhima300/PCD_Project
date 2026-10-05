import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

// Cached reference data (categories + platform list) shared by every filter bar.
export function useReferenceData() {
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.listCategories(), staleTime: 5 * 60_000 });
  const platforms = useQuery({ queryKey: ['platforms', {}], queryFn: () => api.listPlatforms({}), staleTime: 5 * 60_000 });
  return { categories: categories.data ?? [], platforms: platforms.data ?? [] };
}
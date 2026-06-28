import { useQuery } from '@tanstack/react-query';
import helper from '@/utils/helper';
import developerService from './developer.services';
import { School } from './developer.type';

/**
 * Query-key factory for the developer feature. Mirror this pattern in every
 * feature's `<feature>.queries.ts` (see `src/store/README.md`).
 */
export const developerKeys = {
  all: ['developer'] as const,
  schools: () => [...developerKeys.all, 'schools'] as const,
};

const fetchSchools = async (): Promise<School[]> => {
  const response = await developerService.fetchSchools();
  const result = helper.successResponse(response, 'Schools fetched successfully');
  return result.data?.schools ?? [];
};

/**
 * Server data for the schools list. React Query owns loading / error / caching /
 * invalidation — there are no manual `hasFetched` / `isFetching` flags in a store.
 * This is the reference implementation for the store ↔ React Query boundary.
 */
export const useSchoolsQuery = () =>
  useQuery({
    queryKey: developerKeys.schools(),
    queryFn: fetchSchools,
  });

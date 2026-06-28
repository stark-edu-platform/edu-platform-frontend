import { create } from 'zustand';
import helper from '@/utils/helper';
import developerService from './developer.services';
import { FetchSchoolsResponse, School } from './developer.type';
import { registerResettable } from '@/store/reset-registry';

interface DeveloperState {
  schoolsById: Record<string, School>;
  schoolIds: string[];
  isFetchingSchools: boolean;
  hasFetchedSchools: boolean;
  fetchSchools: () => Promise<FetchSchoolsResponse>;
  clearSchools: () => void;
  reset: () => void;
}

const initialData = {
  schoolsById: {},
  schoolIds: [],
};

const emptyState = {
  ...initialData,
  isFetchingSchools: false,
  hasFetchedSchools: false,
};

export const useDeveloperStore = create<DeveloperState>()((set) => ({
  ...initialData,
  isFetchingSchools: false,
  hasFetchedSchools: false,

  fetchSchools: async () => {
    set({ isFetchingSchools: true });

    try {
      const response = await developerService.fetchSchools();
      const result = helper.successResponse(response, 'Schools fetched successfully');
      const schools = result.data?.schools ?? [];
      const schoolsById = schools.reduce<Record<string, School>>((accumulator, school) => {
        accumulator[school.schoolId] = school;
        return accumulator;
      }, {});

      set({
        schoolsById,
        schoolIds: schools.map((school) => school.schoolId),
        isFetchingSchools: false,
        hasFetchedSchools: true,
      });

      return result;
    } catch (error) {
      set({
        ...initialData,
        isFetchingSchools: false,
        hasFetchedSchools: true,
      });
      return helper.errorResponse(error, 'Failed to fetch schools');
    }
  },

  clearSchools: () => {
    set({ ...emptyState });
  },

  reset: () => {
    set({ ...emptyState });
  },
}));

// Participate in the global client-state wipe (logout / unrecoverable 401).
registerResettable(() => useDeveloperStore.getState().reset());

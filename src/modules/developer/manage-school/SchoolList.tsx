'use client';
import { MainWrapper, DataGrid } from '@/components';
import { getSchoolColumns, getSchoolDataset } from './utils';
import { useSchoolsQuery } from '@/store/developer/developer.queries';
export default function SchoolList() {
  const columns = getSchoolColumns();
  const { data: schools = [], isLoading } = useSchoolsQuery();
  const dataset = getSchoolDataset(schools);
  return (
    <MainWrapper
      tobBar
      pageTitle="All Schools"
      pageSubTitle="Manage schools and school groups with school admin"
    >
      <DataGrid header={columns} dataset={dataset} isLoading={isLoading} />
    </MainWrapper>
  );
}

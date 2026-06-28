import { GridColumn, GRID_COLUMN_TYPE } from '@/components';
import { School } from '@/store/developer/developer.type';

export const getSchoolColumns = (): GridColumn[] => {
  return [
    {
      field: 'name',
      type: GRID_COLUMN_TYPE.STRING,
      label: 'Name',
      width: 240,
    },
    {
      field: 'email',
      type: GRID_COLUMN_TYPE.EMAIL,
      label: 'School Email',
      width: 150,
    },
    {
      field: 'phone',
      type: GRID_COLUMN_TYPE.NUMBER,
      label: 'School Phone',
      width: 140,
    },
    {
      field: 'status',
      type: GRID_COLUMN_TYPE.SELECT,
      label: 'Status',
      width: 130,
    },
    {
      field: 'createdAt',
      type: GRID_COLUMN_TYPE.DATE,
      label: 'Created At',
      width: 130,
    },
    {
      field: 'admin_name',
      type: GRID_COLUMN_TYPE.STRING,
      label: 'Admin Name',
      width: 150,
    },
    {
      field: 'admin_email',
      type: GRID_COLUMN_TYPE.EMAIL,
      label: 'Admin Email',
      width: 150,
    },
  ];
};

export const getSchoolDataset = (schools: School[]) => {
  return schools.map((school: School) => {
    return {
      ...school,
      _id: school?.schoolId,
      admin_name: school?.admin?.name,
      admin_email: school?.admin?.email,
    };
  });
};

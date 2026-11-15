export type RotaType = 'AC' | 'AP';

export interface DoctorInput {
  id: string;
  name: string;
  department: string;
}

export interface HolidayApiItem {
  date: string;
  localName: string;
  name: string;
  countryCode: string;
  fixed: boolean;
  global: boolean;
  counties: string[] | null;
  launchYear: number | null;
  types: string[];
}

export const CITY = 'Madrid';
export const YEAR_2026 = 2026;

export const AC_POOL_4: DoctorInput[] = [
  { id: 'doc-001', name: 'Dr. Garcia', department: 'Medicina General' },
  { id: 'doc-002', name: 'Dr. Lopez', department: 'Pediatria' },
  { id: 'doc-003', name: 'Dr. Martinez', department: 'Cardiologia' },
  { id: 'doc-004', name: 'Dr. Sanchez', department: 'Neurologia' },
];

export const AP_POOL_5: DoctorInput[] = [
  { id: 'doc-011', name: 'Dr. Navarro', department: 'Urologia' },
  { id: 'doc-012', name: 'Dr. Torres', department: 'Neumologia' },
  { id: 'doc-013', name: 'Dr. Dominguez', department: 'Endocrinologia' },
  { id: 'doc-014', name: 'Dr. Vazquez', department: 'Reumatologia' },
  { id: 'doc-015', name: 'Dr. Ramos', department: 'Medicina General' },
];

export const AP_POOL_8: DoctorInput[] = [
  ...AP_POOL_5,
  { id: 'doc-016', name: 'Dr. Iglesias', department: 'Medicina General' },
  { id: 'doc-017', name: 'Dr. Marin', department: 'Medicina General' },
  { id: 'doc-018', name: 'Dr. Castro', department: 'Medicina General' },
];

export const AP_POOL_9: DoctorInput[] = [
  ...AP_POOL_8,
  { id: 'doc-019', name: 'Dr. Blanco', department: 'Medicina General' },
];

export const AP_POOL_12: DoctorInput[] = [
  ...AP_POOL_9,
  { id: 'doc-020', name: 'Dr. Gil', department: 'Medicina General' },
  { id: 'doc-021', name: 'Dr. Serrano', department: 'Medicina General' },
  { id: 'doc-022', name: 'Dr. Prieto', department: 'Medicina General' },
];

export const AP_POOL_17: DoctorInput[] = [
  ...AP_POOL_12,
  { id: 'doc-023', name: 'Dr. Ortega', department: 'Medicina General' },
  { id: 'doc-024', name: 'Dr. Rubio', department: 'Medicina General' },
  { id: 'doc-025', name: 'Dr. Molina', department: 'Medicina General' },
  { id: 'doc-026', name: 'Dr. Delgado', department: 'Medicina General' },
  { id: 'doc-027', name: 'Dr. Suarez', department: 'Medicina General' },
];

export const HOLIDAY_API_RESPONSE:HolidayApiItem[] = [
  {
    date: '2026-01-01',
    localName: 'Ano Nuevo',
    name: "New Year's Day",
    countryCode: 'ES',
    fixed: true,
    global: true,
    counties: null,
    launchYear: null,
    types: ['Public'],
  },
  {
    date: '2026-01-06',
    localName: 'Dia de Reyes',
    name: 'Epiphany',
    countryCode: 'ES',
    fixed: true,
    global: true,
    counties: null,
    launchYear: null,
    types: ['Public'],
  },
  {
    date: '2026-05-01',
    localName: 'Dia del Trabajador',
    name: 'Labour Day',
    countryCode: 'ES',
    fixed: true,
    global: true,
    counties: null,
    launchYear: null,
    types: ['Public'],
  },
  {
    date: '2026-08-15',
    localName: 'Asuncion',
    name: 'Assumption of Mary',
    countryCode: 'ES',
    fixed: true,
    global: true,
    counties: null,
    launchYear: null,
    types: ['Public'],
  },
  {
    date: '2026-12-25',
    localName: 'Navidad',
    name: 'Christmas Day',
    countryCode: 'ES',
    fixed: true,
    global: true,
    counties: null,
    launchYear: null,
    types: ['Public'],
  },
];

export const HOLIDAY_API_RESPONSE_WITH_REGIONS: HolidayApiItem[] = [
  {
    date: '2026-01-01',
    localName: 'Ano Nuevo',
    name: "New Year's Day",
    countryCode: 'ES',
    fixed: true,
    global: true,
    counties: null,
    launchYear: null,
    types: ['Public'],
  },
  {
    date: '2026-03-19',
    localName: 'San Jose',
    name: "St. Joseph's Day",
    countryCode: 'ES',
    fixed: true,
    global: false,
    counties: ['ES-VC', 'ES-MC'],
    launchYear: null,
    types: ['Public'],
  },
  {
    date: '2026-04-23',
    localName: 'Sant Jordi',
    name: "St. George's Day",
    countryCode: 'ES',
    fixed: true,
    global: false,
    counties: ['ES-CT'],
    launchYear: null,
    types: ['Public'],
  },
  {
    date: '2026-05-02',
    localName: 'Dia de la Comunidad de Madrid',
    name: 'Madrid Day',
    countryCode: 'ES',
    fixed: true,
    global: false,
    counties: ['ES-MD'],
    launchYear: null,
    types: ['Public'],
  },
];

export const HOLIDAYS_2026 = [
  new Date('2026-01-01'),
  new Date('2026-01-06'),
  new Date('2026-04-02'),
  new Date('2026-04-03'),
  new Date('2026-05-01'),
  new Date('2026-08-15'),
  new Date('2026-10-12'),
  new Date('2026-11-02'),
  new Date('2026-12-07'),
  new Date('2026-12-08'),
  new Date('2026-12-25'),
];

export function toHolidaySet(dates: Date[]): Set<Date> {
  return new Set(dates);
}

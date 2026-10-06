/**
 * Redeemer's University (RUN) Academic Structure
 * Authoritative listing of 10 Faculties and their constituent undergraduate departments.
 */

export interface Faculty {
  id: string;
  name: string;
  shortName: string;
  departments: string[];
}

export const ACADEMIC_FACULTIES: Faculty[] = [
  {
    id: 'basic-medical',
    name: 'Faculty of Basic Medical Sciences',
    shortName: 'FBMS',
    departments: [
      'Biochemistry',
      'Human Anatomy',
      'Human Physiology',
      'Public Health',
      'Nursing Science',
      'Physiotherapy',
      'Medical Laboratory Science',
    ],
  },
  {
    id: 'education',
    name: 'Faculty of Education',
    shortName: 'FEDU',
    departments: [
      'Educational Technology',
      'Technical Education',
      'Industrial Technology Education',
      'Educational Management',
    ],
  },
  {
    id: 'engineering',
    name: 'Faculty of Engineering and Technology',
    shortName: 'FENG',
    departments: [
      'Civil Engineering',
      'Computer Engineering',
      'Electrical & Electronic Engineering',
      'Mechanical Engineering',
      'Mechatronics Engineering',
    ],
  },
  {
    id: 'built-environment',
    name: 'Faculty of Built Environment Studies',
    shortName: 'FBES',
    departments: [
      'Architecture',
      'Building Technology',
      'Estate Management',
      'Quantity Surveying',
      'Urban & Regional Planning',
    ],
  },
  {
    id: 'humanities',
    name: 'Faculty of Humanities',
    shortName: 'FHUM',
    departments: [
      'Christian Religious Studies',
      'English',
      'French',
      'History & International Studies',
      'Philosophy',
      'Theatre Arts',
    ],
  },
  {
    id: 'law',
    name: 'Faculty of Law',
    shortName: 'FLAW',
    departments: [
      'Law',
    ],
  },
  {
    id: 'management-sciences',
    name: 'Faculty of Management Sciences',
    shortName: 'FMS',
    departments: [
      'Accounting',
      'Actuarial Science',
      'Banking & Finance',
      'Business Administration',
      'Hospitality & Tourism Management',
      'Insurance',
      'Marketing',
      'Public Administration',
      'Transport Management',
    ],
  },
  {
    id: 'natural-sciences',
    name: 'Faculty of Natural Sciences',
    shortName: 'FNS',
    departments: [
      'Environmental Management & Toxicology',
      'Geology',
      'Industrial Chemistry',
      'Industrial Mathematics',
      'Industrial Mathematics & Computer Science',
      'Microbiology',
      'Petroleum Chemistry',
      'Physics with Electronics',
      'Statistics',
      'Statistics & Data Science',
    ],
  },
  {
    id: 'social-sciences',
    name: 'Faculty of Social Sciences',
    shortName: 'FSS',
    departments: [
      'Economics',
      'Mass Communication',
      'Political Science',
      'Psychology',
      'Sociology',
      'Social Work',
    ],
  },
  {
    id: 'computing',
    name: 'Faculty of Computing and Digital Technology',
    shortName: 'FCDT',
    departments: [
      'Computer Science',
      'Cyber Security',
      'Information Technology',
    ],
  },
];

/**
 * List of all faculty names in Redeemer's University.
 */
export const FACULTY_NAMES: string[] = ACADEMIC_FACULTIES.map((f) => f.name);

/**
 * Map of Department Name -> Parent Faculty Name
 */
export const DEPARTMENT_TO_FACULTY_MAP: Record<string, string> = {};

ACADEMIC_FACULTIES.forEach((faculty) => {
  faculty.departments.forEach((dept) => {
    DEPARTMENT_TO_FACULTY_MAP[dept] = faculty.name;
    // Also map with "Department of " prefix if encountered
    DEPARTMENT_TO_FACULTY_MAP[`Department of ${dept}`] = faculty.name;
  });
});

/**
 * Flattened and sorted list of all unique undergraduate departments.
 */
export const ALL_DEPARTMENTS: string[] = Array.from(
  new Set(ACADEMIC_FACULTIES.flatMap((f) => f.departments))
).sort((a, b) => a.localeCompare(b));

/**
 * Helper to get all departments under a given faculty name.
 */
export function getDepartmentsForFaculty(facultyName?: string | null): string[] {
  if (!facultyName) return ALL_DEPARTMENTS;
  const faculty = ACADEMIC_FACULTIES.find(
    (f) =>
      f.name.toLowerCase() === facultyName.toLowerCase() ||
      f.shortName.toLowerCase() === facultyName.toLowerCase() ||
      f.id.toLowerCase() === facultyName.toLowerCase()
  );
  return faculty ? [...faculty.departments].sort((a, b) => a.localeCompare(b)) : ALL_DEPARTMENTS;
}

/**
 * Helper to get the parent faculty for a given department.
 */
export function getFacultyForDepartment(departmentName?: string | null): string | undefined {
  if (!departmentName) return undefined;
  // Direct lookup
  if (DEPARTMENT_TO_FACULTY_MAP[departmentName]) {
    return DEPARTMENT_TO_FACULTY_MAP[departmentName];
  }
  // Case-insensitive lookup
  const clean = departmentName.replace(/^department\s+of\s+/i, '').trim().toLowerCase();
  for (const faculty of ACADEMIC_FACULTIES) {
    const match = faculty.departments.find((d) => d.toLowerCase() === clean);
    if (match) return faculty.name;
  }
  return undefined;
}

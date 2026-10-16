import {
  ACADEMIC_FACULTIES,
  FACULTY_NAMES,
  DEPARTMENT_TO_FACULTY_MAP,
  ALL_DEPARTMENTS,
  getDepartmentsForFaculty,
  getFacultyForDepartment,
} from '../src/constants/academicStructure';

describe('academicStructure.ts unit tests', () => {
  describe('Authoritative Faculties and Departments list', () => {
    it('contains all 10 Redeemer\'s University faculties', () => {
      expect(ACADEMIC_FACULTIES).toHaveLength(10);
      expect(FACULTY_NAMES).toHaveLength(10);
    });

    it('each faculty has valid id, name, shortName and non-empty departments', () => {
      for (const faculty of ACADEMIC_FACULTIES) {
        expect(faculty.id).toBeTruthy();
        expect(faculty.name).toMatch(/^Faculty of /);
        expect(faculty.shortName).toBeTruthy();
        expect(Array.isArray(faculty.departments)).toBe(true);
        expect(faculty.departments.length).toBeGreaterThan(0);
      }
    });

    it('ALL_DEPARTMENTS contains sorted, unique departments', () => {
      expect(ALL_DEPARTMENTS.length).toBeGreaterThan(30);
      const sorted = [...ALL_DEPARTMENTS].sort((a, b) => a.localeCompare(b));
      expect(ALL_DEPARTMENTS).toEqual(sorted);
      const unique = Array.from(new Set(ALL_DEPARTMENTS));
      expect(ALL_DEPARTMENTS.length).toBe(unique.length);
    });

    it('DEPARTMENT_TO_FACULTY_MAP correctly maps departments and "Department of" prefix', () => {
      expect(DEPARTMENT_TO_FACULTY_MAP['Computer Science']).toBe('Faculty of Computing and Digital Technology');
      expect(DEPARTMENT_TO_FACULTY_MAP['Department of Computer Science']).toBe('Faculty of Computing and Digital Technology');
      expect(DEPARTMENT_TO_FACULTY_MAP['Nursing Science']).toBe('Faculty of Basic Medical Sciences');
      expect(DEPARTMENT_TO_FACULTY_MAP['Department of Nursing Science']).toBe('Faculty of Basic Medical Sciences');
    });
  });

  describe('getDepartmentsForFaculty', () => {
    it('returns all departments when called without argument or with null/undefined', () => {
      expect(getDepartmentsForFaculty()).toEqual(ALL_DEPARTMENTS);
      expect(getDepartmentsForFaculty(null)).toEqual(ALL_DEPARTMENTS);
      expect(getDepartmentsForFaculty(undefined)).toEqual(ALL_DEPARTMENTS);
      expect(getDepartmentsForFaculty('')).toEqual(ALL_DEPARTMENTS);
    });

    it('returns departments for a faculty matched by exact full name', () => {
      const depts = getDepartmentsForFaculty('Faculty of Engineering');
      expect(depts).toContain('Civil Engineering');
      expect(depts).toContain('Electrical & Electronic Engineering');
      expect(depts).toContain('Mechanical Engineering');
      expect(depts).not.toContain('Biochemistry');
    });

    it('returns departments matched case-insensitively', () => {
      const depts = getDepartmentsForFaculty('faculty of law');
      expect(depts).toEqual(['Law']);
    });

    it('returns departments matched by shortName', () => {
      const depts = getDepartmentsForFaculty('FCDT');
      expect(depts).toEqual(['Computer Science', 'Cyber Security', 'Information Technology']);
    });

    it('returns departments matched by ID', () => {
      const depts = getDepartmentsForFaculty('computing');
      expect(depts).toEqual(['Computer Science', 'Cyber Security', 'Information Technology']);
    });

    it('returns all departments if the faculty name is unrecognized', () => {
      const depts = getDepartmentsForFaculty('Non-existent Faculty of Sorcery');
      expect(depts).toEqual(ALL_DEPARTMENTS);
    });
  });

  describe('getFacultyForDepartment', () => {
    it('returns undefined when called with empty, null, or undefined', () => {
      expect(getFacultyForDepartment()).toBeUndefined();
      expect(getFacultyForDepartment(null)).toBeUndefined();
      expect(getFacultyForDepartment('')).toBeUndefined();
    });

    it('resolves direct department names correctly', () => {
      expect(getFacultyForDepartment('Accounting')).toBe('Faculty of Management Sciences');
      expect(getFacultyForDepartment('Computer Science')).toBe('Faculty of Computing and Digital Technology');
      expect(getFacultyForDepartment('Mass Communication')).toBe('Faculty of Social Sciences');
      expect(getFacultyForDepartment('Law')).toBe('Faculty of Law');
    });

    it('resolves "Department of ..." prefixes correctly', () => {
      expect(getFacultyForDepartment('Department of Accounting')).toBe('Faculty of Management Sciences');
      expect(getFacultyForDepartment('Department of Mass Communication')).toBe('Faculty of Social Sciences');
    });

    it('resolves case-insensitively and handles whitespace', () => {
      expect(getFacultyForDepartment('  computer science  ')).toBe('Faculty of Computing and Digital Technology');
      expect(getFacultyForDepartment('department of biochemistry')).toBe('Faculty of Basic Medical Sciences');
    });

    it('returns undefined for non-existent departments', () => {
      expect(getFacultyForDepartment('Astronautical Engineering')).toBeUndefined();
    });
  });
});

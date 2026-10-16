import {
  fetchLecturerCourses,
  fetchCourseInstructors,
  addCoLecturer,
  removeCoLecturer,
  searchAvailableLecturers,
} from '../src/lib/courseService';
import * as neonModule from '../src/lib/neon';

jest.mock('../src/lib/neon', () => ({
  executeSql: jest.fn(),
  db: {
    from: jest.fn(),
  },
}));

describe('courseService.ts unit tests', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('fetchLecturerCourses', () => {
    it('returns combined lead and co-taught courses from SQL execute', async () => {
      const mockCourses = [
        {
          id: 'course-1',
          course_code: 'CSC 401',
          course_title: 'Software Engineering',
          lecturer_id: 'user-lead-1',
          level: '400',
          created_at: '2026-09-01T00:00:00Z',
          user_role: 'lead',
          lead_lecturer: { id: 'user-lead-1', name: 'Dr. Lead', email: 'lead@run.edu.ng' },
        },
        {
          id: 'course-2',
          course_code: 'CSC 405',
          course_title: 'Artificial Intelligence',
          lecturer_id: 'user-lead-2',
          level: '400',
          created_at: '2026-09-02T00:00:00Z',
          user_role: 'co_lecturer',
          lead_lecturer: { id: 'user-lead-2', name: 'Prof. Other', email: 'other@run.edu.ng' },
        },
      ];

      (neonModule.executeSql as jest.Mock).mockResolvedValueOnce({
        data: mockCourses,
        error: null,
      });

      const courses = await fetchLecturerCourses('user-lead-1');
      expect(courses).toHaveLength(2);
      expect(courses[0].user_role).toBe('lead');
      expect(courses[1].user_role).toBe('co_lecturer');
      expect(neonModule.executeSql).toHaveBeenCalled();
    });

    it('falls back to direct query on executeSql error', async () => {
      (neonModule.executeSql as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: { message: 'relation does not exist' },
      });

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [
            {
              id: 'course-fallback',
              course_code: 'CSC 101',
              course_title: 'Intro to CS',
              lecturer_id: 'user-1',
            },
          ],
        }),
      };
      (neonModule.db.from as jest.Mock).mockReturnValue(mockQueryBuilder);

      const courses = await fetchLecturerCourses('user-1');
      expect(courses).toHaveLength(1);
      expect(courses[0].user_role).toBe('lead');
      expect(courses[0].course_code).toBe('CSC 101');
    });

    it('returns empty array on unexpected exception', async () => {
      (neonModule.executeSql as jest.Mock).mockRejectedValueOnce(new Error('Fatal connection fault'));

      const courses = await fetchLecturerCourses('user-err');
      expect(courses).toEqual([]);
    });
  });

  describe('fetchCourseInstructors', () => {
    it('fetches lead lecturer and co-lecturers', async () => {
      // 1. Lead SQL
      (neonModule.executeSql as jest.Mock).mockResolvedValueOnce({
        data: [
          {
            lecturer_id: 'user-lead',
            name: 'Dr. Lead Lecturer',
            email: 'lead@run.edu.ng',
            staff_id: 'RUN/STAFF/001',
            department: 'Computer Science',
          },
        ],
      });
      // 2. Co-lecturers SQL
      (neonModule.executeSql as jest.Mock).mockResolvedValueOnce({
        data: [
          {
            id: 'cl-1',
            lecturer_id: 'user-co-1',
            name: 'Dr. Assistant Lecturer',
            email: 'co@run.edu.ng',
            staff_id: 'RUN/STAFF/002',
            department: 'Computer Science',
            role: 'co_lecturer',
          },
        ],
      });

      const result = await fetchCourseInstructors('course-100');
      expect(result.lead).toBeDefined();
      expect(result.lead?.name).toBe('Dr. Lead Lecturer');
      expect(result.lead?.role).toBe('lead');
      expect(result.coLecturers).toHaveLength(1);
      expect(result.coLecturers[0].name).toBe('Dr. Assistant Lecturer');
      expect(result.coLecturers[0].role).toBe('co_lecturer');
    });

    it('returns null lead when no course instructor is found', async () => {
      (neonModule.executeSql as jest.Mock).mockResolvedValueOnce({ data: [] });
      (neonModule.executeSql as jest.Mock).mockResolvedValueOnce({ data: [] });

      const result = await fetchCourseInstructors('unknown-course');
      expect(result.lead).toBeNull();
      expect(result.coLecturers).toEqual([]);
    });
  });

  describe('addCoLecturer', () => {
    it('successfully assigns a co-lecturer', async () => {
      const mockQueryBuilder = {
        insert: jest.fn().mockResolvedValue({ error: null }),
      };
      (neonModule.db.from as jest.Mock).mockReturnValue(mockQueryBuilder);

      const res = await addCoLecturer('course-1', 'lecturer-2');
      expect(res).toEqual({ success: true });
      expect(mockQueryBuilder.insert).toHaveBeenCalledWith({
        course_id: 'course-1',
        lecturer_id: 'lecturer-2',
        role: 'co_lecturer',
      });
    });

    it('returns friendly message on unique constraint violation', async () => {
      const mockQueryBuilder = {
        insert: jest.fn().mockResolvedValue({
          error: { message: 'duplicate key value violates unique constraint "idx_course_lecturers"' },
        }),
      };
      (neonModule.db.from as jest.Mock).mockReturnValue(mockQueryBuilder);

      const res = await addCoLecturer('course-1', 'lecturer-2');
      expect(res.success).toBe(false);
      expect(res.error).toBe('This lecturer is already assigned to this course.');
    });

    it('returns generic error on insertion failure', async () => {
      const mockQueryBuilder = {
        insert: jest.fn().mockResolvedValue({
          error: { message: 'Database permission denied' },
        }),
      };
      (neonModule.db.from as jest.Mock).mockReturnValue(mockQueryBuilder);

      const res = await addCoLecturer('course-1', 'lecturer-2');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Database permission denied');
    });
  });

  describe('removeCoLecturer', () => {
    it('executes SQL delete successfully', async () => {
      (neonModule.executeSql as jest.Mock).mockResolvedValueOnce({ error: null });

      const res = await removeCoLecturer('course-1', 'lecturer-2');
      expect(res).toEqual({ success: true });
      expect(neonModule.executeSql).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM public.course_lecturers WHERE course_id = 'course-1' AND lecturer_id = 'lecturer-2';")
      );
    });

    it('returns error when removal fails', async () => {
      (neonModule.executeSql as jest.Mock).mockResolvedValueOnce({
        error: { message: 'Foreign key constraint violated' },
      });

      const res = await removeCoLecturer('course-1', 'lecturer-2');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Foreign key constraint violated');
    });
  });

  describe('searchAvailableLecturers', () => {
    it('filters by query and excludes specified ids', async () => {
      (neonModule.executeSql as jest.Mock).mockResolvedValueOnce({
        data: [
          {
            id: 'lect-found-1',
            name: 'Dr. Search Match',
            email: 'match@run.edu.ng',
            staff_id: 'RUN/009',
            department: 'Computer Science',
          },
        ],
      });

      const lecturers = await searchAvailableLecturers('match', 'Computer Science', ['exclude-1', 'exclude-2']);
      expect(lecturers).toHaveLength(1);
      expect(neonModule.executeSql).toHaveBeenCalledWith(
        expect.stringContaining("id NOT IN ('exclude-1', 'exclude-2')")
      );
      expect(neonModule.executeSql).toHaveBeenCalledWith(
        expect.stringContaining("name ILIKE '%match%'")
      );
    });

    it('filters by department when query is empty', async () => {
      (neonModule.executeSql as jest.Mock).mockResolvedValueOnce({
        data: [],
      });

      await searchAvailableLecturers('', 'Computer Science');
      expect(neonModule.executeSql).toHaveBeenCalledWith(
        expect.stringContaining("department = 'Computer Science'")
      );
    });

    it('returns empty array on failure', async () => {
      (neonModule.executeSql as jest.Mock).mockRejectedValueOnce(new Error('Query timeout'));

      const results = await searchAvailableLecturers('test');
      expect(results).toEqual([]);
    });
  });
});

import { db, executeSql } from '../src/lib/neon';

describe('neon.ts QueryBuilder and SQL Driver unit tests', () => {
  const originalFetch = (globalThis as any).fetch;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
    consoleErrorSpy.mockRestore();
  });

  describe('executeSql', () => {
    it('executes SQL query over HTTP endpoint and returns rows', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rows: [{ id: '1', name: 'Test' }] }),
      });

      const res = await executeSql('SELECT * FROM public.users;');
      expect(res.data).toEqual([{ id: '1', name: 'Test' }]);
      expect(res.error).toBeNull();
    });

    it('translates network offline errors into friendly message', async () => {
      (globalThis as any).fetch = jest.fn().mockRejectedValueOnce(new Error('Failed to fetch from neon.tech'));

      const res = await executeSql('SELECT 1;');
      expect(res.data).toBeNull();
      expect(res.error.message).toContain('No internet connection');
    });

    it('returns server error payload when HTTP status is not ok', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ code: '42P01', message: 'relation does not exist' }),
      });

      const res = await executeSql('SELECT * FROM unknown_table;');
      expect(res.data).toBeNull();
      expect(res.error.code).toBe('42P01');
    });
  });

  describe('QueryBuilder syntax and execution', () => {
    it('builds and executes SELECT query with where clauses, order, and limit', async () => {
      let executedSql = '';
      (globalThis as any).fetch = jest.fn().mockImplementation((url, opts) => {
        const body = JSON.parse(opts.body);
        executedSql = body.query;
        return Promise.resolve({
          ok: true,
          json: async () => ({ rows: [{ id: 'u1', name: 'Alice' }] }),
        });
      });

      const result = await db
        .from('users')
        .select('id, name')
        .eq('role', 'student')
        .neq('status', 'suspended')
        .order('created_at', { ascending: false })
        .limit(10);

      expect(result.data).toEqual([{ id: 'u1', name: 'Alice' }]);
      expect(executedSql).toContain('SELECT public.users.* FROM public.users');
      expect(executedSql).toContain("public.users.role = 'student'");
      expect(executedSql).toContain("public.users.status != 'suspended'");
      expect(executedSql).toContain('ORDER BY public.users.created_at DESC');
      expect(executedSql).toContain('LIMIT 10');
    });

    it('handles numeric and boolean comparisons (gt, gte, lt, lte, in)', async () => {
      let executedSql = '';
      (globalThis as any).fetch = jest.fn().mockImplementation((url, opts) => {
        const body = JSON.parse(opts.body);
        executedSql = body.query;
        return Promise.resolve({
          ok: true,
          json: async () => ({ rows: [] }),
        });
      });

      await db
        .from('attendance_sessions')
        .select('*')
        .gt('radius_meters', 20)
        .gte('created_at', '2026-01-01')
        .lt('radius_meters', 100)
        .lte('end_time', '2026-12-31')
        .in('status', ['active', 'paused']);

      expect(executedSql).toContain('public.attendance_sessions.radius_meters > 20');
      expect(executedSql).toContain("public.attendance_sessions.created_at >= '2026-01-01'");
      expect(executedSql).toContain('public.attendance_sessions.radius_meters < 100');
      expect(executedSql).toContain("public.attendance_sessions.status IN ('active', 'paused')");
    });

    it('handles null comparisons correctly with IS NULL and IS NOT NULL', async () => {
      let executedSql = '';
      (globalThis as any).fetch = jest.fn().mockImplementation((url, opts) => {
        const body = JSON.parse(opts.body);
        executedSql = body.query;
        return Promise.resolve({
          ok: true,
          json: async () => ({ rows: [] }),
        });
      });

      await db
        .from('users')
        .select('*')
        .eq('matric_number', null)
        .neq('staff_id', null);

      expect(executedSql).toContain('public.users.matric_number IS NULL');
      expect(executedSql).toContain('public.users.staff_id IS NOT NULL');
    });

    it('builds INSERT queries with correctly escaped and quoted columns', async () => {
      let executedSql = '';
      (globalThis as any).fetch = jest.fn().mockImplementation((url, opts) => {
        const body = JSON.parse(opts.body);
        executedSql = body.query;
        return Promise.resolve({
          ok: true,
          json: async () => ({ rows: [{ id: 'new-id' }] }),
        });
      });

      await db.from('courses').insert({
        course_code: "CSC 301's Test",
        course_title: 'Database Systems',
        lecturer_id: 'lect-1',
      });

      expect(executedSql).toContain('INSERT INTO public.courses ("course_code", "course_title", "lecturer_id")');
      expect(executedSql).toContain("VALUES ('CSC 301''s Test', 'Database Systems', 'lect-1')");
      expect(executedSql).toContain('RETURNING *;');
    });

    it('builds UPDATE queries with SET clauses and WHERE filters', async () => {
      let executedSql = '';
      (globalThis as any).fetch = jest.fn().mockImplementation((url, opts) => {
        const body = JSON.parse(opts.body);
        executedSql = body.query;
        return Promise.resolve({
          ok: true,
          json: async () => ({ rows: [{ id: 'updated-id' }] }),
        });
      });

      await db
        .from('attendance_records')
        .update({ status: 'present' })
        .eq('id', 'rec-123');

      expect(executedSql).toContain('UPDATE public.attendance_records SET "status" = \'present\'');
      expect(executedSql).toContain("WHERE public.attendance_records.id = 'rec-123'");
      expect(executedSql).toContain('RETURNING *;');
    });

    it('builds DELETE queries with WHERE filters', async () => {
      let executedSql = '';
      (globalThis as any).fetch = jest.fn().mockImplementation((url, opts) => {
        const body = JSON.parse(opts.body);
        executedSql = body.query;
        return Promise.resolve({
          ok: true,
          json: async () => ({ rows: [] }),
        });
      });

      await db
        .from('course_lecturers')
        .delete()
        .eq('course_id', 'c-1')
        .eq('lecturer_id', 'l-2');

      expect(executedSql).toContain('DELETE FROM public.course_lecturers');
      expect(executedSql).toContain("public.course_lecturers.course_id = 'c-1'");
      expect(executedSql).toContain("public.course_lecturers.lecturer_id = 'l-2'");
    });

    it('supports count exact queries', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rows: [{ count: 42 }] }),
      });

      const res = await db.from('enrollments').select('*', { count: 'exact' });
      expect(res.count).toBe(42);
    });

    it('single() returns single object or null instead of array', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rows: [{ id: 'user-single' }] }),
      });

      const res = await db.from('users').select('*').eq('id', 'user-single').single();
      expect(res.data).toEqual({ id: 'user-single' });
    });

    it('synthesizes joined projections for nested relation queries', async () => {
      let executedSql = '';
      (globalThis as any).fetch = jest.fn().mockImplementation((url, opts) => {
        const body = JSON.parse(opts.body);
        executedSql = body.query;
        return Promise.resolve({
          ok: true,
          json: async () => ({ rows: [] }),
        });
      });

      await db
        .from('attendance_records')
        .select('*, course:course_id(course_code), student:student_id(name), session:session_id(start_time)');

      expect(executedSql).toContain('LEFT JOIN public.courses __course ON __course.id = public.attendance_records.course_id');
      expect(executedSql).toContain('LEFT JOIN public.users __student ON __student.id = public.attendance_records.student_id');
      expect(executedSql).toContain('LEFT JOIN public.attendance_sessions __session ON __session.id = public.attendance_records.session_id');
      expect(executedSql).toContain('row_to_json(__course.*) as course');
    });
  });

  describe('RealtimeChannel subscription', () => {
    it('creates channel and allows register of listener callbacks', () => {
      const callback = jest.fn();
      const channel = db.channel('test-channel-sync');
      expect(channel).toBeDefined();

      channel.on('postgres_changes', { event: 'INSERT', table: 'attendance_records' }, callback);
      const sub = channel.subscribe();
      expect(sub.unsubscribe).toBeDefined();

      sub.unsubscribe();
      db.removeChannel(channel);
    });
  });
});

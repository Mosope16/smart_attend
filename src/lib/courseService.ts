import { db, executeSql } from './neon';

export interface CourseInstructor {
  id: string; // junction id or user id
  lecturer_id: string;
  name: string;
  email: string;
  staff_id?: string | null;
  department?: string | null;
  role: 'lead' | 'co_lecturer';
}

export interface LecturerCourse {
  id: string;
  course_code: string;
  course_title: string;
  lecturer_id: string; // Lead lecturer ID
  level?: string | null;
  created_at?: string;
  user_role: 'lead' | 'co_lecturer';
  lead_lecturer?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

/**
 * Fetches all courses where the specified user is either the Lead Lecturer
 * or an assigned Co-Lecturer.
 */
export async function fetchLecturerCourses(userId: string): Promise<LecturerCourse[]> {
  try {
    const escapedUserId = String(userId).replace(/'/g, "''");

    const sql = `
      SELECT 
        c.id,
        c.course_code,
        c.course_title,
        c.lecturer_id,
        c.level,
        c.created_at,
        CASE 
          WHEN c.lecturer_id = '${escapedUserId}' THEN 'lead'
          ELSE COALESCE(cl.role, 'co_lecturer')
        END as user_role,
        row_to_json(lead_u.*) as lead_lecturer
      FROM public.courses c
      LEFT JOIN public.users lead_u ON lead_u.id = c.lecturer_id
      LEFT JOIN public.course_lecturers cl ON cl.course_id = c.id AND cl.lecturer_id = '${escapedUserId}'
      WHERE c.lecturer_id = '${escapedUserId}' OR cl.lecturer_id = '${escapedUserId}'
      ORDER BY c.created_at DESC;
    `;

    const { data, error } = await executeSql<any>(sql);
    if (error || !data) {
      console.warn('Error fetching lecturer courses via SQL, falling back to direct query:', error);
      // Fallback
      const { data: ownCourses } = await db
        .from('courses')
        .select('*')
        .eq('lecturer_id', userId)
        .order('created_at', { ascending: false });

      return (ownCourses || []).map((c: any) => ({
        ...c,
        user_role: 'lead' as const,
      }));
    }

    return data.map((c: any) => ({
      id: c.id,
      course_code: c.course_code,
      course_title: c.course_title,
      lecturer_id: c.lecturer_id,
      level: c.level,
      created_at: c.created_at,
      user_role: (c.user_role === 'lead' ? 'lead' : 'co_lecturer') as 'lead' | 'co_lecturer',
      lead_lecturer: c.lead_lecturer,
    }));
  } catch (err) {
    console.error('fetchLecturerCourses error:', err);
    return [];
  }
}

/**
 * Fetches all instructors (Lead Lecturer + Co-Lecturers) for a course.
 */
export async function fetchCourseInstructors(courseId: string): Promise<{
  lead: CourseInstructor | null;
  coLecturers: CourseInstructor[];
}> {
  try {
    const escapedCourseId = String(courseId).replace(/'/g, "''");

    // 1. Fetch lead lecturer
    const leadSql = `
      SELECT u.id as lecturer_id, u.name, u.email, u.staff_id, u.department
      FROM public.courses c
      JOIN public.users u ON u.id = c.lecturer_id
      WHERE c.id = '${escapedCourseId}';
    `;
    const { data: leadData } = await executeSql<any>(leadSql);
    const leadRow = leadData?.[0];
    const lead: CourseInstructor | null = leadRow
      ? {
          id: leadRow.lecturer_id,
          lecturer_id: leadRow.lecturer_id,
          name: leadRow.name || 'Unknown Lecturer',
          email: leadRow.email || '',
          staff_id: leadRow.staff_id,
          department: leadRow.department,
          role: 'lead',
        }
      : null;

    // 2. Fetch co-lecturers
    const coSql = `
      SELECT cl.id, cl.lecturer_id, cl.role, u.name, u.email, u.staff_id, u.department
      FROM public.course_lecturers cl
      JOIN public.users u ON u.id = cl.lecturer_id
      WHERE cl.course_id = '${escapedCourseId}'
      ORDER BY cl.added_at ASC;
    `;
    const { data: coData } = await executeSql<any>(coSql);

    const coLecturers: CourseInstructor[] = (coData || []).map((row: any) => ({
      id: row.id,
      lecturer_id: row.lecturer_id,
      name: row.name || 'Unknown Lecturer',
      email: row.email || '',
      staff_id: row.staff_id,
      department: row.department,
      role: 'co_lecturer',
    }));

    return { lead, coLecturers };
  } catch (err) {
    console.error('fetchCourseInstructors error:', err);
    return { lead: null, coLecturers: [] };
  }
}

/**
 * Assigns a lecturer as co-lecturer to a course.
 */
export async function addCoLecturer(
  courseId: string,
  lecturerId: string,
  role = 'co_lecturer'
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await db.from('course_lecturers').insert({
      course_id: courseId,
      lecturer_id: lecturerId,
      role,
    });

    if (error) {
      if (String(error?.message || '').includes('unique') || String(error).includes('unique')) {
        return { success: false, error: 'This lecturer is already assigned to this course.' };
      }
      return { success: false, error: error?.message || 'Failed to add co-lecturer.' };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'An unexpected error occurred.' };
  }
}

/**
 * Removes a co-lecturer from a course.
 */
export async function removeCoLecturer(
  courseId: string,
  lecturerId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const escapedCourseId = String(courseId).replace(/'/g, "''");
    const escapedLecturerId = String(lecturerId).replace(/'/g, "''");

    const sql = `DELETE FROM public.course_lecturers WHERE course_id = '${escapedCourseId}' AND lecturer_id = '${escapedLecturerId}';`;
    const { error } = await executeSql(sql);

    if (error) {
      return { success: false, error: error?.message || 'Failed to remove co-lecturer.' };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'An unexpected error occurred.' };
  }
}

/**
 * Searches eligible lecturers (e.g. from the same department) to add as co-lecturers.
 */
export async function searchAvailableLecturers(
  query = '',
  department?: string | null,
  excludeIds: string[] = []
): Promise<Array<{ id: string; name: string; email: string; staff_id: string | null; department: string | null }>> {
  try {
    let whereClauses = ["role = 'lecturer'"];

    if (excludeIds.length > 0) {
      const idsList = excludeIds.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(', ');
      whereClauses.push(`id NOT IN (${idsList})`);
    }

    if (query.trim()) {
      const q = `%${query.trim().replace(/'/g, "''")}%`;
      whereClauses.push(`(name ILIKE '${q}' OR email ILIKE '${q}' OR staff_id ILIKE '${q}')`);
    } else if (department) {
      const dept = department.replace(/'/g, "''");
      whereClauses.push(`department = '${dept}'`);
    }

    const sql = `
      SELECT id, name, email, staff_id, department 
      FROM public.users 
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY name ASC 
      LIMIT 20;
    `;

    const { data } = await executeSql<any>(sql);
    return data || [];
  } catch (err) {
    console.error('searchAvailableLecturers error:', err);
    return [];
  }
}

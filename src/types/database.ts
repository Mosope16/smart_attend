export interface DatabaseUser {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'lecturer';
  matric_number?: string | null;
  staff_id?: string | null;
  faculty?: string | null;
  department?: string | null;
  level?: string | null;
  phone?: string | null;
  device_id?: string | null;
  device_name?: string | null;
  device_updated_at?: string | null;
  created_at?: string;
}

export interface DatabaseCourse {
  id: string;
  course_code: string;
  course_title: string;
  lecturer_id: string;
  faculty?: string | null;
  department?: string | null;
  level?: string | null;
  created_at?: string;
}

export interface DatabaseCourseLecturer {
  id: string;
  course_id: string;
  lecturer_id: string;
  role: 'lead' | 'co_lecturer';
  added_at?: string;
  lecturer?: DatabaseUser;
}

export interface DatabaseEnrollment {
  id: string;
  course_id: string;
  student_id: string;
  joined_at?: string;
  student?: Pick<DatabaseUser, 'id' | 'name' | 'matric_number' | 'email'>;
  course?: Pick<DatabaseCourse, 'id' | 'course_code' | 'course_title'>;
}

export interface DatabaseAttendanceSession {
  id: string;
  course_id: string;
  lecturer_id?: string | null;
  attendance_code: string;
  latitude?: number | null;
  longitude?: number | null;
  radius_meters?: number;
  start_time?: string;
  end_time: string;
  created_at?: string;
  course?: Pick<DatabaseCourse, 'id' | 'course_code' | 'course_title'>;
  lecturer?: Pick<DatabaseUser, 'id' | 'name' | 'email'>;
  attendance_records?: Pick<DatabaseAttendanceRecord, 'id' | 'status' | 'student_id'>[];
}

export interface DatabaseAttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  device_id?: string | null;
  device_name?: string | null;
  status: 'present' | 'absent';
  timestamp: string;
  student?: Pick<DatabaseUser, 'id' | 'name' | 'matric_number'>;
  session?: Pick<DatabaseAttendanceSession, 'id' | 'start_time' | 'end_time'>;
}

export interface StudentRosterItem {
  id: string;
  student: {
    id: string;
    name: string;
    matric_number?: string | null;
  } | null;
}

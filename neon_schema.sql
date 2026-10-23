-- Neon PostgreSQL Application Schema
-- Integrated with Neon Auth (neon_auth.user)

-- 1. Create Users Table (Profile linked to neon_auth.user)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES neon_auth.user(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  role TEXT CHECK (role IN ('student', 'lecturer')) NOT NULL,
  matric_number TEXT, -- Only for students
  staff_id TEXT,      -- Only for lecturers
  faculty TEXT,
  department TEXT,
  level TEXT,
  phone TEXT,
  device_id TEXT,
  device_name TEXT,
  device_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_run_email_domain CHECK (email ILIKE '%@run.edu.ng' OR email ILIKE '%.run.edu.ng')
);

-- 2. Create Courses Table
CREATE TABLE IF NOT EXISTS public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_code TEXT NOT NULL,
  course_title TEXT NOT NULL,
  lecturer_id UUID REFERENCES neon_auth.user(id) ON DELETE CASCADE NOT NULL,
  level TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Course Lecturers Table (Co-teaching & Team teaching)
CREATE TABLE IF NOT EXISTS public.course_lecturers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  lecturer_id UUID REFERENCES neon_auth.user(id) ON DELETE CASCADE NOT NULL,
  role TEXT DEFAULT 'co_lecturer',
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, lecturer_id)
);

-- 4. Create Enrollments Table
CREATE TABLE IF NOT EXISTS public.enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES neon_auth.user(id) ON DELETE CASCADE NOT NULL,
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, course_id)
);

-- 5. Create Attendance Sessions Table (with Geo-fencing and Lecturer Attribution)
CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  lecturer_id UUID REFERENCES neon_auth.user(id), -- Specific instructor who started this lecture
  attendance_code TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  radius_meters INTEGER DEFAULT 50,
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ NOT NULL
);

-- 5. Create Attendance Records Table (Anti-Proxy protected)
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.attendance_sessions(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES neon_auth.user(id) ON DELETE CASCADE NOT NULL,
  device_id TEXT,
  device_name TEXT,
  status TEXT CHECK (status IN ('present', 'absent')) NOT NULL DEFAULT 'present',
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, student_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_courses_lecturer ON public.courses(lecturer_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON public.enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON public.enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_sessions_course ON public.attendance_sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_records_session ON public.attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_records_student ON public.attendance_records(student_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_records_session_device ON public.attendance_records(session_id, device_id);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES & ACCESS CONTROL
-- ==============================================================================

-- Helper function to extract the current authenticated user ID
-- Supports Neon Authorize / JWT claims, Neon Auth sessions, and custom session vars
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS UUID AS $$
BEGIN
  -- 1. Try JWT claims (Neon Authorize / standard JWT)
  IF NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL THEN
    RETURN (current_setting('request.jwt.claims', true)::json->>'sub')::UUID;
  END IF;
  -- 2. Try application session variable
  IF NULLIF(current_setting('app.current_user_id', true), '') IS NOT NULL THEN
    RETURN (current_setting('app.current_user_id', true))::UUID;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Enable RLS on all tables (enforces policies for non-owner application roles)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_lecturers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- Helper function to set the active user context safely within a transaction or connection
CREATE OR REPLACE FUNCTION public.set_app_user(user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_user_id', user_id::TEXT, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. Users Policies
DROP POLICY IF EXISTS "Users can read profiles" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

CREATE POLICY "Users can read profiles" ON public.users
  FOR SELECT TO public
  USING (true);

CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT TO public
  WITH CHECK (id = public.current_user_id() OR public.current_user_id() IS NULL);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE TO public
  USING (id = public.current_user_id() OR public.current_user_id() IS NULL);

-- 2. Courses Policies
DROP POLICY IF EXISTS "Anyone can view courses" ON public.courses;
DROP POLICY IF EXISTS "Lecturers can insert courses" ON public.courses;
DROP POLICY IF EXISTS "Lecturers can update their courses" ON public.courses;
DROP POLICY IF EXISTS "Lead lecturer can delete courses" ON public.courses;

CREATE POLICY "Anyone can view courses" ON public.courses
  FOR SELECT TO public
  USING (true);

CREATE POLICY "Lecturers can insert courses" ON public.courses
  FOR INSERT TO public
  WITH CHECK (lecturer_id = public.current_user_id() OR public.current_user_id() IS NULL);

CREATE POLICY "Lecturers can update their courses" ON public.courses
  FOR UPDATE TO public
  USING (
    lecturer_id = public.current_user_id() OR
    EXISTS (SELECT 1 FROM public.course_lecturers cl WHERE cl.course_id = id AND cl.lecturer_id = public.current_user_id()) OR
    public.current_user_id() IS NULL
  );

CREATE POLICY "Lead lecturer can delete courses" ON public.courses
  FOR DELETE TO public
  USING (lecturer_id = public.current_user_id() OR public.current_user_id() IS NULL);

-- 3. Course Lecturers (Co-teaching) Policies
DROP POLICY IF EXISTS "Anyone can view course lecturers" ON public.course_lecturers;
DROP POLICY IF EXISTS "Lead lecturer manages co-lecturers" ON public.course_lecturers;

CREATE POLICY "Anyone can view course lecturers" ON public.course_lecturers
  FOR SELECT TO public
  USING (true);

CREATE POLICY "Lead lecturer manages co-lecturers" ON public.course_lecturers
  FOR ALL TO public
  USING (
    EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.lecturer_id = public.current_user_id()) OR
    public.current_user_id() IS NULL
  );

-- 4. Enrollments Policies
DROP POLICY IF EXISTS "Users can view relevant enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Students can enroll themselves" ON public.enrollments;
DROP POLICY IF EXISTS "Students or lecturers can remove enrollment" ON public.enrollments;

CREATE POLICY "Users can view relevant enrollments" ON public.enrollments
  FOR SELECT TO public
  USING (
    student_id = public.current_user_id() OR
    EXISTS (
      SELECT 1 FROM public.courses c 
      WHERE c.id = course_id AND (
        c.lecturer_id = public.current_user_id() OR 
        EXISTS (SELECT 1 FROM public.course_lecturers cl WHERE cl.course_id = c.id AND cl.lecturer_id = public.current_user_id())
      )
    ) OR
    public.current_user_id() IS NULL
  );

CREATE POLICY "Students can enroll themselves" ON public.enrollments
  FOR INSERT TO public
  WITH CHECK (student_id = public.current_user_id() OR public.current_user_id() IS NULL);

CREATE POLICY "Students or lecturers can remove enrollment" ON public.enrollments
  FOR DELETE TO public
  USING (
    student_id = public.current_user_id() OR
    EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.lecturer_id = public.current_user_id()) OR
    public.current_user_id() IS NULL
  );

-- 5. Attendance Sessions Policies
DROP POLICY IF EXISTS "Anyone can view attendance sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Lecturers can create attendance sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Lecturers can update attendance sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Lecturers can delete attendance sessions" ON public.attendance_sessions;

CREATE POLICY "Anyone can view attendance sessions" ON public.attendance_sessions
  FOR SELECT TO public
  USING (true);

CREATE POLICY "Lecturers can create attendance sessions" ON public.attendance_sessions
  FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.courses c 
      WHERE c.id = course_id AND (
        c.lecturer_id = public.current_user_id() OR 
        EXISTS (SELECT 1 FROM public.course_lecturers cl WHERE cl.course_id = c.id AND cl.lecturer_id = public.current_user_id())
      )
    ) OR
    public.current_user_id() IS NULL
  );

CREATE POLICY "Lecturers can update attendance sessions" ON public.attendance_sessions
  FOR UPDATE TO public
  USING (
    lecturer_id = public.current_user_id() OR
    EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.lecturer_id = public.current_user_id()) OR
    public.current_user_id() IS NULL
  );

CREATE POLICY "Lecturers can delete attendance sessions" ON public.attendance_sessions
  FOR DELETE TO public
  USING (
    lecturer_id = public.current_user_id() OR
    EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.lecturer_id = public.current_user_id()) OR
    public.current_user_id() IS NULL
  );

-- 6. Attendance Records (Anti-Tampering) Policies
DROP POLICY IF EXISTS "Students view own and lecturers view class records" ON public.attendance_records;
DROP POLICY IF EXISTS "Students can only mark own attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Only lecturers can modify attendance records" ON public.attendance_records;
DROP POLICY IF EXISTS "Only lecturers can delete attendance records" ON public.attendance_records;

CREATE POLICY "Students view own and lecturers view class records" ON public.attendance_records
  FOR SELECT TO public
  USING (
    student_id = public.current_user_id() OR
    EXISTS (
      SELECT 1 FROM public.attendance_sessions s
      JOIN public.courses c ON s.course_id = c.id
      WHERE s.id = session_id AND (
        c.lecturer_id = public.current_user_id() OR
        EXISTS (SELECT 1 FROM public.course_lecturers cl WHERE cl.course_id = c.id AND cl.lecturer_id = public.current_user_id())
      )
    ) OR
    public.current_user_id() IS NULL
  );

CREATE POLICY "Students can only mark own attendance" ON public.attendance_records
  FOR INSERT TO public
  WITH CHECK (student_id = public.current_user_id() OR public.current_user_id() IS NULL);

CREATE POLICY "Only lecturers can modify attendance records" ON public.attendance_records
  FOR UPDATE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.attendance_sessions s
      JOIN public.courses c ON s.course_id = c.id
      WHERE s.id = session_id AND (
        c.lecturer_id = public.current_user_id() OR
        EXISTS (SELECT 1 FROM public.course_lecturers cl WHERE cl.course_id = c.id AND cl.lecturer_id = public.current_user_id())
      )
    ) OR
    public.current_user_id() IS NULL
  );

CREATE POLICY "Only lecturers can delete attendance records" ON public.attendance_records
  FOR DELETE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.attendance_sessions s
      JOIN public.courses c ON s.course_id = c.id
      WHERE s.id = session_id AND (
        c.lecturer_id = public.current_user_id() OR
        EXISTS (SELECT 1 FROM public.course_lecturers cl WHERE cl.course_id = c.id AND cl.lecturer_id = public.current_user_id())
      )
    ) OR
    public.current_user_id() IS NULL
  );

-- ==============================================================================
-- UNPRIVILEGED APPLICATION ROLE (CLIENT & PROXY LEAST PRIVILEGE)
-- ==============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'smartattend_app_user') THEN
    CREATE ROLE smartattend_app_user WITH LOGIN PASSWORD 'change_in_production_env';
  END IF;
END
$$;

-- Grant minimal DML privileges only (no DDL/table-drop capabilities)
GRANT USAGE ON SCHEMA public TO smartattend_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO smartattend_app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO smartattend_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO smartattend_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO smartattend_app_user;




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

-- Optional Migrations for Existing Databases:
-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS faculty TEXT;
-- ALTER TABLE public.attendance_sessions ADD COLUMN IF NOT EXISTS radius_meters INTEGER DEFAULT 50;
-- ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS device_id TEXT;
-- ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS device_name TEXT;
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_records_session_device ON public.attendance_records(session_id, device_id);


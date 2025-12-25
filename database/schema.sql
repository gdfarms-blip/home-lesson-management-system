-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teachers table
CREATE TABLE IF NOT EXISTS teachers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(100),
  subjects TEXT[],
  teaching_allowance INTEGER DEFAULT 20000,
  transport_allowance INTEGER DEFAULT 12000,
  status VARCHAR(20) DEFAULT 'active',
  notes TEXT,
  date_joined DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Subjects table
CREATE TABLE IF NOT EXISTS subjects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Timetable table
CREATE TABLE IF NOT EXISTS timetable (
  id SERIAL PRIMARY KEY,
  day_of_week INTEGER NOT NULL, -- 0=Sunday, 1=Monday, etc.
  time_slot VARCHAR(50) NOT NULL, -- "08:00-09:00"
  subject_id INTEGER REFERENCES subjects(id),
  teacher_id INTEGER REFERENCES teachers(id),
  is_break BOOLEAN DEFAULT FALSE,
  break_description VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(day_of_week, time_slot)
);

-- Attendance table
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  timetable_id INTEGER REFERENCES timetable(id),
  teacher_id INTEGER REFERENCES teachers(id),
  status VARCHAR(20) NOT NULL, -- 'present', 'absent', 'late', 'partial'
  notes TEXT,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  recorded_by INTEGER REFERENCES users(id),
  UNIQUE(week_number, year, day_of_week, timetable_id, teacher_id)
);

-- Payroll table
CREATE TABLE IF NOT EXISTS payroll (
  id SERIAL PRIMARY KEY,
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL,
  teacher_id INTEGER REFERENCES teachers(id),
  teaching_allowance INTEGER DEFAULT 0,
  transport_allowance INTEGER DEFAULT 0,
  bonus INTEGER DEFAULT 0,
  deduction INTEGER DEFAULT 0,
  total_amount INTEGER DEFAULT 0,
  paid BOOLEAN DEFAULT FALSE,
  payment_date DATE,
  payment_reference VARCHAR(100),
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_by INTEGER REFERENCES users(id),
  UNIQUE(week_number, year, teacher_id)
);

-- Payment history table
CREATE TABLE IF NOT EXISTS payment_history (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER REFERENCES teachers(id),
  amount INTEGER NOT NULL,
  payment_type VARCHAR(50) NOT NULL, -- 'weekly_payroll', 'bonus', 'deduction'
  status VARCHAR(20) DEFAULT 'completed',
  reference VARCHAR(100) UNIQUE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id)
);

-- Reports table
CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  report_type VARCHAR(50) NOT NULL, -- 'teacher', 'timetable', 'financial', etc.
  description TEXT NOT NULL,
  generated_by INTEGER REFERENCES users(id),
  file_path VARCHAR(255),
  file_size VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System configuration table
CREATE TABLE IF NOT EXISTS system_config (
  id SERIAL PRIMARY KEY,
  config_key VARCHAR(100) UNIQUE NOT NULL,
  config_value TEXT NOT NULL,
  data_type VARCHAR(20) DEFAULT 'string', -- 'string', 'number', 'boolean', 'array'
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System statistics table
CREATE TABLE IF NOT EXISTS system_stats (
  id SERIAL PRIMARY KEY,
  stat_key VARCHAR(100) UNIQUE NOT NULL,
  stat_value INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_attendance_week_year ON attendance(week_number, year);
CREATE INDEX IF NOT EXISTS idx_attendance_teacher_date ON attendance(teacher_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_payroll_week_year ON payroll(week_number, year);
CREATE INDEX IF NOT EXISTS idx_timetable_day_time ON timetable(day_of_week, time_slot);
CREATE INDEX IF NOT EXISTS idx_teachers_status ON teachers(status);

-- Insert default configuration
INSERT INTO system_config (config_key, config_value, data_type, description) VALUES
('teaching_allowance', '20000', 'number', 'Default weekly teaching allowance in MWK'),
('transport_allowance', '12000', 'number', 'Default weekly transport allowance in MWK'),
('enable_transport_allowance', 'true', 'boolean', 'Enable transport allowance'),
('academic_days', '[0,1,2,3,4,5]', 'array', 'Academic days: 0=Sunday, 1=Monday, etc.'),
('subjects', '["Mathematics","Physics","Chemistry","English","Chichewa","Geography","Biology"]', 'array', 'Available subjects'),
('auto_save_frequency', '5', 'number', 'Auto-save frequency in minutes')
ON CONFLICT (config_key) DO NOTHING;

-- Insert default admin user (password: admin123)
INSERT INTO users (username, email, password_hash, role) VALUES
('admin', 'admin@hls.com', '$2b$10$YourHashedPasswordHere', 'admin')
ON CONFLICT (username) DO NOTHING;

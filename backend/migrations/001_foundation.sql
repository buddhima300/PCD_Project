CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  name text NOT NULL,
  title text NOT NULL DEFAULT '',
  role text NOT NULL CHECK (role IN ('SUPERVISOR','EMPLOYEE','FREELANCER')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','LOCKED','INVITED')),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE permissions (code text PRIMARY KEY);
INSERT INTO permissions(code) VALUES ('accounts.manage'),('disciplinary.approve'),('breaks.policy'),('breaks.review'),('reports.export'),('attendance.correct'),('audit.read');
CREATE TABLE user_permissions (
  user_id uuid NOT NULL REFERENCES users(id),
  permission text NOT NULL REFERENCES permissions(code),
  PRIMARY KEY(user_id,permission)
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_created_idx ON audit_events(created_at DESC,id);
CREATE TABLE departments (code text PRIMARY KEY, name text NOT NULL);
INSERT INTO departments VALUES ('GS','GS'),('DP','DP'),('WD','WD'),('SAFETY','Safety');
CREATE TABLE platform_categories (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE platforms (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  category_id uuid NOT NULL REFERENCES platform_categories(id),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  lifecycle text NOT NULL DEFAULT 'SETUP' CHECK(lifecycle IN ('SETUP','OPERATIONAL')),
  status text NOT NULL DEFAULT 'INACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE platform_capacities (
  platform_id uuid NOT NULL REFERENCES platforms(id),
  department_code text NOT NULL REFERENCES departments(code),
  seats integer NOT NULL CHECK(seats >= 0),
  morning_target integer NOT NULL CHECK(morning_target >= 0 AND morning_target <= seats),
  night_target integer NOT NULL CHECK(night_target >= 0 AND night_target <= seats),
  PRIMARY KEY(platform_id,department_code)
);
CREATE TABLE workers (
  id uuid PRIMARY KEY,
  worker_number text NOT NULL UNIQUE,
  user_id uuid UNIQUE REFERENCES users(id),
  name text NOT NULL,
  email text NOT NULL UNIQUE CHECK(email = lower(email)),
  phone text NOT NULL DEFAULT '',
  worker_type text NOT NULL CHECK(worker_type IN ('EMPLOYEE','FREELANCER')),
  department_code text NOT NULL REFERENCES departments(code),
  position text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ON_LEAVE','SUSPENDED','INACTIVE')),
  lifecycle text NOT NULL DEFAULT 'ONBOARDING' CHECK(lifecycle IN ('ONBOARDING','PRODUCTION_ACTIVE','INACTIVE')),
  joined_at date NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workers_department_idx ON workers(department_code,worker_type);
CREATE TABLE notifications (
  id uuid PRIMARY KEY,
  recipient_id uuid NOT NULL REFERENCES users(id),
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_recipient_idx ON notifications(recipient_id,created_at DESC,id);

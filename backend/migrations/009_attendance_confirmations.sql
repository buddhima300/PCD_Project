-- Independent of historical/retired equipment allocation and handover records.
CREATE TABLE work_occurrences (
  id uuid PRIMARY KEY,
  worker_id uuid NOT NULL REFERENCES workers(id),
  operational_worker_id text NOT NULL,
  worker_name text NOT NULL,
  worker_type text NOT NULL CHECK (worker_type IN ('EMPLOYEE','FREELANCER')),
  platform_code text NOT NULL,
  department text NOT NULL CHECK (department IN ('GS','DP','WD','SAFETY')),
  roster_date date NOT NULL,
  shift text NOT NULL CHECK (shift IN ('MORNING','NIGHT')),
  scheduled_start timestamptz NOT NULL,
  scheduled_end timestamptz NOT NULL,
  effective_start timestamptz NOT NULL,
  effective_end timestamptz NOT NULL,
  source_key text NOT NULL,
  source_version text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(worker_id,roster_date,shift),
  CHECK(scheduled_start < scheduled_end),
  CHECK(effective_start < effective_end),
  CHECK(effective_start >= scheduled_start AND effective_end <= scheduled_end)
);
CREATE INDEX attendance_occurrence_scope ON work_occurrences(roster_date,platform_code,department,shift);
CREATE TABLE attendance_confirmations (
  id uuid PRIMARY KEY,
  occurrence_id uuid NOT NULL UNIQUE REFERENCES work_occurrences(id),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  accepted_at timestamptz NOT NULL,
  device_timestamp timestamptz,
  timezone_offset_minutes integer CHECK(timezone_offset_minutes BETWEEN -840 AND 840),
  status text NOT NULL CHECK(status IN ('CONFIRMED','NEEDS_REVIEW','VOIDED')),
  punctuality text NOT NULL CHECK(punctuality IN ('ON_TIME','LATE')),
  verification text NOT NULL CHECK(verification IN ('SELF_DECLARED','EQUIPMENT_EXCEPTION','SUPERVISOR_REVIEWED')),
  asset_id text REFERENCES ops_laptops(id),
  notes text NOT NULL DEFAULT '',
  equipment_issue text NOT NULL DEFAULT '',
  exception_reason text NOT NULL DEFAULT '',
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES users(id),
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  original_evidence jsonb NOT NULL CHECK(jsonb_typeof(original_evidence)='object'),
  CHECK(length(notes)<=2000 AND length(equipment_issue)<=2000 AND length(exception_reason)<=2000)
);
CREATE INDEX attendance_confirmations_status ON attendance_confirmations(status,accepted_at);
CREATE TABLE equipment_custody_sessions (
  id uuid PRIMARY KEY,
  confirmation_id uuid NOT NULL REFERENCES attendance_confirmations(id),
  worker_id uuid NOT NULL REFERENCES workers(id),
  asset_id text NOT NULL REFERENCES ops_laptops(id),
  received_at timestamptz NOT NULL,
  released_at timestamptz,
  released_by uuid REFERENCES users(id),
  release_notes text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  CHECK(released_at IS NULL OR released_at >= received_at)
);
CREATE UNIQUE INDEX attendance_open_asset ON equipment_custody_sessions(asset_id) WHERE released_at IS NULL;
CREATE UNIQUE INDEX attendance_open_worker ON equipment_custody_sessions(worker_id) WHERE released_at IS NULL;
CREATE TABLE attendance_handover_events (
  id uuid PRIMARY KEY,
  confirmation_id uuid NOT NULL REFERENCES attendance_confirmations(id),
  custody_id uuid REFERENCES equipment_custody_sessions(id),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK(kind IN ('RECEIPT','RETURN','ATTENDANCE_EXCEPTION','CORRECTION')),
  recorded_at timestamptz NOT NULL,
  notes text NOT NULL DEFAULT '',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX attendance_event_confirmation ON attendance_handover_events(confirmation_id,recorded_at);
CREATE TABLE attendance_corrections (
  id uuid PRIMARY KEY,
  confirmation_id uuid NOT NULL REFERENCES attendance_confirmations(id),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  recorded_at timestamptz NOT NULL,
  reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 2000),
  prior_version integer NOT NULL,
  before_values jsonb NOT NULL,
  after_values jsonb NOT NULL
);
CREATE INDEX attendance_correction_history ON attendance_corrections(confirmation_id,recorded_at);
CREATE TABLE attendance_commands (
  actor_user_id uuid NOT NULL REFERENCES users(id),
  operation text NOT NULL,
  request_key text NOT NULL,
  payload_digest text NOT NULL,
  result jsonb NOT NULL,
  accepted_at timestamptz NOT NULL,
  PRIMARY KEY(actor_user_id,operation,request_key)
);

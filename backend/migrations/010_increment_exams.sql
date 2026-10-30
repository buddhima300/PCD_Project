CREATE TABLE increment_opening_balances (
  worker_id uuid PRIMARY KEY REFERENCES workers(id),
  through_date date NOT NULL,
  credited_days numeric(9,1) NOT NULL CHECK(credited_days>=0 AND mod(credited_days,0.5)=0),
  reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 2000),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  recorded_at timestamptz NOT NULL,
  revision integer NOT NULL CHECK(revision>0)
);
CREATE TABLE increment_exam_appointments (
  id uuid PRIMARY KEY,
  worker_id uuid NOT NULL UNIQUE REFERENCES workers(id),
  starts_at timestamptz NOT NULL,
  location text NOT NULL CHECK(length(location) BETWEEN 1 AND 200),
  instructions text NOT NULL CHECK(length(instructions)<=2000),
  status text NOT NULL CHECK(status IN ('SCHEDULED','CANCELLED')),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL,
  revision integer NOT NULL CHECK(revision>0),
  eligibility_snapshot jsonb NOT NULL
);
CREATE INDEX increment_exam_dates ON increment_exam_appointments(starts_at,status);
CREATE TABLE increment_exam_events (
  id uuid PRIMARY KEY,
  worker_id uuid NOT NULL REFERENCES workers(id),
  appointment_id uuid REFERENCES increment_exam_appointments(id),
  kind text NOT NULL CHECK(kind IN ('BASELINE_UPDATED','SCHEDULED','RESCHEDULED','CANCELLED')),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  recorded_at timestamptz NOT NULL,
  reason text NOT NULL,
  before_values jsonb NOT NULL,
  after_values jsonb NOT NULL
);
CREATE INDEX increment_exam_history ON increment_exam_events(worker_id,recorded_at);
CREATE TABLE increment_exam_commands (
  actor_user_id uuid NOT NULL REFERENCES users(id),
  operation text NOT NULL,
  request_key uuid NOT NULL,
  payload_digest text NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY(actor_user_id,operation,request_key)
);
CREATE INDEX ops_notification_recipient ON ops_notifications((data->>'recipientId'));

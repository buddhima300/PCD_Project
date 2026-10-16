-- One ordered JSONB record per original domain entity preserves the exact UI contract.
-- Collections are separate tables; database transactions serialize multi-module changes.
DO $$
DECLARE collection text;
BEGIN
  FOREACH collection IN ARRAY ARRAY['categories','platforms','employees','freelancers','off_days','replacements','laptops','handovers','incidents','notifications','audit','rotation_cycles','candidates','platform_positions','training_assignments'] LOOP
    EXECUTE format('CREATE TABLE ops_%I (id text PRIMARY KEY, ordinal integer NOT NULL, data jsonb NOT NULL CHECK(jsonb_typeof(data) = ''object''))', collection);
  END LOOP;
END $$;
CREATE TABLE ops_state (key text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE operational_accounts (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  worker_id text NOT NULL UNIQUE,
  role text NOT NULL CHECK(role IN ('SUPERVISOR','EMPLOYEE','FREELANCER')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ops_employees_department ON ops_employees ((data->>'dept'));
CREATE INDEX ops_freelancers_department ON ops_freelancers ((data->>'dept'));
CREATE INDEX ops_handovers_incoming ON ops_handovers ((data->>'incomingId'));
CREATE INDEX ops_off_days_employee ON ops_off_days ((data->>'employeeId'));

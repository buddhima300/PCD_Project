CREATE TABLE equipment_allocations (
  id uuid PRIMARY KEY,
  worker_id text NOT NULL,
  worker_name text NOT NULL,
  platform_code text NOT NULL,
  department text NOT NULL CHECK (department IN ('GS','DP','WD','SAFETY')),
  pool_id text NOT NULL,
  asset_id text NOT NULL REFERENCES ops_laptops(id),
  workstation_id text NOT NULL,
  shift_date text NOT NULL CHECK (shift_date ~ '^\d{4}-\d{2}-\d{2}$'),
  shift text NOT NULL CHECK (shift IN ('MORNING','NIGHT')),
  state text NOT NULL DEFAULT 'RESERVED' CHECK (state IN ('RESERVED','RECEIVED','CANCELLED')),
  handover_id text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_by uuid REFERENCES users(id),
  cancelled_at timestamptz,
  cancellation_reason text,
  received_at timestamptz
);
CREATE UNIQUE INDEX equipment_worker_shift ON equipment_allocations(worker_id,shift_date,shift) WHERE state <> 'CANCELLED';
CREATE UNIQUE INDEX equipment_asset_shift ON equipment_allocations(asset_id,shift_date,shift) WHERE state <> 'CANCELLED';
CREATE UNIQUE INDEX equipment_workstation_shift ON equipment_allocations(workstation_id,shift_date,shift) WHERE state <> 'CANCELLED';
CREATE INDEX equipment_pool_date ON equipment_allocations(pool_id,shift_date,shift);

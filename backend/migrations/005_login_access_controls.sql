-- Keep login access separate from employment and platform membership.
ALTER TABLE users ADD COLUMN access_revision integer NOT NULL DEFAULT 1 CHECK (access_revision > 0);
ALTER TABLE users ADD COLUMN access_changed_at timestamptz;
ALTER TABLE users ADD COLUMN access_changed_by uuid REFERENCES users(id);
ALTER TABLE users ADD COLUMN access_change_reason text NOT NULL DEFAULT '';

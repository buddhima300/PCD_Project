-- Preserve every historical transfer record. Retire only outstanding reservations.
UPDATE equipment_allocations
SET state='CANCELLED', cancelled_at=now(), cancellation_reason='Pending handover workflow retired'
WHERE state='RESERVED';

-- Next-user reservations must not prevent staffing changes after workflow removal.
UPDATE ops_laptops
SET data = data || jsonb_build_object(
  'nextUserId',NULL,'nextUserName',NULL,'nextUserNote',NULL,'handoverStatus',NULL,
  'status',CASE WHEN data->>'status'='HANDOVER_PENDING'
    THEN CASE WHEN data->>'currentUserId' IS NOT NULL THEN 'ASSIGNED' ELSE 'AVAILABLE' END
    ELSE data->>'status' END
);

-- Existing trainees now require explicit assignment after evaluation too.
UPDATE ops_training_assignments
SET data = data || '{"trainingOnly":true}'::jsonb
WHERE data->>'trainingStatus' IN ('IN_TRAINING','TRAINING_EXTENDED','TRAINING_ASSIGNED')
  AND data->>'promotedAt' IS NULL;

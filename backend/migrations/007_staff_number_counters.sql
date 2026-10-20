CREATE TABLE staff_number_counters (
  prefix text PRIMARY KEY CHECK(prefix IN ('EMP','FL')),
  next_number integer NOT NULL CHECK(next_number > 0)
);
INSERT INTO staff_number_counters(prefix,next_number)
SELECT prefix,COALESCE(MAX(number),0)+1 FROM (
  SELECT split_part(worker_number,'-',1) AS prefix,split_part(worker_number,'-',2)::integer AS number
  FROM workers WHERE worker_number ~ '^(EMP|FL)-[0-9]+$'
  UNION ALL
  SELECT 'EMP',substring(id FROM 5)::integer FROM ops_employees WHERE id ~ '^EMP-[0-9]+$'
  UNION ALL
  SELECT 'FL',substring(id FROM 4)::integer FROM ops_freelancers WHERE id ~ '^FL-[0-9]+$'
  UNION ALL SELECT 'EMP',0 UNION ALL SELECT 'FL',0
) numbers GROUP BY prefix;

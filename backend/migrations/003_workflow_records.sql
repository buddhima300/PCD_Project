-- Expand workflow-specific arrays into individually persisted records.
DO $$
DECLARE collection text;
BEGIN
  FOREACH collection IN ARRAY ARRAY['availability','disciplinary_cases','warning_letters','disciplinary_events','break_sessions','break_requests','break_policies','profile_events'] LOOP
    EXECUTE format('CREATE TABLE ops_%I (id text PRIMARY KEY, ordinal integer NOT NULL, data jsonb NOT NULL CHECK(jsonb_typeof(data) = ''object''))', collection);
  END LOOP;
END $$;
INSERT INTO ops_availability(id,ordinal,data)
SELECT key,(row_number() OVER ())::integer,jsonb_build_object('id',key,'calendar',value)
FROM jsonb_each(COALESCE((SELECT data FROM ops_state WHERE key='availability'),'{}'::jsonb));
DO $$
DECLARE item text[];
BEGIN
  FOREACH item SLICE 1 IN ARRAY ARRAY[
    ['disciplinary','cases','disciplinary_cases'],['disciplinary','warnings','warning_letters'],['disciplinary','events','disciplinary_events'],
    ['breaks','sessions','break_sessions'],['breaks','requests','break_requests'],['breaks','policies','break_policies'],['profile','events','profile_events']
  ] LOOP
    EXECUTE format('INSERT INTO ops_%I(id,ordinal,data) SELECT COALESCE(value->>''id'',(ordinality-1)::text),(ordinality-1)::integer,value FROM jsonb_array_elements(COALESCE((SELECT data->$1 FROM ops_state WHERE key=$2),''[]''::jsonb)) WITH ORDINALITY',item[3]) USING item[2],item[1];
    UPDATE ops_state SET data=data-item[2] WHERE key=item[1];
  END LOOP;
END $$;
DELETE FROM ops_state WHERE key='availability';

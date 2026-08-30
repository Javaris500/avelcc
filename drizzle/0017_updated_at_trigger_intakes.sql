-- updated_at trigger for `intakes`.
--
-- Same reasoning as 0003, 0005, 0007 and 0010: set_updated_at() is attached per
-- table from an explicit array, not as a blanket rule, so a table added later
-- has NO trigger and its updated_at is maintained only by drizzle's app-level
-- $onUpdate — which does nothing for raw SQL, a psql session, or a data
-- migration. triggers.test.ts asserts the invariant across the whole schema and
-- would go red without this.
--
-- IT MATTERS PARTICULARLY HERE. `intakes` is the one recent table that is
-- deliberately MUTABLE — a proposal moves draft -> proposed -> approved, and
-- `approved_by`, `approved_at` and `mission_id` are set by that transition. So
-- unlike the six telemetry tables, which refuse UPDATE outright, this one is
-- updated as a matter of course and "when did this proposal last move" is a
-- question someone will ask. Without the trigger the answer would be the
-- creation time forever for any write that did not go through drizzle.
--
-- Deliberately NOT append-only, and that is the doc's ruling rather than a
-- preference: DATA-CONTRACTS-V2:130 ends the field block `deleted_at ·
-- timestamps`, and approval sets columns on the row rather than writing a new
-- one. refuse_mutation() must not be attached here — appendOnly.test.ts asserts
-- that nothing outside APPEND_ONLY_TABLES carries it, so getting this wrong
-- fails a check rather than surfacing as a refused write in production.
--
-- Forward-only. 0016 created the table; this adds its trigger.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['intakes']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_set_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_set_updated_at', t);
  END LOOP;
END $$;

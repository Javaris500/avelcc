-- updated_at triggers for the step 3 tables connections and exports.
--
-- Same reasoning as 0003, 0005 and 0007: set_updated_at() is attached per table
-- from an explicit array, not as a blanket rule, so a table added later has NO
-- trigger and its updated_at is maintained only by drizzle's app-level
-- $onUpdate — which does nothing for raw SQL, a psql session, or a data
-- migration. triggers.test.ts asserts the invariant; this keeps it green.
--
-- It matters more on `exports` than anywhere else so far. An Export is the
-- audit record for a delivery into someone else's repository, and `status` and
-- `pr_status` advance through the run. A status advanced by anything other than
-- drizzle would leave updated_at frozen at the INSERT, so "when did this export
-- last move" would read as "when it was created" for exactly the writes least
-- likely to have gone through the ORM.
--
-- Forward-only: 0003, 0005 and 0007 are applied and are not edited. This adds
-- to them. Step 3 is complete with these two, so the step-3 note in 0007 is
-- discharged here.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['connections','exports']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_set_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_set_updated_at', t);
  END LOOP;
END $$;

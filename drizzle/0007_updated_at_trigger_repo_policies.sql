-- updated_at trigger for the step 3 table repo_policies.
--
-- Same reasoning as 0003 and 0005: set_updated_at() is attached per table from
-- an explicit array, not as a blanket rule, so a table added later has NO
-- trigger and its updated_at is maintained only by drizzle's app-level
-- $onUpdate — which does nothing for raw SQL, a psql session, or a data
-- migration. triggers.test.ts asserts the invariant; this keeps it green.
--
-- Forward-only: 0003 and 0005 are applied and are not edited. This adds to them.
--
-- Connection and Export (the other step-3 tables) are not built yet; when they
-- land, their trigger goes in their own migration, not here.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['repo_policies']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_set_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_set_updated_at', t);
  END LOOP;
END $$;

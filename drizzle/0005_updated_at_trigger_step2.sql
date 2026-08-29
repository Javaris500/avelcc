-- updated_at triggers for the step 2 tables.
--
-- 0003 installs set_updated_at() and attaches it per table, from an explicit
-- ARRAY of the step 1 table names. It is not a blanket rule, so every table
-- added afterwards has NO trigger and its updated_at is maintained only by
-- drizzle's app-level $onUpdate — which does nothing for raw SQL, a psql
-- session, or a data migration. Exactly the gap 0003 was written to close,
-- reopened by adding tables.
--
-- Forward-only: 0003 is applied and is not edited. This adds to it.
--
-- roster_entry_skills is absent deliberately: it is a composite-key join table
-- with no timestamps, so there is no updated_at to maintain.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['missions','playbooks','roster_presets','roster_entries']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_set_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_set_updated_at', t);
  END LOOP;
END $$;

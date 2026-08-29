-- updated_at, enforced in the DATABASE rather than by the ORM.
--
-- drizzle's .$onUpdate is app-level: it fires when a write goes through
-- drizzle's query builder and does nothing for raw SQL, a psql session, or a
-- migration that touches data. Verified — a plain UPDATE left updated_at at the
-- creation time.
--
-- The same argument as the agent_templates CHECK constraint: a rule that lives
-- only in a service is a rule that can be bypassed. Keeping $onUpdate as well is
-- deliberate belt-and-braces here, because unlike the shell's text-base case it
-- fails SAFE — both paths set the same value.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients','engagements','skill_sources','skills','agent_templates']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_set_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_set_updated_at', t);
  END LOOP;
END $$;

-- APPEND-ONLY, ENFORCED BY THE DATABASE RATHER THAN BY CONVENTION.
--
-- The six telemetry tables record what was true when each row was written.
-- Closure is a NEW ROW referencing the old one, never a flipped cell. The
-- reasoning is not ours; it is stated in the corpus these tables ingest,
-- .team-5/log/error-log.md:
--
--   "An append-only ledger where closure is a new entry preserves when a thing
--   was open and for how long — which is the data these logs exist to produce.
--   A flipped cell destroys exactly that: it makes a blocker that stalled an
--   agent for two hours indistinguishable from one resolved in a minute."
--
-- A CHECK CANNOT DO THIS. A CHECK constrains a row's values; it cannot see that
-- a row is being replaced. Only a trigger can refuse the statement itself.
--
-- DELETE IS REFUSED TOO. Closure-by-reference protects against a rewritten
-- history; a DELETE removes it outright, which is strictly worse. That is also
-- why none of these tables carries `deleted_at`: a soft delete is an UPDATE and
-- would be refused here anyway. DATA-CONTRACTS-V2:399 wants an export to always
-- resolve what it referenced, and a table with no delete path satisfies that
-- more completely than a nullable flag a reader has to interpret.
--
-- Same per-table attachment shape as 0003, 0005, 0007 and 0010 — and the same
-- hazard, which is that an explicit array reads like a blanket rule and is not
-- one. appendOnly.test.ts asserts the set in both directions against
-- APPEND_ONLY_TABLES in schema.ts, so a seventh table added without a trigger
-- fails a check rather than depending on someone remembering.
--
-- Forward-only. 0014 created the tables; this adds their guard.

CREATE OR REPLACE FUNCTION refuse_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'append-only: % on %.% is refused. Record a new row that references this one.',
    TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'blockers','completions','cost_entries',
    'dispatches','finding_dispositions','findings'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_append_only', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION refuse_mutation()',
      t || '_append_only', t);
  END LOOP;
END $$;

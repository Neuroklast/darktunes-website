-- supabase/e2e-grants.sql
--
-- Local-stack-only fix, NOT part of the production schema SSOT
-- (supabase/reset.sql). On a hosted Supabase project, every table created
-- via the Dashboard SQL editor automatically inherits SELECT/INSERT/UPDATE/
-- DELETE grants for anon/authenticated/service_role from the project's own
-- platform-level ALTER DEFAULT PRIVILEGES setup. The local Supabase CLI
-- stack does not carry that same default-privilege wiring for tables created
-- by reset.sql applied via a plain `psql` connection as the `postgres` role,
-- so RLS policies are correctly defined but never evaluated — Postgres
-- denies with "permission denied for table ..." at the GRANT-privilege
-- check, before RLS even runs.
--
-- Applied once by scripts/e2e-db-setup.mjs, after reset.sql, idempotent.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

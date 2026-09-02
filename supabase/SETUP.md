# Supabase Database Setup

This guide explains how to set up the darkTunes database schema in Supabase.

> **Schema conventions and 3NF requirements** are documented in
> [`supabase/DB_REQUIREMENTS.md`](./DB_REQUIREMENTS.md). Read it before making
> any schema changes.

## Prerequisites

Before running `reset.sql`, you **MUST** execute these commands in the Supabase Dashboard SQL Editor:

```sql
ALTER SCHEMA public OWNER TO postgres;
GRANT ALL ON SCHEMA public TO postgres;
GRANT USAGE, CREATE ON SCHEMA public TO authenticated, anon, service_role;
```

### Why are these manual grants required?

PostgreSQL 15+ revoked default CREATE privileges on the `public` schema. The Supabase Dashboard SQL Editor runs with a restricted role that cannot grant schema privileges. These grants must be executed by a database superuser (via the Supabase Dashboard) before running the main schema script.

## Running the Schema

1. **Manual Grants** (one-time): Copy the SQL above into Supabase Dashboard → SQL Editor → Run
2. **Main Schema**: Copy entire contents of `supabase/reset.sql` → Paste into SQL Editor → Run

## Idempotency

`reset.sql` is fully idempotent — you can run it multiple times safely:

- Tables use `CREATE TABLE IF NOT EXISTS`
- Columns use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- Types use `DO $$ ... EXCEPTION WHEN duplicate_object`
- Triggers are always `DROP ... IF EXISTS` then `CREATE`

## Why DO-blocks for CREATE TYPE?

The script uses `DO $$ BEGIN CREATE TYPE ... EXCEPTION WHEN duplicate_object ... END $$;` instead of `CREATE TYPE IF NOT EXISTS` because:

1. ✅ Works without schema OWNER privileges (compatible with Supabase Dashboard)
2. ✅ Compatible with all PostgreSQL versions ≥ 9.1
3. ✅ Handles race conditions gracefully
4. ✅ Some Supabase PostgreSQL instances don't support `CREATE TYPE IF NOT EXISTS` syntax

## Troubleshooting

### Error: "permission denied for schema public"

**Solution**: Run the manual grants (step 1 above) first.

### Error: "relation does not exist"

**Solution**: Ensure you're running the complete `reset.sql` file, not partial sections.

### Error: "syntax error at or near NOT"

**Solution**: This confirms your Supabase instance doesn't support `CREATE TYPE IF NOT EXISTS`. The DO-block approach avoids this issue.

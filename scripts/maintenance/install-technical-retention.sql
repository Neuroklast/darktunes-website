-- Run once in the darkTunes Supabase SQL editor (postgres role).
-- Technical telemetry only. No financial/audit/customer data is deleted.
-- Cron jobs are dashboard-managed, not installed by supabase/reset.sql.
--
-- Every run is bounded to avoid large deletions holding DB locks. The job
-- catches up automatically after an outage, then maintains retention.
SELECT cron.schedule(
  'darktunes-technical-retention',
  '*/15 * * * *',
  $retention$
    WITH old_runs AS (
      SELECT runid FROM cron.job_run_details
      WHERE start_time < NOW() - INTERVAL '7 days'
      ORDER BY runid LIMIT 5000
    )
    DELETE FROM cron.job_run_details AS d USING old_runs
    WHERE d.runid = old_runs.runid;

    WITH old_sync_logs AS (
      SELECT id FROM public.sync_logs
      WHERE created_at < NOW() - INTERVAL '30 days'
      ORDER BY created_at LIMIT 2000
    )
    DELETE FROM public.sync_logs AS d USING old_sync_logs
    WHERE d.id = old_sync_logs.id;

    WITH old_sync_runs AS (
      SELECT id FROM public.sync_runs
      WHERE started_at < NOW() - INTERVAL '30 days'
      ORDER BY started_at LIMIT 2000
    )
    DELETE FROM public.sync_runs AS d USING old_sync_runs
    WHERE d.id = old_sync_runs.id;

    WITH old_ticks AS (
      SELECT id FROM public.cron_ticks
      WHERE created_at < NOW() - INTERVAL '14 days'
      ORDER BY created_at LIMIT 2000
    )
    DELETE FROM public.cron_ticks AS d USING old_ticks
    WHERE d.id = old_ticks.id;

    WITH expired_app_logs AS (
      SELECT id FROM public.app_logs
      WHERE last_seen_at < NOW() - INTERVAL '90 days'
      ORDER BY last_seen_at LIMIT 1000
    )
    DELETE FROM public.app_logs AS d USING expired_app_logs
    WHERE d.id = expired_app_logs.id;
  $retention$
);

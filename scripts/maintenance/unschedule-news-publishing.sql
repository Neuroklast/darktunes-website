-- Run ONLY AFTER deploying the cronless public news code to darktunes.com.
-- This changes no news, content or financial records.
-- Scheduled rows remain status='scheduled' and become visible at published_at.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='publish-scheduled-news') THEN
    PERFORM cron.unschedule('publish-scheduled-news');
  END IF;
END;
$$;

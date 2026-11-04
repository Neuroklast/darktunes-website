-- One-time maintenance after deploying the retired Odesli integration.
-- Run in the Darktunes Website Supabase SQL Editor using a privileged role.
-- Existing smart_url and platform_links records are preserved.
BEGIN;

UPDATE public.sync_queue
SET status = 'cancelled',
    cancelled_at = now(),
    cancel_requested_at = now(),
    finished_at = now(),
    locked_until = NULL,
    error_message = 'Retired integration'
WHERE job_type = 'odesli' AND status IN ('pending', 'running');

DELETE FROM public.api_credentials WHERE key = 'odesli_api_key';

COMMIT;

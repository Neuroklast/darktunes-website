-- One-time cleanup for legacy browser Web Vitals warning rows.
-- Run in the Darktunes Website Supabase SQL Editor using a privileged role.
-- This intentionally does not affect application errors or any other source.
-- Web Vitals ingestion was removed from the application in PR #689.

BEGIN;
DELETE FROM public.app_logs WHERE source = 'web-vitals';
COMMIT;

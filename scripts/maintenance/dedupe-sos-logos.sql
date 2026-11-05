-- Run ONLY after the shared-logo code has been deployed and the
-- public.sos_logo_assets table from supabase/reset.sql exists.
-- Idempotent. Preserves accounting rules, periods, revisions and statements.
--
-- Reduces each inline 2 MB logo pair to one content-addressed reference.
-- To verify: SELECT count(*), pg_size_pretty(sum(pg_column_size(config)))
--            FROM public.sos_accounting_workspaces;
BEGIN;

WITH original_logos AS (
  SELECT COALESCE(NULLIF(config #>> '{labelInfo,logoBase64}', ''),
                  NULLIF(config #>> '{labelInfo,logo}', '')) AS data_url
  FROM public.sos_accounting_workspaces
  UNION ALL
  SELECT COALESCE(NULLIF(config #>> '{labelInfo,logoBase64}', ''),
                  NULLIF(config #>> '{labelInfo,logo}', '')) AS data_url
  FROM public.sos_rules_presets
)
INSERT INTO public.sos_logo_assets (id, data_url)
SELECT DISTINCT md5(data_url), data_url
FROM original_logos
WHERE data_url LIKE 'data:image/%;base64,%'
ON CONFLICT (id) DO NOTHING;

UPDATE public.sos_accounting_workspaces
SET config = jsonb_set(
  config,
  '{labelInfo}',
  ((config->'labelInfo') - 'logo' - 'logoBase64')
    || jsonb_build_object(
      'logoAssetId',
      md5(COALESCE(NULLIF(config #>> '{labelInfo,logoBase64}', ''),
                   NULLIF(config #>> '{labelInfo,logo}', '')))
    )
)
WHERE COALESCE(NULLIF(config #>> '{labelInfo,logoBase64}', ''),
               NULLIF(config #>> '{labelInfo,logo}', ''))
      LIKE 'data:image/%;base64,%';

UPDATE public.sos_rules_presets
SET config = jsonb_set(
  config,
  '{labelInfo}',
  ((config->'labelInfo') - 'logo' - 'logoBase64')
    || jsonb_build_object(
      'logoAssetId',
      md5(COALESCE(NULLIF(config #>> '{labelInfo,logoBase64}', ''),
                   NULLIF(config #>> '{labelInfo,logo}', '')))
    )
)
WHERE COALESCE(NULLIF(config #>> '{labelInfo,logoBase64}', ''),
               NULLIF(config #>> '{labelInfo,logo}', ''))
      LIKE 'data:image/%;base64,%';

COMMIT;

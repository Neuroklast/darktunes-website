import fs from 'fs';
import path from 'path';

function walk(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walk(full));
    else if (entry.name === 'route.ts') results.push(full);
  }
  return results;
}

function yamlEscape(str) {
  if (!str) return '""';
  if (/[:#\[\]{}|>&*!%@`,]/.test(str) || str.includes('\n') || str.startsWith(' ') || str.endsWith(' ')) {
    return JSON.stringify(str);
  }
  return str;
}

function getTag(routePath) {
  const parts = routePath.replace(/^\/api\//, '').split('/');
  const root = parts[0];
  const map = {
    admin: 'Admin',
    portal: 'Portal',
    account: 'Account',
    auth: 'Auth',
    sync: 'Sync',
    health: 'Health',
    epk: 'EPK',
    press: 'Press',
    newsletter: 'Newsletter',
    journalist: 'Journalist Applications',
    journalist: 'Journalist Applications',
    'journalist-applications': 'Journalist Applications',
    upload: 'Upload',
    'upload-epk': 'Upload',
    'sync-api': 'Sync',
    'sync-artist': 'Sync',
    'sync-youtube': 'Sync',
    revalidate: 'Cache',
    'revalidate-content': 'Cache',
    'revalidate-site-settings': 'Cache',
    contact: 'Public',
    vitals: 'Public',
    'page-events': 'Public',
    'exchange-rates': 'Public',
    'log-error': 'Public',
    v1: 'Partner API',
  };
  return map[root] ?? 'Public';
}

function getSecurity(routePath, auth) {
  if (routePath.startsWith('/api/v1/')) return [{ PartnerApiKey: [] }];
  if (auth.bearerCron) return [{ CronSecret: [] }];
  if (routePath.startsWith('/api/admin/')) {
    if (auth.bearerAdminOnly) return [{ AdminBearer: [] }];
    return [{ AdminBearer: [] }];
  }
  if (routePath.startsWith('/api/portal/') || routePath.startsWith('/api/account/') || routePath.startsWith('/api/press/')) {
    return [{ SessionBearer: [] }];
  }
  if (auth.bearerAdmin) return [{ AdminBearer: [] }];
  if (auth.bearerSession) return [{ SessionBearer: [] }];
  return [];
}

function getPathParams(routePath) {
  const matches = [...routePath.matchAll(/\{([^}]+)\}/g)];
  return matches.map((m) => m[1]);
}

function defaultSummary(method, routePath) {
  const action = {
    GET: 'Retrieve',
    POST: 'Create or submit',
    PUT: 'Replace',
    PATCH: 'Update',
    DELETE: 'Delete',
    HEAD: 'Probe',
  }[method] ?? method;
  return `${action} ${routePath}`;
}

function cleanSummary(summary, method, routePath) {
  if (!summary) return defaultSummary(method, routePath);
  const trimmed = summary
    .replace(/^(GET|POST|PUT|PATCH|DELETE|HEAD)\s+\/api\/[^\s—-]+\s*[—-]?\s*/i, '')
    .replace(/^\/api\/[^\s]+(\s*[—-]\s*)?/, '')
    .trim();
  return trimmed || defaultSummary(method, routePath);
}

const apiDir = path.join(process.cwd(), 'app', 'api');
const files = walk(apiDir).sort();

const routes = [];
function extractMethods(content, fileDir) {
  const methods = [];
  for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    const re1 = new RegExp(`export async function ${m}\\b`);
    const re2 = new RegExp(`export const ${m}\\s*=`);
    const re3 = new RegExp(`export\\s*\\{[^}]*\\b${m}\\b[^}]*\\}\\s*from`);
    if (re1.test(content) || re2.test(content) || re3.test(content)) methods.push(m);
  }

  const reExport = content.match(/export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/);
  if (reExport && methods.length === 0) {
    const exported = reExport[1].split(',').map((s) => s.trim()).filter(Boolean);
    const target = path.resolve(fileDir, reExport[2] + (reExport[2].endsWith('.ts') ? '' : '.ts'));
    if (fs.existsSync(target)) {
      const targetContent = fs.readFileSync(target, 'utf8');
      return [...new Set([...methods, ...extractMethods(targetContent, path.dirname(target))])];
    }
    return exported.filter((m) => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(m));
  }

  return methods;
}

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const methods = extractMethods(content, path.dirname(file));

  const docMatch = content.match(/\/\*\*[\s\S]*?\*\//);
  let summary = '';
  if (docMatch) {
    const lines = docMatch[0]
      .split('\n')
      .map((l) => l.replace(/^\s*\*?\s?/, '').trim())
      .filter((l) => l && !l.startsWith('/') && !l.startsWith('app/api') && !l.startsWith('*'));
    summary = lines.slice(0, 2).join(' ').replace(/\s+/g, ' ').trim();
    // Prefer method-specific line
    for (const line of lines) {
      if (/^(GET|POST|PUT|PATCH|DELETE|HEAD)\s+\/api/.test(line)) {
        summary = line.replace(/^(GET|POST|PUT|PATCH|DELETE|HEAD)\s+/, '').trim();
        break;
      }
    }
  }

  const auth = {
    bearerAdmin: /verifyAdmin\b|verifyAdminOrEditor|verifyPermission/.test(content),
    bearerAdminOnly: /verifyAdmin\(/.test(content) && !/verifyAdminOrEditor/.test(content),
    bearerCron: /CRON_SECRET|verifyCronSecret/.test(content),
    bearerSession: /createServerSupabaseClient|getUser\(\)|getSession|verifyPortalAccess|requirePortalArtist/.test(content),
  };

  const rel = file.replace(apiDir, '').replace(/\\/g, '/').replace(/\/route\.ts$/, '');
  const openapiPath = '/api' + rel.replace(/\[([^\]]+)\]/g, '{$1}');

  routes.push({ path: openapiPath, methods, summary, auth });
}

// Group by path
const pathMap = new Map();
for (const r of routes) {
  if (!pathMap.has(r.path)) pathMap.set(r.path, { ...r });
  else {
    const existing = pathMap.get(r.path);
    existing.methods = [...new Set([...existing.methods, ...r.methods])].sort();
    if (!existing.summary && r.summary) existing.summary = r.summary;
  }
}

const sortedPaths = [...pathMap.values()].sort((a, b) => a.path.localeCompare(b.path));
const tagDescriptions = {
  Account: 'Authenticated user account management (GDPR export, display name, deletion).',
  Admin: 'CMS and back-office endpoints (admin or editor role required).',
  Auth: 'Public authentication helpers.',
  Cache: 'On-demand ISR cache revalidation (secret-protected).',
  EPK: 'Electronic press kit sharing and export.',
  Health: 'System health probes and alerting.',
  'Journalist Applications': 'Press accreditation application flow.',
  Newsletter: 'Double opt-in newsletter subscription.',
  Portal: 'Artist portal dashboard APIs.',
  Press: 'Journalist/press dashboard APIs.',
  Public: 'Unauthenticated public endpoints.',
  Sync: 'Artist/release sync jobs (cron or admin triggered).',
  Upload: 'Media upload endpoints.',
  'Partner API':
    'Public, versioned REST API (/api/v1/*) for partner organizations. Bearer organization API key (dt_live_…), gated behind the partner_api feature flag and per-key scopes. Data is isolated to the calling organization. Follows the Zalando RESTful API Guidelines.',
};

const tags = [...new Set(sortedPaths.map((r) => getTag(r.path)))].sort();

const lines = [];
lines.push('openapi: 3.1.0');
lines.push('info:');
lines.push('  title: darkTunes Music Group API');
lines.push('  description: |');
lines.push('    REST API for the darkTunes Music Group website (Next.js 15 App Router).');
lines.push('');
lines.push('    **Authentication**');
lines.push('    - `SessionBearer`: Supabase JWT for authenticated users (portal, account, press).');
lines.push('    - `AdminBearer`: Supabase JWT with `admin` or `editor` role (admin routes).');
lines.push('    - `CronSecret`: Bearer token matching `CRON_SECRET` for scheduled sync/cache jobs.');
lines.push('');
lines.push('    **Error format** (all routes via `withErrorHandler`):');
lines.push('    ```json');
lines.push('    { "error": "Human-readable message", "code": "OPTIONAL_ERROR_CODE" }');
lines.push('    ```');
lines.push('  version: 1.0.0');
lines.push('  contact:');
lines.push('    name: darkTunes Music Group');
lines.push('    url: https://darktunes.com');
lines.push('');
lines.push('servers:');
lines.push('  - url: https://darktunes.com');
lines.push('    description: Production');
lines.push('  - url: http://localhost:3000');
lines.push('    description: Local development');
lines.push('');
lines.push('tags:');
for (const tag of tags) {
  lines.push(`  - name: ${tag}`);
  if (tagDescriptions[tag]) {
    lines.push(`    description: ${yamlEscape(tagDescriptions[tag])}`);
  }
}
lines.push('');
lines.push('components:');
lines.push('  securitySchemes:');
lines.push('    SessionBearer:');
lines.push('      type: http');
lines.push('      scheme: bearer');
lines.push('      bearerFormat: JWT');
lines.push('      description: Supabase access token (portal artist, press journalist, account owner).');
lines.push('    AdminBearer:');
lines.push('      type: http');
lines.push('      scheme: bearer');
lines.push('      bearerFormat: JWT');
lines.push('      description: Supabase access token with admin or editor role.');
lines.push('    CronSecret:');
lines.push('      type: http');
lines.push('      scheme: bearer');
lines.push('      description: Static secret from CRON_SECRET env var (Supabase Cron / internal jobs).');
lines.push('    PartnerApiKey:');
lines.push('      type: http');
lines.push('      scheme: bearer');
lines.push('      description: >');
lines.push('        Organization API key, prefixed `dt_live_`, sent as `Authorization: Bearer <key>`.');
lines.push('        Keys carry scopes (e.g. `read`, or `*` for all) and are validated against');
lines.push('        organization_api_keys; revoked keys are rejected. The owning organization');
lines.push('        must have the `partner_api` feature enabled.');
lines.push('');
lines.push('  schemas:');
lines.push('    ErrorResponse:');
lines.push('      type: object');
lines.push('      required: [error]');
lines.push('      properties:');
lines.push('        error:');
lines.push('          type: string');
lines.push('        code:');
lines.push('          type: string');
lines.push('    SuccessResponse:');
lines.push('      type: object');
lines.push('      properties:');
lines.push('        success:');
lines.push('          type: boolean');
lines.push('    ContactRequest:');
lines.push('      type: object');
lines.push('      required: [name, email, topic, message, gdprConsent]');
lines.push('      properties:');
lines.push('        name: { type: string, minLength: 1 }');
lines.push('        email: { type: string, format: email }');
lines.push('        topic: { type: string, minLength: 1, maxLength: 100 }');
lines.push('        message: { type: string, minLength: 20 }');
lines.push('        gdprConsent: { type: boolean, enum: [true] }');
lines.push('        website: { type: string, maxLength: 0, description: "Honeypot field - must be empty" }');
lines.push('    ForgotPasswordRequest:');
lines.push('      type: object');
lines.push('      required: [email]');
lines.push('      properties:');
lines.push('        email: { type: string, format: email }');
lines.push('    NewsletterSubscribeRequest:');
lines.push('      type: object');
lines.push('      required: [email]');
lines.push('      properties:');
lines.push('        email: { type: string, format: email }');
lines.push('    DisplayNameUpdate:');
lines.push('      type: object');
lines.push('      required: [displayName]');
lines.push('      properties:');
lines.push('        displayName: { type: string, minLength: 1, maxLength: 120 }');
lines.push('    HealthLiveness:');
lines.push('      type: object');
lines.push('      properties:');
lines.push('        status: { type: string, enum: [ok, degraded] }');
lines.push('        database:');
lines.push('          type: object');
lines.push('          properties:');
lines.push('            status: { type: string, enum: [online, offline] }');
// --- Partner API (/api/v1/*) schemas — Zalando RESTful API Guidelines ---
lines.push('    PartnerArtist:');
lines.push('      type: object');
lines.push('      description: Artist record scoped to the calling organization.');
lines.push('      properties:');
lines.push('        id: { type: string, format: uuid }');
lines.push('        name: { type: string }');
lines.push('        slug: { type: string }');
lines.push('        genres: { type: array, items: { type: string } }');
lines.push('        country: { type: string, nullable: true }');
lines.push('        is_visible: { type: boolean }');
lines.push('        created_at: { type: string, format: date-time }');
lines.push('        updated_at: { type: string, format: date-time, description: "Detail endpoint only." }');
lines.push('    PartnerRelease:');
lines.push('      type: object');
lines.push('      description: Release record scoped to the calling organization.');
lines.push('      properties:');
lines.push('        id: { type: string, format: uuid }');
lines.push('        title: { type: string }');
lines.push('        artist_id: { type: string, format: uuid }');
lines.push('        release_date: { type: string, format: date, nullable: true }');
lines.push('        type: { type: string, nullable: true }');
lines.push('        catalog_number: { type: string, nullable: true }');
lines.push('        isrc: { type: string, nullable: true }');
lines.push('        featured: { type: boolean }');
lines.push('        created_at: { type: string, format: date-time }');
lines.push('        updated_at: { type: string, format: date-time, description: "Detail endpoint only." }');
lines.push('    PartnerReleaseSubmission:');
lines.push('      type: object');
lines.push('      description: Release submission scoped to the calling organization.');
lines.push('      properties:');
lines.push('        id: { type: string, format: uuid }');
lines.push('        artist_id: { type: string, format: uuid }');
lines.push('        status: { type: string }');
lines.push('        title: { type: string }');
lines.push('        release_date: { type: string, format: date, nullable: true }');
lines.push('        type: { type: string, nullable: true }');
lines.push('        genre: { type: string, nullable: true }');
lines.push('        isrc: { type: string, nullable: true }');
lines.push('        catalog_number: { type: string, nullable: true }');
lines.push('        audio_download_url: { type: string, nullable: true, description: "Detail endpoint only." }');
lines.push('        cover_art_url: { type: string, nullable: true, description: "Detail endpoint only." }');
lines.push('        notes: { type: string, nullable: true, description: "Detail endpoint only." }');
lines.push('        created_at: { type: string, format: date-time }');
lines.push('        updated_at: { type: string, format: date-time }');
lines.push('    PartnerArtistList:');
lines.push('      type: object');
lines.push('      required: [data, nextCursor]');
lines.push('      properties:');
lines.push('        data: { type: array, items: { $ref: "#/components/schemas/PartnerArtist" } }');
lines.push('        nextCursor: { type: string, nullable: true, description: "Opaque cursor for the next page, or null when exhausted." }');
lines.push('    PartnerReleaseList:');
lines.push('      type: object');
lines.push('      required: [data, nextCursor]');
lines.push('      properties:');
lines.push('        data: { type: array, items: { $ref: "#/components/schemas/PartnerRelease" } }');
lines.push('        nextCursor: { type: string, nullable: true }');
lines.push('    PartnerReleaseSubmissionList:');
lines.push('      type: object');
lines.push('      required: [data, nextCursor]');
lines.push('      properties:');
lines.push('        data: { type: array, items: { $ref: "#/components/schemas/PartnerReleaseSubmission" } }');
lines.push('        nextCursor: { type: string, nullable: true }');
lines.push('    PartnerArtistEnvelope:');
lines.push('      type: object');
lines.push('      required: [data]');
lines.push('      properties:');
lines.push('        data: { $ref: "#/components/schemas/PartnerArtist" }');
lines.push('    PartnerReleaseEnvelope:');
lines.push('      type: object');
lines.push('      required: [data]');
lines.push('      properties:');
lines.push('        data: { $ref: "#/components/schemas/PartnerRelease" }');
lines.push('    PartnerReleaseSubmissionEnvelope:');
lines.push('      type: object');
lines.push('      required: [data]');
lines.push('      properties:');
lines.push('        data: { $ref: "#/components/schemas/PartnerReleaseSubmission" }');
lines.push('    PartnerAnalyticsExport:');
lines.push('      type: object');
lines.push('      description: JSON analytics payload (returned when format=json; default response is text/csv).');
lines.push('      properties:');
lines.push('        stats: { type: array, items: { type: object, additionalProperties: true } }');
lines.push('        territoryMetrics: { type: array, items: { type: object, additionalProperties: true } }');
lines.push('        listenerMetrics: { type: array, items: { type: object, additionalProperties: true } }');
lines.push('        statements: { type: array, items: { type: object, additionalProperties: true } }');
lines.push('');
lines.push('  responses:');
lines.push('    BadRequest:');
lines.push('      description: Validation error');
lines.push('      content:');
lines.push('        application/json:');
lines.push('          schema: { $ref: "#/components/schemas/ErrorResponse" }');
lines.push('    Unauthorized:');
lines.push('      description: Missing or invalid bearer token');
lines.push('      content:');
lines.push('        application/json:');
lines.push('          schema: { $ref: "#/components/schemas/ErrorResponse" }');
lines.push('    Forbidden:');
lines.push('      description: Insufficient role or permission');
lines.push('      content:');
lines.push('        application/json:');
lines.push('          schema: { $ref: "#/components/schemas/ErrorResponse" }');
lines.push('    NotFound:');
lines.push('      description: Resource not found');
lines.push('      content:');
lines.push('        application/json:');
lines.push('          schema: { $ref: "#/components/schemas/ErrorResponse" }');
lines.push('    TooManyRequests:');
lines.push('      description: Rate limit exceeded');
lines.push('      content:');
lines.push('        application/json:');
lines.push('          schema: { $ref: "#/components/schemas/ErrorResponse" }');
lines.push('');
lines.push('paths:');

const schemaOverrides = {
  '/api/contact': {
    POST: {
      requestBody: { schema: 'ContactRequest' },
      responses: { 200: { schema: 'SuccessResponse' } },
    },
  },
  '/api/auth/forgot-password': {
    POST: {
      requestBody: { schema: 'ForgotPasswordRequest' },
      responses: { 200: { schema: 'SuccessResponse' } },
    },
  },
  '/api/newsletter': {
    POST: {
      requestBody: { schema: 'NewsletterSubscribeRequest' },
      responses: { 200: { schema: 'SuccessResponse' } },
    },
  },
  '/api/account/display-name': {
    PATCH: {
      requestBody: { schema: 'DisplayNameUpdate' },
      responses: { 200: { schema: 'SuccessResponse' } },
    },
  },
  '/api/health': {
    GET: {
      parameters: [
        { name: 'mode', in: 'query', schema: { type: 'string', enum: ['full'] }, description: 'Full dashboard snapshot' },
        { name: 'fresh', in: 'query', schema: { type: 'string', enum: ['1'] }, description: 'Bypass 60s cache when mode=full' },
      ],
      responses: { 200: { schema: 'HealthLiveness' }, 503: { description: 'Database offline' } },
    },
  },
  // --- Partner API (/api/v1/*) — cursor pagination + typed envelopes ---
  '/api/v1/artists': {
    GET: {
      summary: 'List artists',
      parameters: [
        { name: 'limit', in: 'query', description: 'Page size (1-200).', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
        { name: 'cursor', in: 'query', description: "Opaque cursor from a previous response's nextCursor.", schema: { type: 'string' } },
      ],
      responses: { 200: { schema: 'PartnerArtistList' } },
    },
  },
  '/api/v1/artists/{id}': {
    GET: { summary: 'Get artist by ID', responses: { 200: { schema: 'PartnerArtistEnvelope' } } },
  },
  '/api/v1/releases': {
    GET: {
      summary: 'List releases',
      parameters: [
        { name: 'limit', in: 'query', description: 'Page size (1-200).', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
        { name: 'cursor', in: 'query', description: "Opaque cursor from a previous response's nextCursor.", schema: { type: 'string' } },
      ],
      responses: { 200: { schema: 'PartnerReleaseList' } },
    },
  },
  '/api/v1/releases/{id}': {
    GET: { summary: 'Get release by ID', responses: { 200: { schema: 'PartnerReleaseEnvelope' } } },
  },
  '/api/v1/release-submissions': {
    GET: {
      summary: 'List release submissions',
      parameters: [
        { name: 'limit', in: 'query', description: 'Page size (1-200).', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
        { name: 'cursor', in: 'query', description: "Opaque cursor from a previous response's nextCursor.", schema: { type: 'string' } },
      ],
      responses: { 200: { schema: 'PartnerReleaseSubmissionList' } },
    },
  },
  '/api/v1/release-submissions/{id}': {
    GET: { summary: 'Get release submission by ID', responses: { 200: { schema: 'PartnerReleaseSubmissionEnvelope' } } },
  },
  '/api/v1/analytics/export': {
    GET: {
      summary: 'Export artist analytics (CSV default, JSON when format=json)',
      parameters: [
        { name: 'artistId', in: 'query', required: true, description: 'Artist to export; must belong to the calling organization.', schema: { type: 'string', format: 'uuid' } },
        { name: 'format', in: 'query', description: 'Response format.', schema: { type: 'string', enum: ['csv', 'json'], default: 'csv' } },
      ],
      responses: { 200: { schema: 'PartnerAnalyticsExport' } },
    },
  },
};

for (const route of sortedPaths) {
  lines.push(`  ${route.path}:`);
  const tag = getTag(route.path);
  const security = getSecurity(route.path, route.auth);
  const pathParams = getPathParams(route.path);

  for (const method of route.methods) {
    if (method === 'OPTIONS') continue;
    const override = schemaOverrides[route.path]?.[method];
    const opId = (method.toLowerCase() + route.path.replace(/^\/api\//, '').replace(/\{[^}]+\}/g, 'ById').replace(/\//g, '_')).replace(/_+/g, '_');
    lines.push(`    ${method.toLowerCase()}:`);
    lines.push(`      operationId: ${opId}`);
    lines.push(`      tags: [${tag}]`);
    const summary = override?.summary ?? cleanSummary(route.summary, method, route.path);
    lines.push(`      summary: ${yamlEscape(summary)}`);
    lines.push('      security:');
    if (security.length > 0) {
      for (const s of security) {
        const key = Object.keys(s)[0];
        lines.push(`        - ${key}: []`);
      }
    } else {
      lines.push('        - {}');
    }

    const params = override?.parameters ?? [];
    if (pathParams.length > 0 || params.length > 0) {
      lines.push('      parameters:');
      for (const p of pathParams) {
        lines.push(`        - name: ${p}`);
        lines.push('          in: path');
        lines.push('          required: true');
        lines.push('          schema:');
        lines.push('            type: string');
      }
      for (const p of params) {
        lines.push(`        - name: ${p.name}`);
        lines.push(`          in: ${p.in}`);
        if (p.required) lines.push('          required: true');
        if (p.description) lines.push(`          description: ${yamlEscape(p.description)}`);
        lines.push('          schema:');
        lines.push(`            type: ${p.schema.type}`);
        if (p.schema.enum) {
          lines.push(`            enum: [${p.schema.enum.map((e) => JSON.stringify(e)).join(', ')}]`);
        }
        if (p.schema.minimum !== undefined) lines.push(`            minimum: ${p.schema.minimum}`);
        if (p.schema.maximum !== undefined) lines.push(`            maximum: ${p.schema.maximum}`);
        if (p.schema.default !== undefined) lines.push(`            default: ${p.schema.default}`);
        if (p.schema.format) lines.push(`            format: ${p.schema.format}`);
      }
    }

    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      const schema = override?.requestBody?.schema;
      lines.push('      requestBody:');
      if (method === 'POST' && route.path.includes('upload')) {
        lines.push('        required: true');
        lines.push('        content:');
        lines.push('          multipart/form-data:');
        lines.push('            schema:');
        lines.push('              type: object');
        lines.push('              properties:');
        lines.push('                file: { type: string, format: binary }');
      } else {
        lines.push('        required: true');
        lines.push('        content:');
        lines.push('          application/json:');
        lines.push('            schema:');
        if (schema) {
          lines.push(`              $ref: "#/components/schemas/${schema}"`);
        } else {
          lines.push('              type: object');
          lines.push('              additionalProperties: true');
        }
      }
    }

    lines.push('      responses:');
    const responses = override?.responses ?? {};
    if (responses[200]) {
      lines.push("        '200':");
      lines.push('          description: Success');
      if (responses[200].schema) {
        lines.push('          content:');
        lines.push('            application/json:');
        lines.push('              schema:');
        lines.push(`                $ref: "#/components/schemas/${responses[200].schema}"`);
      }
    } else if (method === 'HEAD') {
      lines.push("        '200':");
      lines.push('          description: Liveness probe (no body)');
    } else if (method === 'DELETE') {
      lines.push("        '200':");
      lines.push('          description: Deleted');
      lines.push('          content:');
      lines.push('            application/json:');
      lines.push('              schema:');
      lines.push('                $ref: "#/components/schemas/SuccessResponse"');
    } else if (method === 'GET') {
      lines.push("        '200':");
      lines.push('          description: Success');
      lines.push('          content:');
      lines.push('            application/json:');
      lines.push('              schema:');
      lines.push('                type: object');
      lines.push('                additionalProperties: true');
    } else {
      lines.push("        '200':");
      lines.push('          description: Success');
      lines.push('          content:');
      lines.push('            application/json:');
      lines.push('              schema:');
      lines.push('                $ref: "#/components/schemas/SuccessResponse"');
    }

    if (responses[503]) {
      lines.push("        '503':");
      lines.push(`          description: ${yamlEscape(responses[503].description ?? 'Service unavailable')}`);
    }

    lines.push("        '400': { $ref: '#/components/responses/BadRequest' }");
    if (security.length > 0) {
      lines.push("        '401': { $ref: '#/components/responses/Unauthorized' }");
      lines.push("        '403': { $ref: '#/components/responses/Forbidden' }");
    }
    lines.push("        '404': { $ref: '#/components/responses/NotFound' }");
    if (['/api/contact', '/api/auth/forgot-password', '/api/newsletter', '/api/journalist-applications', '/api/page-events'].includes(route.path)) {
      lines.push("        '429': { $ref: '#/components/responses/TooManyRequests' }");
    }
  }
}

const outPath = path.join(process.cwd(), 'docs', 'openapi.yaml');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
console.log(`Wrote ${outPath} (${sortedPaths.length} paths)`);
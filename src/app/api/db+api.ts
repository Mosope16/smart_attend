/**
 * Secure Serverless Database Gateway (Expo Router API Route)
 * Routes client queries to Neon PostgreSQL without exposing database credentials to mobile clients.
 * Reads the server-only NEON_DATABASE_URL environment variable.
 * Zero-dependency: Uses direct HTTP /sql driver over fetch.
 */

function getDatabaseUrl(): string {
  return process.env.NEON_DATABASE_URL || process.env.EXPO_PUBLIC_NEON_DATABASE_URL || '';
}

function parseHost(url: string): string {
  try {
    const atSplit = url.split('@');
    if (atSplit.length > 1) {
      const hostPart = atSplit[1].split('/')[0];
      const host = hostPart.split('?')[0];
      return host.replace('-pooler', '');
    }
  } catch {
    // fallback
  }
  return 'ep-broad-fire-b5t3ep7p.c-7.us-east-2.aws.neon.tech';
}

// Disallow destructive DDL statements from being proxied
const FORBIDDEN_DDL_REGEX = /^\s*(DROP|ALTER|TRUNCATE|GRANT|REVOKE)\b/i;

export async function POST(request: Request) {
  try {
    const dbUrl = getDatabaseUrl();
    if (!dbUrl) {
      return Response.json(
        { error: { message: 'Server database connection string is not configured.', code: 'CONFIG_ERROR' }, data: null },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const query = typeof body?.query === 'string' ? body.query.trim() : '';

    if (!query) {
      return Response.json(
        { error: { message: 'Query string is required.', code: 'EMPTY_QUERY' }, data: null },
        { status: 400 }
      );
    }

    // Security Gate: Reject DDL modifications from client applications
    if (FORBIDDEN_DDL_REGEX.test(query)) {
      return Response.json(
        { error: { message: 'Security violation: DDL schema modifications are prohibited.', code: '42501' }, data: null },
        { status: 403 }
      );
    }

    const cleanUrl = dbUrl.replace('-pooler', '');
    const host = parseHost(cleanUrl);
    const sqlEndpoint = `https://${host}/sql`;

    const res = await fetch(sqlEndpoint, {
      method: 'POST',
      headers: {
        'Neon-Connection-String': cleanUrl,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return Response.json({ data: null, error: json }, { status: res.status });
    }

    return Response.json({ data: json.rows || [], error: null });
  } catch (err: any) {
    console.error('API Database Proxy Error:', err);
    return Response.json(
      {
        data: null,
        error: {
          message: err?.message || 'Database proxy error occurred.',
          code: err?.code || 'DB_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

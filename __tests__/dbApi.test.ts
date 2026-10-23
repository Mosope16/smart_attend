import { POST } from '../src/app/api/db+api';

describe('db+api.ts unit tests', () => {
  const originalEnv = process.env;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv, NEON_DATABASE_URL: 'postgresql://user:pass@host/db' };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('rejects destructive DDL queries with 403 status', async () => {
    const request = new Request('http://localhost:8081/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'DROP TABLE public.users;' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('42501');
    expect(body.error.message).toContain('Security violation');
  });

  it('rejects empty query with 400 status', async () => {
    const request = new Request('http://localhost:8081/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('executes valid select query and returns data', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ rows: [{ id: '1', name: 'Test' }] }),
    });

    const request = new Request('http://localhost:8081/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'SELECT * FROM public.courses;' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual([{ id: '1', name: 'Test' }]);
    expect(body.error).toBeNull();
  });
});

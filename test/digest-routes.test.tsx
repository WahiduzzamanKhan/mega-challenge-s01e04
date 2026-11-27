import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// Own fixtures in a temp runs dir; runs/ stays untouched.
const GOOD = '2026-11-02';
const EMPTY = '2026-11-03';
const BAD = '2026-11-04';
const MISSING = '2026-12-01';

const goodLines = [
  '{"at":"2026-11-02T23:00:05+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-11-02T23:00:03+01:00","job":"rig/rotate-logs","status":"ok","owner":"lane-07"}',
  '{"at":"2026-11-02T23:00:04+01:00","job":"fixtures/refresh","status":"retry","owner":null,"error":"timeout"}',
  '{"at":"2026-11-02T23:00:09+01:00","job":"fixtures/refresh","status":"fail","owner":null,"error":"boom"}',
];

// Job names in the order the page and the JSON must both list them (sorted by job).
const SORTED_JOBS = ['fixtures/refresh', 'lane/sync', 'rig/rotate-logs'];

let runsDir: string;
const config = { adapter: 'x', installed: 'x', beatEverySeconds: 60, runsDir: '' };

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  config.runsDir = runsDir;
  writeFileSync(join(runsDir, `${GOOD}.jsonl`), goodLines.join('\n') + '\n');
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  writeFileSync(
    join(runsDir, `${BAD}.jsonl`),
    [goodLines[0], 'this is not json', goodLines[1]].join('\n') + '\n',
  );
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

// Job names in the order they appear in the page's table body.
function pageJobs(html: string): string[] {
  return [...html.matchAll(/<tr[^>]*>\s*<td>(?:⚠ )?([^<]*)<\/td>/g)].map((m) => m[1] ?? '');
}

describe('digest routes: good night', () => {
  it('page is 200 and names every job', async () => {
    const res = await createApp(config).request(`/digest/${GOOD}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    for (const job of SORTED_JOBS) expect(html).toContain(job);
    expect(pageJobs(html)).toEqual(SORTED_JOBS);
  });

  it('JSON is 200 with one row per job, sorted by job', async () => {
    const res = await createApp(config).request(`/api/digest/${GOOD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { night: string; rows: { job: string; runs: number }[]; badLines: number };
    expect(body.night).toBe(GOOD);
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(SORTED_JOBS);
    expect(body.rows.find((r) => r.job === 'fixtures/refresh')?.runs).toBe(2);
  });
});

describe('digest routes: missing night', () => {
  it('page is 404 for a night with no file', async () => {
    const res = await createApp(config).request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no run log for that night');
  });

  it('JSON is 404 for a night with no file', async () => {
    const res = await createApp(config).request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: `no run log for ${MISSING}` });
  });

  it('page and JSON are 404 for a malformed night', async () => {
    const page = await createApp(config).request('/digest/not-a-date');
    expect(page.status).toBe(404);
    const api = await createApp(config).request('/api/digest/not-a-date');
    expect(api.status).toBe(404);
  });
});

describe('digest routes: empty night', () => {
  it('page is 200 and says nothing ran', async () => {
    const res = await createApp(config).request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('nothing ran');
    expect(pageJobs(html)).toEqual([]);
  });

  it('JSON is 200 with rows []', async () => {
    const res = await createApp(config).request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: unknown[]; badLines: number };
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });
});

describe('digest routes: night with one bad line', () => {
  it('page is 200, shows the bad-line warning and still lists good jobs', async () => {
    const res = await createApp(config).request(`/digest/${BAD}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('1 line could not be read');
    expect(pageJobs(html)).toEqual(['lane/sync', 'rig/rotate-logs']);
  });

  it('JSON is 200 with badLines === 1 and the good rows', async () => {
    const res = await createApp(config).request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { job: string }[]; badLines: number };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['lane/sync', 'rig/rotate-logs']);
  });
});

describe('digest routes: page and JSON agree', () => {
  it('list the same jobs in the same order for the same night', async () => {
    const app = createApp(config);
    const html = await (await app.request(`/digest/${GOOD}`)).text();
    const body = (await (await app.request(`/api/digest/${GOOD}`)).json()) as { rows: { job: string }[] };
    expect(pageJobs(html)).toEqual(body.rows.map((r) => r.job));
  });
});

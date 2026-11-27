import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('has 5 jobs sorted by job and 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts parsed lines by status', () => {
    expect(night?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('fixtures/refresh: 3 retries, last status ok, offset kept', () => {
    const row = night?.rows.find((r) => r.job === 'fixtures/refresh');
    expect(row).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('notes/backup failed with quota exceeded', () => {
    const row = night?.rows.find((r) => r.job === 'notes/backup');
    expect(row?.lastStatus).toBe('fail');
    expect(row?.lastError).toBe('quota exceeded');
    expect(row?.owner).toBe('lane-07');
  });

  it('digest/render keeps the row with a null owner', () => {
    const row = night?.rows.find((r) => r.job === 'digest/render');
    expect(row?.owner).toBeNull();
    expect(row?.lastError).toBeNull();
    expect(row?.runs).toBe(1);
  });
});

describe('readNight edge cases', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when the file does not exist', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns an empty night for an empty file', () => {
    writeFileSync(join(dir, '2026-01-02.jsonl'), '');
    expect(readNight(dir, '2026-01-02')).toEqual({
      night: '2026-01-02',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('returns null for a night that is not YYYY-MM-DD', () => {
    writeFileSync(join(dir, 'secret.jsonl'), '');
    for (const bad of ['../secret', 'secret', '2026-1-01', '2026-01-01/../x', '']) {
      expect(readNight(dir, bad)).toBeNull();
    }
  });

  it('counts invalid lines as bad and ignores blank lines', () => {
    const lines = [
      '{"at":"2026-01-03T23:00:00+01:00","job":"a","status":"ok","owner":"rook"}',
      '',
      '{"at":"2026-01-03T23:00:00+01:00","job":"b","status":"maybe","owner":"rook"}',
      '{"at":"2026-01-03T23:00:00+01:00","job":"c","status":"ok"}',
      '{"job":"d","status":"ok","owner":null}',
      '[1,2]',
      'not json',
      '',
    ];
    writeFileSync(join(dir, '2026-01-03.jsonl'), lines.join('\n'));
    const night = readNight(dir, '2026-01-03');
    expect(night?.badLines).toBe(5);
    expect(night?.rows.map((r) => r.job)).toEqual(['a']);
    expect(night?.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
  });
});

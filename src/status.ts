import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import type { RunStatus } from './digest/types.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: string[];
  // One entry per night, same order as `nights`. counts is null when the night can't be read.
  digests: NightSummary[];
};

export type NightSummary = {
  night: string;
  counts: Record<RunStatus, number> | null;
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function nightSummaries(runsDir: string, nights: string[]): NightSummary[] {
  return nights.map((night) => {
    try {
      return { night, counts: readNight(runsDir, night)?.counts ?? null };
    } catch {
      return { night, counts: null };
    }
  });
}

export function readStatus(config: RigConfig): Status {
  const nights = nightsOnDisk(config.runsDir);
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights,
    digests: nightSummaries(config.runsDir, nights),
  };
}

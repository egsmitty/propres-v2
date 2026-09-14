import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Plan CI1. GitHub Actions defaults `timeout-minutes` to 360 per job, which is
// long enough to hold a required check hostage on a hang. And an action
// pinned to a mutable tag (`@v7`) can change underneath us without review.
// This test reads the workflow YAML as plain text (no `yaml` dependency — one
// isn't installed) so both properties are enforced mechanically instead of by
// diligence at review time.

const WORKFLOWS_DIR = resolve(__dirname, '../../../../.github/workflows');

interface Job {
  file: string;
  name: string;
  body: string;
}

function collectJobs(file: string, text: string): Job[] {
  const lines = text.split('\n');
  const jobsLineIndex = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (jobsLineIndex === -1) return [];

  const jobs: Job[] = [];
  let current: { name: string; start: number } | null = null;

  const flush = (endLine: number) => {
    if (current) {
      jobs.push({
        file,
        name: current.name,
        body: lines.slice(current.start, endLine).join('\n'),
      });
    }
  };

  for (let i = jobsLineIndex + 1; i < lines.length; i++) {
    const line = lines[i]!;
    // A job name is a key indented exactly two spaces under `jobs:`.
    const jobMatch = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (jobMatch) {
      flush(i);
      current = { name: jobMatch[1]!, start: i };
      continue;
    }
    // Any line at 0 or 1 indent ends the jobs block entirely (a new
    // top-level key, e.g. a trailing comment block is fine since it's still
    // inside the last job's body — only a *key* line ends it).
    if (current && /^\S/.test(line)) {
      flush(i);
      current = null;
    }
  }
  flush(lines.length);

  return jobs;
}

function collectUsesLines(text: string): string[] {
  return text
    .split('\n')
    .filter((l) => /^\s*uses:\s*\S+/.test(l))
    .map((l) => l.trim());
}

const workflowFiles = readdirSync(WORKFLOWS_DIR).filter(
  (f) => f.endsWith('.yml') || f.endsWith('.yaml')
);

const allJobs: Job[] = [];
const allUsesLines: string[] = [];

for (const file of workflowFiles) {
  const text = readFileSync(resolve(WORKFLOWS_DIR, file), 'utf8');
  allJobs.push(...collectJobs(file, text));
  allUsesLines.push(...collectUsesLines(text));
}

describe('workflow hygiene (timeout-minutes, SHA-pinned actions)', () => {
  // Self-enforcing: an empty parse must fail loudly, not pass vacuously.
  it('found at least one workflow job to check', () => {
    expect(allJobs.length).toBeGreaterThan(0);
  });

  it('found at least one `uses:` line to check', () => {
    expect(allUsesLines.length).toBeGreaterThan(0);
  });

  it('every job in every workflow declares timeout-minutes', () => {
    const missing = allJobs
      .filter((job) => !/^\s*timeout-minutes:\s*\d+/m.test(job.body))
      .map((job) => `${job.file}:${job.name}`);
    expect(missing).toEqual([]);
  });

  it('every `uses:` value is pinned to a 40-char commit SHA', () => {
    const shaPin = /@[0-9a-f]{40}\b/;
    const unpinned = allUsesLines.filter((line) => !shaPin.test(line));
    expect(unpinned).toEqual([]);
  });
});

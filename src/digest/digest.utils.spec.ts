import { computeDiff, escapeHtml, formatDigestMessage } from './digest.utils';
import { SnapshotServiceEntry } from './service-health-snapshot.entity';

const healthy = (name: string): SnapshotServiceEntry => ({ name, healthy: true, responseTimeMs: 50 });
const failing = (name: string, error = 'timeout'): SnapshotServiceEntry => ({ name, healthy: false, responseTimeMs: 5000, error });

describe('computeDiff', () => {
  it('detects newly failing service', () => {
    const yesterday = [healthy('svc-a'), healthy('svc-b')];
    const today = [healthy('svc-a'), failing('svc-b', 'ECONNREFUSED')];
    const diff = computeDiff(today, yesterday);
    expect(diff).not.toBeNull();
    expect(diff!.newlyFailing).toEqual([failing('svc-b', 'ECONNREFUSED')]);
    expect(diff!.recovered).toEqual([]);
    expect(diff!.stillFailing).toEqual([]);
  });

  it('detects recovered service', () => {
    const yesterday = [failing('svc-a'), healthy('svc-b')];
    const today = [healthy('svc-a'), healthy('svc-b')];
    const diff = computeDiff(today, yesterday);
    expect(diff).not.toBeNull();
    expect(diff!.recovered).toEqual([healthy('svc-a')]);
    expect(diff!.newlyFailing).toEqual([]);
    expect(diff!.stillFailing).toEqual([]);
  });

  it('detects still failing service', () => {
    const yesterday = [failing('svc-a')];
    const today = [failing('svc-a', 'timeout')];
    const diff = computeDiff(today, yesterday);
    expect(diff).not.toBeNull();
    expect(diff!.stillFailing).toEqual([failing('svc-a', 'timeout')]);
    expect(diff!.newlyFailing).toEqual([]);
    expect(diff!.recovered).toEqual([]);
  });

  it('returns null when no yesterday snapshot', () => {
    const today = [healthy('svc-a'), failing('svc-b')];
    expect(computeDiff(today, null)).toBeNull();
  });
});

describe('formatDigestMessage', () => {
  const today = [healthy('auth'), failing('catalog', 'timeout'), failing('payments', 'ECONNREFUSED')];
  const dateKey = '2026-06-09';

  it('includes summary counts', () => {
    const msg = formatDigestMessage(today, null, dateKey);
    expect(msg).toContain('1 healthy');
    expect(msg).toContain('2 failing');
    expect(msg).toContain('3 total');
  });

  it('shows first-run message when no diff', () => {
    const msg = formatDigestMessage(today, null, dateKey);
    expect(msg).toContain('First run');
  });

  it('bolds newly failing services', () => {
    const yesterday = [healthy('auth'), healthy('catalog'), healthy('payments')];
    const diff = computeDiff(today, yesterday);
    const msg = formatDigestMessage(today, diff, dateKey);
    expect(msg).toContain('<b>• catalog — timeout</b>');
    expect(msg).toContain('<b>• payments — ECONNREFUSED</b>');
  });

  it('bolds recovered services', () => {
    const yesterday = [failing('auth'), failing('catalog'), failing('payments')];
    const todayAllHealthy = [healthy('auth'), healthy('catalog'), healthy('payments')];
    const diff = computeDiff(todayAllHealthy, yesterday);
    const msg = formatDigestMessage(todayAllHealthy, diff, dateKey);
    expect(msg).toContain('<b>• auth</b>');
    expect(msg).toContain('<b>• catalog</b>');
  });

  it('shows no changes message when diff is empty', () => {
    const yesterday = [healthy('auth'), failing('catalog', 'timeout'), failing('payments', 'ECONNREFUSED')];
    const diff = computeDiff(today, yesterday);
    const msg = formatDigestMessage(today, diff, dateKey);
    expect(msg).toContain('No changes since yesterday');
  });

  it('lists still failing services', () => {
    const yesterday = [healthy('auth'), failing('catalog', 'timeout'), failing('payments', 'ECONNREFUSED')];
    const diff = computeDiff(today, yesterday);
    const msg = formatDigestMessage(today, diff, dateKey);
    expect(msg).toContain('• catalog — timeout');
    expect(msg).toContain('• payments — ECONNREFUSED');
  });
});

describe('HTML escaping of untrusted service values', () => {
  const entry = (over: Record<string, unknown> = {}) =>
    ({ name: 'svc', healthy: false, error: undefined, ...over }) as any;

  it('escapes & before < and > so entities are not double-escaped', () => {
    expect(escapeHtml('A & B <tag> C')).toBe('A &amp; B &lt;tag&gt; C');
  });

  it('escapes error text so a stray tag cannot break the digest markup', () => {
    // Telegram rejected the whole digest on 2026-08-18 for exactly this shape.
    const today = [entry({ name: 'speakasap', error: 'no <deployment> found' })];
    const msg = formatDigestMessage(today, computeDiff(today, []), '2026-08-23');

    expect(msg).toContain('no &lt;deployment&gt; found');
    expect(msg).not.toContain('no <deployment> found');
  });

  it('escapes service names too', () => {
    const today = [entry({ name: 'weird<name>' })];
    const msg = formatDigestMessage(today, computeDiff(today, []), '2026-08-23');

    expect(msg).toContain('weird&lt;name&gt;');
    expect(msg).not.toContain('weird<name>');
  });

  it('leaves the digest\'s own markup intact', () => {
    const today = [entry({ name: 'svc' })];
    const msg = formatDigestMessage(today, computeDiff(today, []), '2026-08-23');

    expect(msg).toContain('<b>Monitoring Daily Digest</b>');
  });
});

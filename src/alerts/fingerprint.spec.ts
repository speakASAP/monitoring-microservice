import { buildFingerprint } from './fingerprint';

describe('buildFingerprint', () => {
  it('keeps short identities readable', () => {
    expect(buildFingerprint('cronjob', 'statex-apps', 'pod-janitor')).toBe(
      'cronjob:statex-apps/pod-janitor',
    );
  });

  it('never exceeds the varchar(64) column', () => {
    const longest = buildFingerprint(
      'cronjob',
      'statex-apps',
      'marketing-order-affinity-central-orders-backfill',
    );
    expect(longest.length).toBeLessThanOrEqual(64);
  });

  it('is stable across calls', () => {
    const a = buildFingerprint('cronjob', 'statex-apps', 'catalog-contract-monitor');
    const b = buildFingerprint('cronjob', 'statex-apps', 'catalog-contract-monitor');
    expect(a).toBe(b);
  });

  it('distinguishes long names that share a prefix', () => {
    // Truncation alone would collide these into one alert row, hiding one of
    // the two failures completely.
    const a = buildFingerprint('cronjob', 'statex-apps', `${'x'.repeat(60)}-alpha`);
    const b = buildFingerprint('cronjob', 'statex-apps', `${'x'.repeat(60)}-beta`);
    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(64);
    expect(b.length).toBeLessThanOrEqual(64);
  });

  it('ignores empty parts rather than emitting double separators', () => {
    expect(buildFingerprint('heartbeat', 'job-watcher', '')).toBe('heartbeat:job-watcher');
  });
});

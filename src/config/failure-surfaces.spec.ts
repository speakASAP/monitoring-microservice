import {
  FAILURE_SURFACES,
  undetectedSurfaces,
  findSurface,
  isAutoFixEligible,
} from './failure-surfaces';

describe('failure surface ledger', () => {
  it('declares every CronJob measured in the cluster', () => {
    // If a CronJob ships without a ledger entry, the coverage checker exits
    // non-zero. This asserts the count the checker validated on 2026-09-05.
    const cronjobs = FAILURE_SURFACES.filter((s) => s.kind === 'k8s-cronjob');
    expect(cronjobs).toHaveLength(11);
  });

  it('has unique surface names', () => {
    // Duplicates would make findSurface ambiguous, and isAutoFixEligible would
    // silently answer for whichever entry came first.
    const names = FAILURE_SURFACES.map((s) => s.surface);
    expect(new Set(names).size).toBe(names.length);
  });

  it('records the known-blind host surfaces rather than omitting them', () => {
    // The whole point of the ledger: a gap you have declared is a visible
    // finding, a gap you have not is indistinguishable from silence. Every
    // host surface is currently unobserved — no crontab entry checks its exit
    // code and no systemd unit declares OnFailure=.
    const blind = undetectedSurfaces().map((s) => s.surface);
    expect(blind).toContain('backup-all-databases');
    expect(blind).toContain('rotate-logging-admin-token');
    expect(blind).toContain('alfares-critical-backup');
    expect(blind.length).toBeGreaterThan(0);
  });

  it('shows every CronJob is now covered, which was not true before JobWatcher', () => {
    const cronjobs = FAILURE_SURFACES.filter((s) => s.kind === 'k8s-cronjob');
    expect(cronjobs.every((s) => s.failureDestination === 'monitoring-alert')).toBe(true);
  });
});

describe('auto-fix containment', () => {
  it('refuses automated repair on credential, backup and security surfaces', () => {
    // A wrong autonomous fix on these is worse than a delayed human one.
    for (const surface of [
      'rotate-logging-admin-token',
      'backup-all-databases',
      'alfares-critical-backup',
      'statex-secret-census',
      'pod-janitor',
    ]) {
      expect(isAutoFixEligible(surface)).toBe(false);
    }
  });

  it('refuses automated repair on the trigger incident itself', () => {
    // catalog-contract-monitor fails because it claims an identity the catalog
    // no longer accepts. The obvious automated "fix" — granting the name it
    // asks for — would silence the alert by widening access. That is precisely
    // the fix a machine should not be allowed to make alone.
    expect(isAutoFixEligible('catalog-contract-monitor')).toBe(false);
  });

  it('allows repair on ordinary application jobs', () => {
    expect(isAutoFixEligible('warehouse-reservation-expiry')).toBe(true);
    expect(isAutoFixEligible('cliplot-readiness-monitor')).toBe(true);
  });

  it('fails closed for an unknown surface', () => {
    // Adding a surface must never silently opt it into automated repair.
    expect(isAutoFixEligible('some-job-nobody-declared')).toBe(false);
    expect(isAutoFixEligible('')).toBe(false);
  });

  it('every entry names an owner or explicitly declines to', () => {
    // An alert nobody owns is an alert nobody fixes.
    for (const s of FAILURE_SURFACES) {
      expect(s.owningRepo.length).toBeGreaterThan(0);
    }
  });

  it('every declared gap explains itself', () => {
    // A gap without a reason decays into an unexplained TODO nobody dares close.
    for (const s of undetectedSurfaces()) {
      expect(typeof s.notes).toBe('string');
      expect((s.notes || '').length).toBeGreaterThan(10);
    }
  });
});

describe('findSurface', () => {
  it('finds a declared surface', () => {
    expect(findSurface('pod-janitor')?.owningRepo).toBe('shared');
  });

  it('returns undefined rather than throwing for an unknown name', () => {
    expect(findSurface('nope')).toBeUndefined();
  });
});

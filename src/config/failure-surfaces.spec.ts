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

  it('leaves no surface undeclared and no declared surface unwatched', () => {
    // The whole point of the ledger: a gap you have declared is a visible
    // finding, a gap you have not is indistinguishable from silence.
    //
    // Every surface now reports somewhere. This assertion is deliberately an
    // invariant rather than a list of known-blind names: when the next surface
    // is added to the ledger without a destination, this fails, instead of
    // continuing to pass because the new gap was not in a hardcoded snapshot.
    // That is the failure mode the ledger exists to prevent, so the test must
    // not reproduce it.
    expect(undetectedSurfaces()).toEqual([]);
  });

  it('watches the systemd timers by polling, since OnFailure= needs root', () => {
    // These were the last three gaps. The direct mechanism is an OnFailure=
    // drop-in, but the units are root-owned and sudo is password-gated here,
    // so they were covered by an unprivileged poller from the ssf crontab
    // instead. Weaker than OnFailure= -- up to one poll interval late -- and
    // still incomparably better than nothing, which is what watched them
    // before.
    const timers = FAILURE_SURFACES.filter((s) => s.kind === 'host-systemd-timer');
    expect(timers).toHaveLength(3);
    expect(timers.every((s) => s.failureDestination === 'monitoring-alert')).toBe(true);
  });

  it('covers the user-scope timers, which are invisible to `systemctl list-timers`', () => {
    // These were missed on the first pass: `systemctl --user` is a separate
    // systemd instance with its own bus, so none of them showed up in the
    // enumeration that found the system timers. The most consequential
    // scheduled jobs in the ecosystem were the ones hardest to see.
    const userTimers = FAILURE_SURFACES.filter((s) => s.kind === 'host-user-timer');
    expect(userTimers).toHaveLength(6);
    expect(userTimers.every((s) => s.failureDestination === 'monitoring-alert')).toBe(true);
    expect(userTimers.map((s) => s.surface)).toContain('vault-eso-token-renew');
  });

  it('declares the user bus itself, so one outage is not five false alarms', () => {
    // cron supplies no session bus. Without XDG_RUNTIME_DIR every user-scope
    // read fails simultaneously, and five bogus alerts at once is worse than
    // none: it is how a channel earns being muted.
    const bus = FAILURE_SURFACES.find((s) => s.surface === 'systemd-user-bus');
    expect(bus).toBeDefined();
    expect(bus?.failureDestination).toBe('monitoring-alert');
  });

  it('never allows the secret census or a backup to be auto-repaired', () => {
    // Covering these surfaces means an agent can now be woken by them. Neither
    // is a safe thing to let it edit: one reads every secret in the ecosystem,
    // the other is the last line of defence during a restore.
    const forbidden = [
      'statex-secret-census',
      'alfares-critical-backup',
      // Added with the user-scope timers: one holds the root of the secret
      // chain, the other is the ecosystem's credential-expiry warning.
      'vault-eso-token-renew',
      'statex-token-health',
    ];
    for (const name of forbidden) {
      const surface = FAILURE_SURFACES.find((s) => s.surface === name);
      expect(surface?.autoFixEligible).toBe(false);
    }
  });

  it('shows the crontab entries are now reporting, including the backup', () => {
    // These were the highest-consequence gaps: a silently failing backup is
    // only discovered during a restore.
    const crontab = FAILURE_SURFACES.filter((s) => s.kind === 'host-crontab');
    expect(crontab).toHaveLength(5);
    expect(crontab.every((s) => s.failureDestination === 'monitoring-alert')).toBe(true);
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

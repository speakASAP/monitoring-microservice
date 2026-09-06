import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AlertsService } from './alerts.service';
import { AlertNotifier } from './alert-notifier';
import { NotificationsClient } from '../common/notifications/notifications.client';
import { LoggingService } from '../common/logging/logging.service';
import { HeartbeatService } from './heartbeat.service';
import { buildFingerprint } from './fingerprint';
import { KubeClient, CronJobSummary, JobSummary } from '../k8s/kube-client';
import { intervalMinutesOrFallback } from '../k8s/cron-schedule';

/**
 * Offset from the :00/:15/:30/:45 grid that pod-janitor runs on, so evidence
 * capture is not racing the sweeper that deletes the pods holding it.
 */
const JOB_WATCH_CRON = process.env.JOB_WATCH_CRON || '7,22,37,52 * * * *';

export const JOB_WATCHER_NAME = 'job-watcher';
const JOB_WATCH_INTERVAL_MINUTES = 15;

/**
 * How many scheduled runs a CronJob may miss before it is considered broken.
 *
 * The trigger for this whole lane is why the condition is "has not SUCCEEDED
 * recently" and not "a run failed". Over the 8 days before this was written the
 * cluster produced roughly five transient job failures for every persistent
 * one; alerting on each failure event would have carried a 5:1 false-positive
 * rate, and a channel with that ratio gets muted, which is how the original
 * incident stayed invisible for four days.
 *
 * A job that fails once and succeeds on the next run refreshes
 * lastSuccessfulTime and never alerts. A job that is genuinely dead crosses the
 * threshold once and alerts once.
 *
 * 3 is a starting value, not a measured optimum -- one missed run is routine
 * scheduling jitter, three consecutive misses has no benign explanation. It is
 * env-tunable so it can be corrected from evidence without a code change.
 */
const OVERDUE_INTERVAL_MULTIPLE = Number(process.env.JOB_OVERDUE_MULTIPLE || 3);

/** Namespaces to watch. */
const WATCHED_NAMESPACES = (process.env.JOB_WATCH_NAMESPACES || 'statex-apps')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Log lines captured with an alert. */
const EVIDENCE_TAIL_LINES = Number(process.env.JOB_EVIDENCE_TAIL_LINES || 40);

/**
 * Character budget for the Telegram-bound rendering of the log tail.
 *
 * This bounds ONLY `message`. The untruncated tail always goes to
 * `labels.evidenceLog` — see `handleOverdue`.
 */
const EVIDENCE_MESSAGE_BUDGET = Number(process.env.JOB_EVIDENCE_MESSAGE_BUDGET || 900);

/**
 * Lines that look like the reason a job failed, rather than the noise around it.
 *
 * Measured against the trigger incident. `catalog-contract-monitor` emits a JSON
 * report whose `failedContracts` block sits at roughly character 760 of a 3900
 * character tail, followed by ~3000 characters of `skippedContracts`
 * boilerplate. A last-N-characters window therefore captured only the
 * boilerplate and the live alert row carried no `401` at all: invariant I2
 * implemented in mechanism and defeated in practice.
 *
 * Flipping the window to the head fails the opposite class -- a stack trace puts
 * its cause on the last line. So neither end is the answer; the answer is to
 * find the error-shaped lines wherever they are, and to keep both ends besides.
 */
const ERROR_LINE_PATTERNS: RegExp[] = [
  // HTTP status codes in the 4xx/5xx range, as bare numbers or in prose.
  /\b(?:[45]\d{2})\b/,
  /\b(?:status(?:Code)?|http)\b\s*[":=]*\s*[45]\d{2}/i,
  // Conventional error vocabulary.
  /\b(?:error|err|fail(?:ed|ure)?|fatal|exception|panic|refused|denied|unauthori[sz]ed|forbidden|timeout|timed out|unreachable|cannot|could not|unable to)\b/i,
  // Stack frames and uncaught throws.
  /^\s*at\s+\S+/,
  /\b(?:Error|Exception):\s/,
  /\b(?:UnhandledPromiseRejection|uncaughtException)\b/i,
  // Non-zero exit codes. `exitCode: 0` is not a fault.
  /\bexit(?:\s|_|-)?code["':=\s]+[1-9]/i,
  /\bexited with (?:code )?[1-9]/i,
];

/**
 * Lines that match ERROR_LINE_PATTERNS but are known not to be causes.
 *
 * Without this the `catalog-contract-monitor` digest fills with
 * `skippedContracts` reasons -- every one contains "No product ID available",
 * which matches the `cannot`/`could not` family closely enough in spirit that
 * loosening the patterns would swamp the digest with them. Matching the actual
 * skip vocabulary is narrower and safer than weakening the error vocabulary.
 */
const NON_CAUSE_PATTERNS: RegExp[] = [
  /"reason"\s*:\s*"(?:No |Set )/i,
  /"status"\s*:\s*"(?:ok|pass|skip)/i,
  /\bexit(?:\s|_|-)?code["':=\s]+0\b/i,
  // Structured counters and timestamps. "failed": 1 says a thing failed and
  // nothing about what; the neighbouring "failedContracts" block says which.
  // Left in the digest they crowd out the block that carries the answer --
  // measured on the trigger artifact, where they consumed 8 of 11 kept lines.
  /^"?(?:passed|skipped|failed|total|count|duration(?:Ms)?|startedAt|endedAt|timestamp|generatedAt)"?\s*:\s*[\d"]/i,
];

/**
 * Alerts on Kubernetes CronJobs that have stopped succeeding.
 *
 * This closes the ecosystem's largest blind spot. Before it existed the only
 * recurring failure signal was HealthWatcher, which polls `/health` on
 * long-running services -- a CronJob has no `/health` and no long-running pod,
 * so nothing watched any of them. `catalog-contract-monitor` failed every 30
 * minutes for four days and produced zero alerts, and the alert store confirms
 * the gap was coverage rather than capability: it held five correct alerts from
 * other sources over the same window and not one job-related row, ever.
 *
 * There is no log-based route to this signal. The cluster runs no log collector
 * daemonset -- ingestion is opt-in HTTP from application code -- so a CronJob's
 * stdout never reaches logging-microservice and a failing job that dies before
 * its first HTTP call emits nothing at all. The Kubernetes API is the only
 * place the outcome exists.
 */
@Injectable()
export class JobWatcher {
  private readonly logger = new Logger(JobWatcher.name);

  constructor(
    private readonly kube: KubeClient,
    private readonly alerts: AlertsService,
    private readonly notifier: AlertNotifier,
    private readonly notifications: NotificationsClient,
    private readonly logging: LoggingService,
    private readonly heartbeat: HeartbeatService,
  ) {
    // Registered at construction, not on first success: a watcher that throws
    // on every poll must age into a WatcherSilent alert rather than never
    // being known to exist.
    this.heartbeat.register(JOB_WATCHER_NAME, JOB_WATCH_INTERVAL_MINUTES);
  }

  @Cron(JOB_WATCH_CRON)
  async scheduledCheck(): Promise<void> {
    if (process.env.JOB_WATCH_ENABLED === 'false') return;
    await this.runCheck();
  }

  async runCheck(now: Date = new Date()): Promise<void> {
    if (!this.kube.isAvailable()) {
      // Outside the cluster there are no projected credentials. Stay dormant
      // instead of failing every poll, but do not beat either -- a watcher that
      // cannot see anything is not healthy just because it exited cleanly.
      this.logger.debug('[JobWatcher] no in-pod service account — skipping');
      return;
    }

    try {
      for (const namespace of WATCHED_NAMESPACES) {
        await this.checkNamespace(namespace, now);
      }
      this.heartbeat.beat(JOB_WATCHER_NAME);
    } catch (err: any) {
      const detail = err?.message ?? String(err);
      this.logger.error(`[JobWatcher] sweep failed: ${detail}`);
      await this.logging.log('error', 'job_watch_sweep_failed', { error: detail });
      // Explicitly no beat. A sweep that threw did not verify anything, and
      // treating it as a completed cycle would let the watcher fail forever
      // while looking alive.
      this.heartbeat.fail(JOB_WATCHER_NAME, detail);
    }
  }

  private async checkNamespace(namespace: string, now: Date): Promise<void> {
    const cronJobs = await this.kube.listCronJobs(namespace);
    // Fetched once per namespace rather than per CronJob: evidence lookup needs
    // it only for the jobs that are actually overdue, and the API cost of one
    // list beats N.
    let jobs: JobSummary[] | null = null;

    for (const cj of cronJobs) {
      // One CronJob's failure must never abort the sweep — that would let a
      // single unreadable object hide every other broken job.
      try {
        if (cj.suspended) {
          // Suspended is a deliberate operator action, not a fault. Close any
          // alert left open from before it was suspended.
          await this.alerts.resolveByFingerprint(this.fingerprintFor(cj));
          continue;
        }

        const intervalMinutes = intervalMinutesOrFallback(cj.schedule);
        const overdueAfterMinutes = intervalMinutes * OVERDUE_INTERVAL_MULTIPLE;

        // A CronJob that has never succeeded is measured from its creation, so
        // a job that was broken from the day it shipped is caught. Without
        // this, "never worked" would be indistinguishable from "no data" and
        // would never alert.
        const referenceIso = cj.lastSuccessfulTime || cj.creationTimestamp;
        if (!referenceIso) continue;

        const reference = new Date(referenceIso);
        if (Number.isNaN(reference.getTime())) continue;

        const ageMinutes = (now.getTime() - reference.getTime()) / 60000;

        if (ageMinutes <= overdueAfterMinutes) {
          await this.alerts.resolveByFingerprint(this.fingerprintFor(cj));
          continue;
        }

        if (jobs === null) jobs = await this.kube.listJobs(namespace);
        await this.handleOverdue(cj, {
          ageMinutes,
          intervalMinutes,
          overdueAfterMinutes,
          neverSucceeded: !cj.lastSuccessfulTime,
          jobs,
        });
      } catch (err: any) {
        this.logger.error(
          `[JobWatcher] processing ${cj.namespace}/${cj.name} failed: ${err?.message ?? String(err)}`,
        );
        await this.logging.log('error', 'job_watch_cronjob_failed', {
          cronjob: cj.name,
          namespace: cj.namespace,
          error: err?.message ?? String(err),
        });
      }
    }
  }

  private fingerprintFor(cj: CronJobSummary): string {
    return buildFingerprint('cronjob', cj.namespace, cj.name);
  }

  /**
   * Capture what the failure looked like, at the moment it is detected.
   *
   * This cannot be deferred to whoever reads the alert. A Job object outlives
   * its own logs: pod-janitor deletes failed pods after 120 minutes, and
   * `kubectl logs job/...` on an older failure returns a timeout rather than
   * output. By the time a human or an agent opens an alert about a job that
   * broke overnight, the reason it broke is gone. So the log tail is read here
   * and stored on the alert row.
   */
  private async collectEvidence(
    cj: CronJobSummary,
    jobs: JobSummary[],
  ): Promise<{ jobName: string | null; podName: string | null; logTail: string | null }> {
    const owned = jobs
      .filter((j) => j.ownerUid && j.ownerUid === cj.uid)
      .sort((a, b) =>
        String(b.startTime || b.creationTimestamp || '').localeCompare(
          String(a.startTime || a.creationTimestamp || ''),
        ),
      );

    // Prefer the newest FAILED job — that is the one carrying the reason.
    const target = owned.find((j) => j.failed > 0) || owned[0];
    if (!target) return { jobName: null, podName: null, logTail: null };

    const pods = await this.kube.listPodNamesForJob(cj.namespace, target.name);
    const podName = pods[0] || null;
    const logTail = podName
      ? await this.kube.getPodLogTail(cj.namespace, podName, EVIDENCE_TAIL_LINES)
      : null;

    return { jobName: target.name, podName, logTail };
  }

  private async handleOverdue(
    cj: CronJobSummary,
    ctx: {
      ageMinutes: number;
      intervalMinutes: number;
      overdueAfterMinutes: number;
      neverSucceeded: boolean;
      jobs: JobSummary[];
    },
  ): Promise<void> {
    const evidence = await this.collectEvidence(cj, ctx.jobs);
    const missedRuns = Math.floor(ctx.ageMinutes / ctx.intervalMinutes);

    // Escalates with how long the job has been dead rather than firing critical
    // immediately. Three missed runs may still be an environment hiccup; a full
    // day without a success is a broken job nobody noticed, which is the exact
    // shape of the incident this watcher was built for.
    const severity = ctx.ageMinutes > 24 * 60 ? 'critical' : 'warning';

    const basis = ctx.neverSucceeded ? 'has never succeeded since creation' : 'last succeeded';
    const summary =
      `${cj.name} ${basis} ${this.humaniseMinutes(ctx.ageMinutes)} ago ` +
      `— roughly ${missedRuns} missed run(s) on schedule "${cj.schedule}" ` +
      `(alerts after ${this.humaniseMinutes(ctx.overdueAfterMinutes)})`;

    // Truncation applies HERE and only here. `message` is the Telegram-bound
    // rendering and is bounded by the 4096-character limit; `labels.evidenceLog`
    // below is the machine-readable copy and is never abbreviated.
    const reason = evidence.logTail
      ? `\nLast output (${evidence.podName}):\n` +
        this.renderEvidenceForMessage(evidence.logTail, EVIDENCE_MESSAGE_BUDGET)
      : '\nNo pod output available — the failed pod has already been reclaimed.';

    const { transition, alert, notify } = await this.alerts.fire({
      alertname: 'CronJobNotSucceeding',
      service: cj.name,
      severity,
      message: summary + reason,
      fingerprint: this.fingerprintFor(cj),
      labels: JSON.stringify({
        kind: 'cronjob',
        namespace: cj.namespace,
        cronjob: cj.name,
        schedule: cj.schedule,
        lastSuccessfulTime: cj.lastSuccessfulTime,
        lastScheduleTime: cj.lastScheduleTime,
        missedRuns,
        intervalMinutes: ctx.intervalMinutes,
        evidenceJob: evidence.jobName,
        evidencePod: evidence.podName,
        // CONTRACT — read by the repair loop, not by a human.
        //
        // `evidenceLog` is the complete, unabbreviated pod log tail exactly as
        // Kubernetes returned it: JOB_EVIDENCE_TAIL_LINES lines, no digest, no
        // elision, no "(truncated)" marker. `message` above is a lossy
        // rendering of this same text for Telegram's 4096-character limit.
        //
        // Anything diagnosing a failure must read THIS field. Parsing the
        // message instead would reintroduce GAP-3 at the consumer, because the
        // message is abbreviated by construction and its digest is a heuristic.
        //
        // Null only when the pod was already reclaimed before capture, which is
        // a real state and not an error — see `collectEvidence`.
        evidenceLog: evidence.logTail,
        // Explicit so a consumer can distinguish "not abbreviated" from "we
        // forgot to say". If this is ever false, evidenceLog is not the tail.
        evidenceLogTruncated: false,
        evidenceLogLines: EVIDENCE_TAIL_LINES,
        capturedAt: new Date().toISOString(),
      }),
    });

    await this.logging.log('error', 'cronjob_not_succeeding', {
      cronjob: cj.name,
      namespace: cj.namespace,
      missedRuns,
      ageMinutes: Math.round(ctx.ageMinutes),
      severity,
    });

    // The sweep runs every 15 minutes for as long as the job stays broken.
    // Sending each time is what produced 288 messages for a single outage
    // before the backoff existed; fire() decides when a re-statement is due.
    if (!notify) return;

    const active = await this.alerts.findActive();
    const message =
      transition === 'repeat'
        ? this.notifier.formatRepeat(alert, active)
        : this.notifier.formatFired(alert, active);

    await this.notifications.sendTelegram(message);
  }

  private humaniseMinutes(minutes: number): string {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    if (minutes < 24 * 60) return `${(minutes / 60).toFixed(1)}h`;
    return `${(minutes / (24 * 60)).toFixed(1)}d`;
  }

  /**
   * True when a line looks like the reason a job failed.
   *
   * Exported behaviour is tested directly against the real pod artifact; see
   * `job-watcher.spec.ts`.
   */
  private isCauseLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (NON_CAUSE_PATTERNS.some((re) => re.test(trimmed))) return false;
    return ERROR_LINE_PATTERNS.some((re) => re.test(trimmed));
  }

  /**
   * Render a log tail for Telegram without losing the cause.
   *
   * Three parts, in this order:
   *
   *   1. a digest of the error-shaped lines, wherever in the tail they occur;
   *   2. the head of the tail;
   *   3. the end of the tail, after a marked elision.
   *
   * Parts 2 and 3 are what a stack trace needs -- its cause is the last line,
   * and its frames are what make it readable. Part 1 is what a structured
   * report needs, where the cause is buried mid-document behind boilerplate
   * longer than the whole budget. Both classes are covered by one rendering
   * rather than by a choice between two windows.
   *
   * The digest carries line numbers so a reader can locate each line in the
   * untruncated `labels.evidenceLog`, which is never abbreviated.
   */
  private renderEvidenceForMessage(text: string, max: number): string {
    if (text.length <= max) return text;

    const lines = text.split('\n');

    // A cause is often a block, not a line. In the trigger artifact the status
    // code and the call it belongs to are on adjacent lines of one JSON object:
    //
    //     "contract": "product-search",
    //     "statusCode": 401,
    //
    // Matching line-at-a-time keeps the 401 and drops what got the 401, which
    // is the actionable half. So each match pulls in its immediate neighbours.
    const CONTEXT_LINES = 1;
    const keepIndex = new Set<number>();
    for (let i = 0; i < lines.length; i++) {
      if (!this.isCauseLine(lines[i])) continue;
      for (let j = i - CONTEXT_LINES; j <= i + CONTEXT_LINES; j++) {
        if (j >= 0 && j < lines.length && lines[j].trim()) keepIndex.add(j);
      }
    }

    const causeLines = [...keepIndex]
      .sort((a, b) => a - b)
      .map((i) => `${i + 1}: ${lines[i].trim()}`);

    // Half the budget for the digest. It is the part most likely to hold the
    // answer, but it is a heuristic, so the raw head and tail keep the other
    // half -- a pathological run of matches must not crowd out the real text.
    const digestBudget = Math.floor(max / 2);
    let digest = '';
    if (causeLines.length) {
      const kept: string[] = [];
      let used = 0;
      for (const line of causeLines) {
        if (used + line.length + 1 > digestBudget) break;
        kept.push(line);
        used += line.length + 1;
      }
      const omitted = causeLines.length - kept.length;
      if (kept.length) {
        digest =
          `Likely cause (${kept.length}${omitted > 0 ? ` of ${causeLines.length}` : ''} error-shaped line(s)):\n` +
          `${kept.join('\n')}\n\n`;
      }
    }

    const remaining = max - digest.length;
    if (remaining <= 0) return `${digest.trimEnd()}\n…(full evidence on the alert row)`;

    const elision = '\n…(elided)…\n';
    // Both ends kept: neither end alone is reliably where the cause is.
    const headBudget = Math.max(0, Math.floor((remaining - elision.length) / 2));
    const tailBudget = Math.max(0, remaining - elision.length - headBudget);

    const body =
      headBudget + tailBudget >= text.length
        ? text
        : `${text.slice(0, headBudget)}${elision}${text.slice(text.length - tailBudget)}`;

    return `${digest}${body}\n…(truncated — full evidence on the alert row)`;
  }
}

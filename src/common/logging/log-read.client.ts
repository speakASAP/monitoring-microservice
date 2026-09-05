import { Injectable, Logger } from '@nestjs/common';

export interface ErrorGroup {
  service: string;
  level: string;
  signature: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  sampleMessage: string;
}

export interface ErrorSummary {
  generatedAt: string;
  indexedSince: string;
  windowMinutes: number;
  totalEvents: number;
  groups: ErrorGroup[];
  truncated: boolean;
}

/**
 * Read-side client for logging-microservice.
 *
 * Deliberately talks to /api/logs/error-summary and never to /api/logs/query.
 * The query endpoint reads 4 GB across 330 files with readFileSync on every
 * call, blocking the event loop for ~37 seconds; polling it on a schedule
 * drives logging-microservice into liveness-probe failure and a SIGKILL
 * restart, which stops ingestion for the whole ecosystem. That was observed
 * while building this, not guessed. The summary endpoint answers from an
 * in-memory index in single-digit milliseconds.
 *
 * Uses LOGGING_READ_SERVICE_TOKEN, the existing read-only service principal.
 * No new credential is minted on purpose: the incident that started this work
 * was a caller whose credential had quietly stopped matching, and a token that
 * must be rotated to keep alerting alive is a scheduled outage.
 */
export interface CoverageEntry {
  service: string;
  last_seen: string;
  age_hours: number;
}

export interface CoverageReport {
  healthy: boolean;
  stale_after_hours: number;
  shipping: CoverageEntry[];
  stale: CoverageEntry[];
  idle: CoverageEntry[];
  ignored: string[];
  missing: string[];
}

@Injectable()
export class LogReadClient {
  private readonly logger = new Logger(LogReadClient.name);
  private readonly url =
    process.env.LOGGING_SERVICE_URL || 'http://logging-microservice:3367';
  private readonly token = process.env.LOGGING_READ_SERVICE_TOKEN;
  private readonly timeoutMs = Number(process.env.LOG_READ_TIMEOUT_MS || 8000);

  hasCredential(): boolean {
    return !!this.token;
  }

  /**
   * Returns null on any failure rather than throwing or returning an empty
   * summary. An empty summary means "nothing is failing", and a caller that
   * cannot tell that apart from "I could not ask" will report healthy during an
   * outage — the precise bug this whole effort exists to remove.
   */
  async fetchErrorSummary(windowMinutes: number): Promise<ErrorSummary | null> {
    if (!this.token) {
      this.logger.warn('[LogReadClient] no LOGGING_READ_SERVICE_TOKEN — cannot read error signal');
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(
        `${this.url}/api/logs/error-summary?windowMinutes=${encodeURIComponent(String(windowMinutes))}`,
        {
          headers: { Authorization: `Bearer ${this.token}` },
          signal: controller.signal,
        },
      );
      if (!res.ok) {
        this.logger.error(`[LogReadClient] error-summary returned ${res.status}`);
        return null;
      }
      const body = (await res.json()) as { success?: boolean; data?: ErrorSummary };
      if (!body?.data || !Array.isArray(body.data.groups)) return null;
      return body.data;
    } catch (err: any) {
      this.logger.error(`[LogReadClient] error-summary failed: ${err?.message ?? String(err)}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Which services are still shipping logs, and which have gone quiet.
   *
   * Cheap: this reads file modification times, not file contents — measured at
   * 7ms against the 37 seconds a content query costs. Safe to poll.
   *
   * Returns 503 when the pipeline is degraded, which is the normal case while
   * anything is stale, so the body is read on both 200 and 503. Treating 503 as
   * a failure here would discard exactly the report worth having.
   */
  async fetchCoverage(): Promise<CoverageReport | null> {
    if (!this.token) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.url}/api/logs/coverage`, {
        headers: { Authorization: `Bearer ${this.token}` },
        signal: controller.signal,
      });
      if (res.status !== 200 && res.status !== 503) {
        this.logger.error(`[LogReadClient] coverage returned ${res.status}`);
        return null;
      }
      const body = (await res.json()) as { data?: CoverageReport };
      if (!body?.data || !Array.isArray(body.data.stale)) return null;
      return body.data;
    } catch (err: any) {
      this.logger.error(`[LogReadClient] coverage failed: ${err?.message ?? String(err)}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

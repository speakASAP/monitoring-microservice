import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as https from 'https';

/**
 * Minimal read-only Kubernetes API client.
 *
 * Deliberately not `@kubernetes/client-node`. This lane needs four GETs
 * (cronjobs, jobs, pods, pod logs); the official client brings a large
 * dependency tree, its own auth loading and a release cadence that has broken
 * builds in this ecosystem before. Node's `https` plus the in-pod service
 * account credentials is the whole requirement.
 *
 * The credentials are the ones Kubernetes projects into every pod. They are
 * scoped by the ClusterRole in `k8s/rbac.yaml`, which grants get/list/watch and
 * no write verb anywhere -- so a bug in this file cannot mutate the cluster.
 */

const SA_DIR = '/var/run/secrets/kubernetes.io/serviceaccount';

export interface CronJobSummary {
  name: string;
  namespace: string;
  schedule: string;
  suspended: boolean;
  lastScheduleTime: string | null;
  lastSuccessfulTime: string | null;
  creationTimestamp: string | null;
  uid: string;
}

export interface DeploymentRollout {
  name: string;
  ready: boolean;
  detail: string;
}

export interface JobSummary {
  name: string;
  namespace: string;
  ownerUid: string | null;
  succeeded: number;
  failed: number;
  startTime: string | null;
  completionTime: string | null;
  creationTimestamp: string | null;
  labelSelectorJobName: string;
}

@Injectable()
export class KubeClient {
  private readonly logger = new Logger(KubeClient.name);
  private readonly host = process.env.KUBERNETES_SERVICE_HOST || 'kubernetes.default.svc';
  private readonly port = process.env.KUBERNETES_SERVICE_PORT || '443';

  private caCache: Buffer | null = null;

  /**
   * True when this process is running inside a pod with a projected service
   * account. Callers use it to stay dormant outside the cluster instead of
   * logging an error every poll on a developer machine.
   */
  isAvailable(): boolean {
    try {
      return fs.existsSync(`${SA_DIR}/token`) && fs.existsSync(`${SA_DIR}/ca.crt`);
    } catch {
      return false;
    }
  }

  /**
   * Read the token on every call rather than caching it.
   *
   * Projected service account tokens are short-lived and rotated in place by
   * the kubelet. A token cached at boot starts returning 401 partway through
   * the pod's life -- which for a watcher means it goes blind and, without the
   * heartbeat, goes blind silently.
   */
  private readToken(): string {
    return fs.readFileSync(`${SA_DIR}/token`, 'utf8').trim();
  }

  private readCa(): Buffer {
    if (!this.caCache) this.caCache = fs.readFileSync(`${SA_DIR}/ca.crt`);
    return this.caCache;
  }

  private request(path: string, timeoutMs = 10000): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          host: this.host,
          port: this.port,
          path,
          method: 'GET',
          ca: this.readCa(),
          headers: {
            Authorization: `Bearer ${this.readToken()}`,
            Accept: 'application/json',
          },
          timeout: timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () =>
            resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }),
          );
        },
      );

      req.on('timeout', () => {
        req.destroy(new Error(`kube api timeout after ${timeoutMs}ms: ${path}`));
      });
      req.on('error', reject);
      req.end();
    });
  }

  private async getJson<T>(path: string): Promise<T> {
    const { status, body } = await this.request(path);
    if (status < 200 || status >= 300) {
      throw new Error(`kube api ${status} for ${path}: ${body.slice(0, 300)}`);
    }
    return JSON.parse(body) as T;
  }

  async listCronJobs(namespace: string): Promise<CronJobSummary[]> {
    const data = await this.getJson<any>(`/apis/batch/v1/namespaces/${namespace}/cronjobs`);
    return (data.items || []).map((item: any) => ({
      name: item.metadata?.name,
      namespace: item.metadata?.namespace || namespace,
      schedule: item.spec?.schedule || '',
      suspended: item.spec?.suspend === true,
      lastScheduleTime: item.status?.lastScheduleTime || null,
      lastSuccessfulTime: item.status?.lastSuccessfulTime || null,
      creationTimestamp: item.metadata?.creationTimestamp || null,
      uid: item.metadata?.uid || '',
    }));
  }

  async listJobs(namespace: string): Promise<JobSummary[]> {
    const data = await this.getJson<any>(`/apis/batch/v1/namespaces/${namespace}/jobs`);
    return (data.items || []).map((item: any) => ({
      name: item.metadata?.name,
      namespace: item.metadata?.namespace || namespace,
      ownerUid: item.metadata?.ownerReferences?.[0]?.uid || null,
      succeeded: item.status?.succeeded || 0,
      failed: item.status?.failed || 0,
      startTime: item.status?.startTime || null,
      completionTime: item.status?.completionTime || null,
      creationTimestamp: item.metadata?.creationTimestamp || null,
      labelSelectorJobName: item.metadata?.name,
    }));
  }

  /** Pod names belonging to a Job, newest first. */
  /**
   * Rollout state of a Deployment: V1 of the repair verifier, which must
   * distinguish "the fix is running" from "the fix was committed". Read-only,
   * consistent with the read-only grant agreed in D1 -- this client never
   * mutates cluster state.
   *
   * Returns null when the state cannot be read, so the caller can fail closed
   * rather than treat an unreadable deployment as a successful one.
   */
  async getDeploymentRollout(namespace: string, name: string): Promise<DeploymentRollout | null> {
    try {
      const dep = await this.getJson<any>(
        `/apis/apps/v1/namespaces/${namespace}/deployments/${name}`,
      );
      const spec = dep?.spec?.replicas ?? 0;
      const status = dep?.status ?? {};
      const updated = status.updatedReplicas ?? 0;
      const ready = status.readyReplicas ?? 0;
      const available = status.availableReplicas ?? 0;
      const generationMatched =
        (status.observedGeneration ?? -1) >= (dep?.metadata?.generation ?? 0);
      const rolledOut =
        generationMatched && updated >= spec && ready >= spec && available >= spec && spec > 0;
      return {
        name,
        ready: rolledOut,
        detail: `${ready}/${spec} ready, ${updated} updated, generation ${generationMatched ? 'current' : 'stale'}`,
      };
    } catch (err) {
      this.logger.warn(
        `[KubeClient] deployment rollout unreadable for ${namespace}/${name}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  async listPodNamesForJob(namespace: string, jobName: string): Promise<string[]> {
    const selector = encodeURIComponent(`job-name=${jobName}`);
    const data = await this.getJson<any>(
      `/api/v1/namespaces/${namespace}/pods?labelSelector=${selector}`,
    );
    return (data.items || [])
      .sort((a: any, b: any) =>
        String(b.metadata?.creationTimestamp || '').localeCompare(
          String(a.metadata?.creationTimestamp || ''),
        ),
      )
      .map((p: any) => p.metadata?.name)
      .filter(Boolean);
  }

  /**
   * Tail of a pod's log, or null if it is already gone.
   *
   * Returning null rather than throwing is the point: pod-janitor deletes
   * failed pods after 120 minutes, so "the evidence has expired" is a normal,
   * expected outcome and must not abort the alert that carries it. An alert
   * with no log is still worth far more than no alert.
   */
  async getPodLogTail(
    namespace: string,
    podName: string,
    tailLines = 40,
  ): Promise<string | null> {
    try {
      const { status, body } = await this.request(
        `/api/v1/namespaces/${namespace}/pods/${podName}/log?tailLines=${tailLines}`,
      );
      if (status < 200 || status >= 300) return null;
      return body.trim() || null;
    } catch (err) {
      this.logger.debug(`pod log unavailable for ${namespace}/${podName}: ${String(err)}`);
      return null;
    }
  }
}

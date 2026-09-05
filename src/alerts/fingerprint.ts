import { createHash } from 'crypto';

/**
 * The alerts table stores `fingerprint` as varchar(64), and the partial unique
 * index that keeps one active row per problem is built on it. A fingerprint
 * that overflows 64 characters does not degrade gracefully -- the INSERT
 * throws, inside the per-item try/catch of a watcher, so the surface would be
 * silently unalerted. That is precisely the failure this lane exists to remove,
 * so length is enforced here rather than hoped for at each call site.
 *
 * Kubernetes object names reach 52 characters and are prefixed with a namespace
 * and a kind, which is already over the limit for real objects in this cluster
 * (`marketing-order-affinity-central-orders-backfill` is 48).
 */
const MAX_FINGERPRINT_LENGTH = 64;

/**
 * Build a stable, collision-resistant fingerprint that always fits the column.
 *
 * Short inputs stay human-readable, which matters when reading the alerts table
 * by hand. Long ones keep as much of the readable prefix as possible and end in
 * a hash of the FULL identity, so two long names sharing a prefix still get
 * distinct rows.
 */
export function buildFingerprint(kind: string, ...parts: string[]): string {
  const identity = parts.filter(Boolean).join('/');
  const plain = `${kind}:${identity}`;
  if (plain.length <= MAX_FINGERPRINT_LENGTH) return plain;

  const digest = createHash('sha1').update(plain).digest('hex').slice(0, 12);
  const room = MAX_FINGERPRINT_LENGTH - kind.length - 1 - 1 - digest.length;
  return `${kind}:${identity.slice(0, room)}~${digest}`;
}

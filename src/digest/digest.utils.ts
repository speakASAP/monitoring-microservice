import { SnapshotServiceEntry } from './service-health-snapshot.entity';

/**
 * Escape values interpolated into the digest's HTML.
 *
 * The digest is sent with parse_mode=HTML for its <b> tags, and service names
 * and error strings come from the monitored services themselves. An error
 * containing '<' used to make Telegram reject the entire digest with
 * 400 "can't parse entities", so the whole message was lost -- this happened on
 * 2026-08-18. notifications-microservice now retries such a message as plain
 * text so it can no longer vanish, but the digest would arrive with its markup
 * visible as literal tags. Escaping the untrusted values keeps the formatting
 * intact.
 *
 * '&' must be replaced first, or the '&' of an entity emitted by a later
 * replacement would itself be escaped.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface DigestDiff {
  newlyFailing: SnapshotServiceEntry[];
  recovered: SnapshotServiceEntry[];
  stillFailing: SnapshotServiceEntry[];
}

function sortByName(a: SnapshotServiceEntry, b: SnapshotServiceEntry): number {
  return a.name.localeCompare(b.name);
}

export function computeDiff(
  today: SnapshotServiceEntry[],
  yesterday: SnapshotServiceEntry[] | null,
): DigestDiff | null {
  if (!yesterday || yesterday.length === 0) return null;

  const yesterdayMap = new Map(yesterday.map((s) => [s.name, s]));

  const newlyFailing: SnapshotServiceEntry[] = [];
  const recovered: SnapshotServiceEntry[] = [];
  const stillFailing: SnapshotServiceEntry[] = [];

  for (const svc of [...today].sort(sortByName)) {
    const prev = yesterdayMap.get(svc.name);
    if (!prev) continue;
    if (!svc.healthy && prev.healthy) newlyFailing.push(svc);
    else if (svc.healthy && !prev.healthy) recovered.push(svc);
    else if (!svc.healthy && !prev.healthy) stillFailing.push(svc);
  }

  return {
    newlyFailing: newlyFailing.sort(sortByName),
    recovered: recovered.sort(sortByName),
    stillFailing: stillFailing.sort(sortByName),
  };
}

export function formatDigestMessage(
  today: SnapshotServiceEntry[],
  diff: DigestDiff | null,
  dateKey: string,
): string {
  const healthy = today.filter((s) => s.healthy).length;
  const failing = today.filter((s) => !s.healthy).length;
  const total = today.length;

  const lines: string[] = [
    `🖥 <b>Monitoring Daily Digest</b> — ${dateKey}`,
    '',
    `📊 Summary: ${healthy} healthy / ${failing} failing / ${total} total`,
    '',
    '━━━━━━━━━━━━━━━━━━━━',
  ];

  if (!diff) {
    lines.push('ℹ️ <b>First run — no previous snapshot to compare</b>');
  } else {
    const hasChanges = diff.newlyFailing.length > 0 || diff.recovered.length > 0;
    if (!hasChanges) {
      lines.push('✅ No changes since yesterday');
    } else {
      lines.push('<b>⚠️ CHANGES SINCE YESTERDAY</b>');
      if (diff.newlyFailing.length > 0) {
        lines.push(`<b>⬇️ Newly failing (${diff.newlyFailing.length}):</b>`);
        for (const s of diff.newlyFailing) {
          lines.push(
            `<b>• ${escapeHtml(s.name)}${s.error ? ` — ${escapeHtml(s.error)}` : ''}</b>`,
          );
        }
      }
      if (diff.recovered.length > 0) {
        lines.push(`<b>✅ Recovered (${diff.recovered.length}):</b>`);
        for (const s of diff.recovered) {
          lines.push(`<b>• ${escapeHtml(s.name)}</b>`);
        }
      }
    }
  }

  const currentlyFailing = today.filter((s) => !s.healthy);
  if (currentlyFailing.length > 0) {
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(`🔴 Still failing (${currentlyFailing.length}):`);
    for (const s of currentlyFailing) {
      lines.push(`• ${escapeHtml(s.name)}${s.error ? ` — ${escapeHtml(s.error)}` : ''}`);
    }
  } else {
    lines.push('');
    lines.push('✅ All services healthy');
  }

  return lines.join('\n');
}

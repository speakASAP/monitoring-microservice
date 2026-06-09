import { SnapshotServiceEntry } from './service-health-snapshot.entity';

export interface DigestDiff {
  newlyFailing: SnapshotServiceEntry[];
  recovered: SnapshotServiceEntry[];
  stillFailing: SnapshotServiceEntry[];
}

export function computeDiff(
  today: SnapshotServiceEntry[],
  yesterday: SnapshotServiceEntry[] | null,
): DigestDiff | null {
  if (!yesterday) return null;

  const yesterdayMap = new Map(yesterday.map((s) => [s.name, s]));

  const newlyFailing: SnapshotServiceEntry[] = [];
  const recovered: SnapshotServiceEntry[] = [];
  const stillFailing: SnapshotServiceEntry[] = [];

  for (const svc of today) {
    const prev = yesterdayMap.get(svc.name);
    if (!prev) continue;
    if (!svc.healthy && prev.healthy) newlyFailing.push(svc);
    else if (svc.healthy && !prev.healthy) recovered.push(svc);
    else if (!svc.healthy && !prev.healthy) stillFailing.push(svc);
  }

  return { newlyFailing, recovered, stillFailing };
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
          lines.push(`<b>• ${s.name}${s.error ? ` — ${s.error}` : ''}</b>`);
        }
      }
      if (diff.recovered.length > 0) {
        lines.push(`<b>✅ Recovered (${diff.recovered.length}):</b>`);
        for (const s of diff.recovered) {
          lines.push(`<b>• ${s.name}</b>`);
        }
      }
    }
  }

  const currentlyFailing = today.filter((s) => !s.healthy);
  if (currentlyFailing.length > 0) {
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(`🔴 Still failing (${currentlyFailing.length}):`);
    for (const s of currentlyFailing) {
      lines.push(`• ${s.name}${s.error ? ` — ${s.error}` : ''}`);
    }
  } else {
    lines.push('');
    lines.push('✅ All services healthy');
  }

  return lines.join('\n');
}

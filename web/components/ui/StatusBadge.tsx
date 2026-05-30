export function StatusBadge({ healthy, size = 'sm' }: { healthy: boolean; size?: 'sm' | 'lg' }) {
  const pad = size === 'lg' ? '0.4rem 1rem' : '0.2rem 0.6rem';
  const fs = size === 'lg' ? '0.9rem' : '0.75rem';
  return (
    <span style={{
      background: healthy ? '#052e16' : '#450a0a',
      color: healthy ? '#86efac' : '#fca5a5',
      border: `1px solid ${healthy ? '#166534' : '#991b1b'}`,
      borderRadius: '9999px',
      padding: pad,
      fontSize: fs,
      fontWeight: 600,
    }}>
      {healthy ? '● Healthy' : '● Down'}
    </span>
  );
}

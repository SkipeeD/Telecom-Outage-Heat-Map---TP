import type { AlarmSeverity } from '@/types'
import { severityPalette } from '@/lib/antenna-helpers'

interface Props {
  severity: AlarmSeverity
  className?: string
}

export function SeverityBadge({ severity, className }: Props) {
  const p = severityPalette[severity]
  return (
    <span
      className={className}
      style={{
        background: p.bg,
        border: `1px solid ${p.border}`,
        color: p.text,
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: '0.06em',
        padding: '2px 8px',
        borderRadius: 'var(--radius-full)',
        textTransform: 'uppercase',
        display: 'inline-block',
        lineHeight: 1.4,
      }}
    >
      {severity}
    </span>
  )
}

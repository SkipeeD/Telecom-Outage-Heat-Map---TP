import type { AlarmSeverity, Cell, Technology } from '@/types'

/** Canonical ordered list of all supported technologies — used for iteration. */
export const TECHS: Technology[] = ['2G', '3G', '4G', '5G', '6G']

/** Severity levels ordered from worst to best, used for "first match wins" lookups. */
const SEV_ORDER: AlarmSeverity[] = ['critical', 'major', 'minor', 'warning', 'ok']

/** Maps each technology to its CSS custom property name for consistent theming. */
export const techColorVar: Record<Technology, string> = {
  '2G':  '--tech-2g',
  '3G':  '--tech-3g',
  '4G':  '--tech-4g',
  '5G':  '--tech-5g',
  '6G': '--tech-6g',
}

/** Maps each alarm severity to its CSS custom property name for consistent theming. */
export const sevColorVar: Record<AlarmSeverity, string> = {
  critical: '--alarm-critical',
  major:    '--alarm-major',
  minor:    '--alarm-minor',
  warning:  '--alarm-warning',
  ok:       '--alarm-ok',
}

/**
 * Semi-transparent RGBA colour tokens for severity badges and highlighted rows.
 * Using RGBA instead of CSS variables keeps these usable in inline styles
 * where var() references can't be resolved (e.g. Leaflet popups).
 */
export const severityPalette: Record<
  AlarmSeverity,
  { bg: string; border: string; text: string }
> = {
  critical: { bg: 'rgba(240,79,79,0.12)',  border: 'rgba(240,79,79,0.3)',  text: 'var(--alarm-critical)' },
  major:    { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', text: 'var(--alarm-major)' },
  minor:    { bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)', text: 'var(--alarm-minor)' },
  warning:  { bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.3)', text: 'var(--alarm-warning)' },
  ok:       { bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.3)', text: 'var(--alarm-ok)' },
}

/**
 * Returns the worst severity across all cells on an antenna.
 * Iterates SEV_ORDER so the first match is always the most critical.
 */
export function overallSeverity(cells: Cell[]): AlarmSeverity {
  for (const s of SEV_ORDER) if (cells.some(c => c.status === s)) return s
  return 'ok'
}

/**
 * Returns the cell with the most severe active alarm — used to pick the alarm
 * to display in the antenna popup. Only considers cells that have a currentAlarm
 * so cells in a bad status without a concrete alarm are ignored.
 */
export function worstAlarmCell(cells: Cell[]): Cell | null {
  for (const s of SEV_ORDER) {
    const c = cells.find(c => c.status === s && c.currentAlarm)
    if (c) return c
  }
  return null
}

/**
 * Converts an ISO timestamp to a human-readable relative string
 * (e.g. "3m ago", "2h ago", "1d ago"). Used in alarm and activity feeds.
 */
export function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 60000 // diff in minutes
  if (diff < 1) return 'just now'
  if (diff < 60) return `${Math.floor(diff)}m ago`
  const h = Math.floor(diff / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/**
 * Formats a millisecond duration into a compact human label.
 * Examples: 90000 → "1m", 7200000 → "2h 0m", 90000000 → "1d 1h".
 */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

/**
 * Returns a short status string shown in the antenna popup header,
 * including a count of degraded cells for actionable severities.
 */
export function statusCopy(sev: AlarmSeverity, cells: Cell[]): string {
  const down = cells.filter(c => c.status === 'critical' || c.status === 'major').length
  switch (sev) {
    case 'ok':       return 'All cells nominal'
    case 'critical': return `${down} cell${down > 1 ? 's' : ''} critical — service impact`
    case 'major':    return `${down} cell${down > 1 ? 's' : ''} in major alarm state`
    case 'minor':    return 'Minor degradation detected'
    case 'warning':  return 'Warning active — monitor'
    default:         return 'Status unknown'
  }
}

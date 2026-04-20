import type { AlarmSeverity, Cell, Technology } from '@/types'

export const TECHS: Technology[] = ['2G', '3G', '4G', '5G', 'B2B']

const SEV_ORDER: AlarmSeverity[] = ['critical', 'major', 'minor', 'warning', 'ok']

export const techColorVar: Record<Technology, string> = {
  '2G':  '--tech-2g',
  '3G':  '--tech-3g',
  '4G':  '--tech-4g',
  '5G':  '--tech-5g',
  'B2B': '--tech-b2b',
}

export const sevColorVar: Record<AlarmSeverity, string> = {
  critical: '--alarm-critical',
  major:    '--alarm-major',
  minor:    '--alarm-minor',
  warning:  '--alarm-warning',
  ok:       '--alarm-ok',
}

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

export function overallSeverity(cells: Cell[]): AlarmSeverity {
  for (const s of SEV_ORDER) if (cells.some(c => c.status === s)) return s
  return 'ok'
}

export function worstAlarmCell(cells: Cell[]): Cell | null {
  for (const s of SEV_ORDER) {
    const c = cells.find(c => c.status === s && c.currentAlarm)
    if (c) return c
  }
  return null
}

export function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 60000
  if (diff < 1) return 'just now'
  if (diff < 60) return `${Math.floor(diff)}m ago`
  const h = Math.floor(diff / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

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

import type { Alarm } from '@/types'
import { relTime, sevColorVar } from '@/lib/antenna-helpers'
import { SeverityBadge } from './SeverityBadge'

export function AlarmCard({ alarm }: { alarm: Alarm }) {
  const sevColor = `var(${sevColorVar[alarm.severity]})`
  return (
    <div
      className="rounded-[var(--radius-md)] border p-3 bg-[var(--glass-bg)] border-[var(--glass-border)]"
      style={{ borderLeft: `2px solid ${sevColor}` }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <SeverityBadge severity={alarm.severity} />
      </div>
      <div className="text-[13px] leading-[1.5] text-[var(--text-primary)]">
        {alarm.text}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[11px] text-[var(--text-muted)]">
        <span>{relTime(alarm.alarmTime)}</span>
        <span>{new Date(alarm.alarmTime).toISOString().slice(11, 19)} UTC</span>
      </div>
    </div>
  )
}

export function EmptyAlarm({ text }: { text: string }) {
  return (
    <div className="p-3.5 text-center text-[12px] text-[var(--text-secondary)] bg-[var(--glass-bg)] border border-dashed border-[var(--glass-border)] rounded-[var(--radius-md)]">
      {text}
    </div>
  )
}

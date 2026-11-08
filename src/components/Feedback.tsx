import type { ReactNode } from 'react'
import { Icon } from './Icons'

export function Alert({
  tone = 'danger',
  children,
}: {
  tone?: 'danger' | 'warn' | 'ok' | 'info'
  children: ReactNode
}) {
  const icon =
    tone === 'danger' || tone === 'warn'
      ? 'alert'
      : tone === 'ok'
        ? 'check'
        : 'info'
  return (
    <div className={tone === 'info' ? 'alert' : `alert is-${tone}`} role="status">
      <Icon name={icon} />
      <div className="grow">{children}</div>
    </div>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="note">
      <Icon name="info" />
      <div className="grow">{children}</div>
    </div>
  )
}

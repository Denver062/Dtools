import type { ReactNode } from 'react'

export function PageHeader({
  title,
  desc,
}: {
  title: ReactNode
  desc?: ReactNode
}) {
  return (
    <header className="page-head">
      <h1 className="page-title">{title}</h1>
      {desc ? <p className="page-desc">{desc}</p> : null}
    </header>
  )
}

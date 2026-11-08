import { useState, type DragEvent, type ReactNode } from 'react'
import { Icon, type IconName } from './Icons'
import { formatBytes } from '../lib/format'

export interface FileListItem {
  id: string
  name: string
  sub?: string
  size?: number
  meta?: ReactNode
  icon?: IconName
  tone?: 'accent'
}

export function FileList({
  items,
  onRemove,
  onReorder,
  onClear,
  emptyText = '아직 파일이 없습니다.',
  footer,
}: {
  items: FileListItem[]
  onRemove?: (id: string) => void
  onReorder?: (from: number, to: number) => void
  onClear?: () => void
  emptyText?: string
  footer?: ReactNode
}) {
  const [dragging, setDragging] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  if (!items.length) {
    return (
      <div className="empty">
        <Icon name="file" />
        <span>{emptyText}</span>
      </div>
    )
  }

  const total = items.reduce((sum, item) => sum + (item.size ?? 0), 0)
  const sortable = Boolean(onReorder)

  const handleDrop = (event: DragEvent<HTMLDivElement>, target: number) => {
    if (dragging === null || !onReorder) return
    event.preventDefault()
    onReorder(dragging, target)
    setDragging(null)
    setOver(null)
  }

  return (
    <>
      <div className="file-list">
        {items.map((item, index) => (
          <div
            key={item.id}
            className={`file-row${sortable ? '' : ' no-handle'}${
              dragging === index ? ' is-dragging' : ''
            }${over === index ? ' is-drop-target' : ''}`}
            onDragOver={(event) => {
              if (dragging === null) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setOver(index)
            }}
            onDragLeave={() => {
              if (over === index) setOver(null)
            }}
            onDrop={(event) => handleDrop(event, index)}
          >
            {sortable ? (
              <button
                type="button"
                className="drag-handle"
                draggable
                aria-label={`${item.name} 순서 변경 (위/아래 방향키)`}
                title="끌어서 순서 변경"
                onDragStart={(event) => {
                  setDragging(index)
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', String(index))
                }}
                onDragEnd={() => {
                  setDragging(null)
                  setOver(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowUp' && index > 0) {
                    event.preventDefault()
                    onReorder?.(index, index - 1)
                  } else if (
                    event.key === 'ArrowDown' &&
                    index < items.length - 1
                  ) {
                    event.preventDefault()
                    onReorder?.(index, index + 1)
                  }
                }}
              >
                <Icon name="grip" />
              </button>
            ) : null}

            <span
              className={`file-badge${item.tone === 'accent' ? ' tone-accent' : ''}`}
            >
              <Icon name={item.icon ?? 'file'} />
            </span>

            <div className="file-main">
              <div className="file-name" title={item.name}>
                {item.name}
              </div>
              {item.sub ? (
                <div className="file-sub" title={item.sub}>
                  {item.sub}
                </div>
              ) : null}
            </div>

            {item.size !== undefined ? (
              <span className="file-size">{formatBytes(item.size)}</span>
            ) : (
              <span />
            )}

            <div className="file-meta">
              {item.meta}
              {onRemove ? (
                <button
                  type="button"
                  className="icon-btn is-danger"
                  aria-label={`${item.name} 삭제`}
                  title="삭제"
                  onClick={() => onRemove(item.id)}
                >
                  <Icon name="x" />
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="list-foot">
        <span>
          {items.length}개 · <span className="mono">{formatBytes(total)}</span>
        </span>
        <div className="row">
          {footer}
          {onClear ? (
            <button type="button" className="btn btn-sm btn-ghost" onClick={onClear}>
              모두 지우기
            </button>
          ) : null}
        </div>
      </div>
    </>
  )
}

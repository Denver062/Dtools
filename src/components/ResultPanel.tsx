import { useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icons'
import { downloadAllAsZip, downloadBlob } from '../lib/download'
import { extOf, fileKind, formatBytes } from '../lib/format'
import type { OutputFile } from '../lib/types'

function iconFor(name: string): IconName {
  const kind = fileKind(name)
  if (kind === 'pdf') return 'pdf'
  if (kind === 'image') return 'image'
  if (kind === 'archive') return 'archive'
  return 'file'
}

export function ResultPanel({
  outputs,
  zipName = 'dtools-results.zip',
  title = '결과',
  onReset,
  resetLabel = '새 작업',
  note,
  directories = [],
}: {
  outputs: OutputFile[]
  zipName?: string
  title?: string
  onReset?: () => void
  resetLabel?: string
  note?: ReactNode
  /** Empty directories to preserve when bundling into a ZIP. */
  directories?: string[]
}) {
  const [zipping, setZipping] = useState(false)
  const [zipLabel, setZipLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!outputs.length) return null

  const total = outputs.reduce((sum, item) => sum + item.blob.size, 0)

  const zipAll = async () => {
    setZipping(true)
    setError(null)
    setZipLabel('ZIP 준비 중…')
    try {
      await downloadAllAsZip(
        outputs,
        zipName,
        (done, all) => {
          setZipLabel(`${done} / ${all} 파일 묶는 중…`)
        },
        directories,
      )
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : '결과를 ZIP으로 묶지 못했습니다.',
      )
    } finally {
      setZipping(false)
      setZipLabel(null)
    }
  }

  return (
    <div className="result">
      <div className="card-head">
        <div>
          <div className="card-title">{title}</div>
          <div className="card-desc">
            {outputs.length}개 파일 · {formatBytes(total)}
            {outputs.length > 1 ? ' · ZIP으로 한 번에 받을 수 있습니다.' : ''}
          </div>
        </div>
        {onReset ? (
          <button type="button" className="btn btn-sm btn-ghost" onClick={onReset}>
            {resetLabel}
          </button>
        ) : null}
      </div>

      <div className="result-list">
        {outputs.map((item, index) => (
          <div className="result-file" key={`${item.name}-${index}`}>
            {item.thumbnail ? (
              <img className="thumb" src={item.thumbnail} alt="" />
            ) : (
              <span className="result-icon">
                <Icon name={iconFor(item.name)} />
              </span>
            )}
            <div className="result-info">
              <div className="result-name" title={item.path ?? item.name}>
                {item.name}
              </div>
              <div className="result-meta">
                <span>{item.blob.size > 0 ? formatBytes(item.blob.size) : '0 B'}</span>
                {item.note ? <span>· {item.note}</span> : null}
                {extOf(item.name) ? (
                  <span className="badge">{extOf(item.name).toUpperCase()}</span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label={`${item.name} 다운로드`}
              title="다운로드"
              onClick={() => downloadBlob(item.blob, item.name)}
            >
              <Icon name="download" />
            </button>
          </div>
        ))}
      </div>

      {error ? <div className="field-hint is-danger">{error}</div> : null}

      <div className="row row-wrap">
        {outputs.length === 1 ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => downloadBlob(outputs[0].blob, outputs[0].name)}
          >
            <Icon name="download" />
            다운로드
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={zipping}
            onClick={() => void zipAll()}
          >
            <Icon name="layers" />
            {zipping ? zipLabel ?? 'ZIP 준비 중…' : 'ZIP으로 모두 받기'}
          </button>
        )}
        {onReset ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onReset}
          >
            <Icon name="plus" />
            {resetLabel}
          </button>
        ) : null}
      </div>

      {note ? (
        <div className="note">
          <Icon name="shield" />
          <div className="grow">{note}</div>
        </div>
      ) : null}
    </div>
  )
}

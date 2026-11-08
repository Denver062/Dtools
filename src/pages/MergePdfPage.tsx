import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Dropzone } from '../components/Dropzone'
import { FileList, type FileListItem } from '../components/FileList'
import { Progress } from '../components/Progress'
import { Alert, Note } from '../components/Feedback'
import { ResultPanel } from '../components/ResultPanel'
import { Icon } from '../components/Icons'
import { mergePdfs, readPdfInfo } from '../lib/pdf-core'
import { extOf, formatBytes } from '../lib/format'
import type { PickedSet } from '../lib/pick'
import {
  errorMessage,
  type OutputFile,
  type ProgressState,
} from '../lib/types'

interface PdfItem {
  id: string
  file: File
  pages: number | null
  infoError?: string
}

export default function MergePdfPage() {
  const [items, setItems] = useState<PdfItem[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [outputs, setOutputs] = useState<OutputFile[]>([])

  const checking = items.some((item) => item.pages === null && !item.infoError)
  const broken = items.filter((item) => item.infoError)
  const totalPages = items.reduce((sum, item) => sum + (item.pages ?? 0), 0)
  const totalSize = items.reduce((sum, item) => sum + item.file.size, 0)

  const loadInfo = async (added: PdfItem[]) => {
    for (const entry of added) {
      try {
        const info = await readPdfInfo(entry.file)
        setItems((current) =>
          current.map((item) =>
            item.id === entry.id
              ? { ...item, pages: info.pages, infoError: undefined }
              : item,
          ),
        )
      } catch (problem) {
        setItems((current) =>
          current.map((item) =>
            item.id === entry.id
              ? { ...item, infoError: errorMessage(problem) }
              : item,
          ),
        )
      }
    }
  }

  const handleAdd = (picked: PickedSet) => {
    setError(null)
    const valid = picked.files.filter(
      (item) => extOf(item.file.name) === 'pdf',
    )
    const rejected = picked.files.filter(
      (item) => extOf(item.file.name) !== 'pdf',
    )

    if (rejected.length) {
      setError(
        `${rejected.map((item) => item.file.name).join(', ')} — PDF 파일만 합칠 수 있습니다.`,
      )
    }
    if (!valid.length) return

    const added: PdfItem[] = valid.map((item, index) => ({
      id: `${item.path}-${Date.now()}-${index}`,
      file: item.file,
      pages: null,
    }))
    setItems((current) => [...current, ...added])
    void loadInfo(added)
  }

  const reset = () => {
    setItems([])
    setOutputs([])
    setProgress(null)
    setError(null)
  }

  const handleMerge = async () => {
    if (items.length < 2) {
      setError('PDF를 2개 이상 추가해 주세요.')
      return
    }
    if (checking) {
      setError('PDF 정보를 확인하는 중입니다. 잠시만 기다려 주세요.')
      return
    }
    if (broken.length) {
      setError('읽을 수 없는 PDF가 있습니다. 해당 파일을 삭제해 주세요.')
      return
    }

    setBusy(true)
    setError(null)
    setProgress({ percent: 0, label: 'PDF를 합치는 중…' })
    try {
      const blob = await mergePdfs(
        items.map((item) => item.file),
        setProgress,
      )
      setOutputs([
        {
          name: 'merged.pdf',
          blob,
          note: `${items.length}개 PDF · ${totalPages}페이지`,
        },
      ])
      setProgress(null)
    } catch (problem) {
      setError(errorMessage(problem))
      setProgress(null)
    } finally {
      setBusy(false)
    }
  }

  const listItems: FileListItem[] = items.map((item) => ({
    id: item.id,
    name: item.file.name,
    sub: item.infoError ?? 'PDF',
    size: item.file.size,
    icon: 'pdf',
    tone: item.infoError ? undefined : 'accent',
    meta: (
      <span
        className={`badge${
          item.infoError
            ? ' tone-warn'
            : item.pages !== null
              ? ' tone-accent'
              : ''
        }`}
      >
        {item.infoError ? '오류' : item.pages !== null ? `${item.pages}p` : '확인 중'}
      </span>
    ),
  }))

  if (outputs.length) {
    return (
      <div className="page">
        <PageHeader
          title="PDF 합치기"
          desc="PDF가 하나로 합쳐졌습니다. 원본 파일은 직접 정리해 주세요."
        />
        <div className="tool-grid is-wide">
          <div className="card">
            <ResultPanel
              outputs={outputs}
              onReset={reset}
              note="PDF 병합은 파일을 다시 압축하지 않고 페이지를 그대로 복사합니다. 텍스트와 링크도 유지됩니다."
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        title="PDF 합치기"
        desc={
          <>
            여러 PDF를 <strong>한 파일</strong>로 합칩니다. 순서를 바꾸면 페이지
            순서도 바뀝니다. 모든 처리는 이 브라우저에서 진행됩니다.
          </>
        }
      />

      <div className="tool-grid">
        <div className="stack">
          <Dropzone
            icon="merge"
            title={
              <>
                PDF를 끌어다 놓거나 <em>클릭</em>하세요
              </>
            }
            hint="PDF만 추가할 수 있습니다. 파일을 끌어서 순서를 바꾼 뒤 합치세요."
            formats={['PDF', '여러 개 선택', '페이지 순서 유지']}
            accept=".pdf,application/pdf"
            multiple
            compact={items.length > 0}
            disabled={busy}
            onFiles={handleAdd}
            onError={setError}
          />

          {items.length ? (
            <div className="card is-flush">
              <div className="card-head is-inset">
                <div>
                  <div className="card-title">합칠 PDF</div>
                  <div className="card-desc">
                    위에서부터 차례대로 합쳐집니다. 끌어서 순서를 바꾸세요.
                  </div>
                </div>
                <span className="badge tone-accent">
                  {items.length}개 · {totalPages}p
                </span>
              </div>
              <FileList
                items={listItems}
                onRemove={(id) =>
                  setItems((current) =>
                    current.filter((item) => item.id !== id),
                  )
                }
                onReorder={(from, to) =>
                  setItems((current) => {
                    const next = [...current]
                    const [moved] = next.splice(from, 1)
                    next.splice(to, 0, moved)
                    return next
                  })
                }
                onClear={reset}
                footer={
                  <span className="chip">
                    {formatBytes(totalSize)}
                  </span>
                }
              />
            </div>
          ) : (
            <Note>
              <strong>페이지 순서가 중요하다면.</strong> 파일을 추가한 뒤
              왼쪽 손잡이를 끌어 순서를 바꿀 수 있습니다. 병합 결과에서는
              이 순서대로 페이지가 이어집니다.
            </Note>
          )}
        </div>

        <aside className="rail">
          <div className="card is-rail stack">
            <div className="spread">
              <div>
                <div className="card-title">병합 요약</div>
                <div className="card-desc">추가한 PDF를 확인하세요.</div>
              </div>
              <Icon name="merge" size={20} />
            </div>

            <div className="stats">
              <div className="stat">
                <div className="stat-label">파일</div>
                <div className="stat-value">
                  {items.length}
                  <small>개</small>
                </div>
              </div>
              <div className="stat">
                <div className="stat-label">페이지</div>
                <div className="stat-value">
                  {totalPages}
                  <small>p</small>
                </div>
              </div>
            </div>

            {broken.length ? (
              <Alert>
                {broken.length}개 PDF를 읽지 못했습니다. 목록에서 삭제한 뒤 다시
                시도해 주세요.
              </Alert>
            ) : null}

            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              disabled={busy || items.length < 2 || checking || broken.length > 0}
              onClick={() => void handleMerge()}
            >
              <Icon name="merge" />
              {busy
                ? '합치는 중…'
                : checking
                  ? 'PDF 확인 중…'
                  : 'PDF 합치기'}
            </button>

            {items.length === 1 ? (
              <div className="field-hint">PDF를 하나 더 추가하면 합칠 수 있습니다.</div>
            ) : null}

            {busy && progress ? (
              <Progress percent={progress.percent} label={progress.label} />
            ) : null}

            {error ? <Alert>{error}</Alert> : null}

            <Note>
              <strong>암호화된 PDF는 지원하지 않습니다.</strong> 비밀번호가
              걸린 PDF는 먼저 잠금을 해제한 뒤 추가해 주세요.
            </Note>
          </div>
        </aside>
      </div>
    </div>
  )
}

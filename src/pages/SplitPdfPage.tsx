import { useRef, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Dropzone } from '../components/Dropzone'
import { FileList } from '../components/FileList'
import { Field, Segmented } from '../components/Controls'
import { Progress } from '../components/Progress'
import { Alert, Note } from '../components/Feedback'
import { ResultPanel } from '../components/ResultPanel'
import { Icon } from '../components/Icons'
import {
  readPdfInfo,
  splitPdf,
  type PdfInfo,
  type SplitGroup,
} from '../lib/pdf-core'
import {
  chunkPages,
  extOf,
  formatBytes,
  parseRanges,
  rangeLabel,
  safeFileName,
  stripExt,
} from '../lib/format'
import type { PickedSet } from '../lib/pick'
import {
  errorMessage,
  type OutputFile,
  type ProgressState,
} from '../lib/types'

type SplitMode = 'ranges' | 'chunks'

export default function SplitPdfPage() {
  const [file, setFile] = useState<File | null>(null)
  const [info, setInfo] = useState<PdfInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [mode, setMode] = useState<SplitMode>('ranges')
  const [ranges, setRanges] = useState('')
  const [chunkSize, setChunkSize] = useState(1)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [outputs, setOutputs] = useState<OutputFile[]>([])
  const requestRef = useRef(0)

  let groups: SplitGroup[] = []
  let rangeError: string | null = null
  if (info) {
    try {
      if (mode === 'ranges') {
        groups = parseRanges(ranges, info.pages).map((pages) => ({
          pages,
          label: rangeLabel(pages),
        }))
      } else {
        const size = Math.max(1, Math.min(chunkSize, info.pages))
        groups = chunkPages(info.pages, size).map((pages) => ({
          pages,
          label: rangeLabel(pages),
        }))
      }
    } catch (problem) {
      rangeError = errorMessage(problem)
    }
  }

  const choose = (picked: PickedSet) => {
    const next = picked.files[0]?.file
    if (!next) return
    if (extOf(next.name) !== 'pdf') {
      setError('PDF 파일만 나눌 수 있습니다.')
      return
    }
    const token = ++requestRef.current
    setFile(next)
    setInfo(null)
    setFileError(null)
    setError(null)
    setOutputs([])
    setRanges('')
    setChunkSize(1)
    setLoading(true)

    void (async () => {
      try {
        const pages = await readPdfInfo(next)
        if (requestRef.current !== token) return
        setInfo(pages)
        setRanges(`1-${pages.pages}`)
        setChunkSize(1)
      } catch (problem) {
        if (requestRef.current !== token) return
        setFileError(errorMessage(problem))
      } finally {
        if (requestRef.current === token) setLoading(false)
      }
    })()
  }

  const reset = () => {
    requestRef.current++
    setFile(null)
    setInfo(null)
    setFileError(null)
    setLoading(false)
    setOutputs([])
    setProgress(null)
    setError(null)
    setRanges('')
    setChunkSize(1)
    setMode('ranges')
  }

  const handleSplit = async () => {
    if (!file || !info) {
      setError('먼저 PDF 파일을 선택해 주세요.')
      return
    }
    if (rangeError) {
      setError(rangeError)
      return
    }
    if (!groups.length) {
      setError('나눌 페이지 범위를 확인해 주세요.')
      return
    }

    setBusy(true)
    setError(null)
    setProgress({ percent: 0, label: 'PDF를 나누는 중…' })
    try {
      const base = safeFileName(stripExt(file.name), 'document')
      const result = await splitPdf(
        file,
        groups,
        base,
        setProgress,
      )
      setOutputs(result)
      setProgress(null)
    } catch (problem) {
      setError(errorMessage(problem))
      setProgress(null)
    } finally {
      setBusy(false)
    }
  }

  if (outputs.length && file) {
    const base = safeFileName(stripExt(file.name), 'document')
    return (
      <div className="page">
        <PageHeader
          title="PDF 나누기"
          desc="PDF를 여러 파일로 나눴습니다. 필요한 파일만 받거나 ZIP으로 한 번에 받으세요."
        />
        <div className="tool-grid is-wide">
          <div className="card">
            <ResultPanel
              outputs={outputs}
              zipName={`${base}_split.zip`}
              title="나눈 PDF"
              onReset={reset}
              resetLabel="다른 PDF 나누기"
              note="페이지를 복사해 새 PDF를 만들었습니다. 원본 PDF는 변경되지 않습니다."
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        title="PDF 나누기"
        desc={
          <>
            페이지 범위를 직접 지정하거나 <strong>N페이지마다</strong> 자동으로
            나눕니다. 결과는 각각 독립된 PDF 파일이 됩니다.
          </>
        }
      />

      <div className="tool-grid">
        <div className="stack">
          {file ? (
            <div className="card is-flush">
              <div className="card-head is-inset">
                <div>
                  <div className="card-title">나눌 PDF</div>
                  <div className="card-desc">
                    페이지 수를 확인한 뒤 오른쪽에서 범위를 정하세요.
                  </div>
                </div>
                <span className="badge tone-accent">
                  {info ? `${info.pages}p` : loading ? '확인 중' : 'PDF'}
                </span>
              </div>
              <FileList
                items={[
                  {
                    id: file.name,
                    name: file.name,
                    sub: fileError ?? info?.title ?? 'PDF 문서',
                    size: file.size,
                    icon: 'pdf',
                    tone: 'accent',
                    meta: info ? (
                      <span className="badge tone-accent">{info.pages}p</span>
                    ) : undefined,
                  },
                ]}
                onRemove={reset}
              />
            </div>
          ) : null}

          <Dropzone
            icon="split"
            title={
              <>
                나눌 PDF를 끌어다 놓거나 <em>클릭</em>하세요
              </>
            }
            hint="한 번에 하나의 PDF를 나눕니다. 페이지 범위는 문서의 실제 페이지 수를 기준으로 합니다."
            formats={['PDF', '범위 지정', 'N페이지마다']}
            accept=".pdf,application/pdf"
            multiple={false}
            compact={Boolean(file)}
            disabled={busy}
            onFiles={choose}
            onError={setError}
          />

          {loading ? (
            <div style={{ padding: '8px 0' }}>
              <Progress percent={null} label="PDF 정보를 확인하는 중…" />
            </div>
          ) : fileError ? (
            <Alert>
              {fileError}
              <div style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-sm btn-ghost" onClick={reset}>
                  다른 PDF 선택
                </button>
              </div>
            </Alert>
          ) : info ? (
            <div className="preview-box">
              <div className="spread" style={{ marginBottom: 10 }}>
                <div className="card-title">결과 미리보기</div>
                <span className="badge tone-accent">{groups.length}개 파일</span>
              </div>
              {groups.length ? (
                <div className="dz-formats" style={{ justifyContent: 'flex-start' }}>
                  {groups.slice(0, 14).map((group, index) => (
                    <span className="chip" key={`${group.label}-${index}`}>
                      {group.label}p · {group.pages.length}장
                    </span>
                  ))}
                  {groups.length > 14 ? (
                    <span className="chip is-accent">
                      외 {groups.length - 14}개
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="field-hint is-danger">
                  {rangeError ?? '페이지 범위를 입력해 주세요.'}
                </div>
              )}
            </div>
          ) : (
            <Note>
              <strong>예시.</strong> <code>1-3, 5, 8-</code>는 1~3페이지,
              5페이지, 8페이지부터 끝까지를 각각 별도 PDF로 만듭니다.
            </Note>
          )}
        </div>

        <aside className="rail">
          <div className="card is-rail stack">
            <div className="spread">
              <div>
                <div className="card-title">나누기 설정</div>
                <div className="card-desc">방법과 범위를 선택하세요.</div>
              </div>
              <Icon name="split" size={20} />
            </div>

            <Segmented<SplitMode>
              value={mode}
              ariaLabel="나누기 방법"
              options={[
                { value: 'ranges', label: '범위 지정' },
                { value: 'chunks', label: 'N페이지마다' },
              ]}
              onChange={setMode}
            />

            {mode === 'ranges' ? (
              <Field
                label="페이지 범위"
                hint="쉼표로 구분합니다. 1-3, 5, 8- 처럼 끝을 비우면 마지막 페이지까지입니다."
              >
                <input
                  className="input"
                  value={ranges}
                  placeholder="예: 1-3, 5, 8-"
                  disabled={busy || !info}
                  onChange={(event) => setRanges(event.target.value)}
                />
              </Field>
            ) : (
              <Field
                label="한 파일당 페이지 수"
                value={info ? `최대 ${info.pages}p` : undefined}
                hint="예를 들어 2로 설정하면 2페이지씩 차례로 나눕니다."
              >
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={info?.pages ?? 1}
                  value={chunkSize}
                  disabled={busy || !info}
                  onChange={(event) =>
                    setChunkSize(
                      Math.max(
                        1,
                        Math.min(
                          info?.pages ?? 1,
                          Number(event.target.value) || 1,
                        ),
                      ),
                    )
                  }
                />
              </Field>
            )}

            {rangeError ? <Alert tone="warn">{rangeError}</Alert> : null}

            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              disabled={
                busy || !file || !info || Boolean(rangeError) || !groups.length
              }
              onClick={() => void handleSplit()}
            >
              <Icon name="split" />
              {busy ? '나누는 중…' : `${groups.length || 0}개 PDF로 나누기`}
            </button>

            {busy && progress ? (
              <Progress percent={progress.percent} label={progress.label} />
            ) : null}

            {error ? <Alert>{error}</Alert> : null}

            <div className="stats">
              <div className="stat">
                <div className="stat-label">전체 페이지</div>
                <div className="stat-value">
                  {info?.pages ?? 0}
                  <small>p</small>
                </div>
              </div>
              <div className="stat">
                <div className="stat-label">원본 크기</div>
                <div className="stat-value" style={{ fontSize: 13 }}>
                  {file ? formatBytes(file.size) : '—'}
                </div>
              </div>
            </div>

            <Note>
              <strong>페이지 복사 방식.</strong> 원본 PDF의 페이지를 그대로
              복사하므로 텍스트와 링크가 유지됩니다.
            </Note>
          </div>
        </aside>
      </div>
    </div>
  )
}

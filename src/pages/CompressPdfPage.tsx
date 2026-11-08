import { useRef, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Dropzone } from '../components/Dropzone'
import { FileList } from '../components/FileList'
import { AdvancedSettings, RangeField } from '../components/Controls'
import { Progress } from '../components/Progress'
import { Alert, Note } from '../components/Feedback'
import { ResultPanel } from '../components/ResultPanel'
import { Icon } from '../components/Icons'
import { readPdfInfo, type PdfInfo } from '../lib/pdf-core'
import {
  compressPdf,
  type CompressMode,
  type CompressResult,
} from '../lib/pdf-render'
import {
  extOf,
  formatBytes,
  safeFileName,
  stripExt,
} from '../lib/format'
import type { PickedSet } from '../lib/pick'
import {
  errorMessage,
  type ProgressState,
} from '../lib/types'

const MODES: {
  value: CompressMode
  title: string
  desc: string
  dpi: number
  quality: number
}[] = [
  {
    value: 'balanced',
    title: '균형',
    desc: '150 DPI · 화질과 용량의 균형',
    dpi: 150,
    quality: 72,
  },
  {
    value: 'strong',
    title: '강하게',
    desc: '110 DPI · 용량을 최소로',
    dpi: 110,
    quality: 60,
  },
  {
    value: 'lossless',
    title: '무손실',
    desc: '구조만 정리 · 텍스트 유지',
    dpi: 0,
    quality: 72,
  },
]

const MODE_LABEL: Record<CompressMode, string> = {
  balanced: '균형 압축',
  strong: '강한 압축',
  lossless: '무손실 정리',
}

export default function CompressPdfPage() {
  const [file, setFile] = useState<File | null>(null)
  const [info, setInfo] = useState<PdfInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [mode, setMode] = useState<CompressMode>('balanced')
  const [quality, setQuality] = useState(72)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CompressResult | null>(null)
  const requestRef = useRef(0)

  const choose = (picked: PickedSet) => {
    const next = picked.files[0]?.file
    if (!next) return
    if (extOf(next.name) !== 'pdf') {
      setError('PDF 파일만 압축할 수 있습니다.')
      return
    }
    const token = ++requestRef.current
    setFile(next)
    setInfo(null)
    setFileError(null)
    setError(null)
    setResult(null)
    setLoading(true)

    void (async () => {
      try {
        const pages = await readPdfInfo(next)
        if (requestRef.current !== token) return
        setInfo(pages)
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
    setResult(null)
    setProgress(null)
    setError(null)
    setMode('balanced')
    setQuality(72)
  }

  const chooseMode = (next: CompressMode) => {
    setMode(next)
    const preset = MODES.find((item) => item.value === next)
    if (preset && next !== 'lossless') {
      setQuality(preset.quality)
    }
  }

  const handleCompress = async () => {
    if (!file || !info) {
      setError('먼저 PDF 파일을 선택해 주세요.')
      return
    }
    const preset = MODES.find((item) => item.value === mode) ?? MODES[0]
    setBusy(true)
    setError(null)
    setProgress({ percent: 0, label: 'PDF를 준비하는 중…' })
    try {
      const compressed = await compressPdf(
        file,
        {
          mode,
          dpi: preset.dpi,
          quality: quality / 100,
        },
        setProgress,
      )
      setResult(compressed)
      setProgress(null)
    } catch (problem) {
      setError(errorMessage(problem))
      setProgress(null)
    } finally {
      setBusy(false)
    }
  }

  if (result && file) {
    const base = safeFileName(stripExt(file.name), 'document')
    const saved = result.originalSize - result.outputSize
    const ratio =
      result.originalSize > 0
        ? Math.max(0, (saved / result.originalSize) * 100)
        : 0
    return (
      <div className="page">
        <PageHeader
          title="PDF 압축"
          desc="압축이 끝났습니다. 결과가 원본보다 크면 원본을 그대로 유지했습니다."
        />
        <div className="tool-grid is-wide">
          <div className="card">
            <div className="stats" style={{ marginBottom: 16 }}>
              <div className="stat">
                <div className="stat-label">원본</div>
                <div className="stat-value" style={{ fontSize: 15 }}>
                  {formatBytes(result.originalSize)}
                </div>
              </div>
              <div className="stat">
                <div className="stat-label">결과</div>
                <div className="stat-value" style={{ fontSize: 15 }}>
                  {formatBytes(result.outputSize)}
                </div>
              </div>
              <div className="stat">
                <div className="stat-label">감소</div>
                <div className="stat-value" style={{ fontSize: 15 }}>
                  {result.usedOriginal ? '0%' : `${ratio.toFixed(1)}%`}
                </div>
              </div>
              <div className="stat">
                <div className="stat-label">페이지</div>
                <div className="stat-value" style={{ fontSize: 15 }}>
                  {result.pageCount}p
                </div>
              </div>
            </div>

            <ResultPanel
              outputs={[
                {
                  name: `${base}-compressed.pdf`,
                  blob: result.blob,
                  note: result.usedOriginal
                    ? `원본 유지 · ${MODE_LABEL[mode]}`
                    : `${MODE_LABEL[mode]} · ${formatBytes(Math.max(0, saved))} 감소`,
                },
              ]}
              onReset={reset}
              note={
                mode === 'lossless'
                  ? '무손실 모드는 페이지 내용을 이미지로 바꾸지 않습니다. 텍스트와 링크가 유지됩니다.'
                  : '이미지 기반 압축은 텍스트 선택·검색과 링크가 사라질 수 있습니다. 중요한 문서는 원본을 보관해 주세요.'
              }
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        title="PDF 압축"
        desc={
          <>
            PDF를 가볍게 만듭니다. <strong>무손실</strong>은 구조만 정리하고,{' '}
            <strong>균형·강하게</strong>는 페이지를 이미지로 다시 그려 용량을
            줄입니다.
          </>
        }
      />

      <div className="tool-grid">
        <div className="stack">
          {file ? (
            <div className="card is-flush">
              <div className="card-head is-inset">
                <div>
                  <div className="card-title">압축할 PDF</div>
                  <div className="card-desc">
                    페이지 수와 크기를 확인한 뒤 압축 강도를 선택하세요.
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
            icon="compress"
            title={
              <>
                압축할 PDF를 끌어다 놓거나 <em>클릭</em>하세요
              </>
            }
            hint="한 번에 하나의 PDF를 압축합니다. 스캔 문서는 이미지 기반이라 효과가 클 수 있습니다."
            formats={['PDF', '균형', '강하게', '무손실']}
            accept=".pdf,application/pdf"
            multiple={false}
            compact={Boolean(file)}
            disabled={busy}
            onFiles={choose}
            onError={setError}
          />

          {loading ? (
            <div className="card">
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
          ) : (
            <Note>
              <strong>먼저 무손실을 시도해 보세요.</strong> 텍스트가 많은
              PDF는 무손실 정리만으로도 충분히 줄어들고, 화질과 링크를 그대로
              지킬 수 있습니다.
            </Note>
          )}
        </div>

        <aside className="rail">
          <div className="card is-rail stack">
            <div className="spread">
              <div>
                <div className="card-title">압축 설정</div>
                <div className="card-desc">문서 종류에 맞는 모드를 고르세요.</div>
              </div>
              <Icon name="compress" size={20} />
            </div>

            <div className="mode-cards">
              {MODES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`mode-card${mode === item.value ? ' is-active' : ''}`}
                  disabled={busy}
                  onClick={() => chooseMode(item.value)}
                >
                  <b>{item.title}</b>
                  <span>{item.desc}</span>
                </button>
              ))}
            </div>

            {mode !== 'lossless' ? (
              <AdvancedSettings title="상세 품질 조절 (선택)">
                <RangeField
                  label="세부 이미지 품질"
                  value={quality}
                  min={30}
                  max={95}
                  step={1}
                  format={(value) => `${value}%`}
                  onChange={setQuality}
                  disabled={busy}
                />
              </AdvancedSettings>
            ) : (
              <div className="field-hint">
                무손실 모드는 객체 스트림을 정리합니다. 화질 손실이 전혀 없습니다.
              </div>
            )}

            {mode !== 'lossless' ? (
              <Alert tone="warn">
                페이지를 이미지로 다시 그리므로 텍스트 선택·검색, 링크, 폼이
                사라질 수 있습니다. 원본을 따로 보관해 주세요.
              </Alert>
            ) : null}

            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              disabled={busy || !file || !info || Boolean(fileError)}
              onClick={() => void handleCompress()}
            >
              <Icon name="compress" />
              {busy ? '압축하는 중…' : 'PDF 압축하기'}
            </button>

            {busy && progress ? (
              <Progress percent={progress.percent} label={progress.label} />
            ) : null}

            {error ? <Alert>{error}</Alert> : null}

            <div className="stats">
              <div className="stat">
                <div className="stat-label">페이지</div>
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
              <strong>결과가 더 크면?</strong> 원본을 그대로 돌려드립니다. 억지로
              용량을 줄여 화질을 망가뜨리지 않습니다.
            </Note>
          </div>
        </aside>
      </div>
    </div>
  )
}

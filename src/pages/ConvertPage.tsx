import { useEffect, useRef, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Dropzone } from '../components/Dropzone'
import { FileList, type FileListItem } from '../components/FileList'
import {
  Field,
  RangeField,
  Segmented,
  SelectField,
  Toggle,
} from '../components/Controls'
import { Modal } from '../components/Modal'
import { Progress } from '../components/Progress'
import { Alert, Note } from '../components/Feedback'
import { ResultPanel } from '../components/ResultPanel'
import { Icon } from '../components/Icons'
import {
  detectEncodeSupport,
  type EncodeSupport,
} from '../lib/canvas'
import {
  convertImages,
  formatPdfLayout,
  TARGET_LABEL,
  type ConvertTarget,
  type PdfOrientation,
  type PdfPageSize,
} from '../lib/convert'
import { readPdfInfo, type PdfInfo } from '../lib/pdf-core'
import { pdfToImages, pdfToText } from '../lib/pdf-render'
import {
  convertTables,
  type CsvDelimiter,
  type TableTarget,
} from '../lib/table'
import {
  extOf,
  formatBytes,
  safeFileName,
  stripExt,
} from '../lib/format'
import { mergeFiles } from '../lib/files'
import type { PickedSet } from '../lib/pick'
import {
  errorMessage,
  type OutputFile,
  type PickedFile,
  type ProgressState,
} from '../lib/types'

type Mode = 'images' | 'toPdf' | 'fromPdf' | 'pdfText' | 'table'
type ImageTarget = Exclude<ConvertTarget, 'pdf'>
type PdfImageTarget = Exclude<ImageTarget, 'ico'>

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg']
const TABLE_EXTS = ['csv', 'json']

const MODES: { value: Mode; label: string; short: string; desc: string }[] = [
  {
    value: 'images',
    label: '이미지 변환',
    short: '이미지 → 이미지',
    desc: 'JPG · PNG · WebP · BMP · ICO',
  },
  {
    value: 'toPdf',
    label: '이미지 → PDF',
    short: '이미지 → PDF',
    desc: '페이지 크기와 여백까지 지정',
  },
  {
    value: 'fromPdf',
    label: 'PDF → 이미지',
    short: 'PDF → 이미지',
    desc: '해상도를 골라 페이지별 저장',
  },
  {
    value: 'pdfText',
    label: 'PDF → 텍스트',
    short: 'PDF → 텍스트',
    desc: '페이지별 글자를 TXT로 추출',
  },
  {
    value: 'table',
    label: 'CSV ↔ JSON',
    short: '표 데이터 변환',
    desc: 'CSV와 JSON을 서로 바꾸기',
  },
]

const IMAGE_TARGETS: { value: ImageTarget; label: string }[] = [
  { value: 'jpg', label: 'JPG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'bmp', label: 'BMP' },
  { value: 'ico', label: 'ICO' },
]

const PDF_IMAGE_TARGETS: { value: PdfImageTarget; label: string }[] = [
  { value: 'jpg', label: 'JPG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'bmp', label: 'BMP' },
]

const TABLE_TARGETS: { value: TableTarget; label: string }[] = [
  { value: 'json', label: 'JSON' },
  { value: 'csv', label: 'CSV' },
]

const TABLE_LABEL: Record<TableTarget, string> = {
  json: 'JSON',
  csv: 'CSV',
}

const MAX_EDGE_OPTIONS = [
  { value: '0', label: '원본 크기 유지 (기본)' },
  { value: '4096', label: '긴 변 4096px' },
  { value: '2560', label: '긴 변 2560px (QHD)' },
  { value: '1920', label: '긴 변 1920px (FHD)' },
  { value: '1280', label: '긴 변 1280px (HD)' },
]

const DPI_OPTIONS = [
  { value: '96', label: '96 DPI · 빠르게 (가벼움)' },
  { value: '150', label: '150 DPI · 표준 (추천)' },
  { value: '200', label: '200 DPI · 선명하게' },
  { value: '300', label: '300 DPI · 인쇄용 (고화질/느림)' },
]

const PAGE_SIZE_OPTIONS = [
  { value: 'auto', label: '이미지에 맞춤 (기본)' },
  { value: 'a4', label: 'A4 (210 × 297mm)' },
  { value: 'letter', label: 'Letter (8.5 × 11in)' },
]

const MARGIN_OPTIONS = [
  { value: '0', label: '여백 없음' },
  { value: '18', label: '6mm' },
  { value: '36', label: '12mm' },
  { value: '54', label: '18mm' },
]

const ORIENTATION_OPTIONS: { value: PdfOrientation; label: string }[] = [
  { value: 'auto', label: '자동' },
  { value: 'portrait', label: '세로' },
  { value: 'landscape', label: '가로' },
]

const DELIMITER_OPTIONS: { value: CsvDelimiter; label: string }[] = [
  { value: ',', label: '쉼표 (,)' },
  { value: ';', label: '세미콜론 (;)' },
  { value: '\t', label: '탭' },
]

export default function ConvertPage() {
  const [mode, setMode] = useState<Mode>('images')
  const [imageTarget, setImageTarget] = useState<ImageTarget>('jpg')
  const [pdfTarget, setPdfTarget] = useState<PdfImageTarget>('jpg')
  const [tableTarget, setTableTarget] = useState<TableTarget>('json')
  const [quality, setQuality] = useState(85)
  const [maxEdge, setMaxEdge] = useState('0')
  const [dpi, setDpi] = useState(150)
  const [pageSize, setPageSize] = useState<PdfPageSize>('auto')
  const [orientation, setOrientation] = useState<PdfOrientation>('auto')
  const [margin, setMargin] = useState('0')
  const [pageSeparator, setPageSeparator] = useState(true)
  const [delimiter, setDelimiter] = useState<CsvDelimiter>(',')
  const [bom, setBom] = useState(true)
  const [coerce, setCoerce] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [files, setFiles] = useState<PickedFile[]>([])
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfInfo, setPdfInfo] = useState<PdfInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [support, setSupport] = useState<EncodeSupport | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [failures, setFailures] = useState<{ name: string; message: string }[]>([])
  const [outputs, setOutputs] = useState<OutputFile[]>([])
  const requestRef = useRef(0)

  useEffect(() => {
    let alive = true
    void detectEncodeSupport()
      .then((result) => {
        if (alive) setSupport(result)
      })
      .catch(() => {
        if (alive) setSupport({ webp: false })
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!support || support.webp) return
    setImageTarget((current) => (current === 'webp' ? 'jpg' : current))
    setPdfTarget((current) => (current === 'webp' ? 'jpg' : current))
  }, [support])

  const supportsWebp = support?.webp !== false
  const imageTargets = IMAGE_TARGETS.filter(
    (item) => item.value !== 'webp' || supportsWebp,
  )
  const pdfTargets = PDF_IMAGE_TARGETS.filter(
    (item) => item.value !== 'webp' || supportsWebp,
  )

  const modeInfo = MODES.find((item) => item.value === mode) ?? MODES[0]
  const isPdfMode = mode === 'fromPdf' || mode === 'pdfText'
  const isTableMode = mode === 'table'

  const targetLabel =
    mode === 'images'
      ? TARGET_LABEL[imageTarget]
      : mode === 'toPdf'
        ? TARGET_LABEL.pdf
        : mode === 'fromPdf'
          ? TARGET_LABEL[pdfTarget]
          : mode === 'pdfText'
            ? 'TXT'
            : TABLE_LABEL[tableTarget]

  const summaryOptions = (() => {
    if (mode === 'images') {
      const parts = [TARGET_LABEL[imageTarget]]
      if (imageTarget === 'jpg' || imageTarget === 'webp') {
        parts.push(`품질 ${quality}%`)
      }
      if (imageTarget !== 'ico' && maxEdge !== '0') {
        parts.push(`최대 ${maxEdge}px`)
      }
      return parts.join(' · ')
    }
    if (mode === 'toPdf') {
      return [
        formatPdfLayout({
          pageSize,
          orientation,
          margin: Number(margin),
        }),
        `품질 ${quality}%`,
      ].join(' · ')
    }
    if (mode === 'fromPdf') {
      const parts = [`${dpi} DPI`]
      if (pdfTarget === 'jpg' || pdfTarget === 'webp') {
        parts.push(`품질 ${quality}%`)
      }
      if (maxEdge !== '0') parts.push(`최대 ${maxEdge}px`)
      return parts.join(' · ')
    }
    if (mode === 'pdfText') {
      return pageSeparator ? '페이지 구분선 포함' : '텍스트만'
    }
    const parts = [bom ? 'Excel용 BOM' : 'BOM 없음']
    parts.push(coerce ? '숫자 자동 변환' : '문자열 유지')
    return parts.join(' · ')
  })()

  const clearWork = () => {
    requestRef.current++
    setFiles([])
    setPdfFile(null)
    setPdfInfo(null)
    setFileError(null)
    setLoading(false)
    setOutputs([])
    setFailures([])
    setProgress(null)
    setError(null)
  }

  const switchMode = (next: Mode) => {
    if (next === mode) return
    setMode(next)
    clearWork()
    if (next === 'images') {
      setImageTarget('jpg')
      setQuality(85)
      setMaxEdge('0')
    } else if (next === 'toPdf') {
      setQuality(82)
      setMaxEdge('0')
      setPageSize('auto')
      setOrientation('auto')
      setMargin('0')
    } else if (next === 'fromPdf') {
      setPdfTarget('jpg')
      setQuality(85)
      setDpi(150)
      setMaxEdge('0')
    } else if (next === 'pdfText') {
      setPageSeparator(true)
    } else {
      setTableTarget('json')
      setDelimiter(',')
      setBom(true)
      setCoerce(true)
    }
  }

  const resetSettings = () => {
    if (mode === 'images') {
      setImageTarget('jpg')
      setQuality(85)
      setMaxEdge('0')
    } else if (mode === 'toPdf') {
      setQuality(82)
      setMaxEdge('0')
      setPageSize('auto')
      setOrientation('auto')
      setMargin('0')
    } else if (mode === 'fromPdf') {
      setPdfTarget('jpg')
      setQuality(85)
      setDpi(150)
      setMaxEdge('0')
    } else if (mode === 'pdfText') {
      setPageSeparator(true)
    } else {
      setTableTarget('json')
      setDelimiter(',')
      setBom(true)
      setCoerce(true)
    }
  }

  const handleAddImages = (picked: PickedSet) => {
    setError(null)
    const valid = picked.files.filter((item) =>
      IMAGE_EXTS.includes(extOf(item.file.name)),
    )
    const rejected = picked.files.filter(
      (item) => !IMAGE_EXTS.includes(extOf(item.file.name)),
    )
    if (rejected.length) {
      setError(
        `지원하지 않는 형식입니다: ${rejected
          .map((item) => item.file.name)
          .join(', ')} — JPG, PNG, WebP, GIF, BMP, SVG만 사용할 수 있습니다.`,
      )
    }
    setFailures([])
    if (valid.length) {
      setFiles((current) => mergeFiles(current, valid))
    }
  }

  const handleAddTables = (picked: PickedSet) => {
    setError(null)
    const valid = picked.files.filter((item) =>
      TABLE_EXTS.includes(extOf(item.file.name)),
    )
    const rejected = picked.files.filter(
      (item) => !TABLE_EXTS.includes(extOf(item.file.name)),
    )
    if (rejected.length) {
      setError(
        `지원하지 않는 형식입니다: ${rejected
          .map((item) => item.file.name)
          .join(', ')} — CSV, JSON만 사용할 수 있습니다.`,
      )
    }
    setFailures([])
    if (valid.length) {
      setFiles((current) => mergeFiles(current, valid))
    }
  }

  const handleAddPdf = (picked: PickedSet) => {
    const next = picked.files[0]?.file
    if (!next) return
    if (extOf(next.name) !== 'pdf') {
      setError('PDF 파일만 선택할 수 있습니다.')
      return
    }
    const token = ++requestRef.current
    setPdfFile(next)
    setPdfInfo(null)
    setFileError(null)
    setError(null)
    setOutputs([])
    setFailures([])
    setLoading(true)

    void (async () => {
      try {
        const info = await readPdfInfo(next)
        if (requestRef.current !== token) return
        setPdfInfo(info)
      } catch (problem) {
        if (requestRef.current !== token) return
        setFileError(errorMessage(problem))
      } finally {
        if (requestRef.current === token) setLoading(false)
      }
    })()
  }

  const handleConvert = async () => {
    if (isPdfMode) {
      if (!pdfFile) {
        setError('먼저 PDF 파일을 선택해 주세요.')
        return
      }
      if (!pdfInfo || fileError) {
        setError('PDF 정보를 확인한 뒤 다시 시도해 주세요.')
        return
      }
    } else if (!files.length) {
      setError(
        isTableMode
          ? '먼저 CSV 또는 JSON 파일을 추가해 주세요.'
          : '먼저 이미지 파일을 추가해 주세요.',
      )
      return
    }

    setBusy(true)
    setError(null)
    setFailures([])
    setOutputs([])
    setProgress({ percent: 0, label: '변환 준비 중…' })

    try {
      if (mode === 'fromPdf' && pdfFile) {
        const result = await pdfToImages(
          pdfFile,
          {
            target: pdfTarget,
            dpi,
            quality: quality / 100,
            maxEdge: Number(maxEdge),
          },
          setProgress,
        )
        setOutputs(result)
      } else if (mode === 'pdfText' && pdfFile) {
        const result = await pdfToText(
          pdfFile,
          { pageSeparator },
          setProgress,
        )
        setOutputs(result)
      } else if (mode === 'table') {
        const result = await convertTables(
          files.map((item) => item.file),
          { target: tableTarget, delimiter, bom, coerce },
          setProgress,
        )
        setOutputs(result.outputs)
        setFailures(result.failures)
        if (!result.outputs.length) {
          setError('모든 파일을 변환하지 못했습니다. 아래 오류를 확인해 주세요.')
        }
      } else {
        const options =
          mode === 'toPdf'
            ? {
                target: 'pdf' as const,
                quality: quality / 100,
                maxEdge: Number(maxEdge),
                pdf: {
                  pageSize,
                  orientation,
                  margin: Number(margin),
                },
              }
            : {
                target: imageTarget,
                quality: quality / 100,
                maxEdge: Number(maxEdge),
              }
        const result = await convertImages(
          files.map((item) => item.file),
          options,
          setProgress,
        )
        setOutputs(result.outputs)
        setFailures(result.failures)
        if (!result.outputs.length) {
          setError('모든 파일을 변환하지 못했습니다. 아래 오류를 확인해 주세요.')
        }
      }
      setProgress(null)
    } catch (problem) {
      setError(errorMessage(problem))
      setProgress(null)
    } finally {
      setBusy(false)
    }
  }

  if (outputs.length) {
    const zipName =
      mode === 'fromPdf' && pdfFile
        ? `${safeFileName(stripExt(pdfFile.name), 'document')}-${pdfTarget}.zip`
        : `converted-${
            mode === 'table'
              ? tableTarget
              : mode === 'pdfText'
                ? 'txt'
                : mode === 'toPdf'
                  ? 'pdf'
                  : mode === 'images'
                    ? imageTarget
                    : pdfTarget
          }.zip`

    return (
      <div className="page">
        <PageHeader
          title="파일 변환"
          desc="변환이 끝났습니다. 원본 파일은 변경되지 않았습니다."
        />
        <div className="tool-grid is-wide">
          <div className="card stack">
            {failures.length ? (
              <Alert tone="warn">
                {failures.length}개 파일은 변환하지 못했습니다.
                <div className="small" style={{ marginTop: 6 }}>
                  {failures.map((item) => (
                    <div key={item.name}>
                      · <strong>{item.name}</strong> — {item.message}
                    </div>
                  ))}
                </div>
              </Alert>
            ) : null}
            <ResultPanel
              outputs={outputs}
              zipName={zipName}
              title="변환 결과"
              onReset={clearWork}
              resetLabel="다른 파일 변환"
              note="변환은 브라우저 안에서만 처리되었습니다. 결과는 서버에 저장되지 않습니다."
            />
          </div>
        </div>
      </div>
    )
  }

  const imageItems: FileListItem[] = files.map((item) => {
    const slash = item.path.lastIndexOf('/')
    return {
      id: item.path,
      name: item.file.name,
      sub: slash >= 0 ? item.path.slice(0, slash) : '루트',
      size: item.file.size,
      icon: 'image',
      meta: (
        <span className="badge">
          {(extOf(item.file.name) || 'IMG').toUpperCase()}
        </span>
      ),
    }
  })

  const tableItems: FileListItem[] = files.map((item) => {
    const slash = item.path.lastIndexOf('/')
    return {
      id: item.path,
      name: item.file.name,
      sub: slash >= 0 ? item.path.slice(0, slash) : '루트',
      size: item.file.size,
      icon: 'file',
      meta: (
        <span className="badge">
          {(extOf(item.file.name) || 'FILE').toUpperCase()}
        </span>
      ),
    }
  })

  const dropTitle = (() => {
    if (mode === 'fromPdf') {
      return (
        <>
          PDF를 끌어다 놓거나 <em>클릭</em>하세요
        </>
      )
    }
    if (mode === 'pdfText') {
      return (
        <>
          텍스트를 추출할 PDF를 끌어다 놓거나 <em>클릭</em>하세요
        </>
      )
    }
    if (mode === 'toPdf') {
      return (
        <>
          PDF로 묶을 이미지를 끌어다 놓거나 <em>클릭</em>하세요
        </>
      )
    }
    if (mode === 'table') {
      return (
        <>
          CSV 또는 JSON 파일을 끌어다 놓거나 <em>클릭</em>하세요
        </>
      )
    }
    return (
      <>
        이미지를 끌어다 놓거나 <em>클릭</em>하세요
      </>
    )
  })()

  const dropHint = (() => {
    if (mode === 'fromPdf') {
      return 'PDF 한 개를 선택합니다. 페이지마다 이미지 파일이 만들어집니다.'
    }
    if (mode === 'pdfText') {
      return 'PDF 한 개를 선택합니다. 페이지별 글자를 TXT 파일로 뽑아냅니다.'
    }
    if (mode === 'toPdf') {
      return '여러 이미지를 한 번에 PDF로 묶습니다. 순서를 바꿀 수 있습니다.'
    }
    if (mode === 'table') {
      return 'CSV를 JSON으로, JSON을 CSV로 바꿉니다. 여러 파일을 한 번에 처리할 수 있습니다.'
    }
    return '여러 이미지를 한 번에 변환합니다. 파일마다 실패 여부를 따로 알려드립니다.'
  })()

  const dropFormats = (() => {
    if (isPdfMode) return ['PDF']
    if (mode === 'table') return ['CSV', 'JSON']
    return ['JPG', 'PNG', 'WebP', 'BMP', 'GIF', 'SVG']
  })()

  const dropAccept = (() => {
    if (isPdfMode) return '.pdf,application/pdf'
    if (mode === 'table') return '.csv,.json,text/csv,application/json'
    return '.jpg,.jpeg,.png,.webp,.gif,.bmp,.svg,image/*'
  })()

  const handleFiles = isPdfMode
    ? handleAddPdf
    : mode === 'table'
      ? handleAddTables
      : handleAddImages

  const inputMissing = isPdfMode
    ? !pdfFile || !pdfInfo || Boolean(fileError)
    : !files.length

  return (
    <div className="page">
      <PageHeader
        title="파일 변환"
        desc={
          <>
            이미지·PDF는 물론 <strong>PDF 텍스트 추출</strong>과{' '}
            <strong>CSV ↔ JSON</strong> 변환까지 브라우저 안에서 처리합니다.
          </>
        }
      />

      <div className="tool-grid">
        <div className="stack">
          {isPdfMode && pdfFile ? (
            <div className="card is-flush">
              <div className="card-head is-inset">
                <div>
                  <div className="card-title">
                    {mode === 'pdfText' ? '텍스트를 추출할 PDF' : '변환할 PDF'}
                  </div>
                  <div className="card-desc">
                    {mode === 'pdfText'
                      ? '페이지별로 텍스트를 뽑아 하나의 TXT 파일로 저장합니다.'
                      : '페이지 수를 확인한 뒤 오른쪽에서 형식과 해상도를 고르세요.'}
                  </div>
                </div>
                <span className="badge tone-accent">
                  {pdfInfo ? `${pdfInfo.pages}p` : loading ? '확인 중' : 'PDF'}
                </span>
              </div>
              <FileList
                items={[
                  {
                    id: pdfFile.name,
                    name: pdfFile.name,
                    sub: fileError ?? pdfInfo?.title ?? 'PDF 문서',
                    size: pdfFile.size,
                    icon: 'pdf',
                    tone: 'accent',
                    meta: pdfInfo ? (
                      <span className="badge tone-accent">{pdfInfo.pages}p</span>
                    ) : undefined,
                  },
                ]}
                onRemove={() => {
                  requestRef.current++
                  setPdfFile(null)
                  setPdfInfo(null)
                  setFileError(null)
                  setLoading(false)
                }}
              />
            </div>
          ) : null}

          {!isPdfMode && files.length ? (
            <div className="card is-flush">
              <div className="card-head is-inset">
                <div>
                  <div className="card-title">
                    {mode === 'toPdf'
                      ? 'PDF로 묶을 이미지'
                      : isTableMode
                        ? '변환할 데이터 파일'
                        : '변환할 이미지'}
                  </div>
                  <div className="card-desc">
                    {mode === 'toPdf'
                      ? '위에서부터 차례대로 PDF 페이지가 됩니다.'
                      : isTableMode
                        ? '각 파일을 선택한 형식으로 하나씩 변환합니다.'
                        : '각 이미지를 선택한 형식으로 하나씩 변환합니다.'}
                  </div>
                </div>
                <span className="badge tone-accent">
                  {files.length}개 ·{' '}
                  {formatBytes(
                    files.reduce((sum, item) => sum + item.file.size, 0),
                  )}
                </span>
              </div>
              <FileList
                items={isTableMode ? tableItems : imageItems}
                onRemove={(id) =>
                  setFiles((current) =>
                    current.filter((item) => item.path !== id),
                  )
                }
                onReorder={
                  mode === 'toPdf'
                    ? (from, to) =>
                        setFiles((current) => {
                          const next = [...current]
                          const [moved] = next.splice(from, 1)
                          next.splice(to, 0, moved)
                          return next
                        })
                    : undefined
                }
                onClear={() => setFiles([])}
              />
            </div>
          ) : null}

          <Dropzone
            icon={
              isPdfMode ? 'pdf' : isTableMode ? 'file' : 'image'
            }
            title={dropTitle}
            hint={dropHint}
            formats={dropFormats}
            accept={dropAccept}
            multiple={!isPdfMode}
            compact={
              isPdfMode ? Boolean(pdfFile) : files.length > 0
            }
            disabled={busy}
            onFiles={handleFiles}
            onError={setError}
          />

          {loading ? (
            <div style={{ padding: '8px 0' }}>
              <Progress percent={null} label="PDF 정보를 확인하는 중…" />
            </div>
          ) : fileError ? (
            <Alert>{fileError}</Alert>
          ) : (
            <Note>
              {mode === 'pdfText' ? (
                <>
                  <strong>텍스트만 추출.</strong> 스캔한 이미지 PDF는 글자가
                  없어 변환할 수 없습니다. 페이지 구분선을 끄면 본문만
                  이어집니다.
                </>
              ) : mode === 'table' ? (
                <>
                  <strong>CSV ↔ JSON.</strong> JSON은 객체 배열을 기준으로
                  표를 만듭니다. 중첩된 값은 JSON 문자열로 셀에 들어갑니다.
                </>
              ) : mode === 'toPdf' ? (
                <>
                  <strong>PDF 페이지 설정.</strong> 이미지에 맞춤, A4, Letter
                  중에서 고르고 여백과 방향을 지정할 수 있습니다.
                </>
              ) : mode === 'fromPdf' ? (
                <>
                  <strong>형식별 차이.</strong> JPG는 사진에, PNG는 투명
                  배경과 선명한 글자에, WebP는 작은 용량에 적합합니다. BMP는
                  압축 없는 원본에 가깝습니다.
                </>
              ) : (
                <>
                  <strong>형식별 차이.</strong> JPG는 사진에, PNG는 투명 배경과
                  선명한 글자에, WebP는 작은 용량에 적합합니다. ICO는 Windows
                  아이콘용으로 16~256px 크기를 함께 담습니다.
                </>
              )}
            </Note>
          )}
        </div>

        <aside className="rail">
          <div className="card is-rail stack">
            <div className="spread">
              <div>
                <div className="card-title">변환 설정</div>
                <div className="card-desc">
                  형식과 세부 옵션을 한 창에서 고르세요.
                </div>
              </div>
              <Icon name="convert" size={20} />
            </div>

            <div className="settings-summary">
              <div>
                <span>방식</span>
                <strong>{modeInfo.short}</strong>
              </div>
              <div>
                <span>출력</span>
                <strong>{targetLabel}</strong>
              </div>
              <div>
                <span>옵션</span>
                <strong>{summaryOptions}</strong>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => setSettingsOpen(true)}
              disabled={busy}
            >
              <Icon name="sparkles" />
              변환 설정 열기
            </button>

            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              disabled={busy || inputMissing}
              onClick={() => void handleConvert()}
            >
              <Icon name="convert" />
              {busy
                ? '변환하는 중…'
                : mode === 'toPdf'
                  ? `이미지 ${files.length}장을 PDF로`
                  : mode === 'fromPdf'
                    ? 'PDF를 이미지로 변환'
                    : mode === 'pdfText'
                      ? 'PDF 텍스트 추출'
                      : isTableMode
                        ? `${TABLE_LABEL[tableTarget]}(으)로 변환`
                        : `${targetLabel}(으)로 변환`}
            </button>

            {busy && progress ? (
              <Progress percent={progress.percent} label={progress.label} />
            ) : null}

            {error ? (
              <Alert>
                {error}
                {failures.length ? (
                  <div className="small" style={{ marginTop: 6 }}>
                    {failures.map((item) => (
                      <div key={item.name}>
                        · <strong>{item.name}</strong> — {item.message}
                      </div>
                    ))}
                  </div>
                ) : null}
              </Alert>
            ) : null}

            <Note>
              <strong>원본은 그대로.</strong> 변환 결과는 새 파일로 만들어지며
              원본을 덮어쓰지 않습니다.
            </Note>
          </div>
        </aside>
      </div>

      {settingsOpen ? (
        <Modal
          title="변환 설정"
          description="방식과 출력 옵션을 고르면 바로 적용됩니다."
          onClose={() => setSettingsOpen(false)}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={resetSettings}
              >
                기본값으로
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setSettingsOpen(false)}
              >
                설정 적용
              </button>
            </>
          }
        >
          <div className="settings-block">
            <div className="section-label">변환 방식</div>
            <div className="convert-modes">
              {MODES.map((item) => {
                const active = item.value === mode
                return (
                  <button
                    key={item.value}
                    type="button"
                    className={`convert-mode${active ? ' is-active' : ''}`}
                    aria-pressed={active}
                    onClick={() => switchMode(item.value)}
                  >
                    <span className="convert-mode-head">
                      <span className="convert-mode-label">{item.label}</span>
                      {active ? (
                        <span className="badge tone-accent">선택</span>
                      ) : null}
                    </span>
                    <span className="convert-mode-desc">{item.desc}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <hr className="divider" />

          {mode === 'images' ? (
            <div className="stack-sm">
              <Field
                label="출력 형식"
                hint={
                  imageTarget === 'ico'
                    ? '16 · 32 · 48 · 64 · 128 · 256px 아이콘을 한 파일에 담습니다.'
                    : imageTarget === 'bmp'
                      ? '압축하지 않은 24비트 BMP로 저장합니다.'
                      : undefined
                }
              >
                <Segmented<ImageTarget>
                  value={imageTarget}
                  ariaLabel="출력 형식"
                  options={imageTargets}
                  onChange={setImageTarget}
                />
              </Field>
              {imageTarget === 'jpg' || imageTarget === 'webp' ? (
                <RangeField
                  label="품질"
                  value={quality}
                  min={30}
                  max={95}
                  step={1}
                  format={(value) => `${value}%`}
                  onChange={setQuality}
                  disabled={busy}
                />
              ) : null}
              {imageTarget !== 'ico' ? (
                <SelectField
                  label="최대 크기 (리사이즈)"
                  value={maxEdge}
                  options={MAX_EDGE_OPTIONS}
                  onChange={setMaxEdge}
                  hint="비율을 유지한 채 긴 변만 줄입니다. 원본보다 키우지는 않습니다."
                  disabled={busy}
                />
              ) : null}
            </div>
          ) : null}

          {mode === 'toPdf' ? (
            <div className="stack-sm">
              <SelectField
                label="PDF 페이지 크기"
                value={pageSize}
                options={PAGE_SIZE_OPTIONS}
                onChange={(value) => setPageSize(value as PdfPageSize)}
                disabled={busy}
              />
              {pageSize !== 'auto' ? (
                <Field label="페이지 방향">
                  <Segmented<PdfOrientation>
                    value={orientation}
                    ariaLabel="페이지 방향"
                    options={ORIENTATION_OPTIONS}
                    onChange={setOrientation}
                    disabled={busy}
                  />
                </Field>
              ) : null}
              <SelectField
                label="페이지 여백"
                value={margin}
                options={MARGIN_OPTIONS}
                onChange={setMargin}
                hint="자동 크기에서는 이미지 둘레에 여백이 추가됩니다."
                disabled={busy}
              />
              <RangeField
                label="이미지 품질"
                value={quality}
                min={30}
                max={95}
                step={1}
                format={(value) => `${value}%`}
                onChange={setQuality}
                disabled={busy}
              />
              <SelectField
                label="최대 크기 (리사이즈)"
                value={maxEdge}
                options={MAX_EDGE_OPTIONS}
                onChange={setMaxEdge}
                disabled={busy}
              />
            </div>
          ) : null}

          {mode === 'fromPdf' ? (
            <div className="stack-sm">
              <Field label="이미지 형식">
                <Segmented<PdfImageTarget>
                  value={pdfTarget}
                  ariaLabel="이미지 형식"
                  options={pdfTargets}
                  onChange={setPdfTarget}
                  disabled={busy}
                />
              </Field>
              <SelectField
                label="렌더링 해상도"
                value={String(dpi)}
                options={DPI_OPTIONS}
                onChange={(value) => setDpi(Number(value))}
                disabled={busy}
              />
              {pdfTarget === 'jpg' || pdfTarget === 'webp' ? (
                <RangeField
                  label="품질"
                  value={quality}
                  min={30}
                  max={95}
                  step={1}
                  format={(value) => `${value}%`}
                  onChange={setQuality}
                  disabled={busy}
                />
              ) : null}
              <SelectField
                label="최대 크기 (리사이즈)"
                value={maxEdge}
                options={MAX_EDGE_OPTIONS}
                onChange={setMaxEdge}
                hint="비율을 유지한 채 긴 변만 줄입니다."
                disabled={busy}
              />
            </div>
          ) : null}

          {mode === 'pdfText' ? (
            <div className="stack-sm">
              <Toggle
                checked={pageSeparator}
                onChange={setPageSeparator}
                label="페이지 구분선 포함"
                hint="각 페이지 앞에 '===== 1 / 10 페이지 =====' 표시를 넣습니다."
              />
              <div className="field-hint">
                스캔한 이미지 PDF는 글자가 없어 텍스트로 바꿀 수 없습니다.
              </div>
            </div>
          ) : null}

          {mode === 'table' ? (
            <div className="stack-sm">
              <Field label="출력 형식">
                <Segmented<TableTarget>
                  value={tableTarget}
                  ariaLabel="표 출력 형식"
                  options={TABLE_TARGETS}
                  onChange={setTableTarget}
                  disabled={busy}
                />
              </Field>
              <SelectField
                label="CSV 구분자"
                value={delimiter}
                options={DELIMITER_OPTIONS}
                onChange={(value) => setDelimiter(value as CsvDelimiter)}
                hint="CSV를 읽고 쓸 때 사용하는 구분자입니다."
                disabled={busy}
              />
              <Toggle
                checked={coerce}
                onChange={setCoerce}
                label="숫자·참/거짓 자동 변환"
                hint="CSV → JSON에서 123, true 같은 값을 실제 숫자/불리언으로 저장합니다."
              />
              <Toggle
                checked={bom}
                onChange={setBom}
                label="Excel용 BOM 추가"
                hint="CSV를 Excel에서 열 때 한글이 깨지지 않도록 UTF-8 BOM을 붙입니다."
              />
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  )
}

import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Dropzone } from '../components/Dropzone'
import { FileList } from '../components/FileList'
import {
  AdvancedSettings,
  Field,
  PasswordField,
  SelectField,
} from '../components/Controls'
import { Progress } from '../components/Progress'
import { Alert, Note } from '../components/Feedback'
import { ResultPanel } from '../components/ResultPanel'
import { Icon } from '../components/Icons'
import {
  cancelArchiveJobs,
  extractArchive,
} from '../lib/archive-client'
import type { ExtractedEntry } from '../lib/archive-types'
import {
  baseName,
  extOf,
  safeFileName,
  stripExt,
} from '../lib/format'
import type { PickedSet } from '../lib/pick'
import {
  errorMessage,
  isAbortError,
  type OutputFile,
  type ProgressState,
} from '../lib/types'

interface ExtractResult {
  entries: ExtractedEntry[]
  directories: string[]
}

const ENCODINGS = [
  { value: 'auto', label: '자동 감지 (권장)' },
  { value: 'euc-kr', label: 'EUC-KR / CP949 (한국어)' },
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'shift_jis', label: 'Shift-JIS (일본어)' },
  { value: 'gbk', label: 'GBK (중국어)' },
]

export default function ExtractPage() {
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [encoding, setEncoding] = useState('auto')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ExtractResult | null>(null)

  const isZip = file ? extOf(file.name) === 'zip' : false

  const choose = (picked: PickedSet) => {
    const next = picked.files[0]?.file
    if (!next) return
    setFile(next)
    setResult(null)
    setError(null)
    setPassword('')
    setEncoding('auto')
  }

  const reset = () => {
    setFile(null)
    setResult(null)
    setProgress(null)
    setError(null)
    setPassword('')
    setEncoding('auto')
  }

  const handleExtract = async () => {
    if (!file) {
      setError('먼저 압축 파일을 선택해 주세요.')
      return
    }
    setBusy(true)
    setError(null)
    setProgress({ percent: 0, label: '압축 파일을 확인하는 중…' })
    try {
      const extracted = await extractArchive(
        file,
        {
          password: password || undefined,
          filenameEncoding: encoding === 'auto' ? undefined : encoding,
        },
        setProgress,
      )
      if (!extracted.entries.length && !extracted.directories.length) {
        throw new Error('압축 파일 안에 꺼낼 파일이 없습니다.')
      }
      setResult(extracted)
      setProgress(null)
    } catch (problem) {
      if (isAbortError(problem)) {
        setError('작업을 취소했습니다.')
      } else {
        setError(errorMessage(problem))
      }
      setProgress(null)
    } finally {
      setBusy(false)
    }
  }

  const cancel = () => {
    cancelArchiveJobs()
    setBusy(false)
    setProgress(null)
    setError('작업을 취소했습니다.')
  }

  if (result && file) {
    const outputs: OutputFile[] = result.entries.map((entry) => {
      const slash = entry.path.lastIndexOf('/')
      const folder = slash >= 0 ? entry.path.slice(0, slash) : ''
      return {
        name: baseName(entry.path),
        path: entry.path,
        blob: entry.blob,
        note: folder ? `${folder}/` : '루트',
      }
    })
    const zipName = `${safeFileName(stripExt(file.name), 'archive')}-extracted.zip`

    return (
      <div className="page">
        <PageHeader
          title="압축 풀기"
          desc="압축을 풀었습니다. 파일별로 받거나 폴더 구조를 살려 ZIP으로 한 번에 받으세요."
        />
        <div className="tool-grid is-wide">
          <div className="card">
            {outputs.length ? (
              <ResultPanel
                outputs={outputs}
                directories={result.directories}
                zipName={zipName}
                title={`${file.name} 풀기 결과`}
                onReset={reset}
                resetLabel="다른 파일 풀기"
                note="추출 작업은 브라우저 안에서 끝났습니다. 원본 압축 파일은 직접 삭제해 주세요."
              />
            ) : (
              <div className="stack-sm">
                <Alert tone="warn">
                  압축 파일 안에 꺼낼 파일은 없고 빈 폴더만 있습니다.
                </Alert>
                <button type="button" className="btn btn-ghost" onClick={reset}>
                  <Icon name="plus" />
                  다른 파일 풀기
                </button>
              </div>
            )}
            {result.directories.length ? (
              <div className="field-hint" style={{ marginTop: 10 }}>
                폴더 {result.directories.length}개 구조도 ZIP으로 묶을 때 함께
                보존됩니다.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        title="압축 풀기"
        desc={
          <>
            <strong>ZIP, 7Z</strong>는 물론 TAR, GZ, RAR 같은 형식도 7-Zip
            엔진으로 풉니다. 압축 파일은 서버로 전송되지 않습니다.
          </>
        }
      />

      <div className="tool-grid">
        <div className="stack">
          {file ? (
            <div className="card is-flush">
              <div className="card-head is-inset">
                <div>
                  <div className="card-title">선택한 압축 파일</div>
                  <div className="card-desc">
                    비밀번호가 걸려 있다면 오른쪽에서 입력하세요.
                  </div>
                </div>
                <span className="badge tone-accent">
                  {extOf(file.name).toUpperCase() || 'FILE'}
                </span>
              </div>
              <FileList
                items={[
                  {
                    id: file.name,
                    name: file.name,
                    sub: `${extOf(file.name).toUpperCase() || '파일'} · ${safeFileName(
                      stripExt(file.name),
                      'archive',
                    )}`,
                    size: file.size,
                    icon: 'archive',
                    tone: 'accent',
                  },
                ]}
                onRemove={reset}
              />
            </div>
          ) : null}

          <Dropzone
            icon="unarchive"
            title={
              <>
                압축 파일을 끌어다 놓거나 <em>클릭</em>하세요
              </>
            }
            hint="한 번에 하나의 압축 파일을 풉니다. 파일명이 깨진 ZIP은 7-Zip이나 반디집에서 다시 만들어 주세요."
            formats={['ZIP', '7Z', 'TAR', 'GZ', 'RAR', 'BZ2', 'XZ']}
            accept=".zip,.7z,.tar,.gz,.tgz,.bz2,.xz,.rar,.cab,.iso,.lzma,.zst"
            multiple={false}
            compact={Boolean(file)}
            disabled={busy}
            onFiles={choose}
            onError={setError}
          />

          {file ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={reset}
              disabled={busy}
            >
              <Icon name="x" />
              선택 해제
            </button>
          ) : (
            <Note>
              <strong>형식이 헷갈릴 때.</strong> 확장자가 ZIP이면 ZIP
              엔진을, 그 외에는 7-Zip 엔진을 먼저 사용합니다. 읽지 못하면
              다른 엔진으로 자동 재시도합니다.
            </Note>
          )}
        </div>

        <aside className="rail">
          <div className="card is-rail stack">
            <div className="spread">
              <div>
                <div className="card-title">압축 풀기 설정</div>
                <div className="card-desc">필요할 때만 비밀번호를 입력하세요.</div>
              </div>
              <Icon name="unlock" size={20} />
            </div>

            <Field
              label="비밀번호"
              hint="비밀번호가 없는 압축 파일은 비워 두세요."
            >
              <PasswordField
                value={password}
                onChange={setPassword}
                placeholder="비밀번호 (선택)"
                autoComplete="current-password"
                disabled={busy || !file}
              />
            </Field>

            {isZip ? (
              <AdvancedSettings title="고급 인코딩 설정">
                <SelectField
                  label="파일명 문자셋(인코딩)"
                  value={encoding}
                  options={ENCODINGS}
                  onChange={setEncoding}
                  hint="기본 자동 감지로 대부분 해결됩니다. 옛날 Windows에서 만든 한글 파일명이 깨질 때만 EUC-KR을 선택하세요."
                  disabled={busy}
                />
              </AdvancedSettings>
            ) : null}

            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              disabled={busy || !file}
              onClick={() => void handleExtract()}
            >
              <Icon name="unarchive" />
              {busy ? '푸는 중…' : '압축 풀기'}
            </button>

            {busy && progress ? (
              <Progress
                percent={progress.percent}
                label={progress.label}
                onCancel={cancel}
              />
            ) : null}

            {error ? <Alert>{error}</Alert> : null}

            <Note>
              <strong>안전한 경로만 사용.</strong> 압축 파일 안의{' '}
              <code>..</code> 같은 경로는 제거해, 의도하지 않은 위치에 파일을
              쓰지 않습니다.
            </Note>
          </div>
        </aside>
      </div>
    </div>
  )
}

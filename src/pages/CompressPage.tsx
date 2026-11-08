import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Dropzone } from '../components/Dropzone'
import { FileList, type FileListItem } from '../components/FileList'
import {
  AdvancedSettings,
  Field,
  PasswordField,
  Segmented,
  Toggle,
} from '../components/Controls'
import { Progress } from '../components/Progress'
import { Alert, Note } from '../components/Feedback'
import { ResultPanel } from '../components/ResultPanel'
import { Icon, type IconName } from '../components/Icons'
import { cancelArchiveJobs, createArchive } from '../lib/archive-client'
import type { ArchiveFormat, ArchiveLevel } from '../lib/archive-types'
import { ensureExtension, fileKind, todayStamp } from '../lib/format'
import { mergeDirectories, mergeFiles } from '../lib/files'
import type { PickedSet } from '../lib/pick'
import {
  errorMessage,
  isAbortError,
  type OutputFile,
  type PickedFile,
  type ProgressState,
} from '../lib/types'

function fileIcon(name: string): IconName {
  const kind = fileKind(name)
  if (kind === 'pdf') return 'pdf'
  if (kind === 'image') return 'image'
  if (kind === 'archive') return 'archive'
  return 'file'
}

export default function CompressPage() {
  const [files, setFiles] = useState<PickedFile[]>([])
  const [directories, setDirectories] = useState<string[]>([])
  const [format, setFormat] = useState<ArchiveFormat>('zip')
  const [level, setLevel] = useState<ArchiveLevel>(5)
  const [name, setName] = useState(`archive-${todayStamp()}`)
  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [zipCrypto, setZipCrypto] = useState(false)
  const [headerEncryption, setHeaderEncryption] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [outputs, setOutputs] = useState<OutputFile[]>([])

  const totalCount = files.length + directories.length

  const handleAdd = (picked: PickedSet) => {
    setError(null)
    setFiles((current) => mergeFiles(current, picked.files))
    setDirectories((current) =>
      mergeDirectories(current, picked.directories),
    )
  }

  const items: FileListItem[] = files.map((item) => {
    const slash = item.path.lastIndexOf('/')
    return {
      id: item.path,
      name: item.file.name,
      sub: slash >= 0 ? item.path.slice(0, slash) : '루트',
      size: item.file.size,
      icon: fileIcon(item.file.name),
    }
  })

  const reset = () => {
    setFiles([])
    setDirectories([])
    setOutputs([])
    setError(null)
    setProgress(null)
    setName(`archive-${todayStamp()}`)
  }

  const validate = (): string | null => {
    if (!totalCount) return '압축할 파일이나 폴더를 먼저 추가해 주세요.'
    if (usePassword && !password) return '사용할 비밀번호를 입력해 주세요.'
    if (usePassword && password !== confirm) {
      return '비밀번호와 비밀번호 확인이 일치하지 않습니다.'
    }
    if (format === 'zip' && password.length > 128) {
      return 'ZIP 비밀번호는 128자 이하로 입력해 주세요.'
    }
    return null
  }

  const handleCreate = async () => {
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    setProgress({ percent: 0, label: '압축 준비 중…' })
    try {
      const blob = await createArchive(
        files,
        format === 'zip' ? directories : [],
        {
          format,
          level,
          password: usePassword ? password : undefined,
          zipCrypto: format === 'zip' ? zipCrypto : undefined,
          headerEncryption:
            format === '7z' ? headerEncryption : undefined,
        },
        setProgress,
      )
      const base = name.replace(/\.(zip|7z)$/i, '')
      const fileName = ensureExtension(base || 'archive', format)
      const encryption = usePassword
        ? format === 'zip'
          ? zipCrypto
            ? 'ZipCrypto'
            : 'AES-256'
          : headerEncryption
            ? '7Z + 헤더 암호화'
            : '7Z 암호화'
        : '암호화 없음'
      setOutputs([
        {
          name: fileName,
          blob,
          note: `${files.length}개 파일${directories.length ? ` · 빈 폴더 ${directories.length}개` : ''} · ${encryption}`,
        },
      ])
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

  if (outputs.length) {
    return (
      <div className="page">
        <PageHeader
          title="압축 만들기"
          desc="압축 파일이 만들어졌습니다. 다운로드한 뒤 원본 파일은 직접 정리해 주세요."
        />
        <div className="tool-grid is-wide">
          <div className="card">
            <ResultPanel
              outputs={outputs}
              onReset={reset}
              note={
                usePassword
                  ? '비밀번호는 어디에도 저장되지 않습니다. 잃어버리면 복구할 수 없으니 안전한 곳에 보관해 주세요.'
                  : '압축은 전부 이 브라우저 안에서 처리되었습니다.'
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
        title="압축 만들기"
        desc={
          <>
            여러 파일과 폴더를 <strong>ZIP</strong> 또는{' '}
            <strong>7Z</strong>로 묶습니다. 비밀번호를 걸어도 파일은 서버로
            전송되지 않습니다.
          </>
        }
      />

      <div className="tool-grid">
        <div className="stack">
          <Dropzone
            icon="archive"
            title={
              <>
                파일을 끌어다 놓거나 <em>클릭</em>하세요
              </>
            }
            hint="폴더째 끌어다 놓으면 안의 구조를 그대로 살려 압축합니다."
            formats={['ZIP', '7Z', '모든 파일', '빈 폴더']}
            folders
            compact={totalCount > 0}
            disabled={busy}
            onFiles={handleAdd}
            onError={setError}
          />

          {totalCount > 0 ? (
            <div className="card is-flush">
              <div className="card-head is-inset">
                <div>
                  <div className="card-title">압축할 항목</div>
                  <div className="card-desc">
                    끌어서 순서를 바꿀 수 있습니다. 파일 경로는 그대로
                    유지됩니다.
                  </div>
                </div>
                <span className="badge tone-accent">{totalCount}개</span>
              </div>
              <FileList
                items={items}
                onRemove={(id) =>
                  setFiles((current) =>
                    current.filter((item) => item.path !== id),
                  )
                }
                onReorder={(from, to) =>
                  setFiles((current) => {
                    const next = [...current]
                    const [moved] = next.splice(from, 1)
                    next.splice(to, 0, moved)
                    return next
                  })
                }
                onClear={() => {
                  setFiles([])
                  setDirectories([])
                }}
                footer={
                  directories.length ? (
                    <span className="chip is-accent">
                      빈 폴더 {directories.length}개
                    </span>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Note>
              <strong>폴더 구조도 그대로.</strong> 폴더를 끌어다 놓으면 하위
              폴더와 파일 경로가 압축 파일 안에 유지됩니다. ZIP은 빈 폴더도
              함께 담습니다.
            </Note>
          )}
        </div>

        <aside className="rail">
          <div className="card is-rail stack">
            <div className="spread">
              <div>
                <div className="card-title">압축 설정</div>
                <div className="card-desc">형식과 보안 방식을 선택하세요.</div>
              </div>
              <Icon name="archive" size={20} />
            </div>

            <Field label="파일 이름">
              <div className="row" style={{ gap: 6 }}>
                <input
                  className="input"
                  value={name}
                  placeholder="archive"
                  disabled={busy}
                  onChange={(event) => setName(event.target.value)}
                />
                <span className="chip">.{format}</span>
              </div>
            </Field>

            <Field label="형식">
              <Segmented<ArchiveFormat>
                value={format}
                ariaLabel="압축 형식"
                options={[
                  { value: 'zip', label: 'ZIP' },
                  { value: '7z', label: '7Z' },
                ]}
                onChange={(next) => {
                  setFormat(next)
                  setZipCrypto(false)
                  setHeaderEncryption(false)
                }}
              />
            </Field>

            <Toggle
              checked={usePassword}
              onChange={(next) => {
                setUsePassword(next)
                if (!next) {
                  setPassword('')
                  setConfirm('')
                }
              }}
              label="비밀번호 설정"
              hint="받는 사람만 열 수 있도록 안전하게 암호화합니다."
            />

            {usePassword ? (
              <div className="stack-sm">
                <PasswordField
                  value={password}
                  onChange={setPassword}
                  placeholder="사용할 비밀번호"
                  disabled={busy}
                />
                <PasswordField
                  value={confirm}
                  onChange={setConfirm}
                  placeholder="비밀번호 확인"
                  disabled={busy}
                  ariaLabel="비밀번호 확인"
                />
              </div>
            ) : null}

            <AdvancedSettings title="고급 압축 설정">
              <Field
                label="압축 수준"
                hint="기본 '표준'을 권장합니다. 높을수록 시간은 더 걸리지만 용량이 줄어듭니다."
              >
                <Segmented<ArchiveLevel>
                  value={level}
                  ariaLabel="압축 수준"
                  options={[
                    { value: 0, label: '저장' },
                    { value: 1, label: '빠르게' },
                    { value: 5, label: '표준' },
                    { value: 9, label: '최대' },
                  ]}
                  onChange={setLevel}
                />
              </Field>

              {usePassword ? (
                format === 'zip' ? (
                  <Toggle
                    checked={zipCrypto}
                    onChange={setZipCrypto}
                    label="구형 압축 호환 (ZipCrypto)"
                    hint="매우 오래된 Windows 기본 압축 프로그램 호환용입니다. (보안성 낮음)"
                    disabled={busy}
                  />
                ) : (
                  <Toggle
                    checked={headerEncryption}
                    onChange={setHeaderEncryption}
                    label="파일 목록(이름)도 암호화"
                    hint="비밀번호를 입력하기 전에는 파일 이름도 볼 수 없게 숨깁니다."
                    disabled={busy}
                  />
                )
              ) : null}
            </AdvancedSettings>

            {format === 'zip' && usePassword && !zipCrypto ? (
              <div className="field-hint">
                Windows 탐색기 기본 기능으로는 AES ZIP을 열지 못할 수
                있습니다. 7-Zip이나 반디집을 권장합니다.
              </div>
            ) : null}
            {format === '7z' && directories.length ? (
              <div className="field-hint is-warn">
                7Z는 빈 폴더를 압축 파일에 담지 않을 수 있습니다.
              </div>
            ) : null}

            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              disabled={busy || !totalCount}
              onClick={() => void handleCreate()}
            >
              <Icon name="archive" />
              {busy ? '압축하는 중…' : `${format.toUpperCase()}로 압축하기`}
            </button>

            {busy && progress ? (
              <Progress
                percent={progress.percent}
                label={progress.label}
                onCancel={cancel}
              />
            ) : null}

            {error ? <Alert>{error}</Alert> : null}
          </div>
        </aside>
      </div>
    </div>
  )
}

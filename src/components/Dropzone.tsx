import {
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { Icon, type IconName } from './Icons'
import { fromFileList, readDataTransfer, type PickedSet } from '../lib/pick'

export function Dropzone({
  icon = 'upload',
  title,
  hint,
  formats,
  accept,
  multiple = true,
  folders = false,
  compact = false,
  disabled = false,
  onFiles,
  onError,
}: {
  icon?: IconName
  title: ReactNode
  hint?: ReactNode
  formats?: string[]
  accept?: string
  multiple?: boolean
  folders?: boolean
  compact?: boolean
  disabled?: boolean
  onFiles: (picked: PickedSet) => void
  onError?: (message: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const depth = useRef(0)
  const [dragging, setDragging] = useState(false)

  const openFiles = () => {
    if (!disabled) fileRef.current?.click()
  }

  const openFolder = () => {
    if (!disabled) folderRef.current?.click()
  }

  // Hidden inputs are opened programmatically; their click event would
  // otherwise bubble to the dropzone and open the file picker as well.
  const stopInputClick = (event: MouseEvent<HTMLInputElement>) => {
    event.stopPropagation()
  }

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    depth.current += 1
    setDragging(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    depth.current = Math.max(0, depth.current - 1)
    if (depth.current === 0) setDragging(false)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    depth.current = 0
    setDragging(false)
    if (disabled) return
    const transfer = event.dataTransfer
    if (!transfer?.files?.length) return

    void (async () => {
      try {
        const picked = await readDataTransfer(transfer)
        if (!picked.files.length && !picked.directories.length) {
          onError?.('파일을 찾지 못했습니다. 다시 시도해 주세요.')
          return
        }
        onFiles(picked)
      } catch (error) {
        onError?.(
          error instanceof Error
            ? error.message
            : '끌어온 파일을 읽지 못했습니다.',
        )
      }
    })()
  }

  return (
    <div
      className={`dropzone${compact ? ' is-compact' : ''}${
        dragging ? ' is-drag' : ''
      }`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={openFiles}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          openFiles()
        }
      }}
      onDragEnter={handleDragEnter}
      onDragOver={(event) => {
        if (disabled) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="dz-icon">
        <Icon name={icon} />
      </div>
      <div className="dz-title">{title}</div>
      {hint ? <div className="dz-hint">{hint}</div> : null}
      {formats?.length ? (
        <div className="dz-formats">
          {formats.map((format) => (
            <span className="chip" key={format}>
              {format}
            </span>
          ))}
        </div>
      ) : null}
      {folders ? (
        <button
          type="button"
          className="btn btn-sm dz-folder"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation()
            openFolder()
          }}
        >
          <Icon name="folder-plus" />
          폴더 선택
        </button>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onClick={stopInputClick}
        onChange={(event) => {
          // Snapshot before resetting: assigning `value` clears the live FileList.
          const list = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ''
          if (list.length) onFiles(fromFileList(list))
        }}
      />
      {folders ? (
        <input
          ref={folderRef}
          type="file"
          multiple
          disabled={disabled}
          onClick={stopInputClick}
          {...({ webkitdirectory: '' } as Record<string, string>)}
          onChange={(event) => {
            const list = Array.from(event.currentTarget.files ?? [])
            event.currentTarget.value = ''
            if (list.length) onFiles(fromFileList(list))
          }}
        />
      ) : null}
    </div>
  )
}

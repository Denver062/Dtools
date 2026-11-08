import { Icon } from './Icons'

export function Progress({
  percent,
  label,
  onCancel,
}: {
  percent: number | null
  label: string
  onCancel?: () => void
}) {
  return (
    <div className="progress-wrap">
      <div className="progress-label">
        <span className="truncate">{label}</span>
        <span className="row" style={{ gap: 4 }}>
          <span className="pct">
            {percent === null ? '진행 중' : `${Math.round(percent)}%`}
          </span>
          {onCancel ? (
            <button
              type="button"
              className="icon-btn"
              style={{ width: 24, height: 24 }}
              aria-label="작업 취소"
              title="취소"
              onClick={onCancel}
            >
              <Icon name="x" />
            </button>
          ) : null}
        </span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent === null ? undefined : Math.round(percent)}
      >
        <div
          className={`progress-bar${percent === null ? ' is-indeterminate' : ''}`}
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

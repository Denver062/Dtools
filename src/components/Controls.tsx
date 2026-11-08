import {
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { Icon } from './Icons'

export function Field({
  label,
  value,
  hint,
  hintTone,
  children,
  className = '',
}: {
  label?: ReactNode
  value?: ReactNode
  hint?: ReactNode
  hintTone?: 'warn' | 'danger'
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`field ${className}`.trim()}>
      {label ? (
        <div className="field-label">
          <span>{label}</span>
          {value !== undefined ? <span className="value">{value}</span> : null}
        </div>
      ) : null}
      {children}
      {hint ? (
        <div
          className={`field-hint${hintTone ? ` is-${hintTone}` : ''}`}
        >
          {hint}
        </div>
      ) : null}
    </div>
  )
}

export function PasswordField({
  value,
  onChange,
  placeholder = '비밀번호',
  autoComplete = 'new-password',
  disabled = false,
  ariaLabel = '비밀번호',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: string
  disabled?: boolean
  ariaLabel?: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="pw-wrap">
      <input
        className="input"
        type={visible ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setVisible(!visible)}
        aria-label={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
        disabled={disabled}
      >
        <Icon name={visible ? 'eye-off' : 'eye'} size={16} />
      </button>
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  hint?: ReactNode
  disabled?: boolean
}) {
  return (
    <label className={`toggle-row${disabled ? ' is-disabled' : ''}`}>
      <span className="toggle-info">
        <span className="toggle-label">{label}</span>
        {hint ? <span className="toggle-hint">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        className="toggle-input"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
    </label>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  value: T
  options: { value: T; label: ReactNode; hint?: string }[]
  onChange: (value: T) => void
  disabled?: boolean
  ariaLabel?: string
}) {
  return (
    <div
      className="segmented"
      role="radiogroup"
      aria-label={ariaLabel}
      data-count={options.length}
    >
      {options.map((option) => {
        const checked = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={checked}
            className={`segmented-item${checked ? ' is-active' : ''}`}
            disabled={disabled}
            title={option.hint}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (current) => String(current),
  disabled = false,
}: {
  label: ReactNode
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  format?: (value: number) => string
  disabled?: boolean
}) {
  const fill = ((value - min) / Math.max(1, max - min)) * 100
  return (
    <Field label={label} value={format(value)}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={typeof label === 'string' ? label : undefined}
        style={{ '--fill': `${fill}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Field>
  )
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  hint,
  hintTone,
  disabled = false,
}: {
  label: ReactNode
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  hint?: ReactNode
  hintTone?: 'warn' | 'danger'
  disabled?: boolean
}) {
  return (
    <Field label={label} hint={hint} hintTone={hintTone}>
      <select
        className="select"
        value={value}
        disabled={disabled}
        aria-label={typeof label === 'string' ? label : undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

export function AdvancedSettings({
  title = '고급 설정',
  children,
  defaultOpen = false,
}: {
  title?: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`advanced-box${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="advanced-box-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="advanced-box-label">
          <Icon name="sparkles" size={14} />
          {title}
        </span>
        <span className="advanced-box-arrow">
          <Icon name={open ? 'up' : 'down'} size={14} />
        </span>
      </button>
      {open ? <div className="advanced-box-body stack-sm">{children}</div> : null}
    </div>
  )
}

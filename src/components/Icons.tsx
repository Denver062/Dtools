import type { JSX } from 'react'

export type IconName =
  | 'archive'
  | 'unarchive'
  | 'folder'
  | 'folder-plus'
  | 'file'
  | 'pdf'
  | 'merge'
  | 'split'
  | 'compress'
  | 'convert'
  | 'lock'
  | 'unlock'
  | 'download'
  | 'trash'
  | 'plus'
  | 'x'
  | 'menu'
  | 'sun'
  | 'moon'
  | 'shield'
  | 'check'
  | 'alert'
  | 'info'
  | 'eye'
  | 'eye-off'
  | 'grip'
  | 'up'
  | 'down'
  | 'arrow-right'
  | 'upload'
  | 'image'
  | 'sparkles'
  | 'external'
  | 'layers'

const PATHS: Record<IconName, JSX.Element> = {
  archive: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2.4" />
      <path d="M3 7l2.4-3h13.2L21 7" />
      <path d="M9.5 12h5" />
    </>
  ),
  unarchive: (
    <>
      <rect x="3" y="9" width="18" height="11" rx="2.4" />
      <path d="M3 9l2.4-3h13.2L21 9" />
      <path d="M12 20v-6" />
      <path d="m9 16 3-3 3 3" />
    </>
  ),
  folder: (
    <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.2l1.6 2h8.2a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
  ),
  'folder-plus': (
    <>
      <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.2l1.6 2h8.2a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <path d="M12 11v5M9.5 13.5h5" />
    </>
  ),
  file: (
    <>
      <path d="M13.5 3H6.8A1.8 1.8 0 0 0 5 4.8v14.4A1.8 1.8 0 0 0 6.8 21h10.4a1.8 1.8 0 0 0 1.8-1.8V8z" />
      <path d="M13.5 3v5h5.5" />
    </>
  ),
  pdf: (
    <>
      <path d="M13.5 3H6.8A1.8 1.8 0 0 0 5 4.8v14.4A1.8 1.8 0 0 0 6.8 21h10.4a1.8 1.8 0 0 0 1.8-1.8V8z" />
      <path d="M13.5 3v5h5.5" />
      <path d="M8.3 16.6h1.5a1.15 1.15 0 0 0 0-2.3H8.3v3.9M13.3 14.3h1.6" />
    </>
  ),
  merge: (
    <>
      <rect x="7.5" y="2.8" width="9" height="12" rx="1.6" />
      <rect x="7.5" y="9.2" width="9" height="12" rx="1.6" />
      <path d="M3.5 8v8" />
    </>
  ),
  split: (
    <>
      <rect x="4" y="3" width="7" height="18" rx="1.6" />
      <path d="M14 8h3.5M14 16h3.5" />
      <path d="m16 5.5 3 2.5-3 2.5M16 13.5l3 2.5-3 2.5" />
    </>
  ),
  compress: (
    <>
      <path d="M4 4v4h4M20 4v4h-4M4 20v-4h4M20 20v-4h-4" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  convert: (
    <>
      <path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.4" />
      <path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7" />
      <path d="M12 15v2" />
    </>
  ),
  unlock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.4" />
      <path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 6.9-2.1" />
      <path d="M12 15v2" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.5v11" />
      <path d="m7.5 10 4.5 4.5 4.5-4.5" />
      <path d="M4.5 17.5v1.2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-1.2" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.5h15" />
      <path d="M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
      <path d="M6.5 6.5l.9 12.2a1.8 1.8 0 0 0 1.8 1.8h5.6a1.8 1.8 0 0 0 1.8-1.8l.9-12.2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
    </>
  ),
  moon: <path d="M20 14.5a8.2 8.2 0 0 1-10.5-10.4 8.5 8.5 0 1 0 10.5 10.4z" />,
  shield: (
    <>
      <path d="M12 3 5 6v5.4c0 4.3 2.9 7.6 7 9.6 4.1-2 7-5.3 7-9.6V6z" />
      <path d="m9.2 12 2 2 3.6-3.8" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 6.5" />,
  alert: (
    <>
      <path d="M12 3.5 21 20H3z" />
      <path d="M12 9.5v4.5M12 17.2v.1" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.2M12 7.8v.1" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M4 4l16 16" />
      <path d="M9.2 6.2A10.6 10.6 0 0 1 12 5.8c6 0 9.5 6.2 9.5 6.2a17 17 0 0 1-2.7 3.5M6.2 7.4A17.6 17.6 0 0 0 2.5 12S6 18.2 12 18.2a10 10 0 0 0 4-.8" />
      <path d="M10 10a3 3 0 0 0 4 4" />
    </>
  ),
  grip: (
    <>
      <circle cx="9" cy="6" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="18" r="1" />
    </>
  ),
  up: <path d="m6 14 6-6 6 6" />,
  down: <path d="m6 10 6 6 6-6" />,
  'arrow-right': <path d="M4 12h15m-5-5 5 5-5 5" />,
  upload: (
    <>
      <path d="M12 20V9" />
      <path d="m7.5 13 4.5-4.5 4.5 4.5" />
      <path d="M4.5 6.5V5.3a1.8 1.8 0 0 1 1.8-1.8h11.4a1.8 1.8 0 0 1 1.8 1.8v1.2" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.2" />
      <circle cx="9" cy="9.5" r="1.5" />
      <path d="m4.5 17 4.6-4.6 3.4 3.4 2.6-2.6 4.4 4.4" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3.5l1.5 4.2 4.2 1.5-4.2 1.5L12 15l-1.5-4.3-4.2-1.5 4.2-1.5z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6M20 4l-8.5 8.5" />
      <path d="M18.5 13.5v5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h5" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 8.5 4.5L12 12 3.5 7.5z" />
      <path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5" />
    </>
  ),
}

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName
  size?: number
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}

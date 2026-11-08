import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ComponentType,
} from 'react'
import { BrandMark } from './components/BrandMark'
import { Icon, type IconName } from './components/Icons'

const HomePage = lazy(() => import('./pages/HomePage'))
const CompressPage = lazy(() => import('./pages/CompressPage'))
const ExtractPage = lazy(() => import('./pages/ExtractPage'))
const MergePdfPage = lazy(() => import('./pages/MergePdfPage'))
const SplitPdfPage = lazy(() => import('./pages/SplitPdfPage'))
const CompressPdfPage = lazy(() => import('./pages/CompressPdfPage'))
const ConvertPage = lazy(() => import('./pages/ConvertPage'))

type Theme = 'dark' | 'light'

interface NavItem {
  path: string
  label: string
  icon: IconName
}

const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: '보관함',
    items: [
      { path: '/compress', label: '압축 만들기', icon: 'archive' },
      { path: '/extract', label: '압축 풀기', icon: 'unarchive' },
    ],
  },
  {
    label: 'PDF',
    items: [
      { path: '/pdf/merge', label: 'PDF 합치기', icon: 'merge' },
      { path: '/pdf/split', label: 'PDF 나누기', icon: 'split' },
      { path: '/pdf/compress', label: 'PDF 압축', icon: 'compress' },
    ],
  },
  {
    label: '변환',
    items: [{ path: '/convert', label: '파일 변환', icon: 'convert' }],
  },
]

const PAGES: Record<string, ComponentType> = {
  '/': HomePage,
  '/compress': CompressPage,
  '/extract': ExtractPage,
  '/pdf/merge': MergePdfPage,
  '/pdf/split': SplitPdfPage,
  '/pdf/compress': CompressPdfPage,
  '/convert': ConvertPage,
}

const ALL_ITEMS = NAV.flatMap((group) => group.items)

function readPath(): string {
  const raw = window.location.hash.replace(/^#/, '')
  if (!raw) return '/'
  const path = raw.split('?')[0]
  return path.startsWith('/') ? path.replace(/\/+$/, '') || '/' : `/${path}`
}

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem('dtools-theme')
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    /* storage can be blocked */
  }
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

function Navigation({
  path,
  onNavigate,
}: {
  path: string
  onNavigate?: () => void
}) {
  return (
    <nav className="nav" aria-label="도구 목록">
      {NAV.map((group) => (
        <div className="nav-group" key={group.label}>
          <div className="nav-label">{group.label}</div>
          <div className="nav-items">
            {group.items.map((item) => {
              const active = path === item.path
              return (
                <a
                  key={item.path}
                  className={`nav-item${active ? ' is-active' : ''}`}
                  href={`#${item.path}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={onNavigate}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </a>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

function LocalBadge() {
  return (
    <div className="local-badge">
      <Icon name="shield" />
      <div>
        <strong>100% 로컬 처리</strong>
        <span className="local-badge-desc">파일이 서버로 전송되지 않습니다.</span>
      </div>
    </div>
  )
}

function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: Theme
  onToggle: () => void
}) {
  const dark = theme === 'dark'
  return (
    <button type="button" className="theme-toggle" onClick={onToggle}>
      <span className="row">
        <Icon name={dark ? 'sun' : 'moon'} />
        <span className="theme-toggle-label">
          {dark ? '라이트 모드' : '다크 모드'}
        </span>
      </span>
      <span className="chip">{dark ? 'DARK' : 'LIGHT'}</span>
    </button>
  )
}

function NotFoundPage() {
  return (
    <div className="page">
      <div className="card stack">
        <div className="empty">
          <Icon name="alert" />
          <div>
            <div className="card-title">페이지를 찾을 수 없습니다</div>
            <div className="card-desc">주소가 바뀌었거나 없는 도구입니다.</div>
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'center' }}>
          <a className="btn btn-primary" href="#/">
            <Icon name="arrow-right" />
            홈으로 돌아가기
          </a>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [path, setPath] = useState(readPath)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    const onHashChange = () => setPath(readPath())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (meta) meta.content = theme === 'dark' ? '#0e1119' : '#f5f8ff'
    try {
      localStorage.setItem('dtools-theme', theme)
    } catch {
      /* storage can be blocked */
    }
  }, [theme])

  useEffect(() => {
    setDrawerOpen(false)
    window.scrollTo(0, 0)
    const item = ALL_ITEMS.find((entry) => entry.path === path)
    document.title =
      path === '/'
        ? 'Dtools — 브라우저에서 끝나는 파일 도구'
        : `${item?.label ?? '페이지를 찾을 수 없음'} — Dtools`
  }, [path])

  useEffect(() => {
    if (!drawerOpen) return
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [drawerOpen])

  const Page = PAGES[path]
  const toggleTheme = () => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/">
          <BrandMark />
        </a>

        <div className="topbar-nav">
          <Navigation path={path} />
        </div>

        <div className="topbar-actions">
          <LocalBadge />
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button
            type="button"
            className="icon-btn menu-btn"
            aria-label="메뉴 열기"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <Icon name="menu" />
          </button>
        </div>
      </header>

      <div className="main">
        <Suspense
          fallback={
            <div className="page">
              <div className="card">
                <div className="empty">
                  <Icon name="layers" />
                  <span>도구를 불러오는 중…</span>
                </div>
              </div>
            </div>
          }
        >
          {Page ? <Page /> : <NotFoundPage />}
        </Suspense>

        <footer className="footer">
          <span>
            <b>Dtools</b> · 파일은 브라우저를 떠나지 않습니다.
          </span>
          <div className="footer-links">
            <a href="#/compress">압축</a>
            <a href="#/extract">압축 풀기</a>
            <a href="#/pdf/merge">PDF</a>
            <a href="#/convert">변환</a>
            <span>v1.0</span>
          </div>
        </footer>
      </div>

      <div className={`drawer${drawerOpen ? ' is-open' : ''}`} aria-hidden={!drawerOpen}>
        <div className="spread">
          <a className="brand" href="#/" onClick={() => setDrawerOpen(false)}>
            <BrandMark />
          </a>
          <button
            type="button"
            className="icon-btn"
            aria-label="메뉴 닫기"
            onClick={() => setDrawerOpen(false)}
          >
            <Icon name="x" />
          </button>
        </div>

        <Navigation path={path} onNavigate={() => setDrawerOpen(false)} />

        <div className="sidebar-foot">
          <LocalBadge />
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </div>

      <button
        type="button"
        className={`backdrop${drawerOpen ? ' is-open' : ''}`}
        aria-label="메뉴 닫기"
        tabIndex={drawerOpen ? 0 : -1}
        onClick={() => setDrawerOpen(false)}
      />
    </div>
  )
}

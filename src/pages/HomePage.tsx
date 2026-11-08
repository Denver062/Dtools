import { Icon, type IconName } from '../components/Icons'

interface ToolCard {
  href: string
  icon: IconName
  name: string
  desc: string
  formats: string[]
}

const TOOLS: ToolCard[] = [
  {
    href: '/compress/',
    icon: 'archive',
    name: '압축 만들기',
    desc: '파일과 폴더를 ZIP 또는 7Z로 묶고, AES-256 비밀번호를 걸 수 있습니다.',
    formats: ['ZIP', '7Z', 'AES-256'],
  },
  {
    href: '/extract/',
    icon: 'unarchive',
    name: '압축 풀기',
    desc: 'ZIP, 7Z는 물론 TAR, GZ, RAR까지. 한글 파일명 인코딩도 선택할 수 있습니다.',
    formats: ['ZIP', '7Z', 'RAR', 'TAR'],
  },
  {
    href: '/pdf/merge/',
    icon: 'merge',
    name: 'PDF 합치기',
    desc: '여러 PDF를 순서대로 하나로 합칩니다. 텍스트와 링크를 그대로 보존합니다.',
    formats: ['PDF', '페이지 순서'],
  },
  {
    href: '/pdf/split/',
    icon: 'split',
    name: 'PDF 나누기',
    desc: '페이지 범위를 직접 지정하거나 N페이지마다 자동으로 나눕니다.',
    formats: ['PDF', '범위 지정'],
  },
  {
    href: '/pdf/compress/',
    icon: 'compress',
    name: 'PDF 압축',
    desc: '무손실 구조 정리부터 이미지 기반 강한 압축까지. 원본보다 커지면 원본을 유지합니다.',
    formats: ['PDF', '무손실', '이미지'],
  },
  {
    href: '/convert/',
    icon: 'convert',
    name: '파일 변환',
    desc: '이미지 변환과 PDF 만들기, PDF 텍스트 추출, CSV ↔ JSON 표 변환까지 한 곳에서 처리합니다.',
    formats: ['JPG', 'PNG', 'BMP', 'TXT', 'CSV'],
  },
]

export default function HomePage() {
  return (
    <div className="page">
      <section className="home-hero">
        <div className="hero-copy">
          <h1 className="hero-title">
            파일은 <em>여기서</em>,
            <br />
            브라우저 안에서.
          </h1>
          <p className="hero-desc">
            압축부터 PDF 합치기·나누기·압축, 이미지 변환까지. 파일이 서버로
            업로드되지 않아 <strong>민감한 문서도 안심</strong>하고 다룰 수
            있습니다.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary btn-lg" href="/compress/">
              <Icon name="archive" />
              압축 만들기
            </a>
            <a className="btn btn-ghost btn-lg" href="/pdf/merge/">
              PDF 합치기
              <Icon name="arrow-right" />
            </a>
          </div>
          <div className="hero-note">
            <Icon name="shield" />
            업로드 0 B · 설치 없음 · 무료
          </div>
        </div>

        <div className="home-visual" aria-hidden="true">
          <div className="visual-bar">
            <span className="visual-dots">
              <span />
              <span />
              <span />
            </span>
            <span>dtools.local</span>
            <span className="badge tone-accent">100% 로컬</span>
          </div>
          <div className="visual-rows">
            <div className="visual-row">
              <span className="file-badge tone-accent">
                <Icon name="archive" />
              </span>
              <div className="file-main">
                <div className="file-name">여행 사진.zip</div>
                <div className="file-sub">1.8 GB · AES-256</div>
              </div>
              <span className="chip">ZIP</span>
            </div>
            <div className="visual-row">
              <span className="file-badge tone-accent">
                <Icon name="pdf" />
              </span>
              <div className="file-main">
                <div className="file-name">계약서_병합.pdf</div>
                <div className="file-sub">24페이지 · 3.1 MB</div>
              </div>
              <span className="chip">PDF</span>
            </div>
            <div className="visual-row">
              <span className="file-badge tone-accent">
                <Icon name="image" />
              </span>
              <div className="file-main">
                <div className="file-name">프로필.webp</div>
                <div className="file-sub">1200×1200 · 84 KB</div>
              </div>
              <span className="chip">WebP</span>
            </div>
          </div>
          <div className="visual-meter">
            <span className="row" style={{ gap: 6 }}>
              <Icon name="shield" size={13} />
              서버 업로드
            </span>
            <b>0 B</b>
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="section-head">
          <div>
            <h2 className="section-title">필요한 도구만 골라 쓰세요</h2>
            <p className="section-desc">
              모든 도구가 같은 원칙으로 동작합니다. 파일은 내 기기를 떠나지
              않습니다.
            </p>
          </div>
          <span className="badge tone-accent">6개 도구 · 무료</span>
        </div>
        <div className="tool-cards">
          {TOOLS.map((tool) => (
            <a className="tool-card" href={tool.href} key={tool.href}>
              <span className="tool-card-icon">
                <Icon name={tool.icon} />
              </span>
              <h3>{tool.name}</h3>
              <p>{tool.desc}</p>
              <span className="tool-card-foot">
                <span
                  className="dz-formats"
                  style={{ margin: 0, justifyContent: 'flex-start' }}
                >
                  {tool.formats.map((format) => (
                    <span className="chip" key={format}>
                      {format}
                    </span>
                  ))}
                </span>
                <Icon name="arrow-right" className="tool-card-arrow" />
              </span>
            </a>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="section-head">
          <div>
            <h2 className="section-title">왜 Dtools인가요?</h2>
            <p className="section-desc">
              온라인 변환 사이트에 파일을 올리는 대신, 브라우저의 성능을
              그대로 씁니다.
            </p>
          </div>
        </div>
        <div className="feature-grid">
          <div className="feature">
            <span className="feature-icon">
              <Icon name="shield" />
            </span>
            <h3>서버가 없습니다</h3>
            <p>
              업로드도, 계정도, 보관함도 없습니다. 파일과 비밀번호는 브라우저
              메모리 안에서만 사용됩니다.
            </p>
          </div>
          <div className="feature">
            <span className="feature-icon">
              <Icon name="layers" />
            </span>
            <h3>호환성을 먼저</h3>
            <p>
              ZIP AES와 7Z, TAR·GZ·RAR 읽기, 한글 파일명 인코딩까지. 결과물을
              다른 프로그램에서 열 수 있게 만듭니다.
            </p>
          </div>
          <div className="feature">
            <span className="feature-icon">
              <Icon name="sparkles" />
            </span>
            <h3>설치 없이 바로</h3>
            <p>
              최신 브라우저만 있으면 됩니다. 회사 PC나 태블릿에서도 같은
              도구를 그대로 사용할 수 있습니다.
            </p>
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="flow">
          <div className="flow-step">
            <div className="flow-num">STEP 01</div>
            <h3>파일 선택</h3>
            <p>끌어다 놓거나 클릭해서 파일과 폴더를 고릅니다.</p>
          </div>
          <div className="flow-step">
            <div className="flow-num">STEP 02</div>
            <h3>브라우저에서 처리</h3>
            <p>압축·PDF·변환 엔진이 내 기기 안에서만 실행됩니다.</p>
          </div>
          <div className="flow-step">
            <div className="flow-num">STEP 03</div>
            <h3>바로 다운로드</h3>
            <p>결과를 받고 원본은 직접 정리하면 끝입니다.</p>
          </div>
        </div>
      </section>
    </div>
  )
}

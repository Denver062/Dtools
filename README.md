# Dtools

브라우저 안에서만 동작하는 로컬 파일 도구입니다. 압축 파일 만들기·풀기, PDF 합치기·나누기·압축, 이미지/PDF/표 데이터 변환을 서버 없이 처리합니다.

- **파일은 업로드되지 않습니다.** 모든 작업은 사용자의 브라우저 메모리와 Web Worker 안에서 끝납니다.
- **외부 요청이 없습니다.** UI 폰트, PDF.js 리소스, 7-Zip WASM까지 모두 빌드 결과물에 포함되어 있습니다.
- **한국어 UI**와 다크/라이트 테마를 제공합니다.

## 주요 기능

| 도구 | 할 수 있는 일 |
| --- | --- |
| 압축 만들기 | 파일·폴더를 ZIP 또는 7Z로 묶기, AES-256 비밀번호, ZIP 구형 ZipCrypto 호환, 7Z 파일 목록(헤더) 암호화 |
| 압축 풀기 | ZIP·7Z·TAR·GZ·TGZ·BZ2·XZ·RAR·CAB·ISO 등 7-Zip이 지원하는 형식, 비밀번호 입력, ZIP 파일명 인코딩 수동 지정 |
| PDF 합치기 | 여러 PDF를 순서대로 하나로 합치기 |
| PDF 나누기 | 페이지 범위 직접 지정(`1-3, 5, 8-`) 또는 N페이지마다 자동 분할 |
| PDF 압축 | 무손실 구조 정리, 균형·강하게 이미지 기반 압축, 결과가 더 크면 원본 유지 |
| 파일 변환 | 이미지 → JPG·PNG·WebP·BMP·ICO, 여러 이미지 → 하나의 PDF(A4/Letter·방향·여백), PDF → JPG·PNG·WebP·BMP(페이지별), PDF → TXT, CSV ↔ JSON |

## 개인정보·보안 모델

1. 파일 선택, 압축, PDF 처리, 변환은 모두 `File`/`Blob` API와 브라우저 메모리에서 수행됩니다.
2. ZIP은 `@zip.js/zip.js`, 7Z 및 기타 압축 형식은 `7z-wasm`을 사용하며, 7-Zip 엔진은 전용 Web Worker에서 실행됩니다.
3. PDF 병합·분할은 `pdf-lib`, PDF 렌더링·압축은 `pdfjs-dist`와 Canvas를 사용합니다.
4. 입력 파일과 비밀번호는 IndexedDB, localStorage, 쿠키, 서버 어디에도 저장되지 않습니다. 새로고침하거나 결과를 초기화하면 메모리에서 사라집니다.
5. 테마 설정만 `localStorage`에 저장됩니다.
6. 폰트(Pretendard)와 PDF.js CMap/표준 폰트는 저장소에 포함되어 있으며, 런타임에 CDN·분석 도구·외부 API를 호출하지 않습니다.

> 브라우저나 운영체제가 다운로드 파일을 디스크에 저장하는 것은 사용자의 다운로드 동작이며, Dtools가 별도로 보관하는 것이 아닙니다.

## 지원 범위와 알려진 제한

### 압축

- **ZIP 생성**: AES-256 암호화가 기본입니다. Windows 탐색기의 기본 ZIP 기능은 AES ZIP을 열지 못할 수 있으므로 7-Zip, 반디집, macOS Keka 등을 권장합니다.
- **구형 ZIP 호환**: 고급 설정에서 `ZipCrypto`를 선택하면 오래된 Windows 환경과의 호환성을 높일 수 있지만 보안 강도는 낮습니다.
- **7Z 생성**: AES-256과 헤더 암호화를 지원합니다. 7Z는 ZIP과 달리 빈 폴더를 압축 파일에 담지 않을 수 있습니다.
- **압축 풀기**: ZIP은 ZIP 엔진을 먼저 사용하고 실패하면 7-Zip 엔진으로 재시도합니다. 그 외 형식은 7-Zip 엔진을 사용합니다. RAR을 포함한 일부 형식은 7-Zip WASM 빌드가 지원하는 범위에 따라 실패할 수 있고, 분할 압축·희귀 압축 방식은 지원하지 않을 수 있습니다.
- **파일명 인코딩**: 오래된 Windows ZIP의 한글 파일명이 깨질 때만 고급 설정에서 `EUC-KR / CP949`를 선택하세요.
- **크기 제한**: 별도의 서버 제한은 없지만, 브라우저 메모리와 WASM 파일 시스템 크기에 따라 매우 큰 압축 파일은 실패할 수 있습니다. 7Z 압축은 원본을 WASM 메모리에 복사하므로 ZIP보다 메모리를 더 사용합니다.
- **비밀번호 복구 불가**: 비밀번호는 저장되지 않습니다. 잃어버리면 Dtools로는 복구할 수 없습니다.
- 압축 파일의 항목을 추가·삭제하는 편집 기능과 분할 압축 생성은 제공하지 않습니다.

### PDF

- **합치기/나누기**: 페이지 내용은 복사되지만, 책갈피(아웃라인), 폼 필드, 링크 주석, 디지털 서명, 첨부 파일은 유지되지 않을 수 있습니다.
- **암호화된 PDF**: 비밀번호가 걸린 PDF는 직접 열 수 없습니다. 비밀번호를 해제한 뒤 사용해 주세요.
- **무손실 압축**: 객체 스트림을 정리해 다시 저장합니다. 텍스트·링크·벡터는 유지되지만, 서명된 문서는 서명이 무효화될 수 있습니다.
- **균형/강하게 압축**: 각 페이지를 이미지로 다시 그립니다. 용량은 크게 줄 수 있지만 텍스트 선택·검색, 링크, 폼, 주석이 사라집니다. 결과가 원본보다 크면 원본을 그대로 반환합니다.
- **OCR 없음**: 스캔 PDF의 이미지에서 텍스트를 추출하지 않습니다.

### 파일 변환

- **이미지 입력**: JPG, PNG, WebP, GIF, BMP, SVG.
- **이미지 출력**: JPG, PNG, WebP, BMP(24비트 무압축), ICO(16·32·48·64·128·256px 다중 아이콘). WebP 저장은 브라우저의 Canvas 인코딩 지원에 따라 달라지며, 지원하지 않는 브라우저에서는 선택이 비활성화됩니다.
- **이미지 → PDF**: 페이지 크기(이미지에 맞춤/A4/Letter), 방향(자동/세로/가로), 여백을 지정할 수 있습니다.
- **PDF → 이미지**: JPG·PNG·WebP·BMP, 96·150·200·300 DPI, 긴 변 기준 리사이즈.
- **PDF → 텍스트**: PDF.js로 페이지별 글자를 추출해 하나의 TXT로 저장합니다. 페이지 구분선을 넣거나 끌 수 있습니다.
- **CSV ↔ JSON**: 첫 행을 헤더로 사용하고, 숫자·참/거짓 자동 변환과 CSV 구분자(쉼표/세미콜론/탭), Excel용 UTF-8 BOM을 지원합니다.
- **투명 배경**: JPG·BMP로 변환하면 투명 영역이 흰색으로 채워집니다.
- **GIF/SVG**: 애니메이션 GIF는 첫 프레임만 사용하고, SVG는 현재 화면 크기로 래스터화합니다. SVG 내부 스크립트·외부 리소스는 실행되지 않습니다.
- **미지원 형식**: HEIC/HEIF, RAW, 동영상, 오디오, Office 문서 변환은 지원하지 않습니다. OCR도 제공하지 않습니다.
- **Canvas 한계**: 긴 변 16,384px 또는 약 2억 픽셀을 넘는 이미지는 브라우저 보호를 위해 처리하지 않습니다. 고급 설정의 리사이즈를 사용하세요.

### 브라우저

최신 Chromium 기반 브라우저(Chrome/Edge), Firefox, Safari 16+를 권장합니다. WebAssembly, Web Worker, Canvas, Blob/File API가 필요합니다. WebP 인코딩과 일부 이미지 디코딩은 브라우저별 지원 차이가 있습니다.

## 개발

```bash
npm install
npm run dev        # 개발 서버
npm run typecheck  # TypeScript 검사
npm run build      # 타입 검사 + 프로덕션 빌드
npm run preview    # dist 미리보기
```

`predev`/`prebuild`에서 `scripts/copy-pdfjs.mjs`가 `pdfjs-dist`의 CMap과 표준 폰트를 `public/pdfjs/`로 복사합니다.

### 프로젝트 구조

```
src/
  components/     공통 UI (Dropzone, FileList, Controls, ResultPanel 등)
  lib/            ZIP/PDF/이미지 처리, 포맷 유틸, 파일 선택
  pages/          도구별 페이지 (lazy load)
  workers/        archive.worker.ts — ZIP/7Z/TAR/GZ 엔진
  styles/         global.css — 디자인 시스템
public/
  fonts/          Pretendard Variable (자가 호스팅)
  pdfjs/          PDF.js CMap / standard fonts (빌드 시 복사)
.e2e/             개발용 Playwright 검증 스크립트 (프로젝트 의존성 아님)
scripts/          PDF.js 리소스 복사 스크립트
```

### 기술 스택

- Vite 7 + React 19 + TypeScript
- `@zip.js/zip.js` — ZIP 생성/해제, AES-256, ZipCrypto
- `7z-wasm` — 7Z 생성/해제, TAR/GZ 등 추가 형식
- `pdf-lib` — PDF 병합/분할/무손실 재저장
- `pdfjs-dist` + Canvas — PDF 렌더링, 이미지 기반 압축, PDF → 이미지
- 경로 기반 라우팅(`/compress/` 등), 도구 페이지 코드 분할

## 배포

```bash
npm ci
npm run build
```

`dist/`를 정적 호스팅에 올리면 됩니다.

- 빌드 시 도구별 정적 진입점과 `sitemap.xml`, `robots.txt`를 생성하므로 직접 URL 접속과 검색엔진 수집이 가능합니다.
- 사이트맵 주소: `https://dtols.duckdns.org/sitemap.xml`
- `.wasm`은 `application/wasm`, `.woff2`는 `font/woff2` MIME으로 제공하세요. 대부분의 정적 호스트가 기본 지원합니다.
- `public/fonts/`와 `public/pdfjs/`가 `dist/`에 포함되어야 합니다. 빌드 시 자동으로 복사됩니다.
- SharedArrayBuffer나 COOP/COEP 헤더는 필요하지 않습니다.
- 하위 경로에 배포하려면 Vite `base` 설정과 `global.css`의 폰트 경로(`/fonts/...`)를 함께 조정해야 합니다.

## 검증

`.e2e/`에는 Playwright 기반 브라우저 검증 스크립트가 있습니다. 실제 ZIP/7Z/TAR.GZ/GZ 파일을 만들고 독립 라이브러리로 다시 열어 검증하며, PDF 페이지 수·텍스트 보존·이미지 크기, 변환 결과 시그니처, 라우팅·테마·모바일 레이아웃, 컨트롤 DOM/대비, 외부 네트워크 요청 부재까지 확인합니다.

- `archives.mjs` — ZIP AES-256/ZipCrypto, 7Z 헤더 암호화, 잘못된 비밀번호, 한글 경로, TAR.GZ/GZ
- `pdf.mjs` — 병합 순서/텍스트, 범위·N페이지 분할, 무손실/래스터 압축
- `convert.mjs` — 이미지 형식 변환(JPG/PNG/WebP/BMP/ICO), 이미지→PDF(자동/A4), PDF→이미지·텍스트, CSV↔JSON, 설정 모달, 부분 실패
- `visual.mjs` — 전 라우트 오버플로, 테마 지속성, 모바일 드로어
- `ui-controls.mjs` — 폰트/셸 기하, 라이트·다크 대비, 토글·세그먼트·고급 설정, 외부 요청 부재

Playwright는 프로젝트 런타임 의존성이 아니며, 검증 환경에 별도로 설치해 사용합니다.

## 라이선스·크레딧

이 프로젝트가 사용하는 주요 오픈소스:

- [Pretendard](https://github.com/orioncactus/pretendard) — SIL Open Font License 1.1
- [zip.js](https://github.com/gildas-lormeau/zip.js) — BSD-3-Clause
- [7-Zip / 7z-wasm](https://github.com/ip7z/7zip) — GNU LGPL + unRAR restriction
- [pdf-lib](https://github.com/Hopding/pdf-lib) — MIT
- [PDF.js](https://github.com/mozilla/pdf.js) — Apache-2.0
- [React](https://github.com/facebook/react) — MIT

7-Zip WASM에는 unRAR restriction이 적용됩니다. 재배포·상용 배포 시 각 라이선스 원문을 확인하세요.

# HANDOFF — 부글부글 앱 단단하게 만들기 (운영 안정성 트랙)

## Goal

사용자(`EUNJEONGMUN`)는 Java/Spring 백엔드 경력 + 현재 C/Nonstop Net24 환경 근무자. **첫 웹앱(Next.js 16 + Supabase + Vercel)을 만들어 운영까지 배포 완료**. SQL 기본기·Git PR 흐름은 익숙하지만 **프론트(React/Next/Node)는 약함**. 앞으로 8주에 걸쳐 앱을 단단하게 만들면서 자연스럽게 프론트/운영 역량을 보강하는 게 목표.

전체 로드맵 (단계별, 각 ~1주):
1. **관찰 도구 셋업** (Sentry + Vercel Analytics + Speed Insights) ← 현재 진행 중
2. **CI/CD 안전망** (GitHub Actions + main 브랜치 보호)
3. **Server Action 단위 테스트** (Vitest, 백엔드 강점 활용)
4. **React/Next 멘탈 모델 정리** (RSC vs Client, 'use client' 점검, Next 튜토리얼)
5. **E2E 핵심 흐름 확장** (Playwright 1개 → 5개 시나리오)
6. **DB 최적화** (`EXPLAIN ANALYZE`, 인덱스, RLS 회귀 점검)

## Current Progress

### 앱 자체 (완료된 것)
모든 기능 + 보안 가드 + 모바일 UX 최적화가 main에 push 되어 Vercel 배포 완료. 최근 커밋:
- `56e6183` docs: refresh README — 새 기능·신규 환경변수·보안 가드 반영
- `fcc0668` fix(meeting-form): 날짜 텍스트 수직 정렬 (`leading-10`)
- `aaf5eac` fix: code-review pass — SSRF·권한·race·storage 정리·React key·maxLength 등 13건 수정
- `08d7f4e` "+" 버튼 → "신규 생성" 라벨링
- `ec1f9d4` feat(discussion): Gemini PDF 발제문 추출 + 후보 검수 UI

주요 도메인 기능:
- 모임 CRUD (Kakao 책/장소 검색 통합)
- 발제문 PDF 업로드 → Gemini 2.5 Flash 추출 → 검수 UI
- 헤더 햄버거 메뉴(수정/공유/삭제) + 3단 공유 폴백(navigator.share→clipboard→prompt)
- 마크다운 에디터 (GFM 표·체크박스·Ctrl+B·URL paste)
- 홈 카드 참석 토글 + 현황

### 학습 트랙 (현재 위치)
**단계 1 시작 직전** — 사용자가 Sentry 가입 후 DSN 받아오기를 기다리는 상태.

사용자에게 안내된 사전 학습:
- Sentry란? (Spring의 Logback + APM 비유)
- DSN / Source Map / Error Boundary 개념
- 추후 다룰 Web Vitals (LCP/INP/CLS)

## What Worked

### 기술적 접근
- **Server Action 권한 검증 패턴**: `assertHost(meetingId)` 헬퍼를 액션 첫 줄에서 호출 → 보안 가드 일관성 유지
- **Gemini 발제문 추출**: temperature 0.2 + few-shot 예시 3개(긍정 2 + 부정 1) + JSON Structured Output → 정확도 크게 개선 (Lite 11개 잡탕 → Flash 7개 정확 추출)
- **모바일 입력 정렬 트라우마**: `leading-none`은 line-box를 폰트 사이즈로 줄여 텍스트가 상단 정렬되는 부작용. `leading-10` (= h-10과 동일)이 정답
- **한글 파일명 보존**: 스토리지 경로는 ASCII로 sanitize + DB에 원본 파일명 별도 컬럼 + 다운로드 시 `?download=` 파라미터로 Content-Disposition 부착
- **검색 드롭다운 닫기 UX**: 하단 close 버튼은 모바일 하단 nav에 가려짐 → 상단 헤더 X 아이콘으로 이동

### 협업 흐름
- **deep-interview 스킬 활용**: IA 리팩터링(헤더 햄버거 메뉴 + 홈 카드 참석 통합) 결정 시 Socratic 질문으로 토폴로지 락 → 14% ambiguity 달성 후 구현
- **code-review (xhigh effort) 후 우선순위 픽스**: 15건 발견 중 13건 적용, 2건은 사용자 의도 반영하여 의도적 제외
- **Java/Spring 비유**: 사용자 멘탈 모델에 anchor를 제공하면 새 개념 학습 속도가 빠름

## What Didn't Work (Don't Repeat)

### 기술적 시행착오
- **pdf-parse v1 API 가정**: v2부터 `PDFParse` 클래스 + `getText()`로 바뀜. `pdfParse(buffer)` 호출 패턴은 더 이상 동작 안 함. 최종적으로 Gemini multimodal로 전환하여 pdf-parse 의존성 제거함
- **Supabase Storage 한글 키**: `Invalid key` 에러 발생. ASCII 사니타이즈 필수. `[^a-zA-Z0-9._\-]/g, '_'`
- **`Date.now()` 없는 경로 + `upsert:true`**: 같은 한글 파일명 두 번 업로드 시 storage 객체 덮어쓰기 + publicUrl 동일 → CDN 캐시 stale 위험. `${meetingId}/${Date.now()}-${safeName}` + `upsert:false` 패턴이 정답
- **`grid-cols-2`로 날짜/시간 배치**: 모바일에서 네이티브 date input의 internal width가 컬럼 폭을 넘어 겹침. `minmax(0,…)`도 부족. 최종은 `flex gap-3` + 명시적 픽셀 너비(`w-[160px]` / `w-[120px]`)
- **`leading-none`으로 텍스트 정렬 시도**: line-box가 폰트 크기로 축소되어 텍스트가 상단으로 쏠림. `leading-10`(line-height = box height)이 올바른 패턴
- **`<a download="korean.pdf">`**: cross-origin URL이면 브라우저가 무시. Supabase `?download=` 쿼리 파라미터로 Content-Disposition 강제하는 방식이 작동
- **로컬 Supabase `db reset`**: 로컬에 입력한 데이터 모두 삭제됨. 운영 DB와는 무관. 마이그레이션만 적용하려면 `migration up --local` 사용

### 운영 시행착오
- **Vercel 환경변수 push 누락 risk**: `GEMINI_API_KEY` 같은 신규 키 추가 시 사용자가 Vercel 콘솔에 직접 입력해야 함. 빌드는 통과해도 런타임에서 실패하므로 명시적 안내 필요

## Next Steps

### 즉시 (사용자 응답 대기 중)
1. **사용자가 Sentry 가입 + 프로젝트 생성** 후 DSN을 알려주거나 "받았어요" 라고 응답
2. DSN 받으면 → `pnpm dlx @sentry/wizard@latest -i nextjs` 실행 → DSN 입력 → 자동 생성된 파일들 검토:
   - `sentry.client.config.ts` (브라우저 SDK)
   - `sentry.server.config.ts` (서버 SDK)
   - `sentry.edge.config.ts` (Edge runtime, Next 미들웨어용)
   - `next.config.ts` 업데이트 (withSentryConfig wrap)
3. **의도적 테스트 에러** 발생시켜 Sentry 대시보드에 도달하는지 확인 (예: 임시 `throw new Error('Sentry test')` in page)
4. **Vercel 환경변수에 `SENTRY_AUTH_TOKEN` 추가** (source map 업로드용, wizard가 알려줌)
5. 배포 → 운영 환경에서도 에러 캡처되는지 확인

### Sentry 셋업 완료 후
6. **Vercel Analytics 설치**:
   - `pnpm add @vercel/analytics @vercel/speed-insights`
   - `app/layout.tsx`에 `<Analytics />` + `<SpeedInsights />` 추가
   - Vercel 대시보드에서 활성화 토글
7. **Web Vitals 학습** — LCP/INP/CLS 의미와 운영 사이트 측정값 보기
8. **DevTools 깊이 사용법** 가이드 (Network 탭에서 Supabase 쿼리 분석, Performance 탭에서 컴포넌트 렌더링 추적)

### 단계 1 종료 후 → 단계 2 (GitHub Actions CI)
9. `.github/workflows/ci.yml` 작성:
   ```yaml
   - pnpm install
   - pnpm tsc --noEmit
   - pnpm test
   ```
10. GitHub 저장소 Settings → Branches → main 브랜치 보호 룰 (CI 통과 강제)
11. 사용자가 feature branch + PR 패턴으로 워크플로 전환 (지금까지는 main 직접 push)

## 사용자 컨텍스트 (다음 에이전트가 알아야 할 것)

- **언어**: 한국어 응답 선호
- **백엔드 경력**: Java/Spring, 현재 C + Nonstop Net24 (트랜잭션 시스템)
- **SQL**: 기본 이상 (조인·인덱스·정규화 이해)
- **Git**: PR 흐름 익숙
- **프론트**: 처음 (React/Next/Node 학습 중)
- **Supabase/Vercel**: 이번 프로젝트로 처음 접함
- **AI 도구**: deep-interview·code-review 스킬 사용 경험 있음
- **응답 스타일 선호**: 단계별 + Spring/SQL 비유 + 학습 포인트 명시

## 핵심 파일/문서

- `README.md` — 최신 (Gemini·Kakao·IA·보안 가드 반영)
- `.env.example` — 환경변수 템플릿 (KAKAO_REST_API_KEY, GEMINI_API_KEY 포함)
- `.omc/specs/deep-interview-meeting-detail-ia.md` — IA 리팩터링 결정 기록
- `lib/actions/discussion-files.ts` — 보안 가드(`assertHost`, SSRF 검증, 사이즈 캡, storage 정리) 참고 코드
- `lib/queries/meetings.ts` — `getNextMeeting` (홈 카드용, attendances join 포함)
- `components/meeting/MeetingHeaderMenu.tsx` — 3단 공유 폴백 패턴

## 환경

- macOS, zsh
- pnpm 11.5.0
- Node v26.0.0
- Next.js 16.2.6, React 19.2
- 로컬 Supabase Docker 컨테이너 (포트 54323 Studio)
- 운영: Vercel icn1 (서울) + Supabase Cloud
- Branch 정책: main 직접 push (단계 2 이후 PR 전환 예정)

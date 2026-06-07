# HANDOFF — 부글부글 앱 단단하게 만들기 (운영 안정성 트랙)

## Goal

사용자(`EUNJEONGMUN`)는 Java/Spring 백엔드 경력 + 현재 C/Nonstop Net24 환경 근무자. **첫 웹앱(Next.js 16 + Supabase + Vercel)을 만들어 운영까지 배포 완료**. SQL 기본기·Git PR 흐름은 익숙하지만 **프론트(React/Next/Node)는 약함**. 앞으로 8주에 걸쳐 앱을 단단하게 만들면서 자연스럽게 프론트/운영 역량을 보강하는 게 목표.

전체 로드맵 (단계별, 각 ~1주):
1. ✅ **관찰 도구 셋업** (Sentry + Vercel Analytics + Speed Insights) — **완료**
2. ✅ **CI/CD 안전망** (GitHub Actions + main 브랜치 보호) — **완료**
3. **Server Action 단위 테스트** (Vitest 확장, 백엔드 강점 활용) ← 다음
4. **React/Next 멘탈 모델 정리** (RSC vs Client, 'use client' 점검, Next 튜토리얼)
5. **E2E 핵심 흐름 확장** (Playwright 1개 → 5개 시나리오)
6. **DB 최적화** (`EXPLAIN ANALYZE`, 인덱스, RLS 회귀 점검)

## Current Progress

### 앱 자체
모든 기능 + 보안 가드 + 모바일 UX 최적화 + 운영 관찰 도구 통합까지 main에 push 되어 Vercel 배포 완료.

### 학습 트랙 (현재 위치)
**단계 1 완전 종료 → 단계 2 시작 직전.**

#### 단계 1에서 깐 것
- **Sentry** (`@sentry/nextjs` v10.56.0)
  - Browser / Server / Edge 3개 환경 SDK init
  - `app/global-error.tsx` 최상위 에러 바운더리
  - Source map 자동 업로드 (`SENTRY_AUTH_TOKEN` Vercel 환경변수)
  - Session Replay + Tracing 활성화
  - Sentry MCP 서버 (`.mcp.json`) — Claude Code가 Sentry 이슈 직접 조회 가능
  - 운영 검증 끝 (스택트레이스 원본 파일명 매핑까지 확인)
- **Vercel Web Analytics** (`@vercel/analytics` v2.0.1) — 페이지뷰 / 방문자 / 인기 페이지 / Referrer
- **Vercel Speed Insights** (`@vercel/speed-insights` v2.0.0) — Web Vitals (LCP/INP/CLS/FCP/FID/TTFB) 측정
  - 첫 측정 결과: **Real Experience Score 96 (Great)** — 거의 모두 녹색, FCP만 노란색(2.23s)

#### 관련 커밋 (단계 1)
- `eb9abcd` chore(sentry): set up error monitoring via @sentry/nextjs wizard
- `f0e27e3` chore(sentry): remove example test pages after production verification
- `a2e7fff` chore(analytics): wire Vercel Web Analytics and Speed Insights
- `663fc9e` chore(sentry): rename project to book-club, tune sample rates, document token

#### 단계 2에서 깐 것 (이번 세션 후반)
- `.github/workflows/ci.yml` — PR + push to main 트리거. pnpm install, tsc --noEmit, vitest run. Node 22 LTS, concurrency cancel-in-progress
- **main 브랜치 보호 룰 (GitHub Rulesets)** — Require PR, Require status check `Typecheck & Unit Tests`, Block force pushes, Restrict deletions. **본인도 우회 못 함** (admin bypass 없음)
- PR 워크플로로 전환 — 실제 PR #1 (`docs(handoff): mark phase 2 complete`)을 만들어 검증. 머지 후 SHA 정렬도 표준 절차 (`git reset --hard origin/main`) 완료

#### 관련 커밋 (단계 2)
- `b379388` ci: add GitHub Actions workflow for typecheck and unit tests
- `d9df123` docs(handoff): mark phase 2 (CI/CD) complete (#1) — **첫 PR squash merge**

#### Sentry 프로젝트 정보 (최신)
- Org slug: `eunjeongmun`
- Project slug: `book-club` (rename 완료)
- DSN: `https://fce608438305676ee890456c8c911d6d@o4511517199368192.ingest.us.sentry.io/4511517223026688` (Project ID 기반이라 rename 후에도 그대로 동작)
- Sentry MCP URL: `https://mcp.sentry.dev/mcp/eunjeongmun/book-club`

## What Worked

### 기술적 접근
- **Sentry wizard 자동 셋업**: `pnpm dlx @sentry/wizard@latest -i nextjs`. OAuth 로그인으로 DSN 자동 fetch + 모든 init 파일 + `next.config.ts` 래핑 + Vercel 환경변수 안내까지 한 방
- **운영 검증 절차**: 로컬 `pnpm dev` → `/sentry-example-page` → 에러 발생 → Sentry 대시보드 확인 → push → 운영에서 동일 절차 → 스택트레이스에 원본 파일명 확인 → 테스트 페이지 삭제
- **Vercel Analytics 자동 활성화**: 별도 토글 없이 패키지 + 컴포넌트 마운트 + 첫 데이터 도착하면 자동. "Enable" 버튼 찾지 말 것
- **`curl` + `grep`으로 운영 HTML 직접 검사**: Network 탭에서 안 잡힐 때 `curl -sL [url] | grep -i analytics`로 컴포넌트가 RSC payload에 들어갔는지 1초만에 확인 가능

### 협업 흐름
- **Spring/Logback 비유**: 거의 모든 새 개념에 비유 anchor 제공 → 학습 속도 크게 향상 (Sentry=Logback+APM, DSN=appender 주소, Source map=stack trace 복원, Web Vitals=APM p75 응답시간, GitHub Actions=Jenkins+Gerrit)
- **수동 push 분리**: 사용자가 commit은 위임하지만 push는 직접 — 운영 반영 직전 검토 시간 확보 (사용자가 명시적으로 그렇게 요청함)
- **TaskCreate로 다단계 작업 추적**: Sentry 5단계 + Analytics 4단계 + CI/CD 4단계를 task로 분해 → 진행 상황 시각화
- **두 시나리오로 룰셋 검증**: (1) main에 직접 push 시도 → 거절 확인. (2) PR → CI → squash merge → 정상 흐름. 룰셋 셋업 후 이 두 가지로 검증하는 패턴이 강력함

## What Didn't Work (Don't Repeat)

### 기술적 시행착오
- **Claude Code `!` 접두사로 인터랙티브 CLI 실행 시도**: `pnpm dlx @sentry/wizard`가 `ERR_TTY_INIT_FAILED`로 즉사. `!`는 TTY 없는 백그라운드 bash라 `@clack/prompts` 같은 TUI 라이브러리 못 띄움. **인터랙티브 명령은 사용자가 직접 자기 터미널에서 돌려야 함** (memory에 `feedback_interactive_cli`로 저장됨)
- **Sentry wizard의 `pnpm-workspace.yaml` placeholder 버그**: wizard가 `allowBuilds:` 섹션에 `'@sentry/cli': set this to true or false`라는 문자열을 그대로 박아놓음. 다음 `pnpm add` 단계가 invalid value로 깨짐. 수동으로 `true`로 고치고 wizard 재실행해야 했음. 다음에 또 만나면 즉시 패치
- **Vercel 배포 "Initializing" 7분 stuck**: 첫 push 후 Vercel deployment가 Initializing에서 멈춤. 수동 Redeploy 트리거했더니 새 거가 Queued로 들어가 큐가 막힘. **해결**: 멈춘 거 Cancel → 큐 풀림 → 자동 재배포 시작
- **DevTools Network에서 `vercel`로 필터링**: Analytics는 `_vercel/insights/*` 경로라 "vercel" 검색하면 Vercel Toolbar/Feedback 위젯이 잡히고 정작 Analytics는 안 잡힘. **`insights` 또는 `_vercel` (underscore 포함)로 필터링해야 함**
- **Network 탭에서 안 잡힌다고 비활성화로 결론짓기**: 컴포넌트가 HTML에 들어가 있고 Vercel endpoint도 200이면 정상 동작 중. 사용자가 페이지 hydration 직전이나 다른 페이지에서 캡처했을 가능성. **대시보드의 데이터 도착이 ground truth** — 실제로 데이터 도착 확인됨

### 운영 시행착오
- **테스트 페이지 운영 노출 위험 인지**: wizard가 생성한 `/sentry-example-page` + `/api/sentry-example-api`는 공개 URL이라 누구나 에러를 의도적으로 발생시켜 Sentry 쿼터 소진 가능. 검증 끝나면 별도 커밋으로 삭제 (이번 세션 `f0e27e3`)

### CI/CD 시행착오
- **Status check 이름 mismatch (display name vs job ID)**: 워크플로의 `jobs.verify.name: Typecheck & Unit Tests`가 PR에 표시되는 check 이름이고, GitHub branch protection의 required status check도 그 display name을 매치해야 함. 처음에 job ID `verify`를 등록했더니 영원히 "Expected — Waiting for status to be reported"로 머무름. **Rule의 required check 이름은 PR Checks 섹션에 실제로 보이는 이름과 정확히 같아야 함**. 입문자가 거의 다 한 번씩 밟는 함정
- **HANDOFF.md outdated 가능성**: 이전 HANDOFF에서 "단계 3에서 vitest 깔자"라고 적었는데 사실 **vitest와 playwright는 이미 셋업되어 있었음** (validation 단위 테스트 3개, e2e 1개). 다음 세션은 단계 3을 "vitest 도입" 대신 **"Server Action 테스트로 확장"**으로 봐야 함

## Next Steps

### 즉시 (다음 세션 시작 시)
다음 중 하나 선택:

**A. 단계 3 진행 (Server Action 단위 테스트로 확장) — 추천**
이미 셋업된 vitest 위에 테스트 확장. 백엔드 강점 활용 영역.
- 1번 타깃: `lib/actions/discussion-files.ts` — `assertHost(meetingId)` 가드 + SSRF 검증
- 2번 타깃: `lib/actions/meetings.ts` (또는 유사한 모임 CRUD action) — RLS 통과/실패 케이스
- 3번 타깃: `lib/queries/meetings.ts`의 `getNextMeeting` — attendances join
- 테스트 위치 컨벤션: `tests/lib/actions/...` 패턴 (기존 `tests/lib/validation/*.test.ts`와 동일 구조)
- Supabase mocking 전략: 로컬 Supabase 도커 컨테이너에 시드 데이터 → 통합 테스트 형태 권장. 백엔드 출신에게 친숙한 패턴이고, mocking 함정도 피함

**B. 운영 모니터링 일과 만들기**
- 매일 5분 루틴: Sentry Issues → Vercel Analytics → Speed Insights 순회
- Sentry 대시보드에서 Alert rule 설정 (특정 에러 빈도/타입 threshold)
- 이메일 알림 채널 확인

**C. PR 워크플로 정착 연습**
- 단계 2에서 룰셋만 깔았지만 실제 작업 시 익숙해지는 시간 필요
- 다음 변경부터는 자연스럽게 feature branch → PR → 자동 CI → squash merge

### 단계 4 이후 (다음 단계들)
- **단계 4 (React/Next 멘탈 모델)**: RSC vs Client, `'use client'` 점검, Next.js 캐시 계층 (`revalidatePath`/`revalidateTag`)
- **단계 5 (E2E 확장)**: 이미 `tests/e2e/main-flow.spec.ts` 1개 있음. 4개 더 추가 (회원가입, 모임 생성, 발제문 업로드, 공유)
- **단계 6 (DB 최적화)**: `EXPLAIN ANALYZE`, 인덱스 회귀 점검, RLS 정책 audit

### 학습 포인트 (다음 세션이 자연스럽게 다룰 것)
- **Next.js 캐시 계층**: ISR / `revalidatePath` / `revalidateTag` — 모임 수정 후 홈 카드 stale 가능
- **Supabase 통합 테스트 패턴**: 로컬 Docker 컨테이너에 시드 → 진짜 SQL 실행 → 정리. mocking보다 적합
- **Server Action 테스트의 함정**: cookies()/headers() 등 Next 런타임 의존성 → vitest mocking 필요

## 사용자 컨텍스트 (다음 에이전트가 알아야 할 것)

- **언어**: 한국어 응답 선호
- **백엔드 경력**: Java/Spring, 현재 C + Nonstop Net24 (트랜잭션 시스템)
- **SQL**: 기본 이상 (조인·인덱스·정규화 이해)
- **Git**: PR 흐름 익숙. **commit은 위임 OK, push는 본인이 직접 함** (이번 세션에서 명시)
- **프론트**: 처음 (React/Next/Node 학습 중)
- **Supabase/Vercel**: 이번 프로젝트로 처음 접함
- **AI 도구**: deep-interview·code-review·Sentry MCP 사용 경험
- **응답 스타일 선호**: 단계별 + Spring/SQL 비유 + 학습 포인트 명시 + 핵심만 짚기
- **트러블슈팅 스타일**: 막히면 스크린샷을 빠르게 제공 → 진단이 매우 빠르게 진행됨. 이 흐름 유지할 것
- **Bash 도구로 인터랙티브 CLI 절대 호출하지 말 것**: `!` 접두사도 안 됨. 사용자 본인 터미널 안내

## 핵심 파일/문서

### 기존
- `README.md` — Gemini·Kakao·IA·보안 가드 반영. `SENTRY_AUTH_TOKEN` 추가 명시 필요
- `.env.example` — 환경변수 템플릿
- `.omc/specs/deep-interview-meeting-detail-ia.md` — IA 리팩터링 결정 기록
- `lib/actions/discussion-files.ts` — 보안 가드 참고
- `lib/queries/meetings.ts` — `getNextMeeting`
- `components/meeting/MeetingHeaderMenu.tsx` — 3단 공유 폴백

### 단계 1에서 추가됨
- `instrumentation-client.ts`, `instrumentation.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` — Sentry SDK 초기화 (각 파일에서 `tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1`)
- `app/global-error.tsx` — 최상위 에러 바운더리 (Sentry capture)
- `app/layout.tsx` — `<Analytics />` + `<SpeedInsights />` 마운트 (`</body>` 직전)
- `next.config.ts` — `withSentryConfig` 래퍼 (`project: "book-club"`, source map 업로드, tunnelRoute `/monitoring`)
- `.mcp.json` — Sentry MCP 서버 정의 (`book-club` slug, Claude Code 통합)
- `.env.sentry-build-plugin` — `SENTRY_AUTH_TOKEN` (gitignored, Vercel에도 등록 완료)
- `pnpm-workspace.yaml` — `allowBuilds: '@sentry/cli': true` 추가

### 단계 2에서 추가됨
- `.github/workflows/ci.yml` — CI 워크플로 (Node 22 LTS, pnpm 11)
- **GitHub Rulesets (main 보호)** — 코드 외부에 셋업됨. PR 강제, status check `Typecheck & Unit Tests` 필수, force push 금지, deletion 금지

### 이미 셋업되어 있던 것 (HANDOFF가 outdated였음)
- `vitest.config.ts` + `tests/setup.ts`
- `tests/lib/validation/*.test.ts` — zod schema 검증 (3 파일, 12 테스트)
- `playwright.config.ts`
- `tests/e2e/main-flow.spec.ts` — E2E 1개

## 메모리 (자동 참조됨)

- `feedback_interactive_cli`: 인터랙티브 CLI는 `!` 접두사로 못 돌림. 사용자 본인 터미널에 안내

## 환경

- macOS, zsh
- pnpm 11.5.0
- Node v26.0.0 (매우 신상 — Sentry instrumentation에서 `DEP0205 module.register() deprecated` 경고 발생하지만 동작은 정상)
- Next.js 16.2.6, React 19.2
- 로컬 Supabase Docker 컨테이너 (포트 54323 Studio)
- 운영: Vercel icn1 (서울) + Supabase Cloud + Sentry US
- Branch 정책: **PR + CI 통과 강제** (main 직접 push 차단됨). 작업은 feature branch → PR → Squash merge
- 운영 URL: `https://book-club-five-nu.vercel.app/`

# HANDOFF — 부글부글 앱 단단하게 만들기 (운영 안정성 트랙)

## Goal

사용자(`EUNJEONGMUN`)는 Java/Spring 백엔드 경력 + 현재 C/Nonstop Net24 환경 근무자. **첫 웹앱(Next.js 16 + Supabase + Vercel)을 만들어 운영까지 배포 완료**. SQL 기본기·Git PR 흐름은 익숙하지만 **프론트(React/Next/Node)는 약함**. 앞으로 8주에 걸쳐 앱을 단단하게 만들면서 자연스럽게 프론트/운영 역량을 보강하는 게 목표.

전체 로드맵 (단계별, 각 ~1주):
1. ✅ **관찰 도구 셋업** (Sentry + Vercel Analytics + Speed Insights) — **완료**
2. **CI/CD 안전망** (GitHub Actions + main 브랜치 보호) ← 다음
3. **Server Action 단위 테스트** (Vitest, 백엔드 강점 활용)
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

#### 관련 커밋
- `eb9abcd` chore(sentry): set up error monitoring via @sentry/nextjs wizard
- `f0e27e3` chore(sentry): remove example test pages after production verification
- `a2e7fff` chore(analytics): wire Vercel Web Analytics and Speed Insights

#### Sentry 프로젝트 정보
- Org slug: `eunjeongmun`
- Project slug: `javascript-nextjs` (rename 미루어둠 — 코드 안 박혀 있어서 변경 시 `next.config.ts`, `.mcp.json` 동시 수정 필요)
- DSN: `https://fce608438305676ee890456c8c911d6d@o4511517199368192.ingest.us.sentry.io/4511517223026688`

## What Worked

### 기술적 접근
- **Sentry wizard 자동 셋업**: `pnpm dlx @sentry/wizard@latest -i nextjs`. OAuth 로그인으로 DSN 자동 fetch + 모든 init 파일 + `next.config.ts` 래핑 + Vercel 환경변수 안내까지 한 방
- **운영 검증 절차**: 로컬 `pnpm dev` → `/sentry-example-page` → 에러 발생 → Sentry 대시보드 확인 → push → 운영에서 동일 절차 → 스택트레이스에 원본 파일명 확인 → 테스트 페이지 삭제
- **Vercel Analytics 자동 활성화**: 별도 토글 없이 패키지 + 컴포넌트 마운트 + 첫 데이터 도착하면 자동. "Enable" 버튼 찾지 말 것
- **`curl` + `grep`으로 운영 HTML 직접 검사**: Network 탭에서 안 잡힐 때 `curl -sL [url] | grep -i analytics`로 컴포넌트가 RSC payload에 들어갔는지 1초만에 확인 가능

### 협업 흐름
- **Spring/Logback 비유**: 거의 모든 새 개념에 비유 anchor 제공 → 학습 속도 크게 향상 (Sentry=Logback+APM, DSN=appender 주소, Source map=stack trace 복원, Web Vitals=APM p75 응답시간)
- **수동 push 분리**: 사용자가 commit은 위임하지만 push는 직접 — 운영 반영 직전 검토 시간 확보 (사용자가 명시적으로 그렇게 요청함)
- **TaskCreate로 다단계 작업 추적**: Sentry 5단계 + Analytics 4단계를 task로 분해 → 진행 상황 시각화

## What Didn't Work (Don't Repeat)

### 기술적 시행착오
- **Claude Code `!` 접두사로 인터랙티브 CLI 실행 시도**: `pnpm dlx @sentry/wizard`가 `ERR_TTY_INIT_FAILED`로 즉사. `!`는 TTY 없는 백그라운드 bash라 `@clack/prompts` 같은 TUI 라이브러리 못 띄움. **인터랙티브 명령은 사용자가 직접 자기 터미널에서 돌려야 함** (memory에 `feedback_interactive_cli`로 저장됨)
- **Sentry wizard의 `pnpm-workspace.yaml` placeholder 버그**: wizard가 `allowBuilds:` 섹션에 `'@sentry/cli': set this to true or false`라는 문자열을 그대로 박아놓음. 다음 `pnpm add` 단계가 invalid value로 깨짐. 수동으로 `true`로 고치고 wizard 재실행해야 했음. 다음에 또 만나면 즉시 패치
- **Vercel 배포 "Initializing" 7분 stuck**: 첫 push 후 Vercel deployment가 Initializing에서 멈춤. 수동 Redeploy 트리거했더니 새 거가 Queued로 들어가 큐가 막힘. **해결**: 멈춘 거 Cancel → 큐 풀림 → 자동 재배포 시작
- **DevTools Network에서 `vercel`로 필터링**: Analytics는 `_vercel/insights/*` 경로라 "vercel" 검색하면 Vercel Toolbar/Feedback 위젯이 잡히고 정작 Analytics는 안 잡힘. **`insights` 또는 `_vercel` (underscore 포함)로 필터링해야 함**
- **Network 탭에서 안 잡힌다고 비활성화로 결론짓기**: 컴포넌트가 HTML에 들어가 있고 Vercel endpoint도 200이면 정상 동작 중. 사용자가 페이지 hydration 직전이나 다른 페이지에서 캡처했을 가능성. **대시보드의 데이터 도착이 ground truth** — 실제로 데이터 도착 확인됨

### 운영 시행착오
- **테스트 페이지 운영 노출 위험 인지**: wizard가 생성한 `/sentry-example-page` + `/api/sentry-example-api`는 공개 URL이라 누구나 에러를 의도적으로 발생시켜 Sentry 쿼터 소진 가능. 검증 끝나면 별도 커밋으로 삭제 (이번 세션 `f0e27e3`)

## Next Steps

### 즉시 (다음 세션 시작 시)
다음 중 하나 선택:

**A. 단계 2 진행 (CI/CD 안전망) — 추천**
1. `.github/workflows/ci.yml` 작성:
   ```yaml
   - pnpm install
   - pnpm tsc --noEmit
   - (vitest 깔리기 전이라 test는 skip)
   ```
2. GitHub 저장소 Settings → Branches → main 브랜치 보호 룰 (CI 통과 강제)
3. 사용자가 feature branch + PR 패턴으로 워크플로 전환 (지금까지는 main 직접 push)
4. 첫 PR로 작은 변경 띄워서 CI 동작 확인

**B. 단계 1 잔여 후속 작업** (작은 정리들. 합쳐서 30분 내)
- Sentry 프로젝트명 rename: `javascript-nextjs` → `book-club`
  - Sentry 웹UI Settings → General → Slug 변경
  - `next.config.ts`의 `project: "javascript-nextjs"` 수정
  - `.mcp.json`의 URL slug 수정
- 운영용 `tracesSampleRate` 낮추기: `1` → `0.1` (3개 init 파일 모두)
- README.md에 `SENTRY_AUTH_TOKEN` 환경변수 명시

**C. 운영 모니터링 일과 만들기**
- 매일 5분 루틴: Sentry Issues → Vercel Analytics → Speed Insights 순회
- Sentry 대시보드에서 Alert 설정 (특정 에러 threshold 넘으면 메일)

### 단계 2 이후 (단계 3 — Vitest 단위 테스트)
- `pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/dom jsdom`
- `vitest.config.ts` + `app/test-utils.tsx`
- 첫 테스트: `lib/queries/meetings.ts`의 `getNextMeeting`
- 백엔드 강점 살려 Server Action 위주로 테스트 — assertHost 가드, RLS 권한 검증, transition 케이스
- CI에 `pnpm test` 추가

### 학습 포인트 (다음 세션이 자연스럽게 다룰 것)
- **Next.js 캐시 계층**: ISR / `revalidatePath` / `revalidateTag` — 모임 수정 후 홈 카드 stale 가능
- **GitHub Actions ↔ Jenkins 비유**: workflow / job / step / runner = pipeline / stage / step / agent
- **PR 워크플로 적응**: 지금까지 main 직접 push, 이제 feature branch → PR → review → merge

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

### 단계 1에서 추가됨 (이번 세션)
- `instrumentation-client.ts`, `instrumentation.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` — Sentry SDK 초기화
- `app/global-error.tsx` — 최상위 에러 바운더리 (Sentry capture)
- `app/layout.tsx` — `<Analytics />` + `<SpeedInsights />` 마운트 (`</body>` 직전)
- `next.config.ts` — `withSentryConfig` 래퍼 (source map 업로드, tunnelRoute `/monitoring`)
- `.mcp.json` — Sentry MCP 서버 정의 (Claude Code 통합)
- `.env.sentry-build-plugin` — `SENTRY_AUTH_TOKEN` (gitignored)
- `pnpm-workspace.yaml` — `allowBuilds: '@sentry/cli': true` 추가

## 메모리 (자동 참조됨)

- `feedback_interactive_cli`: 인터랙티브 CLI는 `!` 접두사로 못 돌림. 사용자 본인 터미널에 안내

## 환경

- macOS, zsh
- pnpm 11.5.0
- Node v26.0.0 (매우 신상 — Sentry instrumentation에서 `DEP0205 module.register() deprecated` 경고 발생하지만 동작은 정상)
- Next.js 16.2.6, React 19.2
- 로컬 Supabase Docker 컨테이너 (포트 54323 Studio)
- 운영: Vercel icn1 (서울) + Supabase Cloud + Sentry US
- Branch 정책: **main 직접 push 중 (단계 2 이후 PR 전환 예정)**
- 운영 URL: `https://book-club-five-nu.vercel.app/`

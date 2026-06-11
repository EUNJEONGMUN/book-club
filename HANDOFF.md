# HANDOFF — 부글부글 앱 단단하게 만들기 (운영 안정성 트랙)

## Goal

사용자(`EUNJEONGMUN`)는 Java/Spring 백엔드 경력 + 현재 C/Nonstop Net24 환경 근무자. **첫 웹앱(Next.js 16 + Supabase + Vercel)을 만들어 운영까지 배포 완료**. SQL 기본기·Git PR 흐름은 익숙하지만 **프론트(React/Next/Node)는 약함**. 앞으로 8주에 걸쳐 앱을 단단하게 만들면서 자연스럽게 프론트/운영 역량을 보강하는 게 목표.

전체 로드맵 (단계별, 각 ~1주):
1. ✅ **관찰 도구 셋업** (Sentry + Vercel Analytics + Speed Insights) — **완료**
2. ✅ **CI/CD 안전망** (GitHub Actions + main 브랜치 보호) — **완료**
3. ✅ **Server Action 단위 테스트** (인프라 + 보안 핵심 3개 / 12 케이스 완료) — 다음 PR에서 나머지 action 확장
4. **React/Next 멘탈 모델 정리** (RSC vs Client, 'use client' 점검, Next 튜토리얼)
5. **E2E 핵심 흐름 확장** (Playwright 1개 → 5개 시나리오)
6. **DB 최적화** (`EXPLAIN ANALYZE`, 인덱스, RLS 회귀 점검)

## Current Progress

### 앱 자체
모든 기능 + 보안 가드 + 모바일 UX 최적화 + 운영 관찰 도구 통합까지 main에 push 되어 Vercel 배포 완료.

### 학습 트랙 (현재 위치)
**단계 1, 2, 3 (첫 PR) 완료.** 단계 3은 인프라 + 보안 핵심 3개 action (12 케이스) 까지 완료. 다음 PR에서 나머지 action 확장 예정.

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

#### 단계 1/2 사이 — 관찰 도구 사용법 학습 (이번 세션 후반)
**셋업이 아니라 사용법** 익히기. 깔아둔 도구가 무용지물이 되지 않도록.

**Sentry 깊게 다룬 것**:
- Issues 탭 컬럼 의미 (Users / Events / Age / Trend) + 우선순위 판단 룰
- 이슈 상세 페이지의 **디버깅 4단계 recipe**: Users·Events → Tags 3개(env/release/transaction) → Stack Trace 강조줄 → Breadcrumbs
- 다른 섹션(Highlights / Trace Preview / HTTP Request / Contexts / Activity)은 99% 무시 가능. 1% 까다로운 케이스의 백업
- Alert 시스템: 기본 "high priority issues" 알람 외에 **Regression alert** (production only) 직접 셋업 + 테스트 메일 수신으로 채널 검증
- 테스트 에러 4개 Resolve 처리 → 깨끗한 상태

**관련 커밋**:
- `377c8e6` docs(operations): add operations runbook for daily/weekly monitoring (#3) — **OPERATIONS.md** 신규 문서

#### 운영 테스트 시범 (이번 세션, 2026-06-07)

OPERATIONS.md의 매일/매주 루틴 전에, **OPERATIONS.md가 만든 도구가 실제로 동작하는지 검증**하기 위해 12개 시나리오를 직접 PC + 모바일에서 실행. **이 과정 자체가 운영 안정성 학습의 핵심**이 됨 — 단순 테스트 통과가 아니라, 발견사항을 묶음 PR로 처리하는 흐름까지 한 사이클 완성.

**시나리오 (T1~T12, 12/12 통과)**: PC 로그인 → 모임 생성 (책 검색, 날짜/시간, 장소) → 제출 → PDF 업로드 → Gemini 추출 → 검수 저장 → 수정 → 공유 → 참석 토글 → 모바일 핵심 흐름 → 정리

**발견 사항 처리**:
| # | 처리 | PR |
|---|------|----|
| #1 (날짜/시간 input 간격, cosmetic) | 머지 | PR #7 |
| #2 (검색 헤더 바, cosmetic) | 머지 | PR #7 |
| #3, #4 (Gemini 페이지번호/순서 보존) | 즉시 머지 | PR #5 (`1710e30`) |
| #5 (공유 링크 `?next=` 보존, UX 회귀) | 머지 | PR #7 |
| #6 (모임 상세 Attendance 복원, UX) | **기각** — IA 결정(RSVP 홈 카드 한 곳) 유지 | - |
| #7 (Sentry catch 관찰성 구멍, 긴급) | 즉시 단독 머지 | PR #6 (`4efceb0`) |
| #8 (백그라운드 추출 결과 휘발, UX 회귀) | **유보** — 디자인 옵션 결정 필요 | - |
| #9 (Gemini 503 시 catch-all 메시지) | 진단 완료 → #10 으로 fix | - |
| #10 (Gemini 503 전용 안내 메시지) | 머지 | PR #7 |

**핵심 학습 순간**: 발견 #7 fix (catch에 `Sentry.captureException` 한 줄 추가)가 5분 후 발견 #9 진단을 가능하게 함. catch swallow → unknown → fix → 같은 사고 stack trace + breadcrumb 확보 → Gemini 503 transient임 확정. 운영 관찰성의 가치가 실시간으로 증명된 사례.

**관련 머지 commit**:
- `4efceb0` fix(discussion): capture extract failures in Sentry + console (PR #6) — 발견 #7 긴급 단독 fix
- `<PR #7 squash sha>` fix: post-ops-test bundle — UX polish, auth ?next= preservation, 503 retry copy — 발견 #1/#2/#5/#10 + Suspense bailout 후속 fix

**OPERATIONS.md 내용**:
- 즉시/PR직후 30분/매일 5분/매주 15분/매월 30분 체크리스트
- 알람 메일 도착 시 대응 runbook (New issue vs Regression)
- 이슈 디버깅 4단계 recipe
- 위험 신호 패턴 (빨간 신호 / 노란 신호)
- 빠른 링크 모음

#### 단계 3 진행 (이번 세션, 2026-06-12) — 첫 PR

`docs/superpowers/specs/2026-06-11-server-action-tests-design.md` 디자인 기반.

**완료**:
- 통합 테스트 인프라 (vitest config, dotenv, setup mocks, admin/auth/seed helpers)
- 보안 핵심 3개 action 12 케이스 (discussion-files host 가드 / approveMember RLS / applyToClub invite token)
- CI는 변경 없음 (로컬 전용)

**부수 발견 (다음 PR 후보)**:
- `approveMember`: 비-admin 호출 시 ok=true (UPDATE 0 rows). 화면에 "승인 완료" 노출 가능. action에 row count 검증 추가 필요.
- `applyToClub`: SQL 함수 `status` 필드 무시 → 이미 member여도 "신청됨" 메시지. action에서 status 분기 필요.

**다음 PR 후보**:
- 나머지 9+개 action 확장 (rotateInvite, transferAdmin, leaveClub, deleteClub, updateClub, createClub, createMeeting, updateMeeting, attendance toggle, ...)
- 위 부수 발견 2건 fix

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
- **Spring/Logback 비유**: 거의 모든 새 개념에 비유 anchor 제공 → 학습 속도 크게 향상 (Sentry=Logback+APM, DSN=appender 주소, Source map=stack trace 복원, Web Vitals=APM p75 응답시간, GitHub Actions=Jenkins+Gerrit, Alert=oncall PagerDuty)
- **수동 push 분리**: 사용자가 commit은 위임하지만 push는 직접 — 운영 반영 직전 검토 시간 확보 (사용자가 명시적으로 그렇게 요청함)
- **TaskCreate로 다단계 작업 추적**: Sentry 5단계 + Analytics 4단계 + CI/CD 4단계 + Sentry 사용법 5단계를 task로 분해 → 진행 상황 시각화
- **두 시나리오로 룰셋 검증**: (1) main에 직접 push 시도 → 거절 확인. (2) PR → CI → squash merge → 정상 흐름. 룰셋 셋업 후 이 두 가지로 검증하는 패턴이 강력함
- **"많은 정보 vs 봐야 할 것" 압축**: 사용자가 "정보가 너무 많네요. 제가 주로 봐야할 것들만 알려주세요"라고 명시. → Sentry 이슈 페이지의 ~10개 섹션을 **4단계 recipe**로 압축한 게 결정적. 처음 학습할 땐 도구의 모든 기능 나열 대신 "이 순서로만 보세요" 패턴이 훨씬 유효
- **알람 채널 검증의 표준 절차**: (a) Alert list에서 룰 등록 확인 → (b) 룰 상세에서 저장된 조건 확인 → (c) Send Test Notification으로 실제 채널 검증. 마지막 (c)가 "운영팀의 oncall 콜 테스트"에 해당. 셋업 후 즉시 검증하는 습관 권장
- **TaskCreate 12개 시나리오로 시범 진행**: T1~T12 각각 한 줄 description으로 만든 후 in_progress/completed 토글. 시범 중 끊겨도 재개 가능 + 발견 사항을 누적 PR 목록으로 관리. 다른 학습자에게 권장 패턴
- **Atomic commit per 발견 + squash merge**: 한 PR 안에서 발견별로 commit 분리 (#1, #2, #10, #5 각 commit). 작업 중 진행 추적 명확 + 머지 시 squash로 어차피 합쳐짐. 학습자 입장에서 PR 구성 단계 보이기 좋음
- **Rebase로 commit 제거 후 영향 검증 절차**: 발견 #6 commit을 `git rebase --onto <parent> <commit> <branch>`로 깔끔 제거. 후속 검증 4단계: (a) `git diff main HEAD -- <원래 파일>` 빈 출력 확인 (b) working tree clean (c) 각 commit이 자기 파일만 건드림 확인 (d) `git range-diff`로 rebase된 commit이 원본과 동일한지 확인. 이 절차로 push 전 안전 보장
- **발견 #7 → #9 진단 사례**: 운영 관찰성의 가치가 같은 세션 안에서 한 사이클로 증명됨. catch에 `Sentry.captureException` + `console.error` 한 줄 추가하는 fix가 그 후 같은 에러의 stack trace + breadcrumb 확보로 직결. Spring 환경의 "catch 안 비우기" 원칙이 Next.js / Sentry 환경에서도 그대로 적용됨을 학습

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
- **CI에 `pnpm build` 없음 → prerender 에러 Vercel preview에서야 잡힘**: 이번 세션 PR #7에서 `useSearchParams`를 client에서 추가했는데 `pnpm tsc --noEmit` + vitest는 통과. Vercel preview deploy가 처음으로 `useSearchParams() should be wrapped in a suspense boundary` 에러 잡음 → 추가 commit으로 Suspense 감싸기 fix. 교훈: **typecheck ≠ build**. dynamic API (useSearchParams, cookies, headers) 추가 시 PR 전 로컬 `pnpm build` 1회 권장. CI workflow에 `pnpm build` 추가 검토 가치 있음 (메모리 `feedback_local_build_before_pr`로 저장)
- **server action catch가 exception 통째로 삼킴 → 운영 진단 불가**: 단계 1 셋업 단계에 들어가 있던 `extractQuestionsFromPdf`의 catch가 `'발제문 추출에 실패했습니다.'`만 반환하고 `e`를 버려서, 실제 Gemini 503 발생 시 Sentry/Vercel logs 둘 다 비어있어 진단 1시간 지체. `console.error(e) + Sentry.captureException(e)` 두 줄 추가가 5분 후 같은 사고에서 stack trace 확보 → 즉시 원인 확정. 다음 세션에서 `lib/actions/**` 다른 catch들도 같은 패턴인지 grep 1회 권장 (메모리 `feedback_no_catch_swallow`로 저장)

## Next Steps

### 즉시 (다음 세션 시작 시)

**A. 단계 3 확장 (나머지 server action + 부수 발견 2건 fix) ← 주력**

첫 PR에서 인프라 + 보안 핵심 3개 (12 케이스) 완료. 다음 PR 타깃:
- 나머지 action: rotateInvite, transferAdmin, leaveClub, deleteClub, updateClub, createClub, createMeeting, updateMeeting, attendance toggle 등
- UX 버그 2건: approveMember가 비-admin에도 ok=true 리턴, applyToClub가 이미-member에 "신청됨"
- 패턴은 첫 PR과 동일 (`tests/integration/actions/*.test.ts` 추가만)

**B. 발견 #8 처리 (백그라운드 추출 결과 휘발, UX 회귀)**

이번 세션에서 발견되었지만 디자인 옵션 결정 필요해서 유보. 옵션:
- (a) `beforeunload` 가드로 사용자에게 경고
- (b) candidates를 DB에 임시 저장 → 재진입 시 복원 (schema 변경 필요)
- (c) 추출 중 navigation 차단 (UX 손상)

세션 시작 시 옵션 결정 → fix → PR. 단계 3 작업 사이의 짧은 휴식 같은 작업으로 적합.

**C. CI 워크플로에 `pnpm build` 추가 검토**

이번 세션에서 `useSearchParams` Suspense bailout이 Vercel preview에서야 잡힘. CI 워크플로(`.github/workflows/ci.yml`)에 `pnpm build` 단계 추가하면 다음 PR부터 같은 패턴 미리 차단. 단점: CI 소요 시간 증가 (현재 30초 → 1-2분 예상). 가치 판단 후 적용.

**D. Vercel Analytics / Speed Insights 사용법 (보충, 선택)**

지난 세션에 셋업했지만 사용법 학습 안 함. 단계 3 진행 중 짬짬이 5~10분씩 다뤄도 OK. OPERATIONS.md의 "매일 5분 루틴"으로 실습.

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
- `README.md` — Gemini·Kakao·IA·보안 가드 + `SENTRY_AUTH_TOKEN` 명시 완료
- `OPERATIONS.md` — **운영 일과 runbook (이번 세션 신규)**. 매일/주간/월간 체크리스트 + 알람 대응
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
- `feedback_local_build_before_pr`: PR 전 `pnpm build` 1회. tsc/CI는 prerender 에러 못 잡음
- `feedback_no_catch_swallow`: server action catch는 반드시 `console.error` + `Sentry.captureException`. exception 통째로 삼키지 말 것

## 환경

- macOS, zsh
- pnpm 11.5.0
- Node v26.0.0 (매우 신상 — Sentry instrumentation에서 `DEP0205 module.register() deprecated` 경고 발생하지만 동작은 정상)
- Next.js 16.2.6, React 19.2
- 로컬 Supabase Docker 컨테이너 (포트 54323 Studio)
- 운영: Vercel icn1 (서울) + Supabase Cloud + Sentry US
- Branch 정책: **PR + CI 통과 강제** (main 직접 push 차단됨). 작업은 feature branch → PR → Squash merge
- 운영 URL: `https://book-club-five-nu.vercel.app/`

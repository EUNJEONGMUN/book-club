# 부글부글 — 독서모임 이벤트 관리 웹

독서모임 **부글부글 전용 모바일 우선** 웹 앱. 모임 일정과 참석, 책 정보, 발제문(질문 + 자료 PDF), 멤버 관리를 한 곳에서 처리한다. 호스트는 PDF 발제 자료를 올려두고 AI가 추출한 토론 질문 초안을 검수해 등록할 수 있다.

현재 로컬 DB는 단일 모임 구조로 전환되었다. 홈 `/`, 일정 `/meetings`, 멤버 `/members`, 설정 `/more`, 가입 신청 관리 `/more/applicants`, 승인 대기 `/pending`을 사용한다. 기존 부글부글 주소는 유지된 `legacy_club_id`로 새 주소에 연결한다. `BOOK_CLUB_ID` 환경변수는 더 이상 필요하지 않다.

DB는 `club_settings`(한 행), `members`(사용자당 한 행), `invites`와 기존 일정·발제·참석·한줄 평 테이블을 사용한다. 기존 일정 ID·파일 경로·사용자 계정·초대코드는 보존한다. 이전 그룹 테이블과 변경 전 프로필·일정은 외부 API에서 접근할 수 없는 `legacy_multiclub` 스키마에 보관한다. 회원 자격·관리자 권한은 `members.role`이 기준이며, 예전 `profiles.is_admin` 값은 보관본에만 남는다.

**운영에는 아직 2단계를 적용하지 않았다.** 적용 전 전체 DB·Storage 백업, 대상 부글부글과 관리자 확인, 마이그레이션 전후 보존 검사 및 권한 시험이 필요하다. 다른 그룹에 일정이 있거나 검증된 부글부글 UUID가 유일하게 식별되지 않으면 마이그레이션이 중단된다. 복수 그룹의 멤버십을 합치지 않는다. 상세 검증·백업 절차는 `docs/bootstrap.md`를 참고한다.

> 운영 도메인 외에 로컬에서도 동일하게 구동되도록 Supabase CLI 기반의 마이그레이션·시드 흐름을 갖춘다. 운영은 Vercel(서울 리전) + Supabase Cloud.

---

## 주요 기능

### 모임
- 📚 **모임 등록/수정** — Kakao 책 검색 API로 제목·저자·표지를 자동 채움, 직접 입력도 가능
- 📍 **장소 검색** — Kakao 로컬 API로 카페·도서관 등 장소명 자동 완성 (이름·주소·지도 URL 포함)
- 🗓️ **모임 일정** — 날짜 + 30분 단위 시간 선택
- ✅ **참석 체크** — 참석 / 불참 / 미정 토글; **다음 모임 카드**(홈 탭)에서 본인 참석 상태와 전체 참석 현황을 한눈에
- 📝 **모임 상세 페이지** — 책 정보 + 발제문 중심 (호스트 액션은 헤더 오버플로 `⋯` 메뉴: 정보 수정 / 공유 / 삭제)
- 🔗 **공유** — `navigator.share` → 클립보드 → `prompt` 3단 폴백 (KakaoTalk 인앱 브라우저 대응)

### 발제문
- 📄 **자료 업로드** — PDF / 이미지 (최대 20MB) → Supabase Storage 보관, 한글 파일명 유지 (`?download=` 파라미터)
- 🤖 **AI 발제문 추출** — Gemini 2.5 Flash + JSON Structured Output으로 PDF에서 번호 매겨진 토론 질문만 추출 (서문/이미지 텍스트/사전식 정의 제외)
- ✏️ **후보 검수 UI** — 미리보기/텍스트 토글, 순서 변경 (↑↓), 삭제, 직접 추가, 일괄 저장
- 💬 **질문 CRUD** — 호스트가 인라인으로 추가/수정/삭제
- ✍️ **마크다운 에디터** — 굵게(`**`), 기울임(`*`), 인용구(`>`), 표(GFM), 코드 블록, 체크박스
  - `Ctrl/⌘+B`: 선택 영역 굵게
  - 텍스트 선택 + URL 붙여넣기 → `[선택텍스트](URL)` 자동 변환
  - 미리보기 영역에서 링크 클릭은 새 탭으로 열림 (편집 모드 전환 안 됨)

### 사용자
- 👥 **멤버 명단** — 설정 탭에서 본인 + 알파벳 순 정렬, 한국어 로케일 기반
- 📖 **참여 이력** — 멤버 카드 펼침으로 과거 참석/발제 이력 조회
- 🪪 **프로필** — 이름·아바타 (아바타는 Supabase Storage `avatars` 버킷에 본인 폴더만 쓰기 가능)
- 🔐 **관리자 승인** — 가입 후 관리자가 승인해야 메인 화면 접근 가능 (`pending` 페이지로 격리)
- 🪧 **인증** — 이메일/비밀번호 + Google OAuth

---

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프레임워크 | Next.js 16.2 (App Router, RSC + Server Actions, Turbopack) |
| 언어 | TypeScript 5 (strict), React 19.2 |
| 백엔드 | Supabase (Postgres + Auth + Storage + RLS) — `@supabase/ssr` |
| UI | Tailwind CSS v4, shadcn/ui (base-ui), lucide-react |
| 폼/검증 | React Hook Form + Zod v4 |
| 마크다운 | `react-markdown` + `remark-gfm` |
| 외부 API | Kakao Book Search, Kakao Local Search, **Google Gemini 2.5 Flash** |
| 알림 | sonner (toast) |
| 날짜 | date-fns (한국어 로케일) |
| 테스트 | Vitest (단위·로컬 Postgres/RLS) + Playwright (조회 전용 E2E) |
| 패키지 매니저 | pnpm |
| 호스팅 | Vercel (icn1·서울) + Supabase Cloud |

---

## 디렉토리 구조

```
app/
  (auth)/                      로그인·회원가입·OAuth 콜백
  (app)/                       인증 필수 영역
    page.tsx                   홈 (다음 모임 카드 + 참석 토글/현황)
    meetings/
      page.tsx                 모임 목록 (다가오는·지난)
      new/page.tsx             신규 모임 등록
      [meetingId]/
        page.tsx               모임 상세 (발제문 중심)
        edit/                  모임 정보 수정
    members/                   멤버·참여 이력
    pending/                   가입 승인 대기
    more/                      모임 설정·관리자 기능·내 프로필
    clubs/                     예전 주소 연결 전용
components/
  ui/                          shadcn/ui 기본 컴포넌트 (button, dialog, dropdown-menu...)
  layout/                      BottomNav 등 레이아웃
  meeting/                     MeetingForm / MeetingDetailHeader / MeetingHeaderMenu /
                               BookSearch / LocationSearch / NextMeetingCard /
                               AttendanceToggle / AttendanceSummary /
                               DiscussionFileUploader / CandidateQuestionsEditor /
                               DiscussionQuestionForm / DiscussionQuestionList /
                               MarkdownEditor
  club/                        모임 정보·멤버 카드·초대·가입 신청·관리자 이양
  profile/                     AvatarUploader
lib/
  supabase/                    클라이언트 4종 (client/server/middleware/admin)
  actions/                     Server Actions (mutations)
    meetings.ts                모임 생성/수정/삭제
    attendance.ts              참석 상태 upsert
    questions.ts               단일 질문 CRUD
    discussion-files.ts        PDF 업로드/삭제, Gemini 추출, 일괄 저장
    book-search.ts             Kakao 책 검색
    location-search.ts         Kakao 로컬 검색
    profile.ts                 프로필 수정, 아바타 업로드
    club.ts                    가입 신청·승인·초대·모임 설정·관리자 이양
  auth/membership.ts           단일 모임의 가입 상태·접근 권한
  services/                    내부 멤버십·설정·초대 처리
  queries/club.ts              단일 모임·멤버·이력 조회
  legacy-club-url.ts           예전 주소 연결에만 사용하는 ID 조회
  validation/                  Zod 스키마
  types.ts                     도메인 타입
  database.types.ts            Supabase 자동 생성 타입
supabase/
  migrations/                  DB 마이그레이션 (시간순)
  config.toml                  로컬 Supabase 설정
  seed.sql                     로컬 개발용 시드 (admin 계정)
scripts/
  test-gemini-extract.mjs      Gemini 프롬프트 반복 테스트
  check-local-records.mjs     현재/보관 기록의 전후 보존 비교
tests/
  e2e/                         Playwright 시나리오
middleware.ts                  인증·승인 가드
next.config.ts
vercel.json                    리전 icn1 고정
```

---

## DB 스키마 (단일 모임)

- `auth.users` → `profiles` → `members(user_id PK, role, joined_at)`
- `club_settings(id=1, legacy_club_id, name, description, created_by, created_at, updated_at)`
- `invites(id, token, created_by, created_at, expires_at, revoked_at)`
- `meetings(id, host_id, 책·일시·장소·발제 파일 정보)` — `club_id` 없음
- `discussion_questions`, `attendances`, `meeting_reviews` — 기존 `meeting_id`·`user_id` 관계 유지
- `legacy_multiclub` — 이전 그룹·멤버십·초대 및 프로필·일정 원본. public API에 노출하지 않음

### Storage 버킷

| 버킷 | 용도 | 크기 제한 | 공개 |
|---|---|---|---|
| `avatars` | 프로필 사진 | 5MB | ✅ |
| `book-covers` | 책 표지 | 5MB | ✅ |
| `discussion-files` | 발제 PDF/이미지 | 20MB | ✅ |

### RLS 정책 요약
- 승인된 `members`의 `admin`·`member`만 모임·발제·참석을 조회한다. 승인 대기자는 본인의 신청 상태만 확인한다.
- `is_member()`·`is_admin()`으로 자격을 검사한다. 일정 수정·삭제와 발제 자료 변경은 해당 일정의 호스트만 가능하다.
- 참석은 본인 또는 호스트·관리자가 변경할 수 있다. 지난 참석의 일반 멤버 변경 제한은 서버에서도 검사한다.
- `apply_for_membership(token)`은 유효한 초대코드만 받아 pending 멤버십을 생성한다. 중복 신청은 기존 역할·가입 시각을 유지한다.
- 관리자는 pending → member 승인과 거절, 초대 발급, 관리자 이양을 수행한다. 사용자 ID·이전 모임 ID는 API로 수정할 수 없다.
- `club_settings`는 한 행이며 일반 API에 생성·전체 삭제 권한이 없다. `legacy_multiclub` 보관 스키마도 외부 API에 노출하지 않는다.
- 비공개 한줄 평은 작성자만 조회한다. 익명 표시의 작성자 마스킹은 현재 앱 서버에서 수행한다.
- 발제 파일 경로와 공개 다운로드 URL은 유지하며, 저장소의 쓰기·수정·삭제도 멤버인 호스트로 제한한다.

---

## 인증 & 권한 흐름

가입 → 프로필 생성 → 초대코드로 신청 → `members.role='pending'` → 관리자 승인 → `member`.
로그인 상태와 멤버 자격을 구분하며 승인 전 사용자는 `/pending`, 미가입 사용자는 `/onboarding`으로 이동한다. 그룹 생성·전체 삭제는 제공하지 않는다.

권한 가드:
- 모임 작성/수정/삭제: `host_id = auth.uid()` (RLS) + Server Action 가드
- 발제문 업로드/추출/일괄 저장: 서버에서 `assertHost(meetingId)` 1차 가드
- 일반 멤버: 모임 기록 조회 + 참석 토글 + 자기 프로필 수정
- 관리자: 위 + 가입 신청 승인/거절, 초대링크 발급/revoke, 모임 소개 수정, 다른 멤버에게 관리자 이양

`assertHost(meetingId)`는 `lib/actions/discussion-files.ts`에 정의된 헬퍼로, 모든 변형 Server Action 첫 줄에서 호출되어 미인증/타인의 모임을 차단한다. SSRF 방지를 위해 Gemini 호출은 PDF URL이 **해당 모임의 Supabase storage 경로**로 시작하는지도 검증한다.

---

## 로컬 개발

### 요구사항
- Node.js 20+
- pnpm
- Docker (로컬 Supabase 컨테이너)

### 초기 설정
```bash
pnpm install
pnpm dlx supabase start           # 로컬 Supabase 기동 (Postgres + Studio + Storage)
pnpm exec supabase migration up --local  # 기존 데이터 보존하며 변경 적용
cp .env.example .env.local        # 환경변수 템플릿 복사
# .env.local 값 채우기: supabase status 출력으로 SUPABASE_URL/ANON_KEY/SERVICE_ROLE 채움
# KAKAO_REST_API_KEY, GEMINI_API_KEY 는 각 콘솔에서 발급
pnpm dev
```

브라우저: http://localhost:3000
Supabase Studio: http://localhost:54323

기본 관리자 시드 계정: `seed.sql` 참고 (`docs/bootstrap.md`).

### 자주 쓰는 명령어
```bash
pnpm dev                          # 개발 서버 (Turbopack)
pnpm build                        # 프로덕션 빌드
pnpm test                         # Vitest 단위
pnpm test:e2e                     # Playwright E2E

pnpm dlx supabase start           # 로컬 컨테이너 기동
pnpm dlx supabase stop
pnpm exec supabase migration up --local  # 기존 데이터 보존하며 변경 적용
pnpm dlx supabase migration up --local
pnpm dlx supabase gen types typescript --local > lib/database.types.ts
```

운영 DB 적용은 일반 개발 명령에 포함하지 않는다. 단일 모임 전환은 `docs/single-club-cutover.md`의 백업·쓰기 중단·검증 순서를 따른다. 현재 단계·중단 기준과 로컬 사전 검사 사용법은 [운영 실행 체크리스트](docs/production-execution-checklist.md)를 참조한다. 사전 검사 성공은 운영 실행 승인이 아니다.

2026-11-09 별도 관리형 테스트에서 실제 실행 도구의 전환·쓰기 차단·백업 복원·복구·해제 **337개 검사**와 안전 검사44개를 통과했다. 기존 테스트 계정·기록·파일은 보존했고 이번 작업에서 운영 연결·배포는 하지 않았다. [검증 범위와 남은 조건](docs/hosted-cutover-verification.md)을 따른다. 도구는 테스트 전용이며 운영 대상으로 사용할 수 없다.

이후 [배포·복구 후보 소스](docs/release-candidate-preparation.md) 3개의 고정 패키지와 Node24/기본 Next 빌드3개·로컬 응답23개·안전 검사48개를 확인했다. 실제 Vercel 후보 배포는 아직 생성하지 않았고 main 병합·운영 DB 변경도 보류한다.

2026-11-10 [운영 실행·최종 백업·실제 복원 연결](docs/operational-backup-linkage.md) 4흐름67개·복원390개·안전59개를 통과했다. 전체 Auth 차단 중 갱신 HTTP500에 현재 SDK가 로그인 정보를 지울 수 있음을 확인해 **실제 운영 실행은 코드에서 차단**했다. 운영 DB·배포에는 적용하지 않았으며 기존 로그인 보존 방식을 보완하기 전 실행하지 않는다.

---

## 외부 API 키 발급 가이드

### Kakao (책 + 장소)
1. https://developers.kakao.com → 내 애플리케이션 → 추가
2. **앱 키 > REST API 키** 복사 → `.env.local` 의 `KAKAO_REST_API_KEY`
3. **제품 설정 > 카카오맵** 활성화 (장소 검색에 필요)

### Google Gemini (발제문 추출)
1. https://aistudio.google.com → Get API key
2. 새 프로젝트 또는 기존 프로젝트 선택 → 키 생성
3. `.env.local` 의 `GEMINI_API_KEY` 에 붙여넣기
4. 무료 티어 한도: Gemini 2.5 Flash = 250 요청/일, 250K TPM, 1M 토큰 컨텍스트

---

## 환경변수

| Key | 용도 | 노출 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 클라이언트용 publishable key | client |
| `SUPABASE_SERVICE_ROLE_KEY` | 관리자 작업용 secret (RLS 우회) | server only |
| `NEXT_PUBLIC_SITE_URL` | OAuth 리디렉션 베이스 URL | client |
| `KAKAO_REST_API_KEY` | Kakao 책/장소 검색 | server only |
| `GEMINI_API_KEY` | Gemini 발제문 추출 | server only |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` | Google OAuth | server only |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` | Google OAuth | server only |
| `SENTRY_AUTH_TOKEN` | Source map 업로드 (Vercel 빌드 전용) | server only |

Vercel의 Production / Preview / Development는 환경별로 분리한다. Production의 Supabase 주소·anon 키·service-role 키를 Preview/Development에 복사하지 않는다. Preview에는 별도 검증 DB의 같은 프로젝트에 속한 세 값을 함께 설정하고, 실회원 없는 시험 데이터를 사용한다. 로컬은 로컬 Supabase만 사용한다.

2026-11-08 Supabase 세 변수의 Production/Preview 분리를 완료했다. Production 기존 항목은 유지하고 Preview에만 별도 `book-club-preview` 프로젝트의 세 값을 등록했다. 새 Preview에서 실제 이메일 로그인·권한·다운로드 22개 확인과 운영/테스트 기록 보존 비교를 통과했다. Preview Google/Kakao/Gemini 설정과 운영 반영은 별도 범위로 남아 있다. 기존 Preview 배포에는 옛 값이 남아 있을 수 있다. 최신 결과는 `docs/hosted-preview-verification.md`, 연결 분리 기록은 `docs/preview-isolation.md`를 따른다.
`SENTRY_AUTH_TOKEN` 은 로컬에 두지 않고 (`.env.sentry-build-plugin` 은 wizard 생성 시 자동으로 gitignored) Vercel 환경변수로만 관리.

---

## 통합 테스트 (실제 로컬 Postgres/RLS)

```bash
pnpm test
pnpm test:integration
```

새 통합 테스트는 고정된 로컬 Docker 컨테이너 `supabase_db_book-club`에만 연결한다. 각 시험의 사용자·일정·파일 메타데이터 생성과 변경은 한 트랜잭션에서 **항상 롤백**하며, 전체 기존 데이터 지문을 실행 전후 비교한다. 운영 URL·키·`.env.test`를 사용하지 않고 DB를 초기화하지 않는다. 과거 여러 그룹용 테스트는 `tests/legacy-multiclub`에 실행되지 않는 원본으로 보관했다.

---

## 배포

### 인프라
- **Vercel** — Next.js 호스팅 (서울 리전, `vercel.json`에 고정)
- **Supabase Cloud** — DB + Auth + Storage
- **GitHub** — 푸시 → Vercel 자동 빌드

### 배포 파이프라인

현재 Vercel은 main 변경 시 운영 배포와 운영 도메인 자동 연결이 켜져 있다. 다른 브랜치는 자동 Preview를 만든다. GitHub CI는 타입·단위 검사만 수행하며 DB 전환을 실행하지 않는다.

단일 모임 앱은 기존 운영 DB 구조와 호환되지 않으므로 단순 push/merge를 운영 전환 절차로 사용하지 않는다. Preview의 운영 연결을 먼저 분리하고, 구 앱 호환 점검 브리지 → 외부 쓰기 차단 → 최종 백업/복원 검증 → DB 전환 → 보호된 새 앱 확인 → 재개 순서로 진행한다. 상세는 `docs/single-club-cutover.md`를 따른다. 실제 원격 설정·DB 변경·push·배포는 별도 승인 범위다.

---

## 보안·신뢰성 가드 (요약)

- **Server Action 권한 검증** — 모든 mutation 액션은 `assertHost`/`getCurrentProfile` 우선 호출
- **SSRF 방어** — Gemini에 보내는 PDF URL이 해당 모임의 Supabase storage 접두사로 시작하는지 검증
- **파일 사이즈 캡 + 타임아웃** — 업로드 20MB 한도, AI 추출 60초 타임아웃, HEAD pre-check
- **Storage 정리** — 새 업로드 시 기존 객체 삭제, 삭제 시 storage 객체도 함께 제거 (orphan 방지)
- **파일명 유지** — 한글 파일명은 DB 컬럼(`discussion_file_name`)에 별도 보관, 다운로드 시 `?download=` 파라미터로 Content-Disposition 부착
- **race 가드** — PDF 추출·후보 저장·모임 삭제 모두 in-flight 동안 버튼 비활성화

---

## 문서
- 설계 스펙: `docs/superpowers/specs/2026-05-31-book-club-mvp-design.md`
- 구현 계획: `docs/superpowers/plans/2026-05-31-book-club-mvp.md`
- IA 리팩터링 의사결정: `.omc/specs/deep-interview-meeting-detail-ia.md`
- 부트스트랩: `docs/bootstrap.md`
- 테스트 시나리오: `docs/test-scenarios.md`

## 현재 남은 검토 항목

단일 모임 전환과 별도로, 업로드 요청 용량과 Storage 제한의 불일치, 익명 한줄 평의 DB 직접 조회 시 작성자 보호, 프로필 생성의 계정 소유자 검증, 실험 중인 이미지 공유는 추가 검토 대상이다. 위 전환 검증이 이 항목들의 해결을 의미하지는 않는다.

운영 전환·복구 계획: `docs/single-club-cutover.md`. 보완 마이그레이션 04는 과거 참석 보호와 보관본의 독립성/읽기 전용을 강제한다. 운영 반영과 외부 쓰기 차단 설정은 아직 수행하지 않았다.

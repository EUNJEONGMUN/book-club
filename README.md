# 부글부글 — 독서모임 이벤트 관리 웹

소규모 독서모임을 위한 **모바일 우선** 웹 앱. 모임 일정과 참석, 책 정보, 발제문(질문 + 자료 PDF), 멤버 관리를 한 곳에서 처리한다. 호스트는 PDF 발제 자료를 올려두고 AI가 추출한 토론 질문 초안을 검수해 등록할 수 있다.

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
| 테스트 | Vitest (단위) + Playwright (E2E) |
| 패키지 매니저 | pnpm |
| 호스팅 | Vercel (icn1·서울) + Supabase Cloud |

---

## 디렉토리 구조

```
app/
  (auth)/                      로그인·회원가입·승인 대기·OAuth 콜백
  (app)/                       인증 필수 영역
    page.tsx                   홈 (다음 모임 카드 + 참석 토글/현황)
    meetings/
      page.tsx                 모임 목록 (다가오는·지난)
      new/page.tsx             신규 모임 등록
      [id]/
        page.tsx               모임 상세 (발제문 중심)
        edit/                  모임 정보 수정
    more/                      설정 (멤버/내 발제/프로필)
components/
  ui/                          shadcn/ui 기본 컴포넌트 (button, dialog, dropdown-menu...)
  layout/                      BottomNav 등 레이아웃
  meeting/                     MeetingForm / MeetingDetailHeader / MeetingHeaderMenu /
                               BookSearch / LocationSearch / NextMeetingCard /
                               AttendanceToggle / AttendanceSummary /
                               DiscussionFileUploader / CandidateQuestionsEditor /
                               DiscussionQuestionForm / DiscussionQuestionList /
                               MarkdownEditor
  member/                      MemberCard (이력 펼침)
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
    admin.ts                   관리자 승인
  queries/                     조회 (getNextMeeting / getMeetingDetail / 멤버 이력 등)
  validation/                  Zod 스키마
  types.ts                     도메인 타입
  database.types.ts            Supabase 자동 생성 타입
supabase/
  migrations/                  DB 마이그레이션 (시간순)
  config.toml                  로컬 Supabase 설정
  seed.sql                     로컬 개발용 시드 (admin 계정)
scripts/
  test-gemini-extract.mjs      Gemini 프롬프트 반복 테스트용 스탠드얼론 스크립트
tests/
  e2e/                         Playwright 시나리오
middleware.ts                  인증·승인 가드
next.config.ts
vercel.json                    리전 icn1 고정
```

---

## DB 스키마 (Supabase)

```
auth.users  (Supabase 내장)
   │ 1:1
   ▼
profiles                meetings                    discussion_questions
─ id (=auth.users)      ─ id                        ─ id
─ display_name          ─ host_id  ─ FK profiles    ─ meeting_id  ─ FK meetings
─ avatar_url            ─ book_title, book_author   ─ order_idx (정렬)
─ approved              ─ book_cover_url            ─ content (마크다운)
─ is_admin              ─ scheduled_at
                        ─ location_name/url/address
                        ─ discussion_file_url        attendances
                        ─ discussion_file_name       ─ meeting_id  ─ FK meetings
                                                     ─ user_id     ─ FK profiles
                                                     ─ status (enum: attending/not_attending/undecided)
                                                     UNIQUE(meeting_id, user_id)
```

### Storage 버킷

| 버킷 | 용도 | 크기 제한 | 공개 |
|---|---|---|---|
| `avatars` | 프로필 사진 | 5MB | ✅ |
| `book-covers` | 책 표지 | 5MB | ✅ |
| `discussion-files` | 발제 PDF/이미지 | 20MB | ✅ |

### RLS 정책 요약
- 모든 테이블 `authenticated` 만 접근
- 조회는 자유, 생성·수정·삭제는 본인/호스트만 (DB RLS + Server Action 레벨 `assertHost` 이중 가드)
- 관리자 승인(`approved` 변경)은 service role 통해 RLS 우회
- 발제 파일 업로드 액션은 호출자 검증 후에만 storage 객체 생성·삭제

---

## 인증 & 권한 흐름

```
가입 (이메일 or Google)
  └→ profiles 생성 (approved=false)
     └→ middleware가 /pending 으로 리다이렉트
        └→ 관리자가 설정 탭에서 승인
           └→ 모든 페이지 접근 가능
              ├→ 모임 작성/수정/삭제 : host_id 일치자만
              ├→ 발제문 업로드/추출/일괄 저장 : 서버에서 assertHost 검증
              └→ 일반 멤버 : 조회 + 참석 토글 + 자기 프로필 수정
```

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
pnpm dlx supabase db reset        # 마이그레이션 + seed 적용
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
pnpm dlx supabase db reset        # 마이그레이션 + seed 재적용
pnpm dlx supabase migration up --local
pnpm dlx supabase db push --linked
pnpm dlx supabase gen types typescript --local > lib/database.types.ts
```

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

Vercel 콘솔에서는 Production / Preview / Development 환경에 모두 동일하게 설정.
`SENTRY_AUTH_TOKEN` 은 로컬에 두지 않고 (`.env.sentry-build-plugin` 은 wizard 생성 시 자동으로 gitignored) Vercel 환경변수로만 관리.

---

## 배포

### 인프라
- **Vercel** — Next.js 호스팅 (서울 리전, `vercel.json`에 고정)
- **Supabase Cloud** — DB + Auth + Storage
- **GitHub** — 푸시 → Vercel 자동 빌드

### 배포 파이프라인
```
git push origin main
  └→ Vercel 자동 빌드/배포 (icn1)
DB 마이그레이션이 있을 때:
  pnpm dlx supabase db push --linked   # 클라우드 DB에 증분 적용
```

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

# 독서모임 이벤트 관리 웹

소규모 독서모임을 위한 모바일 우선 웹 앱. 모임 일정, 참석 체크, 발제문, 멤버 관리를 한 곳에서.

🔗 **운영 환경**: https://REMOVED

---

## 주요 기능

- 📚 **모임 등록** — 책 제목·저자·표지(URL), 날짜·시간, 장소·링크
- ✅ **참석 체크** — 참석 / 불참 / 미정 토글, 항목별 명단 토글
- 💬 **발제문 관리** — 모임당 질문 목록 (호스트 권한)
- 👥 **멤버 명단** — 참석/발제 횟수, 본인·관리자는 참여이력 조회
- 🔐 **관리자 승인** — 가입 후 관리자가 승인해야 서비스 이용 가능
- 🪪 **인증** — 이메일/비밀번호 + Google OAuth
- 📷 **이미지 업로드** — 책 표지·아바타 (Supabase Storage)

---

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프레임워크 | Next.js 16 (App Router, RSC + Server Actions) |
| 언어 | TypeScript 5 (strict) |
| UI | Tailwind CSS v4, shadcn/ui (`@base-ui/react`), lucide-react |
| 백엔드 | Supabase (Postgres + Auth + Storage + RLS) |
| 폼·검증 | React Hook Form + Zod v4 |
| 알림 | sonner (toast) |
| 날짜 | date-fns (한국어 로케일) |
| 테스트 | Vitest (단위) + Playwright (E2E) |
| 배포 | Vercel (Seoul/icn1 리전) + Supabase Cloud |

---

## 디렉토리 구조

```
app/                  App Router (페이지·라우팅)
  (auth)/             로그인·가입·승인대기·OAuth 콜백
  (app)/              인증 후 메인 그룹 (홈·모임·설정)
components/
  ui/                 shadcn/ui 기본 컴포넌트
  layout/             BottomNav 등
  meeting/            모임 관련 컴포넌트
  member/             멤버 카드
  profile/            아바타 업로더
lib/
  supabase/           클라이언트 4종 (client/server/middleware/admin)
  actions/            Server Actions (mutations)
  queries/            데이터 조회 (server-side)
  validation/         Zod 스키마
  types.ts            도메인 타입
  database.types.ts   Supabase 자동 생성 타입
supabase/
  migrations/         DB 마이그레이션
  config.toml         로컬 Supabase 설정
  seed.sql            로컬 개발용 초기 데이터
middleware.ts         인증 가드
vercel.json           Vercel 리전 고정
```

---

## DB 스키마

```
auth.users (Supabase 내장)
    │ 1:1
    ▼
profiles (id, display_name, avatar_url, joined_at, approved, is_admin)
    │ host_id              │ user_id
    ▼                      ▼
meetings              attendances
(book_*, scheduled_at, (meeting_id, user_id,
 location_*)           status: enum)
    │
    ▼
discussion_questions
(meeting_id, order_idx, content)
```

**RLS 정책 요약**

- 모든 테이블 `authenticated` 만 접근
- 조회는 자유, 수정·삭제는 본인/호스트만
- 관리자 승인(`approved` 변경)은 service role 통해 RLS 우회

---

## 인증 흐름

```
가입 (이메일 or Google)
    └→ profiles 생성 (approved=false)
       └→ 미들웨어가 /pending 으로 리다이렉트
          └→ 관리자가 설정 탭에서 승인
             └→ 모든 페이지 접근 가능
```

---

## 로컬 개발

### 요구사항

- Node.js 20+
- pnpm
- Docker (Supabase 로컬 인스턴스용)

### 초기 설정

```bash
pnpm install
pnpm dlx supabase start          # 로컬 Supabase 기동
pnpm dlx supabase db reset       # 마이그레이션 + seed 적용
cp .env.example .env.local       # 환경변수 템플릿 복사
# .env.local 의 Supabase 키들을 `supabase start` 출력값으로 채움
pnpm dev
```

브라우저: http://localhost:3000

기본 관리자 계정 등은 `docs/bootstrap.md` 참고.

### 자주 쓰는 명령어

```bash
pnpm dev                         # 개발 서버
pnpm build                       # 프로덕션 빌드
pnpm test                        # Vitest 단위 테스트
pnpm test:e2e                    # Playwright E2E (DB reset 후 실행)

pnpm dlx supabase start          # 로컬 Supabase 기동
pnpm dlx supabase stop           # 중단
pnpm dlx supabase db reset       # 마이그레이션 + seed 재적용
pnpm dlx supabase db push        # 클라우드에 마이그레이션 push
pnpm dlx supabase gen types typescript --local > lib/database.types.ts
```

---

## 배포

### 인프라

- **Vercel** — Next.js 호스팅 (서울 리전)
- **Supabase Cloud** — DB + Auth + Storage
- **GitHub** — 소스 저장 + Vercel 자동 빌드 트리거

### 배포 파이프라인

```
git push origin main
    └→ Vercel 자동 빌드/배포
       └→ icn1 리전 (서울) 서버리스 함수
```

DB 변경이 있는 경우:
```bash
pnpm dlx supabase db push        # 클라우드 DB에 마이그레이션 적용
```

### 환경변수 (Vercel)

| Key | 설명 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 클라이언트용 publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | 관리자 작업용 secret key (RLS 우회) |
| `NEXT_PUBLIC_SITE_URL` | OAuth 리디렉션 베이스 URL |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` | Google OAuth 클라이언트 ID |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` | Google OAuth 시크릿 |

---

## 문서

- 설계 스펙: `docs/superpowers/specs/2026-05-31-book-club-mvp-design.md`
- 구현 계획: `docs/superpowers/plans/2026-05-31-book-club-mvp.md`
- 부트스트랩: `docs/bootstrap.md`
- 테스트 시나리오: `docs/test-scenarios.md`

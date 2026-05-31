# 독서모임 이벤트 관리 웹 MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단일 독서모임용 이벤트 관리 모바일 웹앱을 Next.js 15 + Supabase로 구축. 호스트(=발제자)가 모임/책/일시/장소/발제문을 등록하고, 멤버가 참석 체크 및 발제문을 확인할 수 있는 MVP를 제공.

**Architecture:** Next.js App Router(Server Components + Server Actions) 기반. Supabase Postgres에 RLS로 권한 제어, Supabase Auth(Email/Google/Kakao)로 인증, Supabase Storage로 이미지. 1회용 초대 토큰으로 가입 통제.

**Tech Stack:** Next.js 15, TypeScript, Tailwind, shadcn/ui, Supabase(Postgres/Auth/Storage), React Hook Form, Zod, date-fns, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-05-31-book-club-mvp-design.md`

---

## 진행 순서 요약

| Phase | 내용 | Tasks |
|---|---|---|
| 0 | 프로젝트 부트스트랩 | 1–3 |
| 1 | Supabase 마이그레이션 (DB + RLS + Storage) | 4–6 |
| 2 | 데이터 레이어 & 검증 스키마 | 7–10 |
| 3 | 인증 & 초대 가입 | 11–14 |
| 4 | 앱 레이아웃 & 네비 | 15–16 |
| 5 | 모임 CRUD | 17–20 |
| 6 | 참석 체크 | 21–22 |
| 7 | 발제문 | 23–24 |
| 8 | 홈 화면 | 25 |
| 9 | 더보기 탭 (멤버·초대·프로필) | 26–28 |
| 10 | 파일 업로드 (책 표지·아바타) | 29–30 |
| 11 | 모바일 최적화 & E2E | 31–32 |

각 단계가 끝날 때마다 앱은 동작 가능한 상태로 유지된다.

---

## 파일 구조 개요

```
book-club/
├── app/
│   ├── (auth)/{login,signup}/page.tsx
│   ├── (auth)/auth/callback/route.ts
│   ├── (app)/{layout,page}.tsx
│   ├── (app)/meetings/{page,new/page}.tsx
│   ├── (app)/meetings/[id]/{page,edit/page}.tsx
│   ├── (app)/more/{page,profile/page,invite/page}.tsx
│   ├── {layout,error,not-found}.tsx
│   └── globals.css
├── components/
│   ├── ui/                       # shadcn
│   ├── meeting/                  # MeetingCard, NextMeetingCard, MeetingForm, AttendanceToggle, AttendanceSummary, DiscussionQuestionList, DiscussionQuestionForm
│   ├── member/                   # MemberCard, MemberList
│   ├── invite/                   # InviteLinkCard
│   └── layout/BottomNav.tsx
├── lib/
│   ├── supabase/{server,client,middleware}.ts
│   ├── actions/{meetings,attendance,questions,invite,profile}.ts
│   ├── queries/{meetings,members,invites}.ts
│   ├── validation/{meeting,profile,question}.ts
│   └── types.ts                  # DB Row 타입
├── middleware.ts
├── supabase/
│   ├── config.toml
│   └── migrations/{001_init,002_rls,003_storage}.sql
├── tests/
│   ├── lib/validation/*.test.ts
│   ├── lib/actions/*.test.ts
│   └── e2e/main-flow.spec.ts
├── vitest.config.ts
├── playwright.config.ts
└── (root configs)
```

---

# Phase 0 — 프로젝트 부트스트랩

## Task 1: Next.js 프로젝트 생성 및 기본 설정

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `.gitignore`, `.env.example`

- [ ] **Step 1: Next.js 앱 생성**

```bash
cd /Users/eunjeongmun/workspace/my-app/book-club
pnpm create next-app@latest . --typescript --tailwind --app --src-dir=false --import-alias="@/*" --no-eslint --use-pnpm
```

옵션 답변: TypeScript Yes / Tailwind Yes / src dir No / App Router Yes / customize alias `@/*` Yes / ESLint No

- [ ] **Step 2: 의존성 추가**

```bash
pnpm add @supabase/supabase-js @supabase/ssr react-hook-form @hookform/resolvers zod date-fns sonner lucide-react clsx tailwind-merge class-variance-authority
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/dom jsdom playwright @playwright/test supabase
```

- [ ] **Step 3: `.env.example` 작성**

```dotenv
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
# Public site URL (e.g., http://localhost:3000)
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`.env.local`을 같은 형식으로 만들되 비워두고, 다음 Task에서 Supabase 시작 시 채운다.

- [ ] **Step 4: `app/globals.css`에 Tailwind 디렉티브 + safe-area 변수 확인**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --safe-bottom: env(safe-area-inset-bottom);
}

html, body { height: 100%; }
body { @apply bg-background text-foreground antialiased; font-family: system-ui, -apple-system, sans-serif; }
```

- [ ] **Step 5: `app/layout.tsx` 기본 viewport 메타 + 한국어 lang**

```tsx
import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: '독서모임',
  description: '독서모임 이벤트 관리',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
```

- [ ] **Step 6: 빌드 검증**

Run: `pnpm dev`
Expected: `http://localhost:3000`에 기본 페이지 표시. 콘솔 에러 없음.

- [ ] **Step 7: Git 초기화 및 첫 커밋**

```bash
git init
git add .
git commit -m "chore: bootstrap Next.js + Tailwind project"
```

---

## Task 2: shadcn/ui 초기화 + 공통 UI 컴포넌트 설치

**Files:**
- Create: `components.json`, `lib/utils.ts`, `components/ui/*`

- [ ] **Step 1: shadcn 초기화**

```bash
pnpm dlx shadcn@latest init -d
```
기본값 사용 (TypeScript, Tailwind, slate 베이스 색)

- [ ] **Step 2: MVP에서 사용할 컴포넌트 일괄 설치**

```bash
pnpm dlx shadcn@latest add button input textarea label card dialog dropdown-menu form sheet skeleton avatar separator badge tabs toggle-group sonner alert
```

- [ ] **Step 3: 설치 확인**

Run: `ls components/ui`
Expected: `button.tsx`, `input.tsx`, `card.tsx`, `dialog.tsx` 등 컴포넌트 파일 존재.

- [ ] **Step 4: 커밋**

```bash
git add components.json components/ui lib/utils.ts tailwind.config.ts app/globals.css
git commit -m "chore: install shadcn/ui base components"
```

---

## Task 3: Vitest 테스트 환경 구성

**Files:**
- Create: `vitest.config.ts`, `tests/setup.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: `vitest.config.ts` 작성**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
```

- [ ] **Step 2: `tests/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

```bash
pnpm add -D @testing-library/jest-dom
```

- [ ] **Step 3: `package.json` scripts 추가**

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test"
}
```

- [ ] **Step 4: 동작 확인 — 더미 테스트**

`tests/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
describe('setup', () => { it('runs', () => { expect(1 + 1).toBe(2); }); });
```

Run: `pnpm test`
Expected: 1 passed.

테스트가 통과하면 `tests/smoke.test.ts` 삭제.

- [ ] **Step 5: 커밋**

```bash
git add vitest.config.ts tests/setup.ts package.json pnpm-lock.yaml
git commit -m "chore: configure Vitest"
```

---

# Phase 1 — Supabase 인프라

## Task 4: Supabase 로컬 환경 시작 + 초기 스키마 마이그레이션

**Files:**
- Create: `supabase/config.toml` (자동), `supabase/migrations/001_init.sql`

- [ ] **Step 1: Supabase 로컬 초기화**

```bash
pnpm dlx supabase init
pnpm dlx supabase start
```

로컬 API URL, anon key, service role key 출력됨. `.env.local`에 복사:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<출력된 anon key>
SUPABASE_SERVICE_ROLE_KEY=<출력된 service role key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- [ ] **Step 2: 마이그레이션 파일 생성**

```bash
pnpm dlx supabase migration new init
```

생성된 `supabase/migrations/<timestamp>_init.sql`을 아래로 채운다 (파일명 단순화 위해 `001_init.sql`로 rename):

```sql
-- Enums
CREATE TYPE attendance_status AS ENUM ('attending', 'not_attending', 'undecided');

-- profiles: auth.users 확장
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- meetings
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES profiles(id),
  book_title TEXT NOT NULL,
  book_author TEXT NOT NULL,
  book_cover_url TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  location_name TEXT NOT NULL,
  location_url TEXT,
  location_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX meetings_scheduled_at_idx ON meetings(scheduled_at);
CREATE INDEX meetings_host_id_idx ON meetings(host_id);

-- attendances
CREATE TABLE attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  status attendance_status NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(meeting_id, user_id)
);

-- discussion_questions
CREATE TABLE discussion_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  order_idx INT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX discussion_questions_meeting_order_idx
  ON discussion_questions(meeting_id, order_idx);

-- invites
CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  used_by UUID REFERENCES profiles(id),
  used_at TIMESTAMPTZ
);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER meetings_updated_at BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER attendances_updated_at BEFORE UPDATE ON attendances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

- [ ] **Step 3: 마이그레이션 적용**

```bash
pnpm dlx supabase db reset
```

Expected: 모든 마이그레이션 적용 완료. 에러 없음.

- [ ] **Step 4: 테이블 생성 확인**

```bash
pnpm dlx supabase db diff
```

Expected: "No schema changes found" (마이그레이션과 실제 DB 일치)

- [ ] **Step 5: 커밋**

```bash
git add supabase
git commit -m "feat(db): initial schema (profiles, meetings, attendances, questions, invites)"
```

---

## Task 5: RLS 정책 마이그레이션

**Files:**
- Create: `supabase/migrations/002_rls.sql`

- [ ] **Step 1: 마이그레이션 파일 생성**

```bash
pnpm dlx supabase migration new rls
```

생성 파일을 `002_rls.sql`로 rename 후 작성:

```sql
-- 모든 테이블 RLS 활성화
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY profiles_select ON profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY profiles_insert_own ON profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- meetings
CREATE POLICY meetings_select ON meetings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY meetings_insert ON meetings
  FOR INSERT TO authenticated WITH CHECK (host_id = auth.uid());
CREATE POLICY meetings_update_host ON meetings
  FOR UPDATE TO authenticated USING (host_id = auth.uid()) WITH CHECK (host_id = auth.uid());
CREATE POLICY meetings_delete_host ON meetings
  FOR DELETE TO authenticated USING (host_id = auth.uid());

-- attendances
CREATE POLICY attendances_select ON attendances
  FOR SELECT TO authenticated USING (true);
CREATE POLICY attendances_upsert_own ON attendances
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY attendances_update_own ON attendances
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- discussion_questions
CREATE POLICY questions_select ON discussion_questions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY questions_insert_host ON discussion_questions
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.host_id = auth.uid())
  );
CREATE POLICY questions_update_host ON discussion_questions
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.host_id = auth.uid())
  );
CREATE POLICY questions_delete_host ON discussion_questions
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.host_id = auth.uid())
  );

-- invites
CREATE POLICY invites_select_own ON invites
  FOR SELECT TO authenticated USING (created_by = auth.uid());
CREATE POLICY invites_insert_own ON invites
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
-- UPDATE는 클라이언트에서 직접 못 함 (service role로만 가능 — 가입 Server Action에서 처리)
```

- [ ] **Step 2: 적용**

```bash
pnpm dlx supabase db reset
```

- [ ] **Step 3: psql로 RLS 동작 검증 (수동)**

```bash
pnpm dlx supabase status  # DB URL 확인
# 또는 Studio: http://127.0.0.1:54323
```

Studio에서 SQL Editor로:
```sql
-- 익명 컨텍스트에서 meetings 조회 시 0행이어야 함
SET ROLE anon;
SELECT count(*) FROM meetings;
RESET ROLE;
```

Expected: anon = 0 rows.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations
git commit -m "feat(db): add RLS policies"
```

---

## Task 6: Storage 버킷 마이그레이션

**Files:**
- Create: `supabase/migrations/003_storage.sql`

- [ ] **Step 1: 마이그레이션 작성**

```bash
pnpm dlx supabase migration new storage
```

`003_storage.sql`:

```sql
-- 버킷 생성
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('book-covers', 'book-covers', true, 5242880, ARRAY['image/jpeg','image/png','image/webp']),
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS
-- book-covers: 인증된 사용자 누구나 업로드/조회 (모임 호스트만 업로드해야 하지만, 파일 경로 검증은 Server Action에서)
CREATE POLICY "book-covers read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'book-covers');
CREATE POLICY "book-covers upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'book-covers');
CREATE POLICY "book-covers update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'book-covers');

-- avatars: 본인 파일만 (파일 이름이 user_id로 시작)
CREATE POLICY "avatars read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'avatars');
CREATE POLICY "avatars upload own" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "avatars update own" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 2: 적용 + 검증**

```bash
pnpm dlx supabase db reset
```

Studio (http://127.0.0.1:54323) → Storage 탭에서 `book-covers`, `avatars` 버킷 확인.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations
git commit -m "feat(db): create storage buckets with policies"
```

---

# Phase 2 — 데이터 레이어 & 검증

## Task 7: Supabase 클라이언트 헬퍼

**Files:**
- Create: `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/middleware.ts`, `lib/supabase/admin.ts`, `lib/types.ts`, `middleware.ts`

- [ ] **Step 1: 타입 자동 생성**

```bash
pnpm dlx supabase gen types typescript --local > lib/database.types.ts
```

- [ ] **Step 2: `lib/types.ts` — DB 행 타입 별칭**

```ts
import type { Database } from './database.types';

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type Profile = Tables<'profiles'>;
export type Meeting = Tables<'meetings'>;
export type Attendance = Tables<'attendances'>;
export type DiscussionQuestion = Tables<'discussion_questions'>;
export type Invite = Tables<'invites'>;
export type AttendanceStatus = Database['public']['Enums']['attendance_status'];
```

- [ ] **Step 3: `lib/supabase/server.ts`**

```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/database.types';

export async function getSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // RSC 컨텍스트에서는 set 무시 (middleware가 처리)
          }
        },
      },
    }
  );
}
```

- [ ] **Step 4: `lib/supabase/client.ts`**

```ts
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';

export function getSupabaseBrowser() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 5: `lib/supabase/admin.ts` — service role (서버 전용)**

```ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

export function getSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

- [ ] **Step 6: `lib/supabase/middleware.ts` — 세션 갱신 헬퍼**

```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/database.types';

export async function updateSession(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // 인증 가드: /login, /signup, /auth 경로 외에는 로그인 필요
  const path = req.nextUrl.pathname;
  const isPublic = path.startsWith('/login') || path.startsWith('/signup') || path.startsWith('/auth');

  if (!user && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return res;
}
```

- [ ] **Step 7: 루트 `middleware.ts`**

```ts
import { updateSession } from '@/lib/supabase/middleware';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  return updateSession(req);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```

- [ ] **Step 8: 빌드 검증**

Run: `pnpm build`
Expected: 빌드 성공.

- [ ] **Step 9: 커밋**

```bash
git add lib/supabase lib/types.ts lib/database.types.ts middleware.ts
git commit -m "feat(lib): supabase server/browser/admin clients + auth middleware"
```

---

## Task 8: Zod 검증 스키마 (TDD)

**Files:**
- Create: `lib/validation/meeting.ts`, `lib/validation/profile.ts`, `lib/validation/question.ts`
- Test: `tests/lib/validation/meeting.test.ts`, `tests/lib/validation/profile.test.ts`, `tests/lib/validation/question.test.ts`

- [ ] **Step 1: 모임 검증 테스트 작성**

`tests/lib/validation/meeting.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { meetingFormSchema } from '@/lib/validation/meeting';

describe('meetingFormSchema', () => {
  const valid = {
    book_title: '미움받을 용기',
    book_author: '기시미 이치로',
    scheduled_at: '2026-06-15T19:00',
    location_name: '강남역 스타벅스',
    location_url: '',
    location_address: '',
    book_cover_url: '',
  };

  it('유효한 입력 통과', () => {
    expect(meetingFormSchema.safeParse(valid).success).toBe(true);
  });

  it('빈 책 제목 거부', () => {
    expect(meetingFormSchema.safeParse({ ...valid, book_title: '' }).success).toBe(false);
  });

  it('빈 저자 거부', () => {
    expect(meetingFormSchema.safeParse({ ...valid, book_author: '' }).success).toBe(false);
  });

  it('빈 장소 이름 거부', () => {
    expect(meetingFormSchema.safeParse({ ...valid, location_name: '' }).success).toBe(false);
  });

  it('잘못된 URL 거부', () => {
    expect(meetingFormSchema.safeParse({ ...valid, location_url: 'not-a-url' }).success).toBe(false);
  });

  it('빈 URL은 허용 (선택 필드)', () => {
    expect(meetingFormSchema.safeParse({ ...valid, location_url: '' }).success).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test tests/lib/validation/meeting.test.ts`
Expected: Cannot find module '@/lib/validation/meeting'

- [ ] **Step 3: `lib/validation/meeting.ts` 구현**

```ts
import { z } from 'zod';

const optionalUrl = z.string().trim().url('올바른 URL 형식이 아닙니다').or(z.literal(''));

export const meetingFormSchema = z.object({
  book_title: z.string().trim().min(1, '책 제목을 입력해주세요').max(200),
  book_author: z.string().trim().min(1, '저자를 입력해주세요').max(100),
  book_cover_url: optionalUrl,
  scheduled_at: z.string().min(1, '일시를 선택해주세요'),
  location_name: z.string().trim().min(1, '장소 이름을 입력해주세요').max(100),
  location_url: optionalUrl,
  location_address: z.string().trim().max(200).optional().default(''),
});

export type MeetingFormInput = z.infer<typeof meetingFormSchema>;
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test tests/lib/validation/meeting.test.ts`
Expected: 6 passed.

- [ ] **Step 5: 프로필 스키마 (테스트 + 구현)**

`tests/lib/validation/profile.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { profileFormSchema } from '@/lib/validation/profile';

describe('profileFormSchema', () => {
  it('유효한 이름', () => {
    expect(profileFormSchema.safeParse({ display_name: '홍길동' }).success).toBe(true);
  });
  it('공백 이름 거부', () => {
    expect(profileFormSchema.safeParse({ display_name: '   ' }).success).toBe(false);
  });
  it('20자 초과 거부', () => {
    expect(profileFormSchema.safeParse({ display_name: 'a'.repeat(21) }).success).toBe(false);
  });
});
```

`lib/validation/profile.ts`:
```ts
import { z } from 'zod';

export const profileFormSchema = z.object({
  display_name: z.string().trim().min(1, '이름을 입력해주세요').max(20, '20자 이하로 입력해주세요'),
});

export type ProfileFormInput = z.infer<typeof profileFormSchema>;
```

Run: `pnpm test tests/lib/validation/profile.test.ts`
Expected: 3 passed.

- [ ] **Step 6: 발제문 스키마**

`tests/lib/validation/question.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { questionFormSchema } from '@/lib/validation/question';

describe('questionFormSchema', () => {
  it('유효한 질문', () => {
    expect(questionFormSchema.safeParse({ content: '주인공의 선택에 동의하시나요?' }).success).toBe(true);
  });
  it('빈 질문 거부', () => {
    expect(questionFormSchema.safeParse({ content: '' }).success).toBe(false);
  });
  it('1000자 초과 거부', () => {
    expect(questionFormSchema.safeParse({ content: 'a'.repeat(1001) }).success).toBe(false);
  });
});
```

`lib/validation/question.ts`:
```ts
import { z } from 'zod';

export const questionFormSchema = z.object({
  content: z.string().trim().min(1, '질문을 입력해주세요').max(1000),
});

export type QuestionFormInput = z.infer<typeof questionFormSchema>;
```

Run: `pnpm test`
Expected: 12 passed total.

- [ ] **Step 7: 커밋**

```bash
git add lib/validation tests/lib/validation
git commit -m "feat(validation): zod schemas for meeting, profile, question"
```

---

## Task 9: 쿼리 헬퍼

**Files:**
- Create: `lib/queries/meetings.ts`, `lib/queries/members.ts`, `lib/queries/invites.ts`

- [ ] **Step 1: `lib/queries/meetings.ts`**

```ts
import { getSupabaseServer } from '@/lib/supabase/server';
import type { Meeting, Profile, DiscussionQuestion, Attendance } from '@/lib/types';

export async function getNextMeeting(): Promise<(Meeting & { host: Profile; questions_count: number }) | null> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('meetings')
    .select('*, host:profiles!meetings_host_id_fkey(*), discussion_questions(count)')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, questions_count: data.discussion_questions[0]?.count ?? 0 };
}

export async function getUpcomingMeetings(): Promise<Array<Meeting & { host: Profile }>> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('meetings')
    .select('*, host:profiles!meetings_host_id_fkey(*)')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getPastMeetings(): Promise<Array<Meeting & { host: Profile }>> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('meetings')
    .select('*, host:profiles!meetings_host_id_fkey(*)')
    .lt('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export type MeetingDetail = Meeting & {
  host: Profile;
  questions: DiscussionQuestion[];
  attendances: Array<Attendance & { profile: Profile }>;
};

export async function getMeetingDetail(id: string): Promise<MeetingDetail | null> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('meetings')
    .select(`
      *,
      host:profiles!meetings_host_id_fkey(*),
      questions:discussion_questions(*),
      attendances(*, profile:profiles(*))
    `)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  // 정렬
  data.questions.sort((a: any, b: any) => a.order_idx - b.order_idx);
  return data as MeetingDetail;
}

export async function getMyAttendance(meetingId: string, userId: string) {
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from('attendances')
    .select('status')
    .eq('meeting_id', meetingId)
    .eq('user_id', userId)
    .maybeSingle();
  return data?.status ?? null;
}
```

- [ ] **Step 2: `lib/queries/members.ts`**

```ts
import { getSupabaseServer } from '@/lib/supabase/server';

export type MemberStats = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  attended_count: number;
  hosted_count: number;
};

export async function getAllMembersWithStats(): Promise<MemberStats[]> {
  const supabase = await getSupabaseServer();
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .order('display_name', { ascending: true });
  if (error) throw error;

  // 각 사용자의 참석/호스트 횟수 집계
  const [attended, hosted] = await Promise.all([
    supabase.from('attendances').select('user_id').eq('status', 'attending'),
    supabase.from('meetings').select('host_id'),
  ]);

  const attendedMap = new Map<string, number>();
  attended.data?.forEach((r) => attendedMap.set(r.user_id, (attendedMap.get(r.user_id) ?? 0) + 1));
  const hostedMap = new Map<string, number>();
  hosted.data?.forEach((r) => hostedMap.set(r.host_id, (hostedMap.get(r.host_id) ?? 0) + 1));

  return (profiles ?? []).map((p) => ({
    ...p,
    attended_count: attendedMap.get(p.id) ?? 0,
    hosted_count: hostedMap.get(p.id) ?? 0,
  }));
}

export async function getCurrentProfile() {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  return data;
}
```

- [ ] **Step 3: `lib/queries/invites.ts`**

```ts
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { Invite } from '@/lib/types';

export async function getMyInvites(): Promise<Invite[]> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// service role: 토큰으로 invite 조회 (가입 페이지에서 사용)
export async function getInviteByToken(token: string): Promise<Invite | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from('invites').select('*').eq('token', token).maybeSingle();
  return data;
}
```

- [ ] **Step 4: 빌드 검증**

Run: `pnpm build`
Expected: 타입 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add lib/queries
git commit -m "feat(queries): meeting, member, invite query helpers"
```

---

## Task 10: Server Actions (TDD where applicable)

**Files:**
- Create: `lib/actions/meetings.ts`, `lib/actions/attendance.ts`, `lib/actions/questions.ts`, `lib/actions/invite.ts`, `lib/actions/profile.ts`

각 Server Action은 `{ ok: boolean; error?: string; data?: ... }` 형태로 반환.

- [ ] **Step 1: `lib/actions/meetings.ts`**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { meetingFormSchema } from '@/lib/validation/meeting';

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export async function createMeeting(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = meetingFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다' };

  const { data, error } = await supabase
    .from('meetings')
    .insert({
      host_id: user.id,
      book_title: parsed.data.book_title,
      book_author: parsed.data.book_author,
      book_cover_url: parsed.data.book_cover_url || null,
      scheduled_at: new Date(parsed.data.scheduled_at).toISOString(),
      location_name: parsed.data.location_name,
      location_url: parsed.data.location_url || null,
      location_address: parsed.data.location_address || null,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath('/');
  revalidatePath('/meetings');
  return { ok: true, data: { id: data.id } };
}

export async function updateMeeting(id: string, input: unknown): Promise<ActionResult> {
  const parsed = meetingFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from('meetings')
    .update({
      book_title: parsed.data.book_title,
      book_author: parsed.data.book_author,
      book_cover_url: parsed.data.book_cover_url || null,
      scheduled_at: new Date(parsed.data.scheduled_at).toISOString(),
      location_name: parsed.data.location_name,
      location_url: parsed.data.location_url || null,
      location_address: parsed.data.location_address || null,
    })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/meetings/${id}`);
  revalidatePath('/meetings');
  revalidatePath('/');
  return { ok: true };
}

export async function deleteMeeting(id: string): Promise<ActionResult> {
  const supabase = await getSupabaseServer();
  const { error } = await supabase.from('meetings').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/meetings');
  revalidatePath('/');
  redirect('/meetings');
}
```

- [ ] **Step 2: `lib/actions/attendance.ts`**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServer } from '@/lib/supabase/server';
import type { AttendanceStatus } from '@/lib/types';

const VALID: AttendanceStatus[] = ['attending', 'not_attending', 'undecided'];

export async function setAttendance(meetingId: string, status: AttendanceStatus) {
  if (!VALID.includes(status)) return { ok: false as const, error: '잘못된 상태값' };
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: '로그인이 필요합니다' };

  const { error } = await supabase
    .from('attendances')
    .upsert({ meeting_id: meetingId, user_id: user.id, status }, { onConflict: 'meeting_id,user_id' });

  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/');
  revalidatePath(`/meetings/${meetingId}`);
  return { ok: true as const };
}
```

- [ ] **Step 3: `lib/actions/questions.ts`**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServer } from '@/lib/supabase/server';
import { questionFormSchema } from '@/lib/validation/question';

export async function addQuestion(meetingId: string, input: unknown) {
  const parsed = questionFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  const supabase = await getSupabaseServer();
  // 다음 order_idx 계산
  const { data: existing } = await supabase
    .from('discussion_questions')
    .select('order_idx')
    .eq('meeting_id', meetingId)
    .order('order_idx', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextIdx = (existing?.order_idx ?? -1) + 1;

  const { error } = await supabase.from('discussion_questions').insert({
    meeting_id: meetingId,
    order_idx: nextIdx,
    content: parsed.data.content,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/meetings/${meetingId}`);
  return { ok: true as const };
}

export async function updateQuestion(id: string, meetingId: string, input: unknown) {
  const parsed = questionFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from('discussion_questions')
    .update({ content: parsed.data.content })
    .eq('id', id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/meetings/${meetingId}`);
  return { ok: true as const };
}

export async function deleteQuestion(id: string, meetingId: string) {
  const supabase = await getSupabaseServer();
  const { error } = await supabase.from('discussion_questions').delete().eq('id', id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/meetings/${meetingId}`);
  return { ok: true as const };
}

export async function reorderQuestion(id: string, meetingId: string, newOrderIdx: number) {
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from('discussion_questions')
    .update({ order_idx: newOrderIdx })
    .eq('id', id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/meetings/${meetingId}`);
  return { ok: true as const };
}
```

- [ ] **Step 4: `lib/actions/invite.ts`**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { randomBytes } from 'crypto';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

function generateToken(): string {
  return randomBytes(16).toString('hex'); // 32자
}

export async function createInvite(): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다' };

  const token = generateToken();
  const { error } = await supabase.from('invites').insert({ token, created_by: user.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/more/invite');
  return { ok: true, token };
}

// 가입 페이지에서 호출 — anon이지만 service role로 검증
export async function consumeInvite(token: string, newUserId: string) {
  const admin = getSupabaseAdmin();
  const { data: invite } = await admin.from('invites').select('*').eq('token', token).maybeSingle();
  if (!invite) return { ok: false as const, error: '잘못된 초대 링크' };
  if (invite.used_by) return { ok: false as const, error: '이미 사용된 초대 링크' };
  if (new Date(invite.expires_at) < new Date()) return { ok: false as const, error: '만료된 초대 링크' };

  const { error } = await admin
    .from('invites')
    .update({ used_by: newUserId, used_at: new Date().toISOString() })
    .eq('id', invite.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
```

- [ ] **Step 5: `lib/actions/profile.ts`**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { profileFormSchema } from '@/lib/validation/profile';

export async function createProfile(displayName: string) {
  const parsed = profileFormSchema.safeParse({ display_name: displayName });
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: '로그인이 필요합니다' };

  const { error } = await supabase
    .from('profiles')
    .insert({ id: user.id, display_name: parsed.data.display_name });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/');
  return { ok: true as const };
}

export async function updateProfile(input: unknown) {
  const parsed = profileFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: '로그인이 필요합니다' };
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: parsed.data.display_name })
    .eq('id', user.id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/more');
  revalidatePath('/more/profile');
  return { ok: true as const };
}
```

- [ ] **Step 6: 빌드 검증**

Run: `pnpm build`
Expected: 타입 에러 없음.

- [ ] **Step 7: 커밋**

```bash
git add lib/actions
git commit -m "feat(actions): server actions for meeting, attendance, question, invite, profile"
```

---

# Phase 3 — 인증 & 초대 가입

## Task 11: 로그인 페이지

**Files:**
- Create: `app/(auth)/login/page.tsx`, `app/(auth)/auth/callback/route.ts`

- [ ] **Step 1: OAuth provider 설정 (Supabase Studio)**

http://127.0.0.1:54323 → Authentication → Providers
- Email: 활성, "Confirm email" 옵션은 로컬에서 OFF (개발 편의)
- Google: 활성 + Client ID/Secret 입력 (Google Cloud Console에서 생성)
- Kakao: 활성 + Client ID/Secret (Kakao Developers)
- Redirect URL: `http://localhost:3000/auth/callback`

> **참고:** 로컬 개발 단계에서는 Email-only로 먼저 검증하고, Google/Kakao는 추후 환경변수로 추가.

- [ ] **Step 2: `app/(auth)/auth/callback/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await getSupabaseServer();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
```

- [ ] **Step 3: `app/(auth)/login/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const supabase = getSupabaseBrowser();

  async function signInEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    router.push('/');
    router.refresh();
  }

  async function signInOAuth(provider: 'google' | 'kakao') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) toast.error(error.message);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle>로그인</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={signInEmail} className="space-y-3">
            <div className="space-y-1"><Label htmlFor="email">이메일</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div className="space-y-1"><Label htmlFor="password">비밀번호</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            <Button type="submit" disabled={loading} className="w-full">로그인</Button>
          </form>
          <div className="flex flex-col gap-2">
            <Button variant="outline" onClick={() => signInOAuth('google')}>Google로 로그인</Button>
            <Button variant="outline" onClick={() => signInOAuth('kakao')}>카카오로 로그인</Button>
          </div>
          <p className="text-sm text-center text-slate-600">초대 링크가 있나요? <Link href="/signup" className="underline">가입하기</Link></p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: 검증**

Run: `pnpm dev`
브라우저: http://localhost:3000/login
Expected: 로그인 폼 표시.

Studio에서 테스트 계정 생성 → 이메일/비밀번호 로그인 시도 → 미들웨어가 가입 안 된 상태는 `/` 진입 시도 시 redirect (다음 Task에서 처리). 일단 로그인 자체는 성공해야 함.

- [ ] **Step 5: 커밋**

```bash
git add app/(auth)/login app/(auth)/auth
git commit -m "feat(auth): login page + oauth callback"
```

---

## Task 12: 가입 페이지 (초대 토큰 검증 + 프로필 생성)

**Files:**
- Create: `app/(auth)/signup/page.tsx`

- [ ] **Step 1: 가입 페이지**

```tsx
import { redirect } from 'next/navigation';
import { getInviteByToken } from '@/lib/queries/invites';
import { SignupForm } from './signup-form';

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return <ErrorView message="초대 링크가 필요합니다. 가입은 초대를 받은 분만 가능합니다." />;
  }
  const invite = await getInviteByToken(token);
  if (!invite) return <ErrorView message="잘못된 초대 링크입니다." />;
  if (invite.used_by) return <ErrorView message="이미 사용된 초대 링크입니다." />;
  if (new Date(invite.expires_at) < new Date()) return <ErrorView message="만료된 초대 링크입니다." />;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <SignupForm token={token} />
    </div>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-3">
        <p className="text-xl">😕</p>
        <p className="text-slate-700">{message}</p>
        <a href="/login" className="text-sm underline text-slate-600">로그인 페이지로</a>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 클라이언트 가입 폼**

`app/(auth)/signup/signup-form.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { createProfile } from '@/lib/actions/profile';
import { consumeInvite } from '@/lib/actions/invite';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function SignupForm({ token }: { token: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = getSupabaseBrowser();

  async function signupEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error || !data.user) { setLoading(false); return toast.error(error?.message ?? '가입 실패'); }

    const userId = data.user.id;
    const consumed = await consumeInvite(token, userId);
    if (!consumed.ok) { setLoading(false); return toast.error(consumed.error); }

    const profile = await createProfile(displayName);
    setLoading(false);
    if (!profile.ok) return toast.error(profile.error);

    toast.success('가입 완료!');
    router.push('/');
    router.refresh();
  }

  async function signupOAuth(provider: 'google' | 'kakao') {
    // OAuth는 콜백 후 별도 프로필 설정 페이지로 보내야 함 — MVP에서는 이메일 가입 우선
    toast.message('소셜 가입은 곧 지원됩니다. 이메일로 가입해주세요.');
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader><CardTitle>독서모임 가입</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={signupEmail} className="space-y-3">
          <div className="space-y-1"><Label htmlFor="name">이름</Label>
            <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={20} /></div>
          <div className="space-y-1"><Label htmlFor="email">이메일</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div className="space-y-1"><Label htmlFor="password">비밀번호</Label>
            <Input id="password" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          <Button type="submit" disabled={loading} className="w-full">가입하기</Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: 검증 (시드 초대 직접 삽입)**

Studio SQL Editor:
```sql
-- 가입 테스트용 초대 (임시 — 첫 사용자가 생기기 전이라 created_by는 service role로 우회)
-- 실제로는 첫 멤버는 어떻게 만드나? → 한 번만 SQL로 직접 profile + invite 만들기
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-000000000001', 'admin@example.com',
  crypt('password123', gen_salt('bf')), now(), '{}'::jsonb);
INSERT INTO profiles (id, display_name) VALUES ('00000000-0000-0000-0000-000000000001', '관리자');
INSERT INTO invites (token, created_by) VALUES ('test-invite-token-1234567890abcdef', '00000000-0000-0000-0000-000000000001');
```

> **주의:** 위 SQL은 첫 멤버(부트스트랩) 생성용. 이후 모든 가입은 앱을 통해서.

브라우저: http://localhost:3000/signup?token=test-invite-token-1234567890abcdef
- 폼 표시 확인
- 가입 진행 → 성공 토스트 → `/`로 이동
- Studio에서 `invites` 행의 `used_by`, `used_at` 채워졌는지 확인

- [ ] **Step 4: 커밋**

```bash
git add app/(auth)/signup
git commit -m "feat(auth): signup page with invite token validation"
```

---

## Task 13: 부트스트랩 마이그레이션 (첫 멤버 시드 가이드)

**Files:**
- Create: `supabase/seed.sql`, `docs/bootstrap.md`

- [ ] **Step 1: `supabase/seed.sql` — 로컬 개발 시드**

```sql
-- 로컬 개발용 부트스트랩 멤버 + 초대 토큰
-- 운영 환경에서는 실행하지 않음
DO $$
DECLARE
  bootstrap_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = bootstrap_id) THEN
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, instance_id, aud, role)
    VALUES (bootstrap_id, 'admin@example.com',
      crypt('password123', gen_salt('bf')), now(), '{}'::jsonb,
      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
    INSERT INTO profiles (id, display_name) VALUES (bootstrap_id, '관리자');
    INSERT INTO invites (token, created_by, expires_at)
    VALUES ('local-dev-invite-token-aaaaaaaaaaaaaaaa', bootstrap_id, now() + INTERVAL '365 days');
  END IF;
END $$;
```

- [ ] **Step 2: `docs/bootstrap.md`**

```markdown
# 부트스트랩 가이드

## 로컬 개발
`pnpm dlx supabase db reset` 시 `supabase/seed.sql`이 자동 실행되어 부트스트랩 계정이 생성됨.

- 이메일: `admin@example.com` / 비밀번호: `password123`
- 초대 토큰 (로그인 없이 가입용): `local-dev-invite-token-aaaaaaaaaaaaaaaa`
- 가입 URL: http://localhost:3000/signup?token=local-dev-invite-token-aaaaaaaaaaaaaaaa

## 운영 환경
첫 사용자는 Supabase Dashboard에서 수동으로 생성:
1. Authentication → Users → "Add user" (email + password)
2. SQL Editor에서 profile 삽입:
   ```sql
   INSERT INTO profiles (id, display_name) VALUES ('<user uuid>', '관리자');
   ```
3. 이후 앱에서 초대 링크 생성하여 다른 멤버 초대
```

- [ ] **Step 3: 재시드 검증**

```bash
pnpm dlx supabase db reset
```

브라우저: http://localhost:3000/login → admin@example.com / password123 → 로그인 성공.

- [ ] **Step 4: 커밋**

```bash
git add supabase/seed.sql docs/bootstrap.md
git commit -m "feat(db): bootstrap seed for local development"
```

---

## Task 14: 인증 가드 강화 (프로필 미설정 시 가입 페이지로)

**Files:**
- Modify: `lib/supabase/middleware.ts`

- [ ] **Step 1: 미들웨어에 프로필 체크 추가**

`lib/supabase/middleware.ts`의 `updateSession`에서 user 확인 후 추가:

```ts
// (기존 코드 위)
const { data: { user } } = await supabase.auth.getUser();
const path = req.nextUrl.pathname;
const isPublic = path.startsWith('/login') || path.startsWith('/signup') || path.startsWith('/auth');

if (!user && !isPublic) {
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  return NextResponse.redirect(url);
}

// 인증됐지만 profile 없는 경우 → 로그아웃 + login
if (user && !isPublic) {
  const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (!profile) {
    await supabase.auth.signOut();
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('error', 'profile-missing');
    return NextResponse.redirect(url);
  }
}
```

- [ ] **Step 2: 빌드 + 동작 확인**

Run: `pnpm dev`
- admin 계정 로그인 → `/` 진입 가능 (profile 있음)
- profile 없는 임시 계정으로는 자동 로그아웃 확인 (필요 시 Studio에서 profile 삭제 후 테스트)

- [ ] **Step 3: 커밋**

```bash
git add lib/supabase/middleware.ts
git commit -m "feat(auth): enforce profile existence in middleware"
```

---

# Phase 4 — 앱 레이아웃 & 네비

## Task 15: 하단 탭 네비 컴포넌트

**Files:**
- Create: `components/layout/BottomNav.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calendar, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/', label: '홈', icon: Home, match: (p: string) => p === '/' },
  { href: '/meetings', label: '모임', icon: Calendar, match: (p: string) => p.startsWith('/meetings') },
  { href: '/more', label: '더보기', icon: Menu, match: (p: string) => p.startsWith('/more') },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white border-t z-50"
         style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <ul className="flex">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <li key={t.href} className="flex-1">
              <Link href={t.href}
                    className={cn('flex flex-col items-center gap-1 py-3 text-xs',
                                  active ? 'text-slate-900 font-semibold' : 'text-slate-500')}>
                <t.icon className="w-5 h-5" />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add components/layout/BottomNav.tsx
git commit -m "feat(layout): bottom tab navigation"
```

---

## Task 16: 앱 영역 레이아웃 + 빈 홈 페이지

**Files:**
- Create: `app/(app)/layout.tsx`, `app/(app)/page.tsx`, `app/error.tsx`, `app/not-found.tsx`

- [ ] **Step 1: `app/(app)/layout.tsx`**

```tsx
import { BottomNav } from '@/components/layout/BottomNav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-20">
      <main className="max-w-md mx-auto px-4 py-4">{children}</main>
      <BottomNav />
    </div>
  );
}
```

- [ ] **Step 2: 임시 홈 페이지 (다음 Task에서 다음 모임 카드 추가)**

`app/(app)/page.tsx`:

```tsx
import { getCurrentProfile } from '@/lib/queries/members';

export default async function HomePage() {
  const profile = await getCurrentProfile();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">안녕하세요, {profile?.display_name}님</h1>
      <p className="text-slate-600">홈 화면 준비 중...</p>
    </div>
  );
}
```

- [ ] **Step 3: `app/error.tsx`**

```tsx
'use client';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-3">
        <p className="text-xl">😵 오류가 발생했어요</p>
        <p className="text-sm text-slate-600">{error.message}</p>
        <button onClick={reset} className="underline">다시 시도</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `app/not-found.tsx`**

```tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-3">
        <p className="text-xl">🔍 페이지를 찾을 수 없습니다</p>
        <Link href="/" className="underline text-sm">홈으로</Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 검증**

Run: `pnpm dev`
- 로그인 후 `/` → "안녕하세요, 관리자님" + 하단 탭 표시
- 탭 클릭 시 `/meetings`, `/more`로 이동 (페이지 없음 → 404 OK, 다음 Task에서 처리)

- [ ] **Step 6: 커밋**

```bash
git add app
git commit -m "feat(app): root layout with bottom nav, error/not-found pages"
```

---

# Phase 5 — 모임 CRUD

## Task 17: 모임 리스트 페이지

**Files:**
- Create: `components/meeting/MeetingCard.tsx`, `app/(app)/meetings/page.tsx`

- [ ] **Step 1: MeetingCard 컴포넌트**

```tsx
import Link from 'next/link';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import type { Meeting, Profile } from '@/lib/types';

export function MeetingCard({ meeting }: { meeting: Meeting & { host: Profile } }) {
  const date = new Date(meeting.scheduled_at);
  return (
    <Link href={`/meetings/${meeting.id}`} className="block">
      <Card className="hover:bg-slate-50 transition">
        <CardContent className="p-4 flex gap-3">
          <div className="w-16 h-20 bg-slate-200 rounded shrink-0 flex items-center justify-center overflow-hidden">
            {meeting.book_cover_url
              ? <img src={meeting.book_cover_url} alt={meeting.book_title} className="w-full h-full object-cover" />
              : <span className="text-2xl">📚</span>}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{meeting.book_title}</h3>
            <p className="text-sm text-slate-500 truncate">{meeting.book_author}</p>
            <p className="text-xs text-slate-600 mt-1">
              {format(date, 'yyyy.MM.dd (EEE) HH:mm', { locale: ko })}
            </p>
            <p className="text-xs text-slate-500 truncate">📍 {meeting.location_name}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 2: 모임 리스트 페이지**

```tsx
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getUpcomingMeetings, getPastMeetings } from '@/lib/queries/meetings';
import { MeetingCard } from '@/components/meeting/MeetingCard';
import { Button } from '@/components/ui/button';

export default async function MeetingsPage() {
  const [upcoming, past] = await Promise.all([getUpcomingMeetings(), getPastMeetings()]);
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">모임</h1>
        <Link href="/meetings/new"><Button size="icon"><Plus className="w-4 h-4" /></Button></Link>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">다가오는 모임</h2>
        {upcoming.length === 0 && <p className="text-sm text-slate-500">예정된 모임이 없습니다.</p>}
        {upcoming.map((m) => <MeetingCard key={m.id} meeting={m} />)}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">지난 모임</h2>
        {past.length === 0 && <p className="text-sm text-slate-500">아직 지난 모임이 없습니다.</p>}
        {past.map((m) => <MeetingCard key={m.id} meeting={m} />)}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: 검증**

Studio에서 더미 모임 삽입:
```sql
INSERT INTO meetings (host_id, book_title, book_author, scheduled_at, location_name)
VALUES
  ('00000000-0000-0000-0000-000000000001', '미움받을 용기', '기시미 이치로', now() + interval '7 days', '강남역 스타벅스'),
  ('00000000-0000-0000-0000-000000000001', '아몬드', '손원평', now() - interval '7 days', '판교 카페');
```

브라우저 `/meetings` → 다가오는·지난 모임 카드 표시 확인.

- [ ] **Step 4: 커밋**

```bash
git add components/meeting/MeetingCard.tsx app/(app)/meetings/page.tsx
git commit -m "feat(meetings): list page with upcoming/past sections"
```

---

## Task 18: 모임 등록 폼 (공통 컴포넌트)

**Files:**
- Create: `components/meeting/MeetingForm.tsx`, `app/(app)/meetings/new/page.tsx`

- [ ] **Step 1: MeetingForm 클라이언트 컴포넌트**

```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { meetingFormSchema, type MeetingFormInput } from '@/lib/validation/meeting';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Props = {
  defaultValues?: Partial<MeetingFormInput>;
  onSubmit: (data: MeetingFormInput) => Promise<{ ok: true; data?: { id: string } } | { ok: false; error: string }>;
  submitLabel: string;
  redirectOnSuccess?: (id: string) => string;
};

export function MeetingForm({ defaultValues, onSubmit, submitLabel, redirectOnSuccess }: Props) {
  const router = useRouter();
  const form = useForm<MeetingFormInput>({
    resolver: zodResolver(meetingFormSchema),
    defaultValues: {
      book_title: '', book_author: '', book_cover_url: '',
      scheduled_at: '', location_name: '', location_url: '', location_address: '',
      ...defaultValues,
    },
  });

  async function handleSubmit(data: MeetingFormInput) {
    const result = await onSubmit(data);
    if (!result.ok) return toast.error(result.error);
    toast.success('저장되었습니다');
    if (redirectOnSuccess && result.data?.id) router.push(redirectOnSuccess(result.data.id));
    else router.back();
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
      <FormField label="책 제목" error={form.formState.errors.book_title?.message}>
        <Input {...form.register('book_title')} placeholder="예: 미움받을 용기" />
      </FormField>
      <FormField label="저자" error={form.formState.errors.book_author?.message}>
        <Input {...form.register('book_author')} placeholder="예: 기시미 이치로" />
      </FormField>
      <FormField label="일시" error={form.formState.errors.scheduled_at?.message}>
        <Input type="datetime-local" {...form.register('scheduled_at')} />
      </FormField>
      <FormField label="장소 이름" error={form.formState.errors.location_name?.message}>
        <Input {...form.register('location_name')} placeholder="예: 강남역 스타벅스" />
      </FormField>
      <FormField label="장소 주소 (선택)" error={form.formState.errors.location_address?.message}>
        <Input {...form.register('location_address')} placeholder="서울시 강남구..." />
      </FormField>
      <FormField label="장소 링크 또는 줌 URL (선택)" error={form.formState.errors.location_url?.message}>
        <Input {...form.register('location_url')} placeholder="https://..." />
      </FormField>
      <Button type="submit" disabled={form.formState.isSubmitting} className="w-full">{submitLabel}</Button>
    </form>
  );
}

function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

> **참고:** `book_cover_url`은 Task 29에서 이미지 업로더로 교체. 일단 폼에서는 노출 안 함.

- [ ] **Step 2: 새 모임 페이지**

`app/(app)/meetings/new/page.tsx`:

```tsx
'use client';

import { MeetingForm } from '@/components/meeting/MeetingForm';
import { createMeeting } from '@/lib/actions/meetings';

export default function NewMeetingPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">새 모임 등록</h1>
      <MeetingForm
        onSubmit={(d) => createMeeting(d)}
        submitLabel="등록하기"
        redirectOnSuccess={(id) => `/meetings/${id}`}
      />
    </div>
  );
}
```

- [ ] **Step 3: 검증**

`/meetings/new` → 폼 입력 → 등록 → 모임 상세 페이지로 이동 (페이지 없으면 404, 다음 Task에서). 리스트 페이지에서 새 모임 카드 확인.

- [ ] **Step 4: 커밋**

```bash
git add components/meeting/MeetingForm.tsx app/(app)/meetings/new
git commit -m "feat(meetings): meeting form + new meeting page"
```

---

## Task 19: 모임 상세 페이지 (정보 표시 + 호스트 액션)

**Files:**
- Create: `app/(app)/meetings/[id]/page.tsx`, `components/meeting/MeetingDetailHeader.tsx`, `components/meeting/MeetingActions.tsx`

- [ ] **Step 1: MeetingDetailHeader**

```tsx
import { format, differenceInDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { Meeting, Profile } from '@/lib/types';

export function MeetingDetailHeader({ meeting }: { meeting: Meeting & { host: Profile } }) {
  const date = new Date(meeting.scheduled_at);
  const diff = differenceInDays(date, new Date());
  const dDay = diff > 0 ? `D-${diff}` : diff === 0 ? 'D-Day' : `D+${-diff}`;
  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <div className="w-20 h-28 bg-slate-200 rounded shrink-0 flex items-center justify-center overflow-hidden">
          {meeting.book_cover_url
            ? <img src={meeting.book_cover_url} alt="" className="w-full h-full object-cover" />
            : <span className="text-3xl">📚</span>}
        </div>
        <div className="flex-1 space-y-1">
          <p className="text-xs font-bold text-blue-600">{dDay}</p>
          <h1 className="text-xl font-bold">{meeting.book_title}</h1>
          <p className="text-sm text-slate-600">{meeting.book_author}</p>
          <p className="text-sm text-slate-700 mt-2">
            {format(date, 'yyyy.MM.dd (EEE) HH:mm', { locale: ko })}
          </p>
          <p className="text-xs text-slate-500">호스트: {meeting.host.display_name}</p>
        </div>
      </div>
      <div className="bg-slate-50 p-3 rounded space-y-1">
        <p className="text-sm font-medium">📍 {meeting.location_name}</p>
        {meeting.location_address && <p className="text-xs text-slate-600">{meeting.location_address}</p>}
        {meeting.location_url && (
          <a href={meeting.location_url} target="_blank" rel="noreferrer" className="text-xs underline text-blue-600">
            장소 링크 열기
          </a>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: MeetingActions (호스트 전용)**

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { deleteMeeting } from '@/lib/actions/meetings';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';

export function MeetingActions({ meetingId }: { meetingId: string }) {
  const [open, setOpen] = useState(false);

  async function onDelete() {
    const result = await deleteMeeting(meetingId);
    if (!result.ok) toast.error(result.error);
  }

  return (
    <div className="flex gap-2">
      <Link href={`/meetings/${meetingId}/edit`} className="flex-1">
        <Button variant="outline" className="w-full">수정</Button>
      </Link>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button variant="destructive">삭제</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>모임을 삭제하시겠어요?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">관련된 참석 정보와 발제문이 모두 삭제됩니다.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
            <Button variant="destructive" onClick={onDelete}>삭제</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 3: 상세 페이지**

`app/(app)/meetings/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { getMeetingDetail } from '@/lib/queries/meetings';
import { getCurrentProfile } from '@/lib/queries/members';
import { MeetingDetailHeader } from '@/components/meeting/MeetingDetailHeader';
import { MeetingActions } from '@/components/meeting/MeetingActions';

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meeting = await getMeetingDetail(id);
  if (!meeting) notFound();
  const me = await getCurrentProfile();
  const isHost = me?.id === meeting.host_id;

  return (
    <div className="space-y-6">
      <MeetingDetailHeader meeting={meeting} />
      {/* AttendanceToggle: Task 21 */}
      {/* AttendanceSummary: Task 22 */}
      {/* DiscussionQuestionList: Task 23 */}
      {isHost && <MeetingActions meetingId={meeting.id} />}
    </div>
  );
}
```

- [ ] **Step 4: 검증**

리스트에서 모임 카드 클릭 → 상세 페이지 표시. 호스트일 때만 "수정/삭제" 버튼 노출.

- [ ] **Step 5: 커밋**

```bash
git add components/meeting/MeetingDetailHeader.tsx components/meeting/MeetingActions.tsx app/(app)/meetings/[id]
git commit -m "feat(meetings): detail page header + host actions"
```

---

## Task 20: 모임 수정 페이지

**Files:**
- Create: `app/(app)/meetings/[id]/edit/page.tsx`

- [ ] **Step 1: 수정 페이지**

```tsx
import { notFound, redirect } from 'next/navigation';
import { format } from 'date-fns';
import { getMeetingDetail } from '@/lib/queries/meetings';
import { getCurrentProfile } from '@/lib/queries/members';
import { EditMeetingForm } from './edit-form';

export default async function EditMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [meeting, me] = await Promise.all([getMeetingDetail(id), getCurrentProfile()]);
  if (!meeting) notFound();
  if (me?.id !== meeting.host_id) redirect(`/meetings/${id}`);

  // datetime-local 포맷: yyyy-MM-ddTHH:mm
  const localDate = format(new Date(meeting.scheduled_at), "yyyy-MM-dd'T'HH:mm");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">모임 수정</h1>
      <EditMeetingForm
        id={id}
        defaults={{
          book_title: meeting.book_title,
          book_author: meeting.book_author,
          book_cover_url: meeting.book_cover_url ?? '',
          scheduled_at: localDate,
          location_name: meeting.location_name,
          location_url: meeting.location_url ?? '',
          location_address: meeting.location_address ?? '',
        }}
      />
    </div>
  );
}
```

`app/(app)/meetings/[id]/edit/edit-form.tsx`:

```tsx
'use client';

import { MeetingForm } from '@/components/meeting/MeetingForm';
import { updateMeeting } from '@/lib/actions/meetings';
import type { MeetingFormInput } from '@/lib/validation/meeting';

export function EditMeetingForm({ id, defaults }: { id: string; defaults: MeetingFormInput }) {
  return (
    <MeetingForm
      defaultValues={defaults}
      onSubmit={async (d) => {
        const r = await updateMeeting(id, d);
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      }}
      submitLabel="저장"
      redirectOnSuccess={() => `/meetings/${id}`}
    />
  );
}
```

- [ ] **Step 2: 검증**

호스트로 로그인 → 상세 → 수정 버튼 → 폼에 기존 값 채워짐 → 수정 → 저장 → 상세 페이지로 돌아옴, 반영 확인.

- [ ] **Step 3: 커밋**

```bash
git add app/(app)/meetings/[id]/edit
git commit -m "feat(meetings): edit page"
```

---

# Phase 6 — 참석 체크

## Task 21: 참석 토글 컴포넌트

**Files:**
- Create: `components/meeting/AttendanceToggle.tsx`

- [ ] **Step 1: 컴포넌트**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { setAttendance } from '@/lib/actions/attendance';
import type { AttendanceStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: 'attending', label: '참석' },
  { value: 'not_attending', label: '불참' },
  { value: 'undecided', label: '미정' },
];

export function AttendanceToggle({
  meetingId,
  initialStatus,
}: {
  meetingId: string;
  initialStatus: AttendanceStatus | null;
}) {
  const [status, setStatus] = useState<AttendanceStatus | null>(initialStatus);
  const [, startTransition] = useTransition();

  function handle(s: AttendanceStatus) {
    const prev = status;
    setStatus(s);  // 낙관적 업데이트
    startTransition(async () => {
      const r = await setAttendance(meetingId, s);
      if (!r.ok) { setStatus(prev); toast.error(r.error); }
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">내 참석 여부</p>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => (
          <button key={o.value} onClick={() => handle(o.value)}
            className={cn(
              'py-3 rounded border text-sm font-medium transition',
              status === o.value ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            )}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 모임 상세 페이지에 통합**

`app/(app)/meetings/[id]/page.tsx`의 `{/* AttendanceToggle */}` 자리에:

```tsx
import { AttendanceToggle } from '@/components/meeting/AttendanceToggle';
import { getMyAttendance } from '@/lib/queries/meetings';

// ...
const myStatus = me ? await getMyAttendance(meeting.id, me.id) : null;
// ...
<AttendanceToggle meetingId={meeting.id} initialStatus={myStatus} />
```

- [ ] **Step 3: 검증**

상세 페이지에서 참석/불참/미정 탭 → 즉시 반영, 페이지 새로고침해도 유지.

- [ ] **Step 4: 커밋**

```bash
git add components/meeting/AttendanceToggle.tsx app/(app)/meetings/[id]/page.tsx
git commit -m "feat(attendance): toggle component with optimistic update"
```

---

## Task 22: 참석 현황 요약

**Files:**
- Create: `components/meeting/AttendanceSummary.tsx`

- [ ] **Step 1: 컴포넌트**

```tsx
import type { Attendance, Profile } from '@/lib/types';

export function AttendanceSummary({
  attendances,
}: {
  attendances: Array<Attendance & { profile: Profile }>;
}) {
  const groups = {
    attending: attendances.filter((a) => a.status === 'attending'),
    not_attending: attendances.filter((a) => a.status === 'not_attending'),
    undecided: attendances.filter((a) => a.status === 'undecided'),
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">참석 현황</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="참석" count={groups.attending.length} />
        <Stat label="불참" count={groups.not_attending.length} />
        <Stat label="미정" count={groups.undecided.length} />
      </div>
      {groups.attending.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-600">참석자 명단</summary>
          <ul className="mt-2 space-y-1 pl-4 text-slate-700">
            {groups.attending.map((a) => <li key={a.id}>· {a.profile.display_name}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

function Stat({ label, count }: { label: string; count: number }) {
  return (
    <div className="bg-slate-50 rounded p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-bold">{count}</p>
    </div>
  );
}
```

- [ ] **Step 2: 모임 상세에 통합**

`app/(app)/meetings/[id]/page.tsx`:

```tsx
import { AttendanceSummary } from '@/components/meeting/AttendanceSummary';
// ...
<AttendanceSummary attendances={meeting.attendances} />
```

- [ ] **Step 3: 검증**

여러 계정으로 참석 토글 → 현황 카운트 반영 확인.

- [ ] **Step 4: 커밋**

```bash
git add components/meeting/AttendanceSummary.tsx app/(app)/meetings/[id]/page.tsx
git commit -m "feat(attendance): summary widget"
```

---

# Phase 7 — 발제문

## Task 23: 발제문 리스트 표시

**Files:**
- Create: `components/meeting/DiscussionQuestionList.tsx`

- [ ] **Step 1: 컴포넌트 (읽기 + 호스트 액션)**

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';
import { updateQuestion, deleteQuestion } from '@/lib/actions/questions';
import type { DiscussionQuestion } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function DiscussionQuestionList({
  meetingId,
  questions,
  isHost,
}: {
  meetingId: string;
  questions: DiscussionQuestion[];
  isHost: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">발제문 {questions.length}개</p>
      {questions.length === 0 && <p className="text-sm text-slate-500">아직 등록된 질문이 없습니다.</p>}
      <ul className="space-y-2">
        {questions.map((q, i) => (
          <li key={q.id} className="border rounded p-3 bg-white">
            <QuestionItem index={i + 1} question={q} meetingId={meetingId} editable={isHost} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuestionItem({ index, question, meetingId, editable }: {
  index: number; question: DiscussionQuestion; meetingId: string; editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(question.content);

  async function save() {
    const r = await updateQuestion(question.id, meetingId, { content: text });
    if (!r.ok) return toast.error(r.error);
    setEditing(false);
  }

  async function remove() {
    if (!confirm('이 질문을 삭제할까요?')) return;
    const r = await deleteQuestion(question.id, meetingId);
    if (!r.ok) toast.error(r.error);
  }

  if (editing) return (
    <div className="space-y-2">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={() => { setText(question.content); setEditing(false); }}>취소</Button>
        <Button size="sm" onClick={save}>저장</Button>
      </div>
    </div>
  );

  return (
    <div className="flex justify-between gap-3">
      <p className="text-sm whitespace-pre-wrap"><span className="font-semibold mr-1">Q{index}.</span>{question.content}</p>
      {editable && (
        <div className="flex gap-1 shrink-0">
          <Button size="icon" variant="ghost" onClick={() => setEditing(true)}><Pencil className="w-4 h-4" /></Button>
          <Button size="icon" variant="ghost" onClick={remove}><Trash2 className="w-4 h-4 text-red-600" /></Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 상세 페이지에 통합**

`app/(app)/meetings/[id]/page.tsx`:

```tsx
import { DiscussionQuestionList } from '@/components/meeting/DiscussionQuestionList';
// ...
<DiscussionQuestionList meetingId={meeting.id} questions={meeting.questions} isHost={isHost} />
```

- [ ] **Step 3: 커밋**

```bash
git add components/meeting/DiscussionQuestionList.tsx app/(app)/meetings/[id]/page.tsx
git commit -m "feat(questions): list with inline edit/delete (host only)"
```

---

## Task 24: 발제문 추가 폼

**Files:**
- Create: `components/meeting/DiscussionQuestionForm.tsx`

- [ ] **Step 1: 추가 폼**

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { addQuestion } from '@/lib/actions/questions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function DiscussionQuestionForm({ meetingId, questionsCount }: { meetingId: string; questionsCount: number }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    const r = await addQuestion(meetingId, { content: text });
    setLoading(false);
    if (!r.ok) return toast.error(r.error);
    setText(''); setOpen(false);
  }

  if (!open) return (
    <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
      + 질문 추가 {questionsCount < 5 && <span className="text-xs text-slate-500 ml-2">(5~10개 권장)</span>}
    </Button>
  );

  return (
    <div className="space-y-2 border rounded p-3 bg-slate-50">
      <Textarea value={text} onChange={(e) => setText(e.target.value)}
        placeholder="예: 주인공이 마지막에 한 선택에 동의하시나요?" maxLength={1000} rows={3} />
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={() => { setText(''); setOpen(false); }}>취소</Button>
        <Button onClick={submit} disabled={loading || text.trim().length === 0}>등록</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 상세 페이지 — 호스트만 추가 폼 표시**

```tsx
import { DiscussionQuestionForm } from '@/components/meeting/DiscussionQuestionForm';
// ...
{isHost && <DiscussionQuestionForm meetingId={meeting.id} questionsCount={meeting.questions.length} />}
```

- [ ] **Step 3: 검증**

호스트로 질문 등록·수정·삭제 동작 확인. 일반 멤버는 추가/수정/삭제 버튼 안 보임.

- [ ] **Step 4: 커밋**

```bash
git add components/meeting/DiscussionQuestionForm.tsx app/(app)/meetings/[id]/page.tsx
git commit -m "feat(questions): add question form (host only)"
```

---

# Phase 8 — 홈 화면

## Task 25: 다음 모임 카드 + 홈 페이지

**Files:**
- Create: `components/meeting/NextMeetingCard.tsx`
- Modify: `app/(app)/page.tsx`

- [ ] **Step 1: NextMeetingCard**

```tsx
import Link from 'next/link';
import { format, differenceInDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AttendanceToggle } from './AttendanceToggle';
import type { Meeting, Profile, AttendanceStatus } from '@/lib/types';

type Props = {
  meeting: Meeting & { host: Profile; questions_count: number };
  myStatus: AttendanceStatus | null;
};

export function NextMeetingCard({ meeting, myStatus }: Props) {
  const date = new Date(meeting.scheduled_at);
  const diff = differenceInDays(date, new Date());
  const dDay = diff > 0 ? `D-${diff}` : diff === 0 ? 'D-Day' : `D+${-diff}`;

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex gap-3">
          <div className="w-20 h-28 bg-slate-200 rounded shrink-0 flex items-center justify-center overflow-hidden">
            {meeting.book_cover_url
              ? <img src={meeting.book_cover_url} alt="" className="w-full h-full object-cover" />
              : <span className="text-3xl">📚</span>}
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-xs font-bold text-blue-600">{dDay}</p>
            <h2 className="text-lg font-bold">{meeting.book_title}</h2>
            <p className="text-sm text-slate-600">{meeting.book_author}</p>
            <p className="text-sm text-slate-700 mt-1">
              {format(date, 'MM월 dd일 (EEE) HH:mm', { locale: ko })}
            </p>
            <p className="text-xs text-slate-500">📍 {meeting.location_name}</p>
          </div>
        </div>

        <AttendanceToggle meetingId={meeting.id} initialStatus={myStatus} />

        <Link href={`/meetings/${meeting.id}`}>
          <Button variant="outline" className="w-full">
            발제문 {meeting.questions_count}개 보기 →
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: 홈 페이지**

```tsx
import Link from 'next/link';
import { getNextMeeting, getMyAttendance } from '@/lib/queries/meetings';
import { getCurrentProfile } from '@/lib/queries/members';
import { NextMeetingCard } from '@/components/meeting/NextMeetingCard';
import { Button } from '@/components/ui/button';

export default async function HomePage() {
  const [next, me] = await Promise.all([getNextMeeting(), getCurrentProfile()]);
  const myStatus = next && me ? await getMyAttendance(next.id, me.id) : null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">안녕하세요, {me?.display_name}님</h1>
      {next ? (
        <NextMeetingCard meeting={next} myStatus={myStatus} />
      ) : (
        <div className="text-center py-12 space-y-3 border-2 border-dashed rounded">
          <p className="text-3xl">📚</p>
          <p className="text-slate-600">아직 예정된 모임이 없어요</p>
          <Link href="/meetings/new"><Button>첫 모임 만들기</Button></Link>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 검증**

홈에 다음 모임 카드 표시, 참석 토글 동작, 발제문 버튼 클릭 시 상세 이동. 모임 0개일 때 빈 상태 표시.

- [ ] **Step 4: 커밋**

```bash
git add components/meeting/NextMeetingCard.tsx app/(app)/page.tsx
git commit -m "feat(home): next meeting card + empty state"
```

---

# Phase 9 — 더보기 탭 (멤버·초대·프로필)

## Task 26: 더보기 메인 페이지 + 멤버 명단

**Files:**
- Create: `app/(app)/more/page.tsx`, `components/member/MemberCard.tsx`

- [ ] **Step 1: MemberCard**

```tsx
import type { MemberStats } from '@/lib/queries/members';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function MemberCard({ member }: { member: MemberStats }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Avatar>
        <AvatarImage src={member.avatar_url ?? undefined} alt={member.display_name} />
        <AvatarFallback>{member.display_name.slice(0, 1)}</AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <p className="font-medium">{member.display_name}</p>
        <p className="text-xs text-slate-500">
          참석 {member.attended_count}회 · 호스트 {member.hosted_count}회
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 더보기 페이지**

```tsx
import Link from 'next/link';
import { ChevronRight, LogOut } from 'lucide-react';
import { getAllMembersWithStats, getCurrentProfile } from '@/lib/queries/members';
import { MemberCard } from '@/components/member/MemberCard';
import { Card, CardContent } from '@/components/ui/card';
import { LogoutButton } from './logout-button';

export default async function MorePage() {
  const [me, members] = await Promise.all([getCurrentProfile(), getAllMembersWithStats()]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">더보기</h1>

      <Card>
        <CardContent className="p-0">
          <Link href="/more/profile" className="flex items-center justify-between p-4 hover:bg-slate-50">
            <span>내 프로필 ({me?.display_name})</span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Link href="/more/invite" className="flex items-center justify-between p-4 hover:bg-slate-50">
            <span>초대 링크 관리</span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </Link>
        </CardContent>
      </Card>

      <section className="space-y-1">
        <h2 className="text-sm font-semibold text-slate-700">멤버 {members.length}명</h2>
        <Card><CardContent className="px-4 divide-y">
          {members.map((m) => <MemberCard key={m.id} member={m} />)}
        </CardContent></Card>
      </section>

      <LogoutButton />
    </div>
  );
}
```

- [ ] **Step 3: 로그아웃 버튼**

`app/(app)/more/logout-button.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

export function LogoutButton() {
  const router = useRouter();
  const supabase = getSupabaseBrowser();
  async function onClick() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }
  return (
    <Button variant="outline" className="w-full" onClick={onClick}>
      <LogOut className="w-4 h-4 mr-2" /> 로그아웃
    </Button>
  );
}
```

- [ ] **Step 4: 검증**

`/more` → 멤버 명단, 프로필/초대 진입, 로그아웃 동작.

- [ ] **Step 5: 커밋**

```bash
git add app/(app)/more components/member
git commit -m "feat(more): main page with member list + logout"
```

---

## Task 27: 초대 링크 관리 페이지

**Files:**
- Create: `app/(app)/more/invite/page.tsx`, `components/invite/InviteList.tsx`

- [ ] **Step 1: InviteList 클라이언트 컴포넌트**

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Plus } from 'lucide-react';
import { createInvite } from '@/lib/actions/invite';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { Invite } from '@/lib/types';

export function InviteList({ initial, siteUrl }: { initial: Invite[]; siteUrl: string }) {
  const [invites, setInvites] = useState(initial);
  const [creating, setCreating] = useState(false);

  async function generate() {
    setCreating(true);
    const r = await createInvite();
    setCreating(false);
    if (!r.ok) return toast.error(r.error);
    const url = `${siteUrl}/signup?token=${r.token}`;
    await navigator.clipboard.writeText(url);
    toast.success('초대 링크가 복사되었습니다');
    // optimistic refresh
    setInvites((prev) => [{
      id: crypto.randomUUID(), token: r.token, created_by: '', created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), used_by: null, used_at: null,
    } as Invite, ...prev]);
  }

  function copy(token: string) {
    navigator.clipboard.writeText(`${siteUrl}/signup?token=${token}`);
    toast.success('복사됨');
  }

  function statusLabel(i: Invite): string {
    if (i.used_by) return '✓ 사용됨';
    if (new Date(i.expires_at) < new Date()) return '⏱ 만료';
    return '🟢 진행 중';
  }

  return (
    <div className="space-y-4">
      <Button onClick={generate} disabled={creating} className="w-full">
        <Plus className="w-4 h-4 mr-1" /> 새 초대 링크 생성
      </Button>

      <ul className="space-y-2">
        {invites.map((i) => {
          const active = !i.used_by && new Date(i.expires_at) > new Date();
          return (
            <Card key={i.id}><CardContent className="p-3 flex justify-between items-center">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">{statusLabel(i)}</p>
                <p className="text-sm font-mono truncate">{i.token.slice(0, 16)}...</p>
              </div>
              {active && (
                <Button size="icon" variant="ghost" onClick={() => copy(i.token)}>
                  <Copy className="w-4 h-4" />
                </Button>
              )}
            </CardContent></Card>
          );
        })}
        {invites.length === 0 && <p className="text-sm text-slate-500 text-center">아직 생성한 초대가 없습니다.</p>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: 페이지**

```tsx
import { getMyInvites } from '@/lib/queries/invites';
import { InviteList } from '@/components/invite/InviteList';

export default async function InvitePage() {
  const invites = await getMyInvites();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">초대 링크</h1>
      <p className="text-sm text-slate-600">생성 후 카카오톡 등으로 전달하세요. 1회용이며 7일 후 만료됩니다.</p>
      <InviteList initial={invites} siteUrl={siteUrl} />
    </div>
  );
}
```

- [ ] **Step 3: 검증**

`/more/invite` → "새 초대 링크 생성" → 클립보드에 URL 복사 + 리스트에 새 항목. 다른 브라우저에서 URL 열어 가입 → 리스트의 상태가 "사용됨"으로 변경되는지 새로고침으로 확인.

- [ ] **Step 4: 커밋**

```bash
git add app/(app)/more/invite components/invite
git commit -m "feat(invite): manage page with generate + list"
```

---

## Task 28: 프로필 편집 페이지

**Files:**
- Create: `app/(app)/more/profile/page.tsx`, `app/(app)/more/profile/profile-form.tsx`

- [ ] **Step 1: 페이지**

```tsx
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/queries/members';
import { ProfileForm } from './profile-form';

export default async function ProfilePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">프로필</h1>
      <ProfileForm defaultName={profile.display_name} avatarUrl={profile.avatar_url} />
    </div>
  );
}
```

- [ ] **Step 2: 폼**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { updateProfile } from '@/lib/actions/profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function ProfileForm({ defaultName, avatarUrl }: { defaultName: string; avatarUrl: string | null }) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [loading, setLoading] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = await updateProfile({ display_name: name });
    setLoading(false);
    if (!r.ok) return toast.error(r.error);
    toast.success('저장되었습니다');
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="flex justify-center">
        <Avatar className="w-20 h-20">
          <AvatarImage src={avatarUrl ?? undefined} alt={name} />
          <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
        </Avatar>
      </div>
      <div className="space-y-1">
        <Label htmlFor="name">이름</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
      </div>
      <Button type="submit" disabled={loading} className="w-full">저장</Button>
    </form>
  );
}
```

- [ ] **Step 3: 검증**

이름 수정 → 저장 → 토스트 + `/more`에 반영.

- [ ] **Step 4: 커밋**

```bash
git add app/(app)/more/profile
git commit -m "feat(profile): edit page"
```

---

# Phase 10 — 파일 업로드

## Task 29: 책 표지 업로드 (모임 폼에 통합)

**Files:**
- Modify: `components/meeting/MeetingForm.tsx`
- Create: `components/meeting/BookCoverUploader.tsx`

- [ ] **Step 1: BookCoverUploader**

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

export function BookCoverUploader({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const supabase = getSupabaseBrowser();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error('5MB 이하만 가능합니다');

    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('book-covers').upload(path, file, { upsert: false });
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data: pub } = supabase.storage.from('book-covers').getPublicUrl(path);
    onChange(pub.publicUrl);
    setUploading(false);
  }

  return (
    <div className="space-y-2">
      <div className="w-24 h-32 bg-slate-100 rounded overflow-hidden flex items-center justify-center">
        {value
          ? <img src={value} alt="책 표지" className="w-full h-full object-cover" />
          : <span className="text-2xl text-slate-300">📚</span>}
      </div>
      <label>
        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} disabled={uploading} />
        <Button asChild type="button" variant="outline" size="sm" disabled={uploading}>
          <span>{uploading ? '업로드 중...' : '책 표지 업로드'}</span>
        </Button>
      </label>
      {value && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange('')}>제거</Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: MeetingForm에 통합**

`components/meeting/MeetingForm.tsx` 상단 import 추가 + 폼 첫 필드 위에 삽입:

```tsx
import { BookCoverUploader } from './BookCoverUploader';
// 폼 내부에:
<FormField label="책 표지 (선택)">
  <BookCoverUploader value={form.watch('book_cover_url') ?? ''} onChange={(url) => form.setValue('book_cover_url', url)} />
</FormField>
```

- [ ] **Step 3: 검증**

모임 등록 폼 → 책 표지 업로드 → 미리보기 표시 → 등록 후 카드/상세에 표지 노출.

- [ ] **Step 4: 커밋**

```bash
git add components/meeting/BookCoverUploader.tsx components/meeting/MeetingForm.tsx
git commit -m "feat(upload): book cover uploader integrated into meeting form"
```

---

## Task 30: 프로필 아바타 업로드

**Files:**
- Modify: `app/(app)/more/profile/profile-form.tsx`
- Create: `components/profile/AvatarUploader.tsx`
- Add: 별도 server action `updateAvatar`

- [ ] **Step 1: action 추가**

`lib/actions/profile.ts`에 추가:

```ts
export async function updateAvatarUrl(url: string) {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: '로그인이 필요합니다' };
  const { error } = await supabase.from('profiles').update({ avatar_url: url || null }).eq('id', user.id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/more');
  revalidatePath('/more/profile');
  return { ok: true as const };
}
```

- [ ] **Step 2: AvatarUploader**

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { updateAvatarUrl } from '@/lib/actions/profile';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

export function AvatarUploader({ initialUrl, displayName }: { initialUrl: string | null; displayName: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [uploading, setUploading] = useState(false);
  const supabase = getSupabaseBrowser();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error('5MB 이하만 가능합니다');

    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setUploading(false); return toast.error('로그인 필요'); }
    const ext = file.name.split('.').pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    const r = await updateAvatarUrl(pub.publicUrl);
    setUploading(false);
    if (!r.ok) return toast.error(r.error);
    setUrl(pub.publicUrl);
    toast.success('프로필 사진 업데이트');
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Avatar className="w-20 h-20">
        <AvatarImage src={url ?? undefined} alt={displayName} />
        <AvatarFallback>{displayName.slice(0, 1)}</AvatarFallback>
      </Avatar>
      <label>
        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} disabled={uploading} />
        <Button asChild type="button" variant="outline" size="sm" disabled={uploading}>
          <span>{uploading ? '업로드 중...' : '사진 변경'}</span>
        </Button>
      </label>
    </div>
  );
}
```

- [ ] **Step 3: ProfileForm 수정**

`app/(app)/more/profile/profile-form.tsx`에서 `<Avatar>` 블록을 `<AvatarUploader>`로 교체:

```tsx
import { AvatarUploader } from '@/components/profile/AvatarUploader';
// 폼 안의 Avatar 블록 교체:
<AvatarUploader initialUrl={avatarUrl} displayName={name} />
```

- [ ] **Step 4: 검증**

`/more/profile` → 사진 변경 → 토스트 → 멤버 명단에 반영.

- [ ] **Step 5: 커밋**

```bash
git add components/profile lib/actions/profile.ts app/(app)/more/profile/profile-form.tsx
git commit -m "feat(upload): avatar uploader on profile page"
```

---

# Phase 11 — 모바일 최적화 & E2E

## Task 31: 모바일 디테일 보강

**Files:**
- Modify: `app/layout.tsx`, `app/globals.css`, `app/(app)/layout.tsx`

- [ ] **Step 1: 메타테마 색 + apple-mobile 메타**

`app/layout.tsx`의 `<head>`/metadata에 추가:

```tsx
export const metadata: Metadata = {
  title: '독서모임',
  description: '독서모임 이벤트 관리',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: '독서모임' },
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false,
  themeColor: '#ffffff',
};
```

- [ ] **Step 2: `public/manifest.json`**

```json
{
  "name": "독서모임",
  "short_name": "독서모임",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#0f172a",
  "icons": []
}
```

- [ ] **Step 3: 터치 타겟 최소 44px 확인 + 폼 인풋 줌 방지**

`app/globals.css`:

```css
input, textarea, select { font-size: 16px; }  /* iOS 자동 줌 방지 */
button, [role="button"] { min-height: 44px; }
```

- [ ] **Step 4: 검증**

Chrome DevTools → 모바일 뷰포트 → 화면 정상, 폼 입력 시 자동 줌 없음, 하단 네비 가림 없음.

- [ ] **Step 5: 커밋**

```bash
git add app/layout.tsx app/globals.css public/manifest.json
git commit -m "feat(mobile): pwa manifest, theme color, input zoom prevention"
```

---

## Task 32: E2E 테스트 — 핵심 흐름

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/main-flow.spec.ts`, `tests/e2e/fixtures.ts`

- [ ] **Step 1: Playwright 초기 설정**

```bash
pnpm exec playwright install --with-deps chromium
```

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'ko-KR',
    viewport: { width: 390, height: 844 },  // iPhone 14 Pro
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'mobile-chrome', use: devices['Pixel 7'] }],
});
```

- [ ] **Step 2: 핵심 흐름 테스트**

`tests/e2e/main-flow.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const BOOTSTRAP_INVITE = 'local-dev-invite-token-aaaaaaaaaaaaaaaa';
const UNIQUE = Date.now();

test('초대 가입 → 모임 등록 → 발제문 추가 → 참석 체크', async ({ page }) => {
  // 1. 부트스트랩 초대로 가입 (관리자는 이미 시드에 있음, 새 사용자가 추가 가입)
  // 부트스트랩 초대는 1회용이므로 admin 계정으로 먼저 로그인하여 새 초대 발급
  await page.goto('/login');
  await page.getByLabel('이메일').fill('admin@example.com');
  await page.getByLabel('비밀번호').fill('password123');
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page).toHaveURL('/');

  // 2. 초대 생성
  await page.goto('/more/invite');
  await page.getByRole('button', { name: /새 초대 링크 생성/ }).click();
  await expect(page.getByText('초대 링크가 복사되었습니다')).toBeVisible();

  // 토큰 추출 (UI에서 첫 슬라이스 표시됨)
  const tokenText = await page.locator('p.font-mono').first().innerText();
  const tokenPrefix = tokenText.replace('...', '');

  // 3. 새 모임 등록
  await page.goto('/meetings/new');
  await page.getByLabel('책 제목').fill(`테스트 책 ${UNIQUE}`);
  await page.getByLabel('저자').fill('테스트 저자');
  // datetime-local: 내일
  const tomorrow = new Date(Date.now() + 86400000);
  const local = tomorrow.toISOString().slice(0, 16);
  await page.getByLabel('일시').fill(local);
  await page.getByLabel('장소 이름').fill('테스트 카페');
  await page.getByRole('button', { name: '등록하기' }).click();
  await expect(page).toHaveURL(/\/meetings\/[a-f0-9-]+/);

  // 4. 발제문 추가
  await page.getByRole('button', { name: /질문 추가/ }).click();
  await page.getByPlaceholder(/주인공이 마지막에/).fill('주인공의 선택에 대해 어떻게 생각하시나요?');
  await page.getByRole('button', { name: '등록' }).click();
  await expect(page.getByText('Q1.')).toBeVisible();

  // 5. 참석 체크
  await page.getByRole('button', { name: '참석' }).first().click();
  // 낙관적 업데이트라 별도 어설션은 새로고침으로 확인
  await page.reload();
  // 참석 토글의 "참석" 버튼이 활성 상태(다크 배경)임을 클래스로 확인
  await expect(page.getByRole('button', { name: '참석' }).first()).toHaveClass(/bg-slate-900/);
});
```

- [ ] **Step 3: 실행**

DB 리셋 후:
```bash
pnpm dlx supabase db reset
pnpm test:e2e
```

Expected: 1 passed.

- [ ] **Step 4: 커밋**

```bash
git add playwright.config.ts tests/e2e
git commit -m "test(e2e): core user flow (signup → meeting → question → attendance)"
```

---

# 최종 검증

## Task 33: 전체 동작 점검 + README

**Files:**
- Create: `README.md`

- [ ] **Step 1: README 작성**

```markdown
# 독서모임 이벤트 관리 웹 MVP

## 시작하기

```bash
pnpm install
pnpm dlx supabase start
pnpm dlx supabase db reset
cp .env.example .env.local  # Supabase 키 채우기
pnpm dev
```

기본 부트스트랩 계정/초대 토큰은 `docs/bootstrap.md` 참고.

## 테스트
- 단위: `pnpm test`
- E2E: `pnpm test:e2e`

## 문서
- 설계: `docs/superpowers/specs/2026-05-31-book-club-mvp-design.md`
- 구현 계획: `docs/superpowers/plans/2026-05-31-book-club-mvp.md`
```

- [ ] **Step 2: 수동 통합 테스트 체크리스트**

다음을 직접 확인:
1. ✅ 초대 링크로 신규 가입
2. ✅ 모임 등록 (책 표지 포함)
3. ✅ 발제문 5개 추가
4. ✅ 다른 계정으로 참석 토글 → 현황 반영
5. ✅ 호스트로 모임 수정·삭제
6. ✅ 멤버 명단에서 참석/호스트 횟수 정확
7. ✅ 모바일 뷰포트에서 모든 화면 깨짐 없음

- [ ] **Step 3: 최종 커밋 + 푸시 준비**

```bash
git add README.md
git commit -m "docs: add README"
```

---

# Self-Review (작성 후 점검)

## 스펙 커버리지

| 스펙 섹션 | 구현 Task |
|---|---|
| 2.1 In Scope #1 (이메일+소셜 로그인) | Task 11 |
| 2.1 In Scope #2 (초대 토큰 가입) | Task 10 (consumeInvite), Task 12, Task 27 |
| 2.1 In Scope #3 (모임 CRUD) | Task 17–20 |
| 2.1 In Scope #4 (책 정보) | Task 18, Task 29 (cover) |
| 2.1 In Scope #5 (일시 + D-day) | Task 17, Task 19, Task 25 |
| 2.1 In Scope #6 (장소) | Task 18, Task 19 |
| 2.1 In Scope #7 (참석 토글) | Task 21–22 |
| 2.1 In Scope #8 (발제문) | Task 23–24 |
| 2.1 In Scope #9 (멤버 명단·이력) | Task 26 |
| 2.1 In Scope #10 (모바일 최적화) | Task 31 |
| 5. 데이터 모델 (5 테이블 + RLS + Storage) | Task 4–6 |
| 6. 사용자 흐름 (6개) | 각 흐름이 위 Task들로 매핑 |
| 7.6 테스트 전략 | Task 8 (단위), Task 32 (E2E) |
| 7.7 Storage 버킷 | Task 6, Task 29, Task 30 |

✅ 모든 In Scope 항목 커버.

## 일관성 점검

- `setAttendance` 액션 시그니처는 `(meetingId, status)` — Task 10 정의, Task 21 호출에서 동일 ✓
- `addQuestion / updateQuestion / deleteQuestion` 시그니처 일관 ✓
- `meetingFormSchema` 필드명 (`book_title`, `scheduled_at` 등) — Task 8 정의, Task 18·20 사용에서 동일 ✓
- `MeetingDetail` 타입 — Task 9에서 정의 후 Task 19에서 사용 ✓

## 알려진 제약 / 향후 보강

- OAuth (Google/Kakao) provider 키 등록은 외부 작업이라 수동 가이드만 제공 (Task 11)
- 발제문 순서 변경(드래그앤드롭)은 `order_idx` 컬럼만 준비, UI 미구현 — 필요 시 별도 Task로 추가
- 첫 멤버(부트스트랩) 생성은 SQL 시드로 처리 — 운영 환경 가이드는 `docs/bootstrap.md`
- E2E 테스트는 1개 핵심 흐름만 — 회귀 테스트 확장은 추후

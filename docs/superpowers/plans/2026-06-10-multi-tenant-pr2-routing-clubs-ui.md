# Multi-tenant Phase A — PR 2: Routing, Group CRUD, Onboarding, Group Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the user-facing routing to be group-scoped (`/clubs/<id>/...`), add the group-create flow, ship the onboarding screen for new users, the group list page, and the top-bar group switcher — all while leaving the legacy `/meetings/*` routes untouched (PR 5 cleanup removes them).

**Architecture:** New page routes under `app/(app)/clubs/<id>/...` reuse the existing meeting components (`NextMeetingCard`, `MeetingDetailHeader`, `DiscussionFileUploader`, …) — the data shape didn't change. A new SECURITY DEFINER SQL function (`create_club`) atomically inserts the `clubs` row and the creator's `admin` row in `club_members`. Queries layer gains `getMyClubs`/`getClubById`. The `BottomNav` moves from the top-level layout into a new group layout (`app/(app)/clubs/[id]/layout.tsx`) so it only appears inside a group context; the new top-bar holds the group switcher.

**Tech Stack:** Next.js 16 App Router (RSC + server actions), Supabase (Postgres + RLS + SECURITY DEFINER functions), TypeScript, Tailwind, pnpm, Vitest

**Reference spec:** `docs/superpowers/specs/2026-06-09-multi-tenant-clubs-design.md`

**PR split (decided 2026-06-10):**
- **PR 2a — Tasks 1-15 + push/PR/deploy:** ships everything additive. New `/clubs/*` pages, group create, in-group meeting URLs all exist; the existing `/` home is unchanged. Users who don't know the new URLs see no difference. Production smoke test before moving on.
- **PR 2b — Tasks 16-18 + push/PR/deploy:** ships the user-visible transition. `/onboarding`, the entry router at `/`, and the club-scoped `BottomNav`. After this deploy users land on the new flow.

A push/PR/deploy task lives at the end of each segment (Tasks 15.5 and 18.5 below). Treat them as gates — finish, deploy, smoke test in production before starting the next segment.

---

## File Structure

### New files (created in this PR)

| File | Purpose |
|------|---------|
| `supabase/migrations/20260610000001_create_club_function.sql` | `create_club(name TEXT)` SECURITY DEFINER function (atomic club + admin row insert) |
| `lib/actions/clubs.ts` | `createClub({ name })` server action (calls the SQL function) |
| `lib/queries/clubs.ts` | `getMyClubs()`, `getClubById(id)`, `getNextMeetingInClub(clubId)`, `getUpcomingMeetingsInClub(clubId)`, `getPastMeetingsInClub(clubId)` |
| `components/club/ClubCard.tsx` | Card for the `/clubs` list |
| `components/club/ClubCreateForm.tsx` | Form for `/clubs/new` (name input + submit) |
| `components/club/ClubSwitcher.tsx` | Top-bar drop-down for switching clubs inside the group layout |
| `app/(app)/onboarding/page.tsx` | "그룹 만들기" + "초대코드 입력" (the code input is a UI shell for now — PR 3 wires real behavior) |
| `app/(app)/clubs/page.tsx` | List of clubs the current user belongs to |
| `app/(app)/clubs/new/page.tsx` | Group-create form (client component using `ClubCreateForm`) |
| `app/(app)/clubs/[id]/layout.tsx` | Group context layout: top-bar with name + `ClubSwitcher`, BottomNav, 404 guard if not a member |
| `app/(app)/clubs/[id]/page.tsx` | Group home = next-meeting card layout (replaces the old `app/(app)/page.tsx` content) |
| `app/(app)/clubs/[id]/meetings/page.tsx` | Group meetings list (upcoming + past) |
| `app/(app)/clubs/[id]/meetings/new/page.tsx` | Create-meeting form (sets `club_id` automatically) |
| `app/(app)/clubs/[id]/meetings/[meetingId]/page.tsx` | Meeting detail (copy of existing logic + `club_id === params.id` guard) |
| `app/(app)/clubs/[id]/meetings/[meetingId]/edit/page.tsx` | Meeting edit (same copy + guard) |

### Modified files

| File | What changes |
|------|--------------|
| `app/(app)/page.tsx` | Becomes the entry router: 0 clubs → redirect `/onboarding`, 1+ clubs → redirect `/clubs` |
| `app/(app)/layout.tsx` | Drop `BottomNav` (it moves to the group layout); keep the `pb-20` + `max-w-md` wrapper |
| `lib/actions/meetings.ts` | `createMeeting(...)` accepts `clubId` and writes it into the row (back-compat: existing usages get the default club id from query helper) |

### Untouched (handled in PR 5 cleanup)

- `app/(app)/meetings/page.tsx`, `app/(app)/meetings/new/page.tsx`, `app/(app)/meetings/[id]/page.tsx`, `app/(app)/meetings/[id]/edit/page.tsx` — kept so existing bookmarks keep working through PR 2-4. PR 5 deletes them.
- Existing RLS on `meetings`, `attendances`, `discussion_questions` — still approved-based. PR 5 switches to `is_club_member`.
- `profiles.approved` column — still in the schema. PR 5 drops it.

---

## Pre-flight (one-time, before Task 1)

- [ ] Confirm local Supabase running: `supabase status` shows API + DB URLs
- [ ] Confirm clean git state: `git status` → no uncommitted changes
- [ ] Confirm on main with PR 1 merged: `git log --oneline -3` shows the PR 1 merge commit at HEAD
- [ ] Create branch: `git checkout -b feat/multi-tenant-routing`

---

## Task 1: Add the `create_club` SECURITY DEFINER function

The new RLS on `club_members` (from PR 1) forbids direct INSERT — only server actions via `SECURITY DEFINER` can insert. This function does both the `clubs` row insert and the creator's `admin` row insert in one transaction so a half-created club can never exist.

**Files:**
- Create: `supabase/migrations/20260610000001_create_club_function.sql`

- [ ] **Step 1: Create the file with the function**

```sql
-- Phase A · PR 2: create_club helper
-- SECURITY DEFINER lets the function bypass club_members INSERT-RLS (PR 1 T8)
-- so a single atomic call inserts the club + the creator's admin row.

CREATE OR REPLACE FUNCTION create_club(club_name TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_club_id UUID;
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF club_name IS NULL OR length(trim(club_name)) = 0 THEN
    RAISE EXCEPTION 'Club name is required';
  END IF;

  INSERT INTO clubs (name, created_by)
  VALUES (trim(club_name), current_user_id)
  RETURNING id INTO new_club_id;

  INSERT INTO club_members (club_id, user_id, role)
  VALUES (new_club_id, current_user_id, 'admin');

  RETURN new_club_id;
END;
$$;
```

- [ ] **Step 2: Apply locally**

Run: `supabase db reset`
Expected: completes; the new migration is the last one applied.

- [ ] **Step 3: Verify the function exists and works**

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
  -c "SELECT proname FROM pg_proc WHERE proname = 'create_club';"
```
Expected: one row showing `create_club`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260610000001_create_club_function.sql
git commit -m "$(cat <<'EOF'
feat(schema): add create_club SECURITY DEFINER function

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Create `lib/queries/clubs.ts` — group-aware data accessors

**Files:**
- Create: `lib/queries/clubs.ts`

- [ ] **Step 1: Create the file**

```typescript
import { getSupabaseServer } from '@/lib/supabase/server';
import type { Club, Meeting, Profile, Attendance, DiscussionQuestion } from '@/lib/types';

export type MyClub = Club & {
  role: 'admin' | 'member';
};

/** Returns clubs where the current user is an active member (admin or member). pending excluded. */
export async function getMyClubs(): Promise<MyClub[]> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('club_members')
    .select('role, club:clubs(*)')
    .in('role', ['admin', 'member'])
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .filter((row: any) => row.club !== null)
    .map((row: any) => ({ ...row.club, role: row.role })) as MyClub[];
}

/** Returns the club if the current user is an active member; null otherwise. RLS enforces. */
export async function getClubById(id: string): Promise<Club | null> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type NextMeetingInClub = Meeting & {
  host: Profile;
  questions_count: number;
  attendances: Array<Attendance & { profile: Profile }>;
};

export async function getNextMeetingInClub(clubId: string): Promise<NextMeetingInClub | null> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('meetings')
    .select('*, host:profiles!meetings_host_id_fkey(*), discussion_questions(count), attendances(*, profile:profiles(*))')
    .eq('club_id', clubId)
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const questions_count = (data as any).discussion_questions?.[0]?.count ?? 0;
  return { ...(data as any), questions_count } as NextMeetingInClub;
}

export async function getUpcomingMeetingsInClub(clubId: string): Promise<Array<Meeting & { host: Profile }>> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('meetings')
    .select('*, host:profiles!meetings_host_id_fkey(*)')
    .eq('club_id', clubId)
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<Meeting & { host: Profile }>;
}

export async function getPastMeetingsInClub(clubId: string): Promise<Array<Meeting & { host: Profile }>> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('meetings')
    .select('*, host:profiles!meetings_host_id_fkey(*)')
    .eq('club_id', clubId)
    .lt('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<Meeting & { host: Profile }>;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/queries/clubs.ts
git commit -m "$(cat <<'EOF'
feat(queries): add clubs query layer (getMyClubs, getClubById, in-club meetings)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Create `lib/actions/clubs.ts` — `createClub` server action

**Files:**
- Create: `lib/actions/clubs.ts`

- [ ] **Step 1: Create the file**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { getSupabaseServer } from '@/lib/supabase/server';

const createClubSchema = z.object({
  name: z.string().trim().min(1, '그룹 이름을 입력해주세요.').max(50, '그룹 이름은 50자 이내로 입력해주세요.'),
});

export async function createClub(input: { name: string }): Promise<
  { ok: true; clubId: string } | { ok: false; error: string }
> {
  const parsed = createClubSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' };
  }

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc('create_club', { club_name: parsed.data.name });

  if (error) {
    console.error('[createClub]', error);
    Sentry.captureException(error, { tags: { action: 'createClub' } });
    if (error.message?.includes('Not authenticated')) {
      return { ok: false, error: '로그인이 필요합니다.' };
    }
    return { ok: false, error: '그룹을 만들지 못했습니다.' };
  }

  if (!data) {
    return { ok: false, error: '그룹을 만들지 못했습니다.' };
  }

  revalidatePath('/clubs');
  return { ok: true, clubId: data as string };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/clubs.ts
git commit -m "$(cat <<'EOF'
feat(actions): add createClub server action (calls create_club RPC)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `ClubCreateForm` component (client)

**Files:**
- Create: `components/club/ClubCreateForm.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { createClub } from '@/lib/actions/clubs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ClubCreateForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const result = await createClub({ name });
    if (!result.ok) {
      setSubmitting(false);
      toast.error(result.error);
      return;
    }
    toast.success('그룹을 만들었어요.');
    router.push(`/clubs/${result.clubId}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name" className="text-stone-700">그룹 이름</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 강남 직장인 독서모임"
          required
          maxLength={50}
          className="bg-stone-50 border-stone-200 focus:bg-white"
        />
      </div>
      <Button
        type="submit"
        disabled={submitting || name.trim().length === 0}
        className="w-full bg-stone-800 hover:bg-stone-700 text-white"
      >
        {submitting ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />만드는 중...</>
        ) : (
          '그룹 만들기'
        )}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/club/ClubCreateForm.tsx
git commit -m "$(cat <<'EOF'
feat(club): add ClubCreateForm component

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `/clubs/new` page

**Files:**
- Create: `app/(app)/clubs/new/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { ClubCreateForm } from '@/components/club/ClubCreateForm';

export default function NewClubPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/clubs" className="text-stone-500 hover:text-stone-800">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold">새 그룹 만들기</h1>
      </div>
      <ClubCreateForm />
    </div>
  );
}
```

- [ ] **Step 2: Build (catches prerender issues)**

Run: `pnpm build`
Expected: builds, `/clubs/new` appears in the route table.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/clubs/new/page.tsx"
git commit -m "$(cat <<'EOF'
feat(clubs): add /clubs/new page

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `ClubCard` component

**Files:**
- Create: `components/club/ClubCard.tsx`

- [ ] **Step 1: Create the component**

```typescript
import Link from 'next/link';
import { Crown, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { MyClub } from '@/lib/queries/clubs';

export function ClubCard({ club }: { club: MyClub }) {
  return (
    <Link href={`/clubs/${club.id}`} className="block">
      <Card className="hover:bg-stone-50 transition-colors">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center text-2xl shrink-0">
            📚
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{club.name}</p>
            {club.description && (
              <p className="text-sm text-stone-500 truncate">{club.description}</p>
            )}
          </div>
          <span className="shrink-0 inline-flex items-center gap-1 text-xs text-stone-500">
            {club.role === 'admin' ? (
              <><Crown className="w-3.5 h-3.5" />admin</>
            ) : (
              <><Users className="w-3.5 h-3.5" />member</>
            )}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/club/ClubCard.tsx
git commit -m "$(cat <<'EOF'
feat(club): add ClubCard component for /clubs list

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `/clubs` group list page

**Files:**
- Create: `app/(app)/clubs/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getMyClubs } from '@/lib/queries/clubs';
import { ClubCard } from '@/components/club/ClubCard';
import { Button } from '@/components/ui/button';

export default async function ClubsPage() {
  const clubs = await getMyClubs();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">내 그룹</h1>
        <Link href="/clubs/new">
          <Button size="sm" className="gap-1">
            <Plus className="w-4 h-4" />
            새 그룹
          </Button>
        </Link>
      </div>
      {clubs.length === 0 ? (
        <div className="text-center py-12 space-y-2 border-2 border-dashed rounded-xl">
          <p className="text-3xl">📚</p>
          <p className="text-sm text-stone-500">아직 속한 그룹이 없어요.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {clubs.map((club) => (
            <li key={club.id}>
              <ClubCard club={club} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: builds, `/clubs` appears in route table.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/clubs/page.tsx"
git commit -m "$(cat <<'EOF'
feat(clubs): add /clubs list page

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `ClubSwitcher` component (top-bar drop-down)

**Files:**
- Create: `components/club/ClubSwitcher.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';

import Link from 'next/link';
import { ChevronDown, List } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { MyClub } from '@/lib/queries/clubs';

export function ClubSwitcher({
  currentClub,
  allClubs,
}: {
  currentClub: { id: string; name: string };
  allClubs: MyClub[];
}) {
  const others = allClubs.filter((c) => c.id !== currentClub.id);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1 text-base font-semibold text-stone-800 hover:text-stone-600 transition-colors">
        <span className="truncate max-w-[200px]">{currentClub.name}</span>
        <ChevronDown className="w-4 h-4 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="min-w-56">
        {others.length > 0 && (
          <>
            {others.map((c) => (
              <DropdownMenuItem key={c.id} asChild>
                <Link href={`/clubs/${c.id}`} className="cursor-pointer">
                  {c.name}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem asChild>
          <Link href="/clubs" className="cursor-pointer gap-2">
            <List className="w-4 h-4" />
            그룹 목록
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/club/ClubSwitcher.tsx
git commit -m "$(cat <<'EOF'
feat(club): add ClubSwitcher top-bar drop-down

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Group layout (`app/(app)/clubs/[id]/layout.tsx`)

Adds the top bar with `ClubSwitcher` and moves `BottomNav` here. Guards against non-members via `notFound()` (RLS will already return null in `getClubById`).

**Files:**
- Create: `app/(app)/clubs/[id]/layout.tsx`

- [ ] **Step 1: Create the layout**

```typescript
import { notFound } from 'next/navigation';
import { getClubById, getMyClubs } from '@/lib/queries/clubs';
import { ClubSwitcher } from '@/components/club/ClubSwitcher';
import { BottomNav } from '@/components/layout/BottomNav';

export default async function ClubLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const [club, myClubs] = await Promise.all([getClubById(id), getMyClubs()]);
  if (!club) notFound();

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-stone-100">
        <div className="max-w-md mx-auto px-4 py-3">
          <ClubSwitcher
            currentClub={{ id: club.id, name: club.name }}
            allClubs={myClubs}
          />
        </div>
      </header>
      <div className="space-y-6 pt-4">{children}</div>
      <BottomNav />
    </>
  );
}
```

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: builds successfully.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/clubs/[id]/layout.tsx"
git commit -m "$(cat <<'EOF'
feat(clubs): add group context layout with switcher + bottom nav

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Group detail (`/clubs/<id>`) page — reuses the existing home layout

**Files:**
- Create: `app/(app)/clubs/[id]/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
import Link from 'next/link';
import { getNextMeetingInClub } from '@/lib/queries/clubs';
import { getCurrentProfile } from '@/lib/queries/members';
import { NextMeetingCard } from '@/components/meeting/NextMeetingCard';
import { Button } from '@/components/ui/button';
import { getSupabaseServer } from '@/lib/supabase/server';

async function getMyAttendance(meetingId: string, userId: string) {
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from('attendances')
    .select('status')
    .eq('meeting_id', meetingId)
    .eq('user_id', userId)
    .maybeSingle();
  return data?.status ?? null;
}

export default async function ClubHomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clubId } = await params;
  const [next, me] = await Promise.all([getNextMeetingInClub(clubId), getCurrentProfile()]);
  const myStatus = next && me ? await getMyAttendance(next.id, me.id) : null;

  return (
    <div className="space-y-4">
      {me && <h1 className="text-xl font-bold">안녕하세요, {me.display_name}님</h1>}
      {next ? (
        <NextMeetingCard meeting={next} myStatus={myStatus} />
      ) : (
        <div className="text-center py-12 space-y-3 border-2 border-dashed rounded">
          <p className="text-3xl">📚</p>
          <p className="text-slate-600">아직 예정된 모임이 없어요</p>
          <Link href={`/clubs/${clubId}/meetings/new`}>
            <Button>첫 모임 만들기</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: builds.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/clubs/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(clubs): add group home page (next-meeting layout)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Group meetings list (`/clubs/<id>/meetings`)

**Files:**
- Create: `app/(app)/clubs/[id]/meetings/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getUpcomingMeetingsInClub, getPastMeetingsInClub } from '@/lib/queries/clubs';
import { MeetingCard } from '@/components/meeting/MeetingCard';
import { Button } from '@/components/ui/button';

export default async function ClubMeetingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clubId } = await params;
  const [upcoming, past] = await Promise.all([
    getUpcomingMeetingsInClub(clubId),
    getPastMeetingsInClub(clubId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">모임</h1>
        <Link href={`/clubs/${clubId}/meetings/new`}>
          <Button className="gap-1">
            <Plus className="w-4 h-4" />
            신규 생성
          </Button>
        </Link>
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

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: builds.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/clubs/[id]/meetings/page.tsx"
git commit -m "$(cat <<'EOF'
feat(clubs): add /clubs/<id>/meetings list page

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Extend `createMeeting` action to accept `clubId`

**Files:**
- Modify: `lib/actions/meetings.ts`

- [ ] **Step 1: Read the current action**

Run: `cat lib/actions/meetings.ts | head -80`

Find the `createMeeting` (or equivalent) function. It currently doesn't take a `clubId`. We need to: (a) accept `clubId` in input, (b) include it in the INSERT.

- [ ] **Step 2: Patch the schema + insert**

In `lib/actions/meetings.ts`, locate the create-meeting zod schema and add a `club_id` field (UUID, required). Locate the `.insert({ ... })` payload and include `club_id: parsed.data.club_id`. Concretely, find:

```typescript
const createSchema = z.object({
  // ... existing fields
});
```

and add:

```typescript
  club_id: z.string().uuid('잘못된 그룹 id'),
```

Then in the INSERT payload, add `club_id: parsed.data.club_id` alongside the existing fields.

(If the file structure differs — e.g. there's no `createSchema` but rather an inline parse — adapt: add a `clubId` parameter to the action signature, validate as UUID, and include it in the insert.)

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: errors at any call site that still calls `createMeeting` without `club_id`. The legacy `app/(app)/meetings/new/page.tsx` needs to pass it too — temporarily pass the default club id (fetch via `getMyClubs()[0]?.id` in that page) so the existing route keeps working until PR 5 cleanup.

If the legacy page typecheck-fails, edit `app/(app)/meetings/new/page.tsx` (or its form component) to fetch `const clubs = await getMyClubs();` and pass `clubs[0]?.id ?? null` into the form as a hidden field. If the user has zero clubs, render "그룹을 먼저 만들어주세요" instead.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/meetings.ts "app/(app)/meetings/new/page.tsx"
git commit -m "$(cat <<'EOF'
feat(meetings): accept club_id on createMeeting; legacy page passes default club

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: New meeting page (`/clubs/<id>/meetings/new`)

**Files:**
- Create: `app/(app)/clubs/[id]/meetings/new/page.tsx`

- [ ] **Step 1: Inspect the existing legacy page**

Run: `cat app/\(app\)/meetings/new/page.tsx`

This is the source. The new page is essentially the same, but: (a) reads `params.id` as `clubId`, (b) renders `MeetingForm` with `clubId` baked in.

- [ ] **Step 2: Create the new page**

The exact shape depends on the legacy file. Use this template, swapping `<existing form import>` for the actual form component used in the legacy page:

```typescript
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/queries/members';
import { MeetingForm } from '@/components/meeting/MeetingForm';

export default async function NewMeetingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clubId } = await params;
  const me = await getCurrentProfile();
  if (!me) redirect('/login');

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">새 모임 만들기</h1>
      <MeetingForm clubId={clubId} />
    </div>
  );
}
```

The `MeetingForm` component likely takes some props; check the legacy page (`app/(app)/meetings/new/page.tsx`) and replicate them. Add `clubId` as a new prop.

- [ ] **Step 3: Update `MeetingForm` to take a `clubId` prop and include it in the action call**

Open `components/meeting/MeetingForm.tsx` and:
1. Add `clubId: string` to its props.
2. In the submit handler, pass `club_id: clubId` to `createMeeting`.

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: builds without errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/clubs/[id]/meetings/new/page.tsx" components/meeting/MeetingForm.tsx
git commit -m "$(cat <<'EOF'
feat(clubs): add /clubs/<id>/meetings/new + MeetingForm clubId prop

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Meeting detail page (`/clubs/<id>/meetings/<meetingId>`)

**Files:**
- Create: `app/(app)/clubs/[id]/meetings/[meetingId]/page.tsx`

- [ ] **Step 1: Inspect the legacy file**

Run: `cat app/\(app\)/meetings/\[id\]/page.tsx`

Copy its logic. The new page additionally guards: `if (meeting.club_id !== params.id) notFound();`

- [ ] **Step 2: Create the new page**

```typescript
import { notFound } from 'next/navigation';
import { getMeetingDetail } from '@/lib/queries/meetings';
import { getCurrentProfile } from '@/lib/queries/members';
import { MeetingDetailHeader } from '@/components/meeting/MeetingDetailHeader';
import { DiscussionQuestionList } from '@/components/meeting/DiscussionQuestionList';
import { DiscussionQuestionForm } from '@/components/meeting/DiscussionQuestionForm';
import { DiscussionFileUploader } from '@/components/meeting/DiscussionFileUploader';

export default async function ClubMeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string; meetingId: string }>;
}) {
  const { id: clubId, meetingId } = await params;
  const meeting = await getMeetingDetail(meetingId);
  if (!meeting) notFound();
  if (meeting.club_id !== clubId) notFound();

  const me = await getCurrentProfile();
  const isHost = me?.id === meeting.host_id;

  return (
    <div className="space-y-6">
      <MeetingDetailHeader meeting={meeting} isHost={isHost} />
      <section className="space-y-3">
        <p className="text-sm font-medium">발제 자료</p>
        {isHost && (
          <DiscussionFileUploader
            meetingId={meeting.id}
            currentFileUrl={meeting.discussion_file_url ?? null}
            currentFileName={meeting.discussion_file_name ?? null}
          />
        )}
        {/* ... carry over non-host file rendering from the legacy page if present ... */}
      </section>
      <DiscussionQuestionList meetingId={meeting.id} questions={meeting.questions} isHost={isHost} />
      {isHost && (
        <DiscussionQuestionForm meetingId={meeting.id} questionsCount={meeting.questions.length} />
      )}
    </div>
  );
}
```

(Replicate any non-host file rendering from the legacy file verbatim.)

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: builds.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/clubs/[id]/meetings/[meetingId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(clubs): add /clubs/<id>/meetings/<meetingId> page with club guard

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Meeting edit page (`/clubs/<id>/meetings/<meetingId>/edit`)

**Files:**
- Create: `app/(app)/clubs/[id]/meetings/[meetingId]/edit/page.tsx`

- [ ] **Step 1: Inspect the legacy edit page**

Run: `cat app/\(app\)/meetings/\[id\]/edit/page.tsx`

Copy its logic with the same `club_id` guard.

- [ ] **Step 2: Create the new edit page**

```typescript
import { notFound, redirect } from 'next/navigation';
import { getMeetingDetail } from '@/lib/queries/meetings';
import { getCurrentProfile } from '@/lib/queries/members';
import { EditForm } from '@/app/(app)/meetings/[id]/edit/edit-form';

export default async function ClubMeetingEditPage({
  params,
}: {
  params: Promise<{ id: string; meetingId: string }>;
}) {
  const { id: clubId, meetingId } = await params;
  const meeting = await getMeetingDetail(meetingId);
  if (!meeting) notFound();
  if (meeting.club_id !== clubId) notFound();

  const me = await getCurrentProfile();
  if (me?.id !== meeting.host_id) redirect(`/clubs/${clubId}/meetings/${meetingId}`);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">모임 수정</h1>
      <EditForm meeting={meeting} />
    </div>
  );
}
```

(If the legacy `EditForm` import path is different — check before writing.)

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: builds.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/clubs/[id]/meetings/[meetingId]/edit/page.tsx"
git commit -m "$(cat <<'EOF'
feat(clubs): add /clubs/<id>/meetings/<meetingId>/edit page with guard

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15.5 — PR 2a deploy gate (verify, push, merge, db push, production smoke)

Finish PR 2a before starting PR 2b. After this gate, production has the new `/clubs/*` routes available (but users don't see them yet — the entry router is still the old home).

- [ ] **Step 1: Local verification**

```bash
pnpm vitest run
pnpm tsc --noEmit
pnpm build
```
Expected: all green; route table includes `/clubs`, `/clubs/new`, `/clubs/[id]`, `/clubs/[id]/meetings`, `/clubs/[id]/meetings/new`, `/clubs/[id]/meetings/[meetingId]`, `/clubs/[id]/meetings/[meetingId]/edit`.

- [ ] **Step 2: Local smoke test**

`pnpm dev` → http://localhost:3000. Existing `/` still works as before (home). Manually visit `/clubs` (empty for local seed) → "새 그룹" → create one → land on `/clubs/<id>` → see empty next-meeting state → "첫 모임 만들기" → fill form → meeting visible. Top-bar drop-down → "그룹 목록". Kill dev server.

- [ ] **Step 3: Push**

```bash
git push -u origin feat/multi-tenant-routing
```

- [ ] **Step 4: PR**

Open the PR with:
- Title: `feat(routing): multi-tenant clubs routes + group CRUD (PR 2a)`
- Body summarizing T1-T15 work, marking PR 2b as the follow-up.

- [ ] **Step 5: Merge**

CI green → Squash and merge → Delete branch.

- [ ] **Step 6: Production migration**

```bash
git checkout main
git pull origin main
supabase db push
```
Confirm `y`. Applies `20260610000001_create_club_function.sql`.

- [ ] **Step 7: Production smoke**

Visit https://book-club-five-nu.vercel.app/. Existing flow unchanged (still old home). Manually visit `https://book-club-five-nu.vercel.app/clubs` → 부글부글 group appears → click → see the next meeting. New routes work in production. Users won't naturally land here yet — that's PR 2b.

- [ ] **Step 8: Local cleanup + start PR 2b branch**

```bash
git branch -D feat/multi-tenant-routing
git checkout -b feat/multi-tenant-routing-entry
```

---

## Task 16: Onboarding page

**Files:**
- Create: `app/(app)/onboarding/page.tsx`

The "초대코드 입력" UI is a placeholder until PR 3 wires real behavior; submitting it shows an info toast.

- [ ] **Step 1: Create the onboarding page**

```typescript
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plus, Key } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function OnboardingPage() {
  const [code, setCode] = useState('');

  function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    toast.info('초대코드 가입은 곧 활성화됩니다. 잠시만 기다려주세요.');
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-stone-50">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="text-4xl">📖</div>
          <h1 className="text-2xl font-semibold text-stone-800 tracking-tight">시작하기</h1>
          <p className="text-sm text-stone-500">새 그룹을 만들거나 초대코드로 가입할 수 있어요</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 space-y-5">
          <Link href="/clubs/new" className="block">
            <Button className="w-full bg-stone-800 hover:bg-stone-700 text-white gap-2">
              <Plus className="w-4 h-4" />
              새 그룹 만들기
            </Button>
          </Link>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-stone-100" />
            <span className="text-xs text-stone-400">또는</span>
            <div className="flex-1 h-px bg-stone-100" />
          </div>

          <form onSubmit={handleCodeSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="code" className="text-stone-700">초대코드 또는 링크</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ABC-XYZ-123 또는 초대 URL 전체"
                className="bg-stone-50 border-stone-200 focus:bg-white"
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={code.trim().length === 0}
              className="w-full gap-2"
            >
              <Key className="w-4 h-4" />
              초대코드로 가입
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: builds, `/onboarding` is in the route table.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/onboarding/page.tsx"
git commit -m "$(cat <<'EOF'
feat(onboarding): add /onboarding page (group create + code input shell)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Entry router (rewrite `app/(app)/page.tsx`)

The old home becomes a tiny server router that redirects based on club count.

**Files:**
- Modify: `app/(app)/page.tsx`

- [ ] **Step 1: Rewrite the file**

Replace the entire file content with:

```typescript
import { redirect } from 'next/navigation';
import { getMyClubs } from '@/lib/queries/clubs';

export default async function EntryRouterPage() {
  const clubs = await getMyClubs();
  if (clubs.length === 0) redirect('/onboarding');
  redirect('/clubs');
}
```

- [ ] **Step 2: Drop `BottomNav` from the top layout**

Open `app/(app)/layout.tsx` and remove the `BottomNav` import + render. The file becomes:

```typescript
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-20">
      <main className="max-w-md mx-auto px-4 py-4">{children}</main>
    </div>
  );
}
```

(BottomNav now lives in `app/(app)/clubs/[id]/layout.tsx` only.)

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: builds. `/` is now `ƒ Dynamic` (redirect).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/page.tsx" "app/(app)/layout.tsx"
git commit -m "$(cat <<'EOF'
feat(routing): / becomes club entry router; bottom nav moves to group layout

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Update `BottomNav` to be club-scoped

The shared `BottomNav` component had hard-coded `/`, `/meetings`, `/more` hrefs. Now from inside a group, `/`-and-`/meetings` should map to `/clubs/<id>` and `/clubs/<id>/meetings`. `/more` stays as is.

**Files:**
- Modify: `components/layout/BottomNav.tsx`

- [ ] **Step 1: Rewrite to derive tabs from the current group route**

```typescript
'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { Home, Calendar, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BottomNav() {
  const pathname = usePathname();
  const params = useParams<{ id?: string }>();
  const clubId = params?.id;

  // Inside a group layout, params.id is always present.
  const tabs = clubId
    ? [
        {
          href: `/clubs/${clubId}`,
          label: '홈',
          icon: Home,
          match: (p: string) => p === `/clubs/${clubId}`,
        },
        {
          href: `/clubs/${clubId}/meetings`,
          label: '모임',
          icon: Calendar,
          match: (p: string) => p.startsWith(`/clubs/${clubId}/meetings`),
        },
        {
          href: '/more',
          label: '설정',
          icon: Menu,
          match: (p: string) => p.startsWith('/more'),
        },
      ]
    : [];

  if (tabs.length === 0) return null;

  return (
    <nav
      className="fixed bottom-0 inset-x-0 bg-white border-t z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex">
        {tabs.map((t) => {
          const active = t.match(pathname);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                className={cn(
                  'flex flex-col items-center gap-1 py-3 text-xs',
                  active ? 'text-slate-900 font-semibold' : 'text-slate-500'
                )}
              >
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

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: builds.

- [ ] **Step 3: Commit**

```bash
git add components/layout/BottomNav.tsx
git commit -m "$(cat <<'EOF'
feat(nav): BottomNav becomes club-scoped (uses params.id)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 19 — PR 2b deploy gate (verify, push, merge, production smoke)

No DB migration this time (T16-T18 are code-only).

- [ ] **Step 1: Local verification**

```bash
pnpm vitest run
pnpm tsc --noEmit
pnpm build
```
Expected: all green. Route table now shows `/` as dynamic (redirect) instead of static (old home page).

- [ ] **Step 2: Local smoke test**

`pnpm dev` → http://localhost:3000:
- [ ] `/` (logged-in, with at least one club) → auto-redirects to `/clubs`
- [ ] `/onboarding` directly → see both options ("그룹 만들기" + "초대코드 입력 곧 활성화" toast on submit)
- [ ] Inside a group: top bar shows the club name + drop-down; bottom nav shows 홈/모임/설정 mapped to `/clubs/<id>`, `/clubs/<id>/meetings`, `/more`
- [ ] "모임" tab → meetings list → meeting detail → attendance toggle works
- [ ] Top-bar drop-down → "그룹 목록" → `/clubs`. From `/clubs`, BottomNav is not shown (we're outside a group).

If anything breaks, fix before committing.

- [ ] **Step 3: Push**

```bash
git push -u origin feat/multi-tenant-routing-entry
```

- [ ] **Step 4: PR**

Open the PR with:
- Title: `feat(routing): onboarding + entry router + club-scoped BottomNav (PR 2b)`
- Body: summarize T16-T18 work + note this is the user-visible transition layered on top of PR 2a.

- [ ] **Step 5: Merge**

CI green → Squash and merge → Delete branch.

- [ ] **Step 6: Production smoke**

Visit https://book-club-five-nu.vercel.app/. After login should now auto-redirect to `/clubs` (entry router). Click 부글부글 → group home with new top bar + bottom nav. "모임" tab → list → detail. Top-bar drop-down → "그룹 목록".

Verify legacy `/meetings/<id>` URLs (e.g. an old shared link) still resolve until PR 5 cleanup.

- [ ] **Step 7: Local cleanup**

```bash
git checkout main
git pull origin main
git branch -D feat/multi-tenant-routing-entry
```

---

## Done criteria

- ✅ Group create + browse works end-to-end (production)
- ✅ Entry router sends new users to onboarding, existing users to `/clubs`
- ✅ Existing 부글부글 group still shows all data (next meeting, list, detail, attendance, share)
- ✅ Legacy `/meetings/<id>` URLs still work (will be removed in PR 5)
- ✅ Production has the `create_club` function

## Out of scope for this PR (handled in later PRs)

- Invite link issuance, application, approval (PR 3)
- Group settings — rename, description edit, admin transfer, group delete (PR 4)
- Legacy `/meetings/*` route removal + `profiles.approved` drop + RLS rewrite of `meetings`/`attendances`/`discussion_questions` to use `is_club_member()` (PR 5)
- Anything UI for invite-code submission beyond the placeholder (PR 3)

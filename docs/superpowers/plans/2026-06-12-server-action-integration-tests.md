# Server Action Integration Test Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Server action 통합 테스트 인프라 + 보안 핵심 3개 action에 대한 12 케이스를 `pnpm test:integration` 한 줄로 검증 가능하게.

**Architecture:** Wrap-and-mock 접근. 로컬 Supabase 도커(`http://127.0.0.1:54321`)에 진짜 RLS·SECURITY DEFINER 함수까지 친 통합 테스트. `next/cache`·`@sentry/nextjs`·`@/lib/supabase/server` 3개 모듈만 vitest mock; action 본문은 그대로 실행. service_role client로 시드/정리, anon key로 signin해서 세션 만든 client를 mock 슬롯에 꽂아 action이 그 user로 행동하게 함.

**Tech Stack:** vitest 4.1.7 (기존), @supabase/supabase-js 2.106 (기존), dotenv (신규 devDep), Supabase CLI 2.102 (기존).

**Spec:** `docs/superpowers/specs/2026-06-11-server-action-tests-design.md`

**필수 사전 조건:** 모든 통합 테스트는 로컬 supabase가 켜져 있어야 함. `pnpm supabase status`가 "API URL: http://127.0.0.1:54321"을 보여야 함. 안 켜져 있으면 `pnpm supabase start`.

---

## File Structure

| 경로 | 역할 |
|------|------|
| `vitest.config.integration.ts` | (신규) node env, `tests/integration/**`, singleFork |
| `package.json` | (수정) scripts에 `test:integration` 추가 + dotenv devDep |
| `.gitignore` | (수정) `!.env.test.example` 추가 |
| `.env.test.example` | (신규) 로컬 supabase 키 템플릿 |
| `tests/integration/setup.ts` | (신규) 글로벌 mock (sentry·next-cache·supabase-server) |
| `tests/integration/helpers/admin.ts` | (신규) service_role 클라이언트 싱글톤 |
| `tests/integration/helpers/auth.ts` | (신규) `signInAs` + `currentClient` (mock 슬롯) |
| `tests/integration/helpers/seed.ts` | (신규) `resetDb`/`seedUser`/`seedClub`/`seedMember`/`seedInvite` |
| `tests/integration/_smoke.test.ts` | (임시, T8에서 삭제) 인프라 단계별 검증 |
| `tests/integration/actions/discussion-files.test.ts` | (신규) `removeDiscussionFile` 4 케이스 |
| `tests/integration/actions/club-members-approve.test.ts` | (신규) `approveMember` 4 케이스 |
| `tests/integration/actions/club-members-apply.test.ts` | (신규) `applyToClub` 4 케이스 |
| `HANDOFF.md` | (수정) 단계 3 진행 기록 |
| `README.md` | (수정) 로컬 supabase + 통합 테스트 실행법 짧은 섹션 |

---

## TDD에 대한 메모

이 PR은 **기존 production 코드의 동작을 명세하는 characterization test**가 본질. 새 기능 빌드 TDD와 다름:
- 인프라(T1~T4)는 정상 TDD — failing smoke → 구현 → pass
- 액션 테스트(T5~T7)는 작성과 동시에 PASS 되어야 정상. PASS면 spec의 예측이 옳음. FAIL이면 spec의 예측이 틀린 것이고 실제 코드 동작을 확인해 spec/테스트 둘 중 하나를 정정.
- 즉 T5~T7의 "테스트가 통과한다"는 단순 검증이 아니라 **prod 코드 동작을 우리가 이해한 대로 못박는 행위**.

---

## Task 1: 통합 테스트 config + 스크립트 + env 스캐폴딩

**Files:**
- Create: `vitest.config.integration.ts`
- Modify: `package.json` (scripts + devDependencies)
- Modify: `.gitignore`
- Create: `.env.test.example`
- Create: `tests/integration/_placeholder.test.ts` (T2에서 _smoke.test.ts로 대체)

- [ ] **Step 1: dotenv 설치**

```bash
pnpm add -D dotenv
```

- [ ] **Step 2: vitest.config.integration.ts 생성**

```ts
// vitest.config.integration.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/integration/setup.ts'],
    include: ['tests/integration/**/*.test.ts'],
    globals: true,
    testTimeout: 10_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
});
```

⚠️ 이 시점에 `tests/integration/setup.ts`는 아직 없음 — T2에서 만들 때까지 vitest가 setupFile 못 찾아 실패할 수 있음. Step 4의 placeholder 테스트로 일단 우회. T2에서 setup.ts 만들면 정상화.

- [ ] **Step 3: package.json scripts 수정**

scripts 섹션:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run --config vitest.config.integration.ts",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 4: .gitignore에 .env.test.example whitelist 추가**

기존 `!.env.example` 줄 바로 아래에:
```
!.env.test.example
```

- [ ] **Step 5: .env.test.example 생성**

```bash
# 로컬 Supabase 도커 (pnpm supabase start로 부팅)
# 키 값은 `pnpm supabase status` 출력에서 복사:
#   - API URL → SUPABASE_TEST_URL
#   - anon key → SUPABASE_TEST_ANON_KEY
#   - service_role key → SUPABASE_TEST_SERVICE_ROLE_KEY

SUPABASE_TEST_URL=http://127.0.0.1:54321
SUPABASE_TEST_ANON_KEY=
SUPABASE_TEST_SERVICE_ROLE_KEY=
```

- [ ] **Step 6: setup.ts placeholder 생성 (T2에서 채움)**

```bash
mkdir -p tests/integration
```

빈 `tests/integration/setup.ts` 생성 (T1에서 vitest config가 가리키는 파일이 존재하도록):
```ts
// Placeholder — T2에서 글로벌 mock으로 채움
```

- [ ] **Step 7: placeholder 테스트 생성 (T2에서 삭제)**

```ts
// tests/integration/_placeholder.test.ts
import { describe, it, expect } from 'vitest';

describe('integration scaffolding smoke', () => {
  it('vitest config 로드 + setup 파일 로드 OK', () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 8: 실행해서 wiring 검증**

```bash
pnpm test:integration
```

Expected: `1 passed`, exit 0. 빨개지면 vitest.config.integration.ts 경로/문법 점검.

- [ ] **Step 9: Commit**

```bash
git add vitest.config.integration.ts package.json pnpm-lock.yaml .gitignore .env.test.example tests/integration/setup.ts tests/integration/_placeholder.test.ts
git commit -m "$(cat <<'EOF'
test(integration): scaffold vitest integration config + scripts

vitest.config.integration.ts 추가, package.json에 test:integration 스크립트
추가, .env.test.example 템플릿, dotenv devDep. 빈 placeholder 테스트로 wiring
검증. T2에서 setup.ts + admin helper로 본격 인프라 작성.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 글로벌 mock setup.ts + admin helper

**Files:**
- Modify: `tests/integration/setup.ts`
- Create: `tests/integration/helpers/admin.ts`
- Delete: `tests/integration/_placeholder.test.ts`
- Create: `tests/integration/_smoke.test.ts`

**필수 사전 조건:** `pnpm supabase status`가 켜진 상태여야 함. 안 켜져 있으면 `pnpm supabase start`.

- [ ] **Step 1: 사용자에게 .env.test 채우라고 안내 (블로커)**

이 task의 일부로 사용자가 한 번만 실행해야 함:
```bash
cp .env.test.example .env.test
pnpm supabase status
# 출력에서 anon key, service_role key 복사 → .env.test에 채움
```

`.env.test`가 이미 채워져 있는지 확인:
```bash
test -s .env.test && grep -q 'eyJ' .env.test && echo "OK" || echo "BLOCKED: .env.test 채워주세요"
```

BLOCKED면 사용자에게 안내 후 중단.

- [ ] **Step 2: smoke 테스트 작성 (실패할 것)**

```ts
// tests/integration/_smoke.test.ts
import { describe, it, expect } from 'vitest';
import { admin } from './helpers/admin';

describe('integration infra smoke', () => {
  it('admin() 클라이언트로 auth.admin.listUsers 호출 성공', async () => {
    const { data, error } = await admin().auth.admin.listUsers();
    expect(error).toBeNull();
    expect(Array.isArray(data?.users)).toBe(true);
  });
});
```

- [ ] **Step 3: placeholder 삭제**

```bash
rm tests/integration/_placeholder.test.ts
```

- [ ] **Step 4: 실패 확인**

```bash
pnpm test:integration
```

Expected: FAIL — `Cannot find module './helpers/admin'` (또는 import error).

- [ ] **Step 5: setup.ts에 글로벌 mock + dotenv 작성 (T2판 — T3에서 supabase/server mock 추가됨)**

T2에서는 `auth.ts`가 아직 없어 supabase/server mock도 빠진 형태로 작성. T3에서 마지막 줄 mock 한 덩어리 추가.

```ts
// tests/integration/setup.ts
import { config } from 'dotenv';
import { vi } from 'vitest';

config({ path: '.env.test', override: true });

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
// supabase/server mock은 T3에서 auth.ts와 함께 추가
```

- [ ] **Step 6: admin.ts 작성**

```ts
// tests/integration/helpers/admin.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _admin: SupabaseClient | null = null;

export function admin(): SupabaseClient {
  if (!_admin) {
    const url = process.env.SUPABASE_TEST_URL;
    const key = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        '.env.test에 SUPABASE_TEST_URL / SUPABASE_TEST_SERVICE_ROLE_KEY가 필요합니다. ' +
        '`pnpm supabase status` 출력에서 복사하세요.'
      );
    }
    _admin = createClient(url, key, { auth: { persistSession: false } });
  }
  return _admin;
}
```

- [ ] **Step 7: 통과 확인**

```bash
pnpm test:integration
```

Expected: `1 passed`.

빨개지면:
- "fetch failed" 류 → `pnpm supabase status` 확인, 안 켜져 있으면 `pnpm supabase start`
- "Invalid API key" → `.env.test`의 service_role key 다시 복사

- [ ] **Step 8: Commit**

```bash
git add tests/integration/setup.ts tests/integration/helpers/admin.ts tests/integration/_smoke.test.ts
git rm tests/integration/_placeholder.test.ts
git commit -m "$(cat <<'EOF'
test(integration): add global mocks + admin helper

setup.ts에 @sentry/nextjs, next/cache 글로벌 mock + dotenv .env.test 로드.
admin.ts는 service_role 키로 RLS 우회 setup/teardown 전용 클라이언트.
smoke 테스트로 로컬 supabase 연결 검증.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: auth helper + getSupabaseServer mock 복원

**Files:**
- Modify: `tests/integration/setup.ts` (supabase/server mock 추가)
- Create: `tests/integration/helpers/auth.ts`
- Modify: `tests/integration/_smoke.test.ts` (signInAs 시나리오 추가)

- [ ] **Step 1: smoke 테스트 확장 (실패할 것)**

```ts
// tests/integration/_smoke.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { admin } from './helpers/admin';
import { signInAs, currentClient, signOut } from './helpers/auth';

describe('integration infra smoke', () => {
  beforeEach(() => signOut());

  it('admin() 클라이언트로 auth.admin.listUsers 호출 성공', async () => {
    const { data, error } = await admin().auth.admin.listUsers();
    expect(error).toBeNull();
    expect(Array.isArray(data?.users)).toBe(true);
  });

  it('signInAs로 user 컨텍스트 전환 → currentClient가 그 user로 인증됨', async () => {
    const email = `${randomUUID()}@test.local`;
    const password = 'test1234';
    const { data: created } = await admin().auth.admin.createUser({
      email, password, email_confirm: true,
    });
    expect(created.user).toBeTruthy();

    await signInAs(email, password);
    const { data: { user } } = await currentClient().auth.getUser();
    expect(user?.email).toBe(email);

    // 정리
    if (created.user) await admin().auth.admin.deleteUser(created.user.id);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm test:integration
```

Expected: FAIL — `Cannot find module './helpers/auth'`.

- [ ] **Step 3: auth.ts 작성**

```ts
// tests/integration/helpers/auth.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _current: SupabaseClient | null = null;

function anonClient(): SupabaseClient {
  const url = process.env.SUPABASE_TEST_URL;
  const key = process.env.SUPABASE_TEST_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      '.env.test에 SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY가 필요합니다.'
    );
  }
  return createClient(url, key);
}

export function currentClient(): SupabaseClient {
  if (!_current) _current = anonClient();
  return _current;
}

export async function signInAs(email: string, password: string): Promise<void> {
  const c = anonClient();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  _current = c;
}

export function signOut(): void {
  _current = anonClient();
}
```

- [ ] **Step 4: setup.ts에 supabase/server mock 복원**

`tests/integration/setup.ts`를 최종 모습으로:

```ts
import { config } from 'dotenv';
import { vi } from 'vitest';
import { currentClient } from './helpers/auth';

config({ path: '.env.test', override: true });

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServer: async () => currentClient(),
}));
```

- [ ] **Step 5: 통과 확인**

```bash
pnpm test:integration
```

Expected: `2 passed`.

- [ ] **Step 6: Commit**

```bash
git add tests/integration/setup.ts tests/integration/helpers/auth.ts tests/integration/_smoke.test.ts
git commit -m "$(cat <<'EOF'
test(integration): add signInAs helper + wire supabase/server mock

auth.ts는 signInAs(email, password)로 anon key signin → access_token 보유
client를 모듈 슬롯에 저장. setup.ts의 vi.mock('@/lib/supabase/server')가
currentClient()를 리턴하므로 action 본문은 그 user 컨텍스트로 실행됨.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: seed helpers (resetDb, seedUser, seedClub, seedMember, seedInvite)

**Files:**
- Create: `tests/integration/helpers/seed.ts`
- Modify: `tests/integration/_smoke.test.ts` (seed 풀체인 시나리오 추가)

- [ ] **Step 1: smoke 확장 — 풀 시드 체인 (실패할 것)**

`tests/integration/_smoke.test.ts`에 케이스 추가:

```ts
import { resetDb, seedUser, seedClub, seedMember, seedInvite } from './helpers/seed';

// ... 기존 describe 내부에 추가:

  it('resetDb + seedUser + seedClub + seedMember + seedInvite 풀 체인', async () => {
    await resetDb();

    const adminUser = await seedUser();
    const member = await seedUser();
    const pending = await seedUser();
    expect(adminUser.id).toBeTruthy();
    expect(adminUser.email).toMatch(/@test\.local$/);

    const club = await seedClub('스모크 모임', adminUser.id);
    expect(club.id).toBeTruthy();
    expect(club.name).toBe('스모크 모임');

    await seedMember(club.id, member.id, 'member');
    await seedMember(club.id, pending.id, 'pending');

    const { data: rows } = await admin()
      .from('club_members')
      .select('user_id, role')
      .eq('club_id', club.id);
    expect(rows).toHaveLength(3);

    const token = await seedInvite(club.id);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(10);

    await resetDb();
    const { data: after } = await admin().from('clubs').select('id').eq('id', club.id);
    expect(after).toHaveLength(0);
  });
```

`admin` import도 필요하면 추가 (이미 위에 있음).

- [ ] **Step 2: 실패 확인**

```bash
pnpm test:integration
```

Expected: FAIL — `Cannot find module './helpers/seed'`.

- [ ] **Step 3: seed.ts 작성**

```ts
// tests/integration/helpers/seed.ts
import { randomUUID } from 'crypto';
import { admin } from './admin';

const NEVER_UUID = '00000000-0000-0000-0000-000000000000';

export async function resetDb(): Promise<void> {
  const a = admin();
  // 외래키 역순 (CASCADE 의존하지 않고 명시적으로)
  await a.from('attendances').delete().neq('meeting_id', NEVER_UUID);
  await a.from('meeting_questions').delete().neq('id', NEVER_UUID);
  await a.from('meetings').delete().neq('id', NEVER_UUID);
  await a.from('club_invites').delete().neq('club_id', NEVER_UUID);
  await a.from('club_members').delete().neq('club_id', NEVER_UUID);
  await a.from('clubs').delete().neq('id', NEVER_UUID);

  const { data } = await a.auth.admin.listUsers();
  await Promise.all(
    (data?.users ?? []).map((u) => a.auth.admin.deleteUser(u.id))
  );
}

export type SeededUser = { id: string; email: string; password: string };

export async function seedUser(): Promise<SeededUser> {
  const email = `${randomUUID()}@test.local`;
  const password = 'test1234';
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw error ?? new Error('seedUser: createUser 실패 (data.user 없음)');
  }
  return { id: data.user.id, email, password };
}

export type SeededClub = { id: string; name: string };

export async function seedClub(name: string, adminUserId: string): Promise<SeededClub> {
  const a = admin();
  const { data: club, error: clubErr } = await a
    .from('clubs')
    .insert({ name, created_by: adminUserId })
    .select()
    .single();
  if (clubErr || !club) throw clubErr ?? new Error('seedClub: clubs insert 실패');

  const { error: memberErr } = await a.from('club_members').insert({
    club_id: club.id,
    user_id: adminUserId,
    role: 'admin',
  });
  if (memberErr) throw memberErr;

  return { id: club.id, name: club.name };
}

export async function seedMember(
  clubId: string,
  userId: string,
  role: 'admin' | 'member' | 'pending'
): Promise<void> {
  const { error } = await admin().from('club_members').insert({
    club_id: clubId,
    user_id: userId,
    role,
  });
  if (error) throw error;
}

/**
 * rotate_invite SQL 함수는 SECURITY DEFINER + 호출자 admin 체크가 있음.
 * service_role 호출 시 auth.uid()가 null이라 'Not admin'으로 실패함.
 * → admin user로 signin한 상태에서 호출해야 함.
 * 헬퍼는 그래서 (clubId, adminEmail, adminPassword)를 받음.
 */
export async function seedInvite(
  clubId: string,
  adminEmail: string,
  adminPassword: string
): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js');
  const c = createClient(
    process.env.SUPABASE_TEST_URL!,
    process.env.SUPABASE_TEST_ANON_KEY!
  );
  const { error: authErr } = await c.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  if (authErr) throw authErr;

  const { data, error } = await c.rpc('rotate_invite', { target_club_id: clubId });
  if (error) throw error;
  if (!data) throw new Error('seedInvite: rotate_invite returned null');
  return data as string;
}
```

⚠️ `rotate_invite` RPC 호출 시 인자명을 `target_club_id`로 통일했음 (migration `20260611000001_invite_apply_functions.sql`에서 정의된 시그니처와 일치 — 작업 전 grep으로 확인 권장).

- [ ] **Step 4: smoke 케이스의 seedInvite 호출에 admin 자격증명 전달**

위 Step 1의 smoke에서 `const token = await seedInvite(club.id);` 줄을:
```ts
const token = await seedInvite(club.id, adminUser.email, adminUser.password);
```
로 변경.

- [ ] **Step 5: 통과 확인**

```bash
pnpm test:integration
```

Expected: `3 passed`.

빨개지면:
- `rotate_invite` 인자명 mismatch → migration 파일 grep으로 확인
- "Not admin" → seedInvite 자격증명 잘못 전달됨
- clubs insert 실패 → schema의 `created_by NOT NULL` 확인 (seedClub에서 채움)

- [ ] **Step 6: Commit**

```bash
git add tests/integration/helpers/seed.ts tests/integration/_smoke.test.ts
git commit -m "$(cat <<'EOF'
test(integration): add seed helpers (resetDb / seedUser / seedClub / seedMember / seedInvite)

resetDb는 가변 테이블 6개 + 테스트 사용자 전원 삭제로 격리. seedInvite는
rotate_invite RPC가 호출자 admin 체크를 요구하므로 (clubId, email, password)
시그니처로 admin signin 거쳐 호출.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Test file 1 — `discussion-files` host 가드 (4 케이스)

**Files:**
- Create: `tests/integration/actions/discussion-files.test.ts`

작업 전 grep으로 `removeDiscussionFile`의 정확한 export 이름과 시그니처를 확인:
```bash
grep -n "export async function" lib/actions/discussion-files.ts
```

- [ ] **Step 1: 테스트 파일 작성 (PASS 되어야 정상 — characterization test)**

```ts
// tests/integration/actions/discussion-files.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { removeDiscussionFile } from '@/lib/actions/discussion-files';
import { admin } from '../helpers/admin';
import { signInAs, signOut } from '../helpers/auth';
import { resetDb, seedUser, seedClub, seedMember } from '../helpers/seed';

async function seedMeeting(opts: {
  clubId: string;
  hostId: string;
  discussionFileUrl?: string | null;
}): Promise<{ id: string }> {
  const { data, error } = await admin()
    .from('meetings')
    .insert({
      club_id: opts.clubId,
      host_id: opts.hostId,
      book_title: '테스트 책',
      book_author: '저자',
      scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
      location_name: '강남역',
      discussion_file_url: opts.discussionFileUrl ?? null,
    })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('seedMeeting 실패');
  return { id: data.id };
}

describe('discussion-files: assertHost guard (removeDiscussionFile 경유)', () => {
  beforeEach(async () => {
    await resetDb();
    signOut();
  });

  it('A. 로그인 X → 로그인 필요 에러', async () => {
    const host = await seedUser();
    const club = await seedClub('A', host.id);
    const meeting = await seedMeeting({ clubId: club.id, hostId: host.id });

    // signOut 상태 그대로 (beforeEach)
    const result = await removeDiscussionFile(meeting.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('로그인이 필요합니다.');
  });

  it('B. 같은 클럽 멤버지만 host 아님 → 발제자 전용 에러', async () => {
    const host = await seedUser();
    const otherMember = await seedUser();
    const club = await seedClub('A', host.id);
    await seedMember(club.id, otherMember.id, 'member');
    const meeting = await seedMeeting({ clubId: club.id, hostId: host.id });

    await signInAs(otherMember.email, otherMember.password);
    const result = await removeDiscussionFile(meeting.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('발제자만 사용할 수 있습니다.');
  });

  it('C. host 본인 → ok=true + DB의 discussion_file_url이 null로', async () => {
    const host = await seedUser();
    const club = await seedClub('A', host.id);
    const meeting = await seedMeeting({
      clubId: club.id,
      hostId: host.id,
      discussionFileUrl: 'https://example.com/dummy.pdf',
    });

    await signInAs(host.email, host.password);
    const result = await removeDiscussionFile(meeting.id);

    expect(result.ok).toBe(true);

    const { data } = await admin()
      .from('meetings')
      .select('discussion_file_url')
      .eq('id', meeting.id)
      .single();
    expect(data?.discussion_file_url).toBeNull();
  });

  it('D. 존재하지 않는 meetingId → 모임 없음 에러', async () => {
    const host = await seedUser();
    await signInAs(host.email, host.password);

    const result = await removeDiscussionFile(randomUUID());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('모임을 찾을 수 없습니다.');
  });
});
```

⚠️ `removeDiscussionFile`의 실제 export 이름이 다르면 (e.g. `deleteDiscussionFile`), Step 1 작업 전 grep 결과로 import 라인 수정. 케이스 C에서 `storage.remove` 호출이 실패하더라도 가드 통과 후 DB update가 일어나는 흐름이 핵심 — Storage 실패는 무시될 수도 있고 에러를 던질 수도 있어 prod 코드 확인 필요. 만약 C가 실패하면 prod 코드 동작을 확인해 케이스 기대값을 조정 (예: storage 실패 시 ok=false 리턴이면 그에 맞춰).

- [ ] **Step 2: 실행해서 4/4 통과 확인**

```bash
pnpm test:integration tests/integration/actions/discussion-files.test.ts
```

Expected: `4 passed`. 빨개지면 spec의 예측이 prod 코드와 어긋난 것 — `lib/actions/discussion-files.ts`를 다시 읽어 케이스 기대값 정정 (테스트가 진실, spec은 reference).

- [ ] **Step 3: 전체 통합 스위트 회귀 확인**

```bash
pnpm test:integration
```

Expected: 모두 통과 (smoke 3 + discussion-files 4 = 7).

- [ ] **Step 4: Commit**

```bash
git add tests/integration/actions/discussion-files.test.ts
git commit -m "$(cat <<'EOF'
test(integration): cover assertHost guard via removeDiscussionFile (4 cases)

discussion-files action 4종이 공유하는 host 가드를 가장 단순한 엔트리포인트인
removeDiscussionFile로 검증. 비로그인/비-host/host/없는-meeting 케이스.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Test file 2 — `approveMember` RLS-enforced admin-only (4 케이스)

**Files:**
- Create: `tests/integration/actions/club-members-approve.test.ts`

기대 동작은 spec의 Test 2 표 참조: B/C/D는 ok=true지만 DB role 불변 (UX 버그 신호).

- [ ] **Step 1: 테스트 파일 작성**

```ts
// tests/integration/actions/club-members-approve.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { approveMember } from '@/lib/actions/club-members';
import { admin } from '../helpers/admin';
import { signInAs, signOut } from '../helpers/auth';
import { resetDb, seedUser, seedClub, seedMember } from '../helpers/seed';

async function fetchRole(clubId: string, userId: string): Promise<string | null> {
  const { data } = await admin()
    .from('club_members')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .single();
  return data?.role ?? null;
}

describe('approveMember (RLS-enforced)', () => {
  beforeEach(async () => {
    await resetDb();
    signOut();
  });

  it('A. admin이 pending을 승인하면 role=member', async () => {
    const adminUser = await seedUser();
    const pending = await seedUser();
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, pending.id, 'pending');

    await signInAs(adminUser.email, adminUser.password);
    const result = await approveMember(club.id, pending.id);

    expect(result.ok).toBe(true);
    expect(await fetchRole(club.id, pending.id)).toBe('member');
  });

  it('B. 일반 member 호출 시 ok=true지만 DB role 불변 (RLS가 조용히 차단)', async () => {
    const adminUser = await seedUser();
    const member = await seedUser();
    const pending = await seedUser();
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, member.id, 'member');
    await seedMember(club.id, pending.id, 'pending');

    await signInAs(member.email, member.password);
    const result = await approveMember(club.id, pending.id);

    expect(result.ok).toBe(true);
    expect(await fetchRole(club.id, pending.id)).toBe('pending');
  });

  it('C. 비-멤버 호출 시 ok=true지만 DB role 불변', async () => {
    const adminUser = await seedUser();
    const pending = await seedUser();
    const outsider = await seedUser();
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, pending.id, 'pending');

    await signInAs(outsider.email, outsider.password);
    const result = await approveMember(club.id, pending.id);

    expect(result.ok).toBe(true);
    expect(await fetchRole(club.id, pending.id)).toBe('pending');
  });

  it('D. 다른 클럽 admin 호출 시 ok=true지만 DB role 불변 (cross-club 격리)', async () => {
    const admin1 = await seedUser();
    const pending = await seedUser();
    const admin2 = await seedUser();
    const clubA = await seedClub('A', admin1.id);
    const clubB = await seedClub('B', admin2.id);
    await seedMember(clubA.id, pending.id, 'pending');

    await signInAs(admin2.email, admin2.password);
    const result = await approveMember(clubA.id, pending.id);

    expect(result.ok).toBe(true);
    expect(await fetchRole(clubA.id, pending.id)).toBe('pending');
    // (clubB는 사용 안 했지만 다른 클럽 admin이라는 컨텍스트 셋업용)
  });
});
```

- [ ] **Step 2: 4/4 통과 확인**

```bash
pnpm test:integration tests/integration/actions/club-members-approve.test.ts
```

Expected: `4 passed`. 만약 B/C/D에서 ok=false가 나오면 prod 코드가 RLS와 별개로 명시적 admin 체크를 추가한 것 — `lib/actions/club-members.ts`의 approveMember 다시 읽고 spec/테스트 정정.

- [ ] **Step 3: 전체 통합 스위트 회귀 확인**

```bash
pnpm test:integration
```

Expected: smoke 3 + discussion-files 4 + approveMember 4 = 11 passed.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/actions/club-members-approve.test.ts
git commit -m "$(cat <<'EOF'
test(integration): cover approveMember RLS enforcement (4 cases)

A: admin 정상 승인. B/C/D: 비-admin은 ok=true 리턴 받지만 RLS가 UPDATE를
0 rows로 차단해 DB role 불변. cross-club admin 격리 회귀 안전망 포함.

부수 발견: B/C/D의 ok=true는 UX 신호 (사용자에겐 "승인 완료"처럼 보일
가능성). 다음 PR 후보 — action에서 .select() 후 row count 검증해 ok=false
리턴.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Test file 3 — `applyToClub` invite token (4 케이스)

**Files:**
- Create: `tests/integration/actions/club-members-apply.test.ts`

기대 동작은 spec의 Test 3 표 참조. D는 ok=true (현재 동작) + DB 멤버 1 row 보존.

- [ ] **Step 1: 테스트 파일 작성**

```ts
// tests/integration/actions/club-members-apply.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { applyToClub } from '@/lib/actions/club-members';
import { admin } from '../helpers/admin';
import { signInAs, signOut } from '../helpers/auth';
import { resetDb, seedUser, seedClub, seedMember, seedInvite } from '../helpers/seed';

async function fetchMemberRows(clubId: string, userId: string) {
  const { data } = await admin()
    .from('club_members')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', userId);
  return data ?? [];
}

describe('applyToClub', () => {
  beforeEach(async () => {
    await resetDb();
    signOut();
  });

  it('A. 유효 token + 비-멤버 → ok=true + pending row 생성', async () => {
    const adminUser = await seedUser();
    const applicant = await seedUser();
    const club = await seedClub('A', adminUser.id);
    const token = await seedInvite(club.id, adminUser.email, adminUser.password);

    await signInAs(applicant.email, applicant.password);
    const result = await applyToClub(token);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.clubId).toBe(club.id);
      expect(result.clubName).toBe('A');
    }
    const rows = await fetchMemberRows(club.id, applicant.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('pending');
  });

  it('B. 위조 token (랜덤 uuid) → ok=false 유효하지 않은 초대코드', async () => {
    const adminUser = await seedUser();
    const applicant = await seedUser();
    const club = await seedClub('A', adminUser.id);

    await signInAs(applicant.email, applicant.password);
    const result = await applyToClub(randomUUID());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('유효하지 않은 초대코드입니다.');
    const rows = await fetchMemberRows(club.id, applicant.id);
    expect(rows).toHaveLength(0);
  });

  it('C. rotate되어 revoke된 token → ok=false 취소된 초대링크', async () => {
    const adminUser = await seedUser();
    const applicant = await seedUser();
    const club = await seedClub('A', adminUser.id);
    const oldToken = await seedInvite(club.id, adminUser.email, adminUser.password);
    // 한 번 더 rotate → oldToken은 revoked_at 채워짐
    await seedInvite(club.id, adminUser.email, adminUser.password);

    await signInAs(applicant.email, applicant.password);
    const result = await applyToClub(oldToken);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(
        '취소된 초대링크입니다. admin에게 새 링크를 요청해주세요.'
      );
    }
    const rows = await fetchMemberRows(club.id, applicant.id);
    expect(rows).toHaveLength(0);
  });

  it('D. 이미 member인 사용자 신청 → ok=true (현재 동작) + DB 중복 row 없음', async () => {
    const adminUser = await seedUser();
    const alreadyMember = await seedUser();
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, alreadyMember.id, 'member');
    const token = await seedInvite(club.id, adminUser.email, adminUser.password);

    await signInAs(alreadyMember.email, alreadyMember.password);
    const result = await applyToClub(token);

    // action이 SQL 함수의 status 필드를 무시하고 club_id, club_name만 읽음
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.clubId).toBe(club.id);

    const rows = await fetchMemberRows(club.id, alreadyMember.id);
    expect(rows).toHaveLength(1);              // 중복 row 없음
    expect(rows[0].role).toBe('member');        // 기존 role 보존
  });
});
```

- [ ] **Step 2: 4/4 통과 확인**

```bash
pnpm test:integration tests/integration/actions/club-members-apply.test.ts
```

Expected: `4 passed`. 케이스 D가 ok=false로 나오면 SQL 함수가 status 필드 외에 예외를 던지는 경로가 있는 것 — `supabase/migrations/20260611000001_invite_apply_functions.sql`의 `apply_to_club` 함수 다시 읽고 정정.

- [ ] **Step 3: 전체 통합 스위트 회귀 확인**

```bash
pnpm test:integration
```

Expected: smoke 3 + discussion-files 4 + approveMember 4 + applyToClub 4 = 15 passed.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/actions/club-members-apply.test.ts
git commit -m "$(cat <<'EOF'
test(integration): cover applyToClub invite token flow (4 cases)

A: 정상 가입 신청. B: 위조 token 거절. C: rotate된 old token 거절.
D: 이미 member인 사용자 신청 시 현재 ok=true + DB 중복 row 없음 (composite
PK + ON CONFLICT DO NOTHING).

부수 발견: D의 ok=true는 SQL 함수의 status='already_member'를 action이
무시하기 때문. 사용자에게 잘못된 "신청됨" 메시지 노출 가능. 다음 PR 후보.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 정리 (smoke 삭제 + 문서 업데이트 + 최종 회귀 확인)

**Files:**
- Delete: `tests/integration/_smoke.test.ts`
- Modify: `README.md` (통합 테스트 섹션 추가)
- Modify: `HANDOFF.md` (단계 3 진행 기록)

- [ ] **Step 1: smoke 삭제**

```bash
rm tests/integration/_smoke.test.ts
```

- [ ] **Step 2: 통합 스위트 12 케이스만 남았는지 확인**

```bash
pnpm test:integration
```

Expected: `Test Files  3 passed (3)`, `Tests  12 passed (12)`.

- [ ] **Step 3: 단위 스위트 회귀 확인 (CI가 도는 그것)**

```bash
pnpm test
```

Expected: validation 12개 그대로 통과.

- [ ] **Step 4: README.md에 통합 테스트 섹션 추가**

`README.md`의 적당한 위치 (Setup 섹션 끝 또는 Testing 섹션)에 추가. 기존 testing 섹션 있으면 거기에, 없으면 새 섹션:

```markdown
## 통합 테스트 (Server Action)

로컬 Supabase 도커에 진짜로 쿼리하는 통합 테스트. RLS·SECURITY DEFINER 함수까지 검증.

```bash
# 한 번만 셋업
cp .env.test.example .env.test
pnpm supabase status   # 출력의 anon key / service_role key를 .env.test에 채움
pnpm supabase start    # 도커 부팅

# 실행
pnpm test:integration
```

CI는 통합 테스트를 실행하지 않음 (도커 부팅 비용 회피). PR 직전 로컬에서 1회 실행이 표준 절차.
```

작업 전 README 현재 내용 확인:
```bash
grep -n "test\|Testing\|Setup" README.md | head -20
```

적절한 삽입 지점 선택.

- [ ] **Step 5: HANDOFF.md 단계 3 진행 기록**

`HANDOFF.md`에서 "단계 3" 마커 찾기:
```bash
grep -n "단계 3\|Server Action 단위" HANDOFF.md
```

다음 위치들 업데이트:
- 로드맵 줄: `3. **Server Action 단위 테스트** ...` → `3. ✅ **Server Action 단위 테스트** (인프라 + 보안 핵심 3개 / 12 케이스 완료, 단계 진행 중) ← 다음 PR에서 확장`
- "Current Progress" 섹션에 짧은 박스 추가 (이번 PR 요약 + 부수 발견 2건 명시: approveMember/applyToClub UX 버그 후보)

작성 예시 (정확한 위치는 파일 보고 결정):

```markdown
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
```

- [ ] **Step 6: 최종 회귀 — 두 스위트 다 통과**

```bash
pnpm test && pnpm test:integration
```

Expected: 둘 다 exit 0.

- [ ] **Step 7: Commit**

```bash
git add README.md HANDOFF.md
git rm tests/integration/_smoke.test.ts
git commit -m "$(cat <<'EOF'
docs+test: finalize server action integration test phase 1

smoke 테스트 제거 (T2~T4의 인프라 검증 역할 종료). README에 통합 테스트
실행법 섹션 추가. HANDOFF에 단계 3 진행 + 부수 발견 2건 기록.

최종 상태: 통합 12 케이스 + 단위 12 케이스. CI는 단위만, 통합은 PR 직전
`pnpm test:integration` 1회 (build와 같은 자리).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## 작업 순서 요약

| Task | 산출물 | 통합 테스트 수 |
|------|--------|------------------|
| T1 | vitest config + scripts + env scaffolding | 1 (placeholder) |
| T2 | setup mocks + admin helper | 1 (smoke admin) |
| T3 | auth helper + supabase/server mock 복원 | 2 (smoke admin + signInAs) |
| T4 | seed helpers 전체 | 3 (smoke 전체) |
| T5 | discussion-files 4 케이스 | 7 |
| T6 | approveMember 4 케이스 | 11 |
| T7 | applyToClub 4 케이스 | 15 |
| T8 | smoke 삭제 + docs | 12 (최종) |

각 task는 독립적으로 커밋. T2부터는 로컬 supabase 켜져 있어야 함.

---

## 외부 의존 (사용자 1회 수동 작업)

- `pnpm supabase start` — 도커 부팅 (T2 전)
- `cp .env.test.example .env.test` + supabase status 출력으로 키 채우기 (T2 전)

위 둘은 subagent가 못 함 — controller가 사용자에게 안내하고 확인 후 T2 진행.

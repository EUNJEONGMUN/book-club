# Server Action 통합 테스트 인프라 — 디자인

**작성일**: 2026-06-11
**학습 로드맵 단계**: 3 (Server Action 단위 테스트)
**범위**: 단일 PR (인프라 + 보안 핵심 3개 action)

---

## Goal

운영 시나리오를 손으로 클릭하던 보안·권한 흐름을 `pnpm test:integration` 한 줄로 검증할 수 있게 만든다. 이 PR의 본질은 **3개 테스트가 아니라 그 위에 12+개 action을 같은 패턴으로 얹을 수 있는 인프라**.

### 동기

- Phase A (multi-tenant) 완료 후 RLS·SECURITY DEFINER 함수·`assertHost` 가드가 늘었지만 회귀 안전망이 없음. RLS 정책 한 줄 잘못 건드리면 cross-club 접근이 열릴 수 있고, 현재 감지 수단이 운영 사용자뿐.
- 사용자(EUNJEONGMUN)는 Spring `@SpringBootTest` 통합 테스트에 익숙한 백엔드 출신. mock으로 도배하는 단위 테스트보다 진짜 DB·진짜 RLS를 친 통합 테스트가 학습 곡선·신뢰도 둘 다 우월.

---

## 결정 (브레인스토밍 합의)

| 항목 | 결정 | 이유 |
|------|------|------|
| **전략** | 통합 — 로컬 Supabase 도커 | RLS·SECURITY DEFINER 함수까지 검증. 백엔드 친숙 패턴. mock 함정 회피. |
| **첫 PR 범위** | MVP — 인프라 + 보안 핵심 3개 (12 케이스) | 인프라 한 번 깔리면 나머지 9+개 action은 같은 패턴 복붙. |
| **CI 정책** | 로컬만 — CI는 기존 단위만 유지 | postgres container 셋업 비용 회피. `pnpm build` 1회와 같은 자리로 PR 직전 1회 수동. |
| **접근** | A — Wrap-and-mock | `next/cache`·`@sentry/nextjs`·`@/lib/supabase/server` 3개 모듈만 mock. action 본문은 그대로 실행됨. production 코드 변경 0. |

### 거절된 대안

- **B (Pure-function 추출)**: action 12개 전부 리팩터 필요. wrapper 검증 못 함. YAGNI 위반.
- **C (E2E through HTTP)**: 단계 5의 자리. 단위 테스트 트랙이 아님.
- **CI 통합**: postgres service container + supabase-cli 부트가 CI를 30초→3-5분으로. 첫 PR엔 무거움. 단계 5/6에서 재검토.

---

## Architecture

### Approach A — Wrap-and-mock

```
┌─────────────────────────────────────────────────────────────┐
│ Test file (예: club-members-approve.test.ts)               │
│  beforeEach(resetDb)                                        │
│  seedUser / seedClub / seedMember (service_role로 setup)    │
│  signInAs(email, password) ← anon key signin               │
│  approveMember(clubId, userId) ← action 본문 그대로 실행    │
│  expect(...) + DB 직접 SELECT로 결과 검증                   │
└──────┬──────────────────────────────────────────────────────┘
       │ import
       ▼
┌─────────────────────────────────────────────────────────────┐
│ lib/actions/club-members.ts (production 코드, 변경 없음)    │
│  getSupabaseServer() ← vi.mock으로 갈음                     │
│  revalidatePath() ← vi.mock no-op                           │
│  Sentry.captureException() ← vi.mock no-op                  │
└──────┬──────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ 로컬 Supabase (docker, http://127.0.0.1:54321)              │
│  진짜 postgres + 진짜 RLS + 진짜 auth                       │
└─────────────────────────────────────────────────────────────┘
```

**핵심**: `@/lib/supabase/server` 모듈 자체를 mock. `next/headers` cookie 내부를 mock하지 않음 — supabase-ssr 버전 fragile이라 경계에서 갈음하는 게 견고. action이 실제로 호출하는 supabase 메서드(`.from()`, `.auth.getUser()`, `.storage.from()` 등)는 모두 진짜.

### "자동"의 의미

- **수동→자동 (테스트 실행)**: 12 케이스를 손으로 클릭 → `pnpm test:integration` 한 줄. ✅
- **로컬→CI (사람 개입 0)**: 이번 PR엔 X. 매 PR 직전 사용자가 직접 1회 실행 (= `pnpm build` 1회와 같은 자리).

---

## Infrastructure (8개 조각)

### 1. vitest config 둘

- `vitest.config.ts` (기존, 그대로) — jsdom, `tests/lib/validation/*`, CI에서 돌아감
- `vitest.config.integration.ts` (신규) — node env, `tests/integration/**`, timeout 10s, `pool: 'forks' + singleFork: true` (DB 충돌 방지)

### 2. package.json 스크립트

- `test` (기존, 그대로) — unit
- `test:integration` (신규) — `vitest run --config vitest.config.integration.ts`
- `test:all` (선택) — 둘 다 순차

### 3. `tests/integration/setup.ts` (글로벌 mock + env)

- `dotenv`로 `.env.test` 로드
- `vi.mock('@sentry/nextjs')` — `captureException` / `captureMessage` no-op
- `vi.mock('next/cache')` — `revalidatePath` / `revalidateTag` no-op
- `vi.mock('@/lib/supabase/server')` — auth helper의 `currentClient()` 리턴

### 4. `tests/integration/helpers/admin.ts`

`service_role` 클라이언트 생성. setup·teardown 전용. RLS 우회.

### 5. `tests/integration/helpers/auth.ts`

- `signInAs(email, password)` — anon key로 signin → access_token 보유 client를 모듈 슬롯에 저장
- `signOut()` — 슬롯을 fresh anon client로 교체 (비로그인 상태)
- `currentClient()` — setup.ts의 mock이 호출

### 6. `tests/integration/helpers/seed.ts`

- `resetDb()` — 가변 테이블 6개를 service_role `.delete()`로 비움 (`attendances`, `meeting_questions`, `meetings`, `club_invites`, `club_members`, `clubs`) + `auth.admin.listUsers` 돌려 테스트 사용자 삭제
- `seedUser()` — `auth.admin.createUser({ email_confirm: true })` → `{ id, email, password }` 리턴 (이메일은 `${randomUUID()}@test.local`)
- `seedClub(name, adminUserId)` — clubs row + admin role의 club_members row
- `seedMember(clubId, userId, role)` — pending/member/admin 시드
- `seedInvite(clubId)` — `rotate_invite` SQL 호출해 active token 발급

### 7. Env 파일 둘

- `.env.test.example` (commit) — 로컬 supabase 기본값 채워서 git clone 직후 `cp`만 하면 됨
  ```
  SUPABASE_TEST_URL=http://127.0.0.1:54321
  SUPABASE_TEST_ANON_KEY=<pnpm supabase status로 확인>
  SUPABASE_TEST_SERVICE_ROLE_KEY=<pnpm supabase status로 확인>
  ```
- `.env.test` (`.gitignore` 추가) — 실제 키 채운 로컬 파일

### 8. Reset 전략 (MVP: 단순)

- `beforeEach`에서 `resetDb()`. 테스트당 ~100-200ms 추가. 첫 PR엔 OK.
- truncate SQL function은 **만들지 않음** (운영 push 위험). service_role client의 `.delete()`로 처리.
- 나중에 느려지면 트랜잭션 롤백 패턴으로 최적화. (이 PR 범위 외)

---

## Test 케이스 (3 파일 / 12 케이스)

### Test 1 — `discussion-files` host 가드

**파일**: `tests/integration/actions/discussion-files.test.ts`

`removeDiscussionFile(meetingId)`로 `assertHost` 가드 검증 (FormData 없이 호출 가능한 가장 단순한 엔트리포인트).

| # | 상황 | 시드 | 기대 |
|---|------|------|------|
| A | 로그인 X | meeting 1개 | `{ ok: false, error: '로그인이 필요합니다.' }` |
| B | 같은 클럽 멤버지만 host 아님 | host + 일반 member 둘 다 멤버, meeting의 host_id=host | `{ ok: false, error: '발제자만 사용할 수 있습니다.' }` |
| C | host 본인 | meeting의 `discussion_file_url='https://example.com/dummy.pdf'` | `{ ok: true }` + DB 직접 SELECT로 `discussion_file_url IS NULL` 확인 |
| D | 존재하지 않는 meetingId | (없음) | `{ ok: false, error: '모임을 찾을 수 없습니다.' }` |

### Test 2 — `club-members.approveMember` admin-only (RLS-enforced)

**파일**: `tests/integration/actions/club-members-approve.test.ts`

⚠️ **현재 구현의 미묘함**: action 본문에는 admin 체크가 없음. 권한 강제는 **순수 RLS** (`club_members_update_admin` 정책: `USING is_club_admin(club_id)`). 비-admin이 호출하면 UPDATE가 0 rows affected로 조용히 끝남 → action은 `{ ok: true }` 리턴하지만 DB는 변경 0. 따라서 테스트는 **두 차원**으로 검증:
- `result.ok` 값 (action의 명목 동작)
- DB role 값 직접 SELECT (실제 권한 적용 여부)

| # | 상황 | 시드 | 기대 (`result.ok`) | 기대 (DB role) |
|---|------|------|---------------------|------------------|
| A | admin이 pending 승인 | club A: admin1 + pending1 | `true` | `'member'` (변경됨) |
| B | 일반 member가 시도 | club A: admin1 + member1 + pending1 | `true` (조용히 no-op) | `'pending'` (불변) |
| C | 비-멤버가 시도 | club A: admin1 + pending1, 그리고 outsider1 (멤버 아님) | `true` (조용히 no-op) | `'pending'` (불변) |
| D | 다른 클럽 admin이 시도 (cross-club 격리) | club A: admin1 + pending1. club B: admin2 | `true` (조용히 no-op) | `'pending'` (불변) |

📝 **부수 발견**: B/C/D의 `ok=true`는 사실 UX 버그 신호 (사용자 화면엔 "승인 완료"로 보일 수 있음). 이 PR 범위 밖이지만 다음 PR 후보로 기록. action에 `.select()` 추가해 0 rows면 ok=false 리턴하는 식.

### Test 3 — `club-members.applyToClub` invite token

**파일**: `tests/integration/actions/club-members-apply.test.ts`

⚠️ **현재 구현의 미묘함**: action은 `apply_to_club` SQL 함수의 JSON 응답에서 `club_id, club_name`만 읽고 `status` 필드(`valid`/`already_member`/`already_pending`)는 무시. 즉 이미 멤버여도 `{ ok: true, ... }` 리턴 (이 PR 범위 밖 UX 버그). 테스트는 **현재 동작을 명세**하고, DB로 실제 부수효과를 검증:

| # | 상황 | 시드 | 기대 (action) | 기대 (DB) |
|---|------|------|----------------|-------------|
| A | 유효 token + 비-멤버 | club + admin (invite rotate). non-member-user. | `{ ok: true, clubId, clubName }` | 새 `club_members(role='pending')` row 생성 |
| B | 위조 token (uuid 형식) | club + admin + non-member. 임의 uuid 전달. | `{ ok: false, error: '유효하지 않은 초대코드입니다.' }` | row 없음 |
| C | rotate되어 revoke된 token | active invite 발급 후 한 번 더 rotate해서 old token 무효화 | `{ ok: false, error: '취소된 초대링크입니다. admin에게 새 링크를 요청해주세요.' }` | row 없음 |
| D | 이미 member인 사용자가 신청 | club + admin + member1 (이미 member) | `{ ok: true, clubId, clubName }` (현재 동작) | 기존 row의 role은 `'member'` 그대로, 새 row X (composite PK + `ON CONFLICT DO NOTHING`) |

📝 **부수 발견**: D는 사용자 입장에서 "신청됨" 메시지가 뜨는데 실제로는 이미 멤버 상태. 다음 PR 후보 — action에서 `status` 필드 분기.

---

## 디렉터리 구조 (최종)

```
tests/
├── lib/validation/                       # 기존 — 그대로 (CI에서 돌아감)
│   ├── meeting.test.ts
│   ├── profile.test.ts
│   └── question.test.ts
└── integration/                          # 신규
    ├── setup.ts
    ├── helpers/
    │   ├── admin.ts
    │   ├── auth.ts
    │   └── seed.ts
    └── actions/
        ├── discussion-files.test.ts
        ├── club-members-approve.test.ts
        └── club-members-apply.test.ts

vitest.config.ts                          # 기존 — 그대로
vitest.config.integration.ts              # 신규
.env.test.example                         # 신규 (commit)
.env.test                                 # 신규 (.gitignore 추가)
```

---

## 핵심 스켈레톤

### `vitest.config.integration.ts`

```ts
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

### `tests/integration/setup.ts`

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

### `tests/integration/helpers/admin.ts`

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _admin: SupabaseClient | null = null;
export function admin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      process.env.SUPABASE_TEST_URL!,
      process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
  }
  return _admin;
}
```

### `tests/integration/helpers/auth.ts`

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _current: SupabaseClient | null = null;

function anonClient() {
  return createClient(
    process.env.SUPABASE_TEST_URL!,
    process.env.SUPABASE_TEST_ANON_KEY!
  );
}

export function currentClient(): SupabaseClient {
  if (!_current) _current = anonClient();
  return _current;
}

export async function signInAs(email: string, password: string) {
  const c = anonClient();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  _current = c;
}

export function signOut() {
  _current = anonClient();
}
```

### `tests/integration/helpers/seed.ts`

```ts
import { randomUUID } from 'crypto';
import { admin } from './admin';

const NEVER_UUID = '00000000-0000-0000-0000-000000000000';

export async function resetDb() {
  const a = admin();
  // 외래키 역순 삭제
  await a.from('attendances').delete().neq('meeting_id', NEVER_UUID);
  await a.from('meeting_questions').delete().neq('id', NEVER_UUID);
  await a.from('meetings').delete().neq('id', NEVER_UUID);
  await a.from('club_invites').delete().neq('club_id', NEVER_UUID);
  await a.from('club_members').delete().neq('club_id', NEVER_UUID);
  await a.from('clubs').delete().neq('id', NEVER_UUID);
  // 테스트 사용자 삭제
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
  if (error || !data.user) throw error ?? new Error('seedUser failed');
  return { id: data.user.id, email, password };
}

export async function seedClub(name: string, adminUserId: string) {
  const { data: club, error } = await admin()
    .from('clubs').insert({ name }).select().single();
  if (error || !club) throw error ?? new Error('seedClub failed');
  await admin().from('club_members').insert({
    club_id: club.id, user_id: adminUserId, role: 'admin',
  });
  return club;
}

export async function seedMember(
  clubId: string,
  userId: string,
  role: 'admin' | 'member' | 'pending'
) {
  await admin().from('club_members').insert({
    club_id: clubId, user_id: userId, role,
  });
}

export async function seedInvite(clubId: string): Promise<string> {
  const { data, error } = await admin().rpc('rotate_invite', { p_club_id: clubId });
  if (error || !data) throw error ?? new Error('seedInvite failed');
  return data as string;
}
```

### 케이스 한 개 풀로 (다른 11개는 동일 패턴)

`tests/integration/actions/club-members-approve.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { approveMember } from '@/lib/actions/club-members';
import { admin } from '../helpers/admin';
import { signInAs, signOut } from '../helpers/auth';
import { resetDb, seedUser, seedClub, seedMember } from '../helpers/seed';

describe('approveMember', () => {
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
    const { data } = await admin().from('club_members')
      .select('role')
      .eq('club_id', club.id)
      .eq('user_id', pending.id)
      .single();
    expect(data?.role).toBe('member');
  });

  it('B. 일반 member 호출 시 ok=true지만 DB role 불변 (RLS가 조용히 차단)', async () => {
    /*
      seed: admin1 + member1 + pending1 (모두 club A)
      signInAs(member1)
      const result = await approveMember(club.id, pending1.id)
      expect(result.ok).toBe(true)              // action은 성공으로 보임
      DB SELECT: pending1.role === 'pending'    // 실제로는 변경 X
    */
  });

  it('C. 비-멤버 호출 시 ok=true지만 DB role 불변', async () => {
    /*
      seed: admin1 + pending1 (club A) + outsider1 (멤버 아님)
      signInAs(outsider1) → 동일 패턴
    */
  });

  it('D. 다른 클럽 admin 호출 시 ok=true지만 DB role 불변 (cross-club 격리)', async () => {
    /*
      seed: club A (admin1 + pending1), club B (admin2)
      signInAs(admin2) → approveMember(clubA.id, pending1.id) → 동일 패턴
      ⚠️ 이 케이스가 phase A 격리의 회귀 안전망 — 빨개지면 RLS 정책 변경 의심
    */
  });
});
```

---

## Out of Scope (이 PR 안 함)

- 나머지 9+개 server action 테스트 (다음 PR에서 같은 패턴 복붙)
- E2E (단계 5)
- CI 통합 실행 (단계 5/6에서 재검토)
- 트랜잭션 롤백 방식의 reset 최적화
- truncate SQL function (운영 push 위험)
- Coverage 측정 / 리포트
- 단계 4의 RSC vs Client 멘탈 모델

---

## 사용자 흐름 (DX)

**한 번만 셋업**:
```bash
cp .env.test.example .env.test     # 로컬 키 채우기
pnpm supabase start                # 도커 부팅
pnpm test:integration              # 12 케이스 통과 확인
```

**매 PR 직전**:
```bash
pnpm test:integration              # ← 새 자리. 기존 'pnpm build' 1회와 같은 위치.
```

**로컬 supabase가 꺼져 있으면** → connection error로 즉시 실패 (속이지 않음).

---

## 학습 포인트

| 영역 | Spring/SQL 비유 |
|------|-----------------|
| `vi.mock` 모듈 갈음 | `@MockBean` |
| `getSupabaseServer` 경계 mock | port-adapter 패턴, infrastructure layer 갈음 |
| `service_role` 클라이언트 | DBA 계정. RLS 우회. 시드/정리 전용. |
| `auth.admin.createUser` | Spring Security `UserDetailsManager.createUser` |
| `pool: forks + singleFork` | JUnit `@Execution(SAME_THREAD)` — DB 공유 자원 보호 |
| `beforeEach(resetDb)` | `@Transactional + @Rollback`의 더 무거운 버전 |
| signInAs로 컨텍스트 전환 | `@WithMockUser` / `SecurityContextHolder.setAuthentication` |

---

## Success Criteria

1. `pnpm test:integration`이 12개 케이스 모두 통과 (로컬 supabase 부팅 상태)
2. CI는 `pnpm test`만 돌리고 통과 (변경 없음)
3. 새 action 테스트 추가 시 `tests/integration/actions/`에 파일 하나 추가하면 끝 (인프라 재사용)
4. 로컬 supabase 꺼져 있으면 즉시 실패 메시지로 안내됨 (조용히 false positive 안 됨)
5. Phase A의 RLS 정책 한 줄을 일부러 약하게 만들면 Test 2D 또는 Test 3 케이스 중 하나가 즉시 빨간 글씨

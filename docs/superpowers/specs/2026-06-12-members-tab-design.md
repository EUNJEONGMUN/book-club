# 멤버 탭 (clubs/[id]/members) — 디자인

**작성일**: 2026-06-12
**범위**: 단일 PR. phase A cleanup(PR 5)에서 제거된 "멤버 리스트 + 참석/발제 통계"의 multi-tenant 버전 복구.

---

## Goal

각 클럽 멤버를 둘러보면서 "누가 얼마나 활발한지" 한눈에. 베타 운영 중 사용자(EUNJEONGMUN)가 "어디서 보는 거냐"고 물으면서 빠진 게 확인됨 (phase A cleanup 부작용).

---

## 결정

| 항목 | 결정 |
|------|------|
| 라우트 | `/clubs/[id]/members` — 리스트 한 페이지. 멤버 상세는 후속 PR. |
| 표시 대상 | active 멤버만 (admin + member). pending 제외. |
| 카드 정보 | 아바타 + display_name + admin 뱃지(해당시) + "참석 N회 · 발제 M회" |
| 정렬 | display_name 가나다순 |
| BottomNav | 4탭으로 확장 — 홈 / 모임 / **멤버**(신규) / 설정 |
| RLS | 신규 정책 없음. 기존 `club_members_select_member` + `meetings_select` + `attendances_select` 활용. |
| 마이그레이션 | 없음. 쿼리만 추가. |

---

## File Structure

| 경로 | 역할 |
|------|------|
| `app/(app)/clubs/[id]/members/page.tsx` | (신규) 서버 컴포넌트 — 쿼리 호출 + 카드 렌더링 |
| `lib/queries/clubs.ts` | (수정) `getClubMembersWithStats(clubId)` 추가 |
| `components/club/MemberCard.tsx` | (신규) 카드 한 개 |
| `components/layout/BottomNav.tsx` | (수정) "멤버" 탭 추가 |
| `tests/integration/queries/club-members-stats.test.ts` | (신규) RLS 통합 테스트 2 케이스 |

## Architecture

```
/clubs/[id]/members (RSC)
  ├─ getClubMembersWithStats(clubId)  ← lib/queries/clubs.ts
  │   ├─ JOIN club_members + profiles
  │   ├─ COUNT attendances WHERE status='attending' AND meeting in this club
  │   └─ COUNT meetings WHERE host_id = profile.id AND club_id = this club
  └─ <MemberCard {...stats} /> × N
```

쿼리 구현은 단순한 2-쿼리 패턴 (active members + 통계 맵) — 기존 `getAllMembersWithStats` 패턴을 club_id 한정으로 재사용.

## 기존 `MemberCard` 컴포넌트와의 관계

phase A 전에 있던 `components/MemberCard.tsx` + `getAllMembersWithStats()`는 PR 5에서 삭제됨. 새 `components/club/MemberCard.tsx`는 그 단순 부활이 아니라:
- multi-tenant: 통계가 클럽 범위
- 위치: `components/club/` 하위 (클럽 영역 컴포넌트로 명확하게)
- 시그니처: `{ id, displayName, avatarUrl, role, attendedCount, hostedCount }`

## RLS 명시 (회귀 안전망)

- `club_members SELECT`: `is_club_member(club_id)` — 같은 클럽 active 멤버만 다른 멤버 row 열람
- `meetings SELECT`: `is_club_member(club_id)` — 같은 클럽 모임만 열람 (호스트 카운트용)
- `attendances SELECT` (phase A cleanup 이후): meeting → club → 멤버 체크

비-멤버가 직접 URL로 `/clubs/[id]/members` 접근 시 → 쿼리 결과 빈 배열 → 페이지에서 적절한 처리 (notFound or "권한 없음").

## 테스트 (이번 PR)

`tests/integration/queries/club-members-stats.test.ts`:

| # | 시나리오 | 기대 |
|---|---------|------|
| A | 클럽에 admin1 + member1 + pending1 + outsider. admin1로 signin → getClubMembersWithStats(club.id) | length 2 (pending/outsider 제외), 카운트 0/0 |
| B | 위 시드 + member1이 host인 meeting 1개 (admin1 참석) → admin1로 signin → 조회 | member1: 발제 1, 참석 0 / admin1: 발제 0, 참석 1 |
| C | outsider로 signin → 같은 클럽 조회 | length 0 (RLS가 차단) |

기존 `tests/integration/actions/*` 아닌 `tests/integration/queries/*`로 분리 — query는 read-only라 의미적 구분.

## 후속 PR (2026-06-12, 같은 세션) — 멤버 상세

- `/clubs/[id]/members/[userId]` 신규 — 한 멤버의 모임 이력
- 권한: admin은 누구든, member는 본인만 (pre-A 동작 보존)
- 쿼리: `getMemberHistoryInClub(clubId, userId)` — 발제 + 참석 (발제 우선)
- `MemberCard`는 권한 있을 때만 clickable Link로 감쌈
- 테스트 2 케이스 (queries/member-history.test.ts) — host/attendance 카운트 + cross-club 격리, 비-멤버 빈 결과

## Out of scope (이번 세션 끝)

- 검색/필터/정렬 옵션
- 멤버 카드 → 그 사람이 발제한 모임으로 deep-link
- pending applicants 페이지 분리 (admin은 현재 `/clubs/[id]/settings`에서 봄, 변경 없음)
- 멤버 카드 swipe action (강퇴 등)

## 위험

- BottomNav 4탭 — 360px 모바일 폭에서 한 탭당 ~84px → 아이콘+라벨 한 줄 충분
- 통계 쿼리 — 베타 단계라 데이터 적음, 추후 EXPLAIN 단계 6에서 점검

## Success Criteria

1. 운영에서 `/clubs/<id>/members` 접속 → admin/member 카드 + 본인 통계 확인
2. BottomNav 모바일에서 4탭 정상 렌더, "멤버" 활성 시 굵게
3. 비-멤버가 직접 URL 진입 → 빈 결과 (RLS 차단)
4. 통합 테스트 3 케이스 통과 (queries/club-members-stats.test.ts)
5. 단위 12 + 기존 통합 21 + 신규 3 = 24 모두 그린

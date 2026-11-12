# 로컬 개발 및 단일 모임 전환

## 로컬 실행

Node.js, pnpm과 Docker가 필요하다. GitHub CI의 Node.js 버전은 22다. Docker를 실행한 뒤 아래 명령을 사용한다.

```bash
pnpm install
pnpm exec supabase start
pnpm exec supabase migration up --local
cp -n .env.example .env.local
pnpm exec supabase status
# .env.local에 로컬 URL과 키를 입력한 뒤
pnpm dev
```

화면: http://localhost:3000 / 관리자: `admin@example.local` / 비밀번호: `password123`.
신규 로컬 DB의 시드는 부글부글 설정·관리자 멤버십·미래/과거 일정 2건·질문 1건을 만든다. 기존 DB에서 시드를 추가할 때만 `pnpm exec supabase db query --local --file supabase/seed.sql`을 사용한다. DB 초기화는 필요하지 않다.

로컬 초대코드: `bugeul-local-invite` (시드 실행일부터 30일). 운영 계정·기록과는 별개의 환경이다.

## 환경변수

`supabase status`에 나온 로컬 API URL, anon 또는 publishable 키, service-role 또는 secret 키를 각각 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`에 설정한다. 마지막 키는 서버 전용이다. OAuth 리다이렉션에 사용하는 `NEXT_PUBLIC_SITE_URL`은 로컬에서 `http://localhost:3000`이다.

- 책·장소 검색은 `KAKAO_REST_API_KEY`를 사용한다. [Kakao Developers](https://developers.kakao.com)에서 앱과 REST API 키를 준비하고 카카오맵 기능을 활성화한다.
- PDF 질문 추출은 `GEMINI_API_KEY`를 사용한다. [Google AI Studio](https://aistudio.google.com/)에서 키를 발급한다.
- Google OAuth는 Supabase Auth에서 설정한다. 로컬 설정은 `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`와 `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`을 사용한다. [로컬 Google OAuth 검증](google-oauth-check.md)
- 가입 신청 알림을 시험할 때는 `RESEND_API_KEY`와 선택값 `RESEND_FROM`을 설정한다. 배포 빌드의 소스맵 업로드는 Vercel에 설정한 `SENTRY_AUTH_TOKEN`을 사용한다. [환경변수 템플릿](../.env.example)

Vercel Preview는 별도 `book-club-preview` 프로젝트의 Supabase URL과 키를 사용한다. Production, Preview, 로컬은 각각의 프로젝트 값으로 구성한다. [Preview 환경 분리 기록](preview-isolation.md) · [실제 Preview 검증 기록](hosted-preview-verification.md)

## 2단계 데이터 보존

마이그레이션: `20261108000003_single_club_schema.sql`.

- 전체 구조 변경은 하나의 트랜잭션이다. 보존 검사에 실패하면 전부 롤백한다.
- 검증된 부글부글 UUID가 유일하게 식별되어야 하고 관리자가 있어야 한다. 다른 그룹에 일정이 있으면 자동 합치기·삭제 없이 중단한다. 완전히 빈 신규 DB는 시드로 초기화할 수 있다.
- `club_settings`는 한 행, `members`는 사용자당 한 행이다. 부글부글 소속 멤버의 역할·가입 시각과 기존 초대 ID·토큰·만료/취소 시각을 그대로 옮긴다.
- 일정 ID, 책/장소/발제 파일 정보, 발제 질문, 참석, 한줄 평은 그대로 유지한다.
- 전체 기존 그룹·멤버십·초대는 `legacy_multiclub`에 보관한다. 다른 그룹 사용자를 부글부글 멤버로 자동 승인하지 않는다. 원래 프로필과 일정도 별도 보관한다.
- 기존 계정과 인증 정보·Storage 메타데이터·실제 파일은 수정하지 않는다. `legacy_club_id`는 기존 링크 연결용이며 API로 수정할 수 없다.
- 보관 스키마는 public API와 일반 사용자·service role에서 접근할 수 없다. 일반 API에서 전체 모임 설정을 생성·삭제할 수 없다.

## 이번 로컬 검증의 백업

`.local-backups/before-single-club-20261108-015742/`에 DB 전체 dump, Storage 파일, 전환 전 JSON 기록, SHA-256 manifest를 저장했다. Git에서는 제외한다.

원래 백업을 별도의 임시 로컬 DB에 복원하여 전환을 재실행하고, 다른 그룹의 일정이 있는 경우 전체 롤백되는 것도 확인했다. 빈 스키마 복원 후 전환·시드도 확인했다. 검증용 DB는 정리했고 현재 로컬 DB와 운영 DB를 초기화하지 않았다.

## 테스트

```bash
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm exec tsc --noEmit
pnpm build
```

통합 테스트는 고정된 로컬 Docker 컨테이너만 사용하고 각 시험의 변경을 항상 롤백한다. 데이터 전체를 삭제하던 이전 테스트는 실행 경로에서 분리했다.

Playwright E2E는 위 시드 관리자와 지난 모임을 사용한다. 처음 실행할 때는 `pnpm exec playwright install chromium`으로 브라우저를 설치한다. 로그인·홈 메뉴, 지난 모임 상세, 멤버·설정·프로필, 예전 모임 주소 이동을 확인한다. [테스트 시나리오](test-scenarios.md)

## 운영 전환 완료

운영 DB는 2026-11-11 단일 모임 구조로 전환했고, 보존 검증 후 임시 쓰기 차단을 해제했다. 적용 순서와 최종 전체 DB·Storage 백업 및 복원 증거는 [운영 전환 완료 기록](manual-production-cutover.md)에 있다.

## 3단계 정리 및 회귀 검증

권한 검사는 `lib/auth/membership.ts`, 공개 Server Actions는 `lib/actions/club.ts`, 내부 업무 처리는 `lib/services`, 단일 모임 조회는 `lib/queries/club.ts`에 있다. 이전 주소의 UUID 조회는 `lib/legacy-club-url.ts`로 분리했다. 과거 마이그레이션·보관 레코드·백업은 정리 과정에서 삭제하지 않는다.

현재 기록을 재검증할 때:

```bash
node scripts/check-local-records.mjs snapshot .local-backups/새-검증-전.json
pnpm test
pnpm test:integration
pnpm test:e2e
node scripts/check-local-records.mjs compare .local-backups/새-검증-전.json
```

브라우저 시험은 회원·일정·발제·참석·평을 조회만 한다. 실제 저장·삭제 권한은 데이터 전체를 롤백하는 통합 시험으로 검증한다. 로그인에 따른 접속 시각 변경은 비교에서 제외하지만 계정 ID·이메일·암호 해시는 비교한다.

## 추가 보완 검증

`20261108000004_preserve_history_and_archive.sql`은 일반 멤버의 과거 참석 INSERT/UPDATE/upsert를 DB에서도 차단한다. 호스트·관리자의 정정 권한은 유지한다. 보관 테이블의 현재 사용자 참조를 제거하고 DML·TRUNCATE 거절 트리거로 보관본을 읽기 전용으로 고정한다. 레코드 값은 변경하지 않는다.

대표 데이터 리허설은 `scripts/rehearse-single-club.mjs`로 반복할 수 있다. 새 임시 로컬 DB에 기존 백업을 복원하고, 한글 PDF 파일명·질문·공개/비공개/익명 평·탈퇴/대기 사용자·초대 만료/취소·Google identity 기록을 넣어 전환을 검증한다. 실제 로컬 Storage의 생성한 랜덤 PDF만 다운로드하여 전후 해시를 비교한 뒤 정리한다. 기존 데이터는 사용하지 않는다.

구 버전 호환 점검 브리지와 임시 DB 쓰기 차단의 준비·리허설은 [운영 전환·복구 절차서](single-club-cutover.md)에 보관한다. 실제 운영 전환에서 사용한 차단 설치·해제 결과는 [운영 전환 완료 기록](manual-production-cutover.md)에 있다.

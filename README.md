# 독서모임 이벤트 관리 웹 MVP

독서모임 일정 관리를 위한 모바일 웹 앱.

## 시작하기

### 요구 사항

- Node.js 20+
- pnpm
- Docker (Supabase 로컬 실행용)

### 로컬 개발 환경 설정

```bash
pnpm install
pnpm dlx supabase start
pnpm dlx supabase db reset
cp .env.example .env.local
# .env.local에 supabase start 출력된 키 복사
pnpm dev
```

브라우저에서 http://localhost:3000 접속.

기본 부트스트랩 계정/초대 토큰은 `docs/bootstrap.md` 참고.

## 주요 기능

- 📚 모임 등록 (책 제목, 저자, 책 표지, 일시, 장소)
- ✅ 참석 체크 (참석 / 불참 / 미정)
- 💬 발제문 등록 및 조회
- 👥 멤버 명단 + 참석·호스팅 횟수
- 🔗 1회용 초대 링크로 멤버 가입 통제
- 📷 책 표지 · 아바타 이미지 업로드

## 테스트

```bash
# 단위 테스트
pnpm test

# E2E 테스트 (Supabase 로컬 실행 필요)
pnpm dlx supabase db reset
pnpm test:e2e
```

## 기술 스택

- **프레임워크**: Next.js 16 (App Router, Server Components + Server Actions)
- **언어**: TypeScript (strict)
- **스타일**: Tailwind CSS v4 + shadcn/ui
- **백엔드**: Supabase (Postgres, Auth, Storage, RLS)
- **폼 검증**: React Hook Form + Zod v4
- **날짜**: date-fns (한국어 로케일)
- **테스트**: Vitest + Playwright

## 문서

- 설계 스펙: `docs/superpowers/specs/2026-05-31-book-club-mvp-design.md`
- 구현 계획: `docs/superpowers/plans/2026-05-31-book-club-mvp.md`
- 부트스트랩: `docs/bootstrap.md`

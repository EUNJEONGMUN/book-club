# 부트스트랩 가이드

## 로컬 개발
`pnpm dlx supabase db reset` 시 `supabase/seed.sql`이 자동 실행되어 관리자 계정이 생성됨.

- 이메일: `admin@example.local` / 비밀번호: `password123`

## 운영 환경
첫 사용자는 Supabase Dashboard에서 수동으로 생성:

1. Authentication → Users → "Add user" (email + password)
2. SQL Editor에서 profile 삽입:
   ```sql
   INSERT INTO profiles (id, display_name, approved, is_admin) VALUES ('<user uuid>', '관리자', true, true);
   ```
3. 이후 앱에서 신규 가입자를 관리자가 승인

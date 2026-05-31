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

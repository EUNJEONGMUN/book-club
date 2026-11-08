# Supabase DB 연결용 공개 CA

`supabase-prod-ca-2021.crt`는 DB 서버의 신원을 확인하는 공개 인증서이며 비밀키가 아니다. 운영 DB나 시스템 인증서 설정을 바꾸지 않고 백업 프로세스에서만 사용한다.

- 배포 원본: https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
- 공식 설정 안내: https://supabase.com/docs/guides/platform/ssl-enforcement
- 이름: Supabase Root 2021 CA
- 유효기간: 2021-04-28 ~ 2031-04-26 (UTC)
- PEM 파일 SHA-256: `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`

2026-11-08 HTTPS 인증서를 검증한 연결로 다운로드했다. 백업 도구는 파일 해시도 확인하며 `verify-full`로 발급 체인과 DB 호스트를 모두 검증한다. 인증서 교체 시 원본·유효기간·실제 연결을 검증하고 파일과 도구의 해시를 함께 갱신한다.

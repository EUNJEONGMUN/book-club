# 부글부글

독서모임 부글부글의 일정, 참석, 발제 자료, 한줄 평을 관리하는 웹 앱이다. [운영 사이트](https://book-club-five-nu.vercel.app)

## 주요 기능

- 다가오는 일정과 참석 현황을 확인하고, 지난 모임은 연도별 목록이나 월별 책장으로 볼 수 있다.
- 모임 상세에서 링크를 공유할 수 있다. 모임을 등록하거나 수정할 때 승인된 멤버를 발제자로 지정한다.
- 멤버별 참석·발제 이력을 확인할 수 있다. 설정에서 기존 계정에 Google 로그인을 연결하고 기본 또는 크리스마스 테마를 선택할 수 있다.

## 로컬 실행

CI와 같은 Node.js 22, pnpm 11과 로컬 Supabase를 실행할 Docker가 필요하다.

```bash
pnpm install
pnpm exec supabase start
pnpm exec supabase migration up --local
cp -n .env.example .env.local
pnpm exec supabase status
```

`supabase status`에서 로컬 Supabase URL과 키를 확인해 `.env.local`에 설정한 뒤 `pnpm dev`를 실행한다. 앱은 [localhost:3000](http://localhost:3000)에서 열린다. [환경변수와 시드 계정](docs/bootstrap.md)

## 테스트와 배포

- 단위 테스트 `pnpm test`
- 로컬 DB 통합 테스트 `pnpm test:integration`
- 로컬 브라우저 조회 테스트 `pnpm test:e2e`

PR에서 GitHub CI의 타입 검사·단위 테스트와 Vercel 프리뷰 빌드를 확인한다. `main` 변경은 Vercel 운영 배포로 이어진다. 앱이 DB 변경에 의존하면 운영 Supabase에 해당 마이그레이션을 적용하고 확인한 뒤 병합한다. [발제자와 작성자 권한 관련 마이그레이션](docs/application.md#데이터-구조)

## 상세 문서

- [앱 기능과 권한](docs/application.md)
- [로컬 설정과 검증](docs/bootstrap.md) · [테스트 시나리오](docs/test-scenarios.md)
- [운영 모니터링](OPERATIONS.md)
- [운영 전환 완료 및 백업 증거](docs/manual-production-cutover.md) · [전환 리허설과 복구 절차](docs/single-club-cutover.md)

# 현재 상태 — 단일 부글부글 전환 (2026-11-11)

Git 정리 진행 — 사용자 최신 지시로 **이제 agent의 작업 브랜치 push와 main 병합까지 명시적으로 승인**됐다. 이전 owner-only push 규칙보다 이 최신 지시를 우선한다. 원격main378cc/작업branch충돌없음, 기존운영앱565 대비 app/components/lib/의존성소스차이없음. GitHub커넥터권한은pull만; 기존 gh의 EUNJEONGMUN 계정 OAuth로 CLI에서push/PR/필수CI/정상squash병합하고 자동VercelProduction까지확인한다. 보호규칙우회/강제push/DB마이그레이션재실행/백업삭제는 하지 않는다. docs/single-club-pr.md의과거운영보류조건을실제운영완료/최종검증근거로정리했다.

수동 진행 최신18 — **운영 전환 및 최종 사용자 검증 완료**: owner가 async질문에 “로그인·지난 모임·자료 열기 모두 정상”으로 답했다. 실제 기존 관리자계정 재로그인/지난모임/발제자료 다운로드·열기 정상에대한owner직접확인으로기록. `owner-final-acceptance.json`(private실행폴더)에근거/범위기록, docs/manual-production-cutover.md를완료상태로정리했다. 에이전트의추가UI재검사는기존handle의browser.user unavailable로불가했으나 owner직접확인은유효; 별도재로그인성공을허위주장하지않음. 현재production단일모임dpl5Nn/DBresumed/쓰기재개/원본보관함영구읽기전용·RLS유지/최종백업보존. **운영반영과데이터보존검증은완료**, 옛최종dump를운영에덮어쓰기금지. 이후Git정리: 작업branch codex/single-club-transition의앱소스와동일내용을main에반영하는PR/CI/ownerpush; main미병합·agentpush0이며 기존main자동배포는다중그룹구코드를다시배포할수있으므로소스동기화시내용확인필요. 이turn은운영변경추가0/새테스트추가0/기존백업삭제0. 최종사용자보고는운영전환완료와남은Git소스정리를구분한다.

수동 진행 최신17 — **owner재개 UPDATE1/COMMIT, 실제resumed확인, 기존계정 UI검증 대기**: owner가resume-4f4d197f16.sql 성공보고. Root는freeze상태helper를쓰지않고Observer의SELECT로 실제 run/release/club 일치 `stage=resumed`, cutover_guard schema없음/임시cutover트리거0, legacy5개table의영구archive_read_only활성 및 API3role의schemaUSAGE없음, live8tableRLS유지를확인했다. 현재members14/meetings11/questions67/files14. 증거 production-resumed-confirmed.json(UTC16:03:53). **서비스쓰기재개됨, 최종로그인/실제자료다운로드는아직미검증**. UI이전10탭은owner가닫아서없음. 현재IAB는Supabase5와새로그인11탭, `loginVerifyTab`바인딩으로 `https://book-club-five-nu.vercel.app/login?next=%2Fmeetings`를visible:true로열고markHandoff했다. 원래관리자계정직접로그인·지난모임·발제자료1개다운로드/열기 결과를 async질문함(3옵션:전부정상/기록자료문제/로그인또는가입문제). 비밀번호/코드전송금지 안내. owner응답을받고 실제 브라우저 상태와필요한조회/다운로드를확인하며이어간다. **새쓰기발생가능하므로옛최종백업으로덮어쓰기/기존사전취소/복구SQL실행금지**,문제면현데이터보존·새차단/백업·원인수정으로진행. root운영변경전송0/mainmergepush0. 아직Gitmain동기화/임시토큰폐기등후속정리남음. 최종배포완료보고는실제사용자흐름확인범위를분명히밝힌다.

수동 진행 최신16 — **owner새앱승격성공, 실제canonical·운영연결·최종재대조 확인, 다음쓰기재개**: owner스크린샷의Success와 Vercel GET으로 canonical=`dpl_5NnPHdjLD9wmoUUj6B7waB6qQAcE`확인. DBreadonly status는verified/guardc44cc...유지. IAB기존10탭을reload하니login으로이동(그전AX의과거모임데이터는reload전옛화면캐시였으므로새앱인증성공증거아님). 새로그인화면부글부글확인. canonical/login의HTTP200과공개JS18개를GET해 실제runtime Supabase ref가 **chvprcpdfgivnfkgwkem만**임을독립확인(키출력/저장없음). 증거 single-club-promotion-confirmed.json/new-app-public-runtime-verification.json. **실제재로그인/새앱기록조회는아직미검증**. 전체Auth차단중새로그인은불가하므로사용자의기존로그아웃수용/운영재개승인에따라domain/app/실제운영ref/원본데이터·membership권한을먼저확인하고 재개직후owner실로그인으로검증하도록순서변경해commentary에설명했다. 이사실을감추거나기존계정실로그인성공이라고기록금지.

`--observe resume --bundle .../backup-849be6fb353b006e --destination-verified`는이운영대상확인에근거해사용했고 원본/새projection/파일14/guard를다시대조통과한뒤SQL만export했다. **서버아직verified, 재개안됨**. 다음 ownerSQL `/tmp/book-club-manual-f8ff4376/resume-4f4d197f16.sql` (hostmanual-sql동일이름;receipt·containerSHA확인;영구legacy보호유지/임시guard함수·스키마와종속임시트리거만제거/업무행삭제없음). **만료 UTC2026-11-10T16:17:07.647335Z = KST11/11 01:17:07**,만료시실제resume검사재실행해새SQL,기한수정금지. 증거 resume-preparation.json. owner UPDATE1/COMMIT후 `--observe status`는freeze_state의허용stage에resumed없어실패하므로쓰지말고 Observer.query의SELECT로runstage=resumed,guardnamespace/function없음·cutovertrigger0·legacy영구보호/권한유지확인. 그다음owner에게준비한운영로그인 https://book-club-five-nu.vercel.app/login?next=%2Fmeetings 에서기존관리자계정직접로그인/지난모임·파일1개확인요청. IAB prodTab10에로그인화면준비됨. 새Auth를임의생성/위조하지않는다. **쓰기재개후옛백업복구/원래DB덮어쓰기금지**,문제시현시점기록보존/다시쓰기차단부터검토. Root운영쓰기전송0/mainmergepush0.

수동 진행 최신15 — **owner verified등록 COMMIT, 실제verified·차단 확인, 다음 새앱 승격**: 사용자가 compare SQL의 UPDATE1/COMMIT 보고. Root read-only status가 실제 verified/동일run·release·freeze·전체guard SHA c44cc... 확인. 기존 소유자 Vercel CLI 인증의 GET 2개로 단일모임 후보 `dpl_5NnPHdjLD9wmoUUj6B7waB6qQAcE`/URL `book-club-cnyootg5z-scone-s-projects.vercel.app`가 고정project/READY/Production임과 canonical이 여전히 점검 `dpl_B3kqFh7AJHDYDttUvTA5nKUzzAxH`임을 확인. 증거 실행폴더 before-single-club-promotion.json (2026-11-10T15:58:30Z). 다음 owner명령 `npx --yes vercel@65.12.1 promote https://book-club-cnyootg5z-scone-s-projects.vercel.app --scope scone-s-projects --yes`만 안내. **아직 승격 실행 안 했음**, DB쓰기차단 계속. 성공 출력후 canonicalalias와 실제새앱/기존계정·자료/권한을 확인하고 destination-verified를충족한뒤 resume검증·SQLexport·owner실행으로 이어간다. Auth차단에따른세션로그아웃은owner수용했으나 실제로그인성공으로허위보고금지. owner수동클라우드변경방식유지, root변경SQL/POST0. mainmerge/push0.

수동 진행 최신14 — **owner04 COMMIT, 실제 converted·데이터/파일 보존 검증 통과, 다음 verified등록 SQL**: 읽기전용 status가 실제 converted와 전체 guard SHA c44cc...를 확인. `manual-cutover.py --observe compare --bundle .local-backups/operation-run-20261109T155238544485Z/backup-849be6fb353b006e` 성공: 모든 원본 행(Auth/Storage 포함)은 원본/legacy 보관본과 일치, live회원/초대/프로필/모임 projection 일치, 실제 Origin파일14개 바이트SHA일치, 전체guard검사통과. profiles21/members14/meetings11/questions67/attendances92/reviews4/Auth24. 추가 readonly metadata도 live8tableRLS/legacy비공개·5table영구읽기전용/외부FK분리/3migration이력/지난출석권한/storage4member정책 모두true. 증거 post-conversion-comparison.json, post-conversion-protection-check.json(실행폴더). 내보낸 검증완료 SQL `manual-sql/compare-a2c4b29e1d.sql`을 로컬 `/tmp/book-club-manual-f8ff4376/compare-a2c4b29e1d.sql`에600복사/SHA `da239258f65771a53b064bbcd91316562c3a4b760c9790bcce1488a1a59e9f31`확인. **아직 서버 converted이며 verified아님**, helper쓰기없음. owner에게 표준psql-W-X-ON_ERROR_STOP -f해당SQL 안내. **만료 2026-11-10T16:10:20.132044Z = 11/11 KST01:10:20**, 만료시실제compare다시실행해새SQL생성,기한수정금지. owner UPDATE1/COMMIT후 실제verified확인→단일모임 후보 promote 수동안내→실제canonical/앱/기존계정·자료검사→검증된resume파일 owner실행. 점검/전체DB차단 계속 유지, 새앱승격/차단해제 아직없음. 추가 메타데이터 쿼리 첫 시도는 SELECT개행으로 로컬Observer정책이거절했고 재형식화 후SELECT만성공(운영변경없음).

수동 진행 최신13 — **owner03 COMMIT, 실제 migrated03/새 구조 차단 확인, 다음04**: 사용자가 `20261108000003.sql` 마지막 COMMIT을 보고했다. Root 읽기 전용 status가 실제 migrated03/동일 run·release·frozen_at/retained legacy클럽UUID 및 전체 guard 검사를 통과했다. 새 테이블과 스키마 이동으로 guards SHA는 `c44cc164ab36eac06b10081d04fd24b928fde2e1f3367ad43a996a906daa5792`로 변경(이전SHA와 동일해야 하는 것이 아님). 다음04 파일은 receipt SHA `8d7db55c66ce414e09800121a72eb7ea112eb4b8d92a7b70270d4580bb4c5347`와 현재 검증 엔진 생성 결과를 대조하여 로컬 컨테이너 `/tmp/book-club-manual-f8ff4376/20261108000004.sql`에600으로복사/SHA확인. 증거 manual-sql/migration04-container-ready.json. **04 아직 실행 안 함**. owner에게 표준 dockerexec/verify-full/aws-1:5432/postgres.chv.../postgres/psql-W-X-ON_ERROR_STOP -f04만 안내. 이 단계는 legacy보관본의 live계정연결FK를 분리하고 영구읽기전용트리거를 설치하며, 일반회원의 지난모임 출석수정만 제한(관리자/진행자 보정유지); 기존행 수정/삭제 없음. owner COMMIT 후 실제 converted/guards 확인→`--observe compare --bundle .local-backups/operation-run-20261109T155238544485Z/backup-849be6fb353b006e`로 실제 최종원본 대비 행/파일/정책 대조 및 verified등록SQL export→owner실행 순서. 서버 verified 전 새앱승격/쓰기재개금지. 점검/전체DB차단 유지, root운영쓰기전송없음.

수동 진행 최신12 — **owner02 COMMIT, 실제 migrated02/전체 차단 확인, 다음03**: 사용자가 `20261108000002.sql`의 마지막 COMMIT을 보고했다. Root의 읽기 전용 `manual-cutover.py --observe status`가 실제 `migrated02`, 동일 run/release/frozen_at 및 guards SHA `60ec3b4402d228943c6494e0143196b5842d22aec005b9ecfd85f469eca2fb4e`를 확인했다. 다음03파일은 receipt SHA `40ceae27955b465f14d5bbe13c2333bca1358836225deff424780f62694bbae3`와 현재 검증 엔진 생성 결과를 대조해 로컬 컨테이너 `/tmp/book-club-manual-f8ff4376/20261108000003.sql`에600으로복사/SHA확인. 증거 manual-sql/migration03-container-ready.json. **03은 아직 실행 안 함**. owner에게 표준 dockerexec/verify-full/aws-1:5432/postgres.chv.../postgres/psql-W-X-ON_ERROR_STOP -f03만안내. 이 SQL은 단일 모임 설정/회원/초대로 변환하며 기존 그룹/멤버/초대 테이블과 프로필/모임 원본을 private legacy_multiclub에보존, 동일모임ID/활동 보존검사 실패시 전체롤백. owner COMMIT 후 실제 migrated03/차단 확인→04만복사/안내. 최종 원본백업/파일 유지, 운영점검과DB차단계속유지. Root운영쓰기전송없음.

수동 진행 최신11 — **owner 승인 COMMIT, 실제 backup_verified 확인, 다음 02**: 사용자가 approve-backup SQL의 UPDATE 1/COMMIT을 보고했다. 읽기 전용 status로 실제 backup_verified와 동일 freeze/전체 guard SHA60ec...를 확인했고, 별도 읽기 조회로 run 일치 및 backup_sha256=최종manifest 3ea67d9f... / restore_sha256=실제report 305c0bcf... 일치를 확인했다. 증거 `operation-run-20261109T155238544485Z/backup-registration-confirmed.json`. 검증된 `manual-sql/20261108000002.sql`을 로컬 컨테이너 `/tmp/book-club-manual-f8ff4376/20261108000002.sql`에600으로복사하고 receipt/실제파일SHA 확인했다. **실행은 아직 안 함.** 다음 owner에게 표준 docker exec -it/TLSverify-full/aws-1:5432/postgres.chv.../postgres/psql-W-X-ON_ERROR_STOP -f해당02파일 명령만 안내. 이 단계는 clubs_delete_admin 정책 제거로 그룹 삭제 경로를 막고 migrated02/이력 기록, 업무 행/ID 삭제·변경 없음. owner COMMIT 후 읽기 status migrated02/guards 확인→03만복사/안내→03COMMIT 확인→04순서. 운영 점검/쓰기차단 유지, 최종원본백업/파일 보존. Root는 운영쓰기SQL 전송하지 않음. 이하 최신10의 승인대기는 과거 상태.

수동 진행 최신10 — **최종 묶음 실제복원 통과, 다음 owner backup 승인 SQL**: 사용자가 public pg_dump 후 정상셸복귀를보고했다. public 입력 **81232B/SHA b1d74fbc317f2cdce9df3875cdb9979463d47d6b7017bc89e1ed8dbaf7775091/8 DATA**, host/컨테이너SHA일치, full532383B c625...변경없음확인. `manual-cutover.py --observe capture --full .../owner-final-20261110T152637447254Z/database.dump --public .../public.dump`가실제현재frozen행·정책·Origin파일14개를nonce로2회읽고같은차단구간과묶어 **`.local-backups/operation-run-20261109T155238544485Z/backup-849be6fb353b006e/`** 생성했다. kind cutover-frozen-backup-v1/connection_kind production/runf8ff/동일freezeBeforeAfter, profiles21/members14/Auth24/meetings11/questions67/attendances92/reviews4/invites2/files14. 기존 사전묶음/manifest불변.

그 묶음으로 `--observe approve-backup --bundle .../backup-849be6fb353b006e` 실행: **전체/public 실제복원·50 COPY·2seq·파일14·130검사 통과**, 현재Live행/정책/Origin파일/guard도재대조통과. 하지만 **서버단계는아직frozen, backup_verified아님**(helper는쓰기금지). 내보낸SQL **manual-sql/approve-backup-661ba4757a.sql**의manifest/report해시가실제보고서와같음을확인하고 **로컬 `/tmp/book-club-manual-f8ff4376/approve-backup-661ba4757a.sql`**에600으로복사/SHA확인했다. owner가다음표준dockerexec/psql-W-X-ON_ERROR_STOP -f해당파일만실행할차례. **파일은생성후15분기한**이므로 지연으로만료되면actual검증다시거쳐새파일생성,SQL기한삭제/수정금지. 승인단계는privatecontrolrow의백업/복원hash·stage만등록,업무구조전환안함. ownerCOMMIT후`--observe status`와serverhash로backup_verified확인하고그다음02→03→04단계별파일복사/명령안내. 데이터전환파일은아직컨테이너에미복사.

증거: owner-final폴더의 public-copy-verification.json/full-copy-verification.json/final-verification-summary.json, bundlemanifest/records/metadata/files/actualrestore-report. 각private600/디렉터리700. Source03과04모두NOTIFYpgrst'reload schema'포함확인(코드변경없음). 서비스·DB차단유지중이므로불필요한추가조사없이순서대로진행. 오류시자동재실행/해제하지않는다.

수동 진행 최신9 — **frozen 최종 full archive 생성/복사 확인, 다음 public dump**: 사용자가 full pg_dump 후 오류 없이 셸복귀를 보고했다. 로컬 컨테이너 `/tmp/book-club-final-f8ff4376-20261110T152637447254Z/database.dump`를600으로제한하고 같은 owner-final host folder의 database.dump로복사, 양쪽SHA확인. **532383bytes / SHA c625b1df673eb71ba456d9ffb71db6b601f317cefbd23ab5c560f7d556b1ecac / PGDMP·목록50 DATA / 제어행run f8ff·release1e76·stagefrozen·동일frozenAt15:20:56.730169+00** 확인했다. 실제복원은 아직 안 했으며 `full-copy-verification.json`에 public_backup_pending:true로기록. full덤프에는실제운영frozen제어행이있어옛사전008ce2...와다르다. 원본컨테이너파일/옛백업보존, 운영SQL안보냄.

다음 owner명령은 같은TLS/host/user/DB/pg_dump -W/-Fc/lockwait5에 **--schema=public --file=/tmp/book-club-final-f8ff4376-20261110T152637447254Z/public.dump**를추가한복구용public백업이다. 성공후 public만새host경로복사/SHA·목록확인하고 full복사본은덮어쓰지않는다. 이후 `manual-cutover.py --observe capture --full .local-backups/operation-run-20261109T155238544485Z/owner-final-20261110T152637447254Z/database.dump --public .../public.dump`가현재Origin파일2회/행/정책을같은freeze와묶는다. 생성bundleactual복원→승인SQL→owner실행전까지migration안내금지. 서비스·DB여전히점검/frozen이므로순서대로신속진행.

수동 진행 최신8 — **실제 운영 frozen 확인, 다음 owner 최종 full dump**: 사용자가 01-freeze.sql의 BEGIN/DDL/UPDATE1/COMMIT 출력을 보고했다. Root가 `manual-cutover.py --run-folder .local-backups/operation-run-20261109T155238544485Z --observe status`를 실행해 **stage frozen**, run f8ff4376923abe3660ef2480d4cfd56a / release1e76... / 실제클럽7504... / **frozen_at 2026-11-10T15:20:56.730169+00:00** / **guards_sha256 60ec3b4402d228943c6494e0143196b5842d22aec005b9ecfd85f469eca2fb4e**를 직접 확인했다. 함수·모든 트리거·API권한/MPU/vector 검사 통과. 관찰은 read-only이며 root는 운영쓰기SQL을 전송하지 않았다. **현재 실제 서비스 점검+DB쓰기차단 상태**이므로 불필요한 조사/재시험을 하지 말고 최종백업 단계로 진행한다.

최종 owner archive input 새 plan/folder `.local-backups/operation-run-20261109T155238544485Z/owner-final-20261110T152637447254Z/plan.json`을 만들었다. 로컬 컨테이너 mode700 새 디렉터리 **/tmp/book-club-final-f8ff4376-20261110T152637447254Z** 준비. 사용자에게 먼저 표준 docker exec -it/verify-full/기존CA/aws-1:5432/postgres.chv.../postgres/pg_dump-W/-Fc/lockwait5s/**--file=해당경로/database.dump** 전체백업 명령만 안내한다. 오류 없이 셸복귀하면 다음 public-only dump(--schema=public, --file=같은경로/public.dump) 명령을 안내. 아카이브를 TTY stdout으로 리다이렉트하지 않는다. 두 입력을 private host folder로 docker cp/600/SHA목록 확인한 뒤 `manual-cutover.py --observe capture --full .../database.dump --public .../public.dump`로 Origin파일/행/정책·현재freeze와묶고, `--observe approve-backup --bundle <생성backup...>`가 실제 격리복원을 호출하고 승인SQL만export하도록 한다. owner가 승인SQL을 실행해야backup_verified가서버에기록되며 그 전02이하마이그레이션안내금지. 실제 frozen final 아카이브의 제어행(9필드)이 현재run/stage/frozenAt과일치해야함, 옛 사전512419B dump는 사용/승격금지. Source final input plan의 backup_created:false는생성시점기록그대로유지,별도결과기록추가. 현재는 full/public 아카이브 아직 미생성.

수동 진행 최신7 — **운영 점검 화면 연결 완료, 다음은 owner DB freeze**: 사용자가 maintenance 후보 승격 후 실제 canonical의 점검 화면을 보고했다. Root도 nonce/no-cache GET으로 /, /login, /more/profile, 실제 과거모임링크4개 모두 **503 / Cache-Control:no-store / Retry-After:60 / 기존기록보존문구**를 확인했다. 증거 `.local-backups/manual-rollout-20261110/maintenance-live-check-20261110T151522010327Z.json`. canonical alias는 GET으로 maintenance ID `dpl_B3kqFh7AJHDYDttUvTA5nKUzzAxH`임을 확인. Supabase read_only SELECT로 control/guard/legacy namespace 아직NULL, 실제클럽UUID1개, MPU/parts0, vector0, 신규02/03/04이력[] 확인. SQL0와 사전취소 파일은 호스트receipt/컨테이너SHA재대조 및CA읽기확인 통과. Root는 아직 운영 DB변경SQL을 실행하지 않았다.

이제 owner에게 같은 pinned TLS/원래 postgres 접속의 `docker exec -it ... psql -W -X -v ON_ERROR_STOP=1 -f /tmp/book-club-manual-f8ff4376/01-freeze.sql`만 안내한다. 정상 마지막 COMMIT을 확인한 뒤 helper `python3 -B scripts/manual-cutover.py --run-folder .local-backups/operation-run-20261109T155238544485Z --observe status`로 실제 frozen/control/전체guard를 읽기 검증한다. 다음은 새 full/public 최종 dump2개를 owner가 만들고 Origin파일·행·정책과 bundle→실제복원→owner backup_verified 승인SQL→02/03/04이다. 기존 사전512419B dump는 최종중단백업으로 승격하지 않는다. 서비스 점검 중이므로 불필요한 조사/재시험으로 오래 멈추지 말고 검증된 경로를 순서대로 진행한다. 오류 시 자동재실행/자동해제하지 않는다. 사전취소SQL과 recovery-app은 준비돼 있다. local HEAD는 d853a24(앞선전체수동코드·문서커밋), push/mainmerge는 안 함.

수동 진행 최신6 — **다음은 점검 화면 승격 안내**: 사용자가 기존 관리자 계정으로 지난 모임·발제 자료가 잘 열리고 조회된다고 확인했다. 새 `scripts/manual-cutover.py`와 `rehearse-manual-cutover.py`, 단위 테스트를 구현했다. 전자는 오프라인 SQL 준비 + **클라우드 SELECT read_only:true 관찰/SQL export만**, DB 변경 전송·비밀번호 입력·배포 기능 없음. 실제 변경은 owner psql만. 기존 Core의 executor DBpostgres/session_userpostgres/run/release/stage/백업해시 조건은 생성 SQL에 유지하며 관찰자의 역할을 위장하지 않는다. 관찰자 권한 실조회는 supabase_read_only_user/superuserfalse/BYPASSRLStrue/pg_read_all_datatrue/read_onlyon. Supautils.policy_grants에 postgres의 storage.objects도 현재 포함됨을 읽기 조회로 확인했다(새 권한 부여 없음). 아래 ‘수동 경로 미구현’은 이제 과거 기록.

새 사전 백업을 사용한 실제 manual psql 재생 **5흐름·82검사·실복원4×130=520검사·전체 단위77개 통과**. 증거 `.local-backups/manual-sql-rehearsal-20261110T144604176426Z/{verification-report,tested-source-proof}.json`. cancel/정상전환/02부분복구/03부분복구/04전체복구, 잘못된 역할·UUID·초기화 최종오류 원자롤백·차단누락·승인 전 마이그레이션·검증 전 복구재개·재개 후 옛취소 거절을 검사. 모든 리허설 runID는 실제 run과 다르고 artifacts kind local-restore여서 실제 운영 승인에 쓸 수 없다. new network-none 컨테이너만, 원래 로컬 DB/원본 사전 dump/manifest 보존·시험컨테이너 정리. 첫2실패는 SQL함수바깥개행 btrim검사/제어행 필드수9 대10 검사 버그였고 수정 후 새 폴더에서 전부 통과, 실패증거도 보관. 운영 영향 없음.

실제 plan `.local-backups/operation-run-20261109T155238544485Z/run-plan.json`의 runID **f8ff4376923abe3660ef2480d4cfd56a**, releaseSHA **1e76b67ab27f2bb2f8f30a82df77d19b908c680b09f5a7e32ad4fc749f4209d9**에 묶인 SQL5개를 `manual-sql/`에 생성(이미 있으므로 --prepare 재실행하면 overwrite거절). `01-freeze.sql`은 private control 생성/guard 설치/누락검사를 단일Tx에서 수행하고 원본version/UUID/role/legacy/managed의존성/진행업로드 검사를 한다. 미리 준비한 02/03/04는 아직 backup_verified해시 없으면 실행 불가, 실제 실행 위치로 미복사. cancel-before-migration.sql은 옛구조·이력·run stage 확인 후 own guard만 제거하며 데이터 덮어쓰기 없음. **로컬 컨테이너 `/tmp/book-club-manual-f8ff4376/`에는 01-freeze.sql(SHA1f7b3f8a68675a24dfce8d8009faf0bc6de681a12c4d5c476ae7948503f69b28), cancel-before-migration.sql(SHA84d76e864245fceb5d7e9c3605b9f75e4df9e06b10947fe03fb6f9278e9a97d0) 2개만 복사600·디렉터리700/SHA대조 완료.** 실제 SQL실행은 아직0.

수동 helper 사용법(agent가 읽기/파일준비에 사용, owner에게 Python자격증명wrapper 재실행 요구 금지): `--run-folder <operation-run> --observe status|capture|approve-backup|compare|recover|check-recovery|resume|cancel`. capture는 owner가 표준pg_dump로 받은 `--full/--public` 두 아카이브의 제어행run/release/stage/frozenAt을 확인하고 실제 현재행·정책·Origin파일2회와 묶음. approve-backup은 실제 새 네트워크없는 전체/public/파일 복원을 직접 호출한 뒤 현재행/파일/guard 재대조하고 **서버를 바꾸지 않고** 승인SQL을 내보낸다. owner가 SQL을 실행해야 backup_verified 해시가 서버에 기록됨. 비교·복구·재개도 Core메서드의 변경 시점에서 SQL만 내보냄. 모든 변경SQL에는 실행 직전 SQL guard검사(함수내용/owner/security/path/API권한/trigger활성·종류·전체대상/MPU·vector0), lock5초/statement최대60초(차단설치30초), 15분 기한(검증후 파일만), ON_ERROR_STOP을 추가했다. rollback은 먼저 owner의 실패전체dump(현재 controlstage 일치 필수)를 받아 failedJSON/dump를 보존하고 현재상태에 맞는 Core public 복구SQL을 생성한다. owner 실행 후 recovering에서 `--observe check-recovery --bundle ... --context recovery-context-*.json`로 원본/실패보관본/이력/ACL/OID/파일을 검사해야 recovered_verified SQL이 나오며 그 전 resume불가. 이후 --destination-verified는 같은운영host 실제계정/자료·alias검사한 뒤에만 사용한다.

새 마지막 Vercel 조회 `.local-backups/manual-rollout-20261110/before-maintenance-20261110T145321102153Z.json`에 세후보Ready와 실제 canonical이 원래 dpl6Cf임을 확인했다. 다음 owner명령은 `npx --yes vercel@65.12.1 promote https://book-club-ham5e94j8-scone-s-projects.vercel.app --scope scone-s-projects --yes`. CLI65 promote --help로플래그확인함. **이 명령부터 점검 화면이 보임**을 알리고 진행업로드·다른DB작업 먼저종료 안내. 아직 DB변경이 아니며 승인 재질문하지 않고 사용자 수동 방식 유지. 성공결과 뒤 canonical 실제503/no-store/retry60/기록보존문구·alias maintenanceID를 읽기로 확인한 후 owner에게 표준 psql -W -X -f /tmp/book-club-manual-f8ff4376/01-freeze.sql 명령만 단계별안내. 오류 시 자동재시도하지 않는다. 새Source접근보호/운영target·실모드UI·기존관리자baseline·백업296까지기존증거 모두유지. 공개요약 docs/manual-production-cutover.md.

수동 진행 최신5: 사용자가 preflight pg_dump 후 오류 없이 셸로 돌아온 screenshot을 보냈다. 실제 컨테이너 파일512419bytes 확인, private parent700 안 file644였음을 확인한 뒤 파일600으로 제한하고 호스트 `.local-backups/manual-rollout-20261110/preflight-db-20261110T123903448256Z/database.dump`로 복사했다. 컨테이너/호스트 SHA동일 **008ce2aae61bf4284c7ad8a2c61e5d0cf8f750077dd1b71a60eeda72ff822e9b**, PGDMP/목록49 DATA 확인. manifest는 새 사전 사본으로 생성했으며 writes_frozen=false/final_cutover_backup=false/restore_verified=false 생성시점 기록 유지. 완료 증거는 옆 `preflight-result.json` 및 `.local-backups/production-restore-verified-20261110T124418661118Z/verification-report.json`. 기존 `verify-production-restore.py --backup NEW --records .local-backups/production-readonly-20261109T154650326434Z --postgres-rehearsal --write-barrier-rehearsal`로 새 network-none local컨테이너에서 **296검사·49 COPY·2시퀀스·파일14·전체복원/전환/복구 원본보존 통과**. 원래 로컬 DB 불변, 새 시험 컨테이너 정리. 사용자에게도 백업/검증 성공 및 아직 사전 사본임을 안내했다. 운영 DB/도메인 변경 없음.

현재 사용자에게 요청한 다음 수동 확인: IAB tab10 `https://book-club-five-nu.vercel.app/login`(markHandoff)에 원래 관리자 계정으로 직접 로그인 후 지난모임/발제자료1개 정상 확인 결과를 달라고 async 요청했다. 전환 전후 권한·기록 비교와 점검 직후의 유효 관리자 세션을 확보하려는 목적. 응답 대기. 새 계정가입/기록수정 금지 안내, 비밀번호/코드 입력은 소유자만. 로그인 후 next는 바로 무작정 promote가 아니라 **수동 DB 실행용 SQL/취소·복구 경로를 실제 검증한 형태로 준비한 뒤** 점검 시작 안내해야 한다.

수동 SQL 준비 관련 미해결 구현 차이: 현재 운영 실제 쓰기는 사용자 표준 psql로만 진행하기로 했다. Core Engine의 역할/실행/단계·백업해시 검사를 유지하면서 SQL 파일을 owner가 실행할 수 있게 내보내는 수동 경로는 아직 따로 구현하지 않았다. 초기화·freeze 원자성 및 02/03/04/사전취소/복구 SQL을 준비·로컬 재생 검증한 뒤 사용자에게 단계별 psql 실행만 안내해야 한다(자동 credential-wrapper 재시도 요청 금지). 당일 frozen dump/public dump/파일을 실제복원하여 같은 run/release 서버 backup_verified 해시에 묶는 기존 Core 검사도 생략하지 않는다. 기존 write-barrier-sql.py는 LOCAL ONLY 제한 그대로이며 rawlocalSQL을 운영에 붙여넣지 않는다. Core의 actual Production-shaped assertion은 DBpostgres/session_userpostgres/run/release/stage에 묶여 있고 Core.migration_sql()은 pure 생성 가능. 중요한 관찰: Management API query read_only=true의 실제 login/role은 **supabase_read_only_user**, DBpostgres/read_onlyon이다. 따라서 이 관찰자 연결에 executor의 session_userpostgres 조건을 그대로 적용하면 실패하며, 그것을 이유로 실제 변경 SQL의 role검사를 없애면 안 된다. API는 계속 조회만 하고 실제 변경은 검증된 소유자 psql rolepostgres 경로를 사용한다. 향후 helper를 만든다면 조회 결과 검사→실행할 SQL파일 export만 하며 API에 변경 SQL을 전송하지 않도록 해야 한다.

수동 진행 최신4: 사용자 첨부에서 pinnedCA/verify-full/aws-1:5432/고정postgres계정의 직접 psql -W 읽기전용 접속 성공을 확인했다. 결과 db=postgres/db_user=postgres/superuser=off/clubs=1, BEGIN→SELECT→ROLLBACK. Python wrapper 실패 때문에 더 이상 접속 차단으로 취급하지 않는다. 다음 수동 단계는 **중단 전 전체 pg_dump 실제 생성·격리 복원 확인**(서비스 사용 중 사전 사본이며 최종 중단 백업 아님). 새 private plan/folder `.local-backups/manual-rollout-20261110/preflight-db-20261110T123903448256Z/plan.json`, 로컬 컨테이너 새 디렉터리 `/tmp/book-club-preflight-20261110T123903448256Z`를 mode700으로 준비했다. 사용자가 docker exec -it + 같은 TLS/host/user/DB + pg_dump -W --format=custom --lock-wait-timeout=5s --file=/tmp/book-club-preflight-20261110T123903448256Z/database.dump 를 직접 실행할 차례다. **TTY로 binary stdout을 호스트 리다이렉트하면 안 됨**; 아카이브는 컨테이너 파일에 쓰고 완료 후 docker cp로 private host folder로 복사해 검사할 것. 실패/부분파일은 삭제/덮어쓰기 없이 검토. DB/역할/기존 로컬테이블 변경 없음.

세 후보 UI도 읽기만 확인: maintenance /login은 '잠시 점검 중입니다'와 원본보존 문구, recovery/single /login은 부글부글 이메일·Google 로그인 폼 정상. 실제 로그인/회원변경은 안 했다. `.local-backups/manual-rollout-20261110/candidate-browser-check-20261110T123903448256Z.json`. 새 클라이언트의 실제 Supabase ref 독립 검증은 아직 안 됨: JS URL 직접 비인증 GET302, pageAssets는 script bundle 미지원으로 중단; bypass secret/보호 변경 없음. 소스 및 Production 타깃/프로젝트·운영 alias/보호 조회 근거와 UI의 실제 모드 효과는 확보했다. 실제 회원 로그인/자료 검사는 DB 전환 전후 운영 host의 정상 인증 흐름에서 추가 확인해야 한다. 아직 점검 승격·쓰기 차단·DB 전환은 안 했다.

수동 진행 최신3(11/10 KST): 세 후보 모두 사용자 CLI 명령으로 Ready. maintenance=`dpl_B3kqFh7AJHDYDttUvTA5nKUzzAxH`/ham5e94j8, recovery=`dpl_4vAryEbL6RpXLfN9EkhLQtTDo6nE`/f7ud7uz75, single=`dpl_5NnPHdjLD9wmoUUj6B7waB6qQAcE`/cnyootg5z (각 fullURL는 아래 기록과 receipts). 사용자 Vercel CLI 로그인 credential이 `~/Library/Application Support/com.vercel.cli/auth.json`에 생겨 고정 endpoint GET을 메모리 인증으로 사용 가능(토큰 출력/복사/새 파일 저장 없음). 이번에 GET으로 세 배포 모두 고정project/production/READY/alias[]/sourcecli 확인, 비로그인 GET은 모두302→vercel.com(접근 보호), Node24.x/SSO all_except_custom_domains 확인. **canonical alias book-club-five-nu.vercel.app은 여전히 원래 dpl_6CfNuZiDymJQPjdqN2Z9KeeG2Zxn**. `.local-backups/manual-rollout-20261110/candidate-readonly-verification-20261110T123013779152Z.json` 및 single-club-owner-receipt 참조. DB 변경/점검 시작/승격은 아직 없음.

모드/연결 원문 검증 한계: v13 deployment env/build.env가 값이 아닌 list여서 모드 None; 공식 CLI가 쓰는 v3/env/pull/dpl_ID 조회는3개 모두400으로 중단(수정 요청 없음). 값 검증에 성공했다고 주장하지 말 것. 원문 숨김 Secret은 유지. 실제 보호된 후보의 maintenance503·새/복구login응답 및 새 client 번들의 운영 Supabase ref를 확인하는 단계는 아직 남아 있다. 사용자에게 바로 promote 안내하지 않는다.

다음 수동 단계는 **점검 시작 전에 표준 psql로 최종 백업용 DB 접속 확인**. 이전 Python wrapper의 OperatorSQL실패가 있었으므로 DB 연결/백업 경로가 실제 동작하는지 중단 전에 확인해야 한다. pinnedCA SHA700723... 검증 후 공개 인증서만 기존 로컬 `supabase_db_book-club:/tmp/book-club-production-ca.crt`에 복사했다(운영/로컬 DB행 변경 없음). 사용자에게 docker exec -it + PGSSLMODEverify-full/PGSSLROOTCERT해당경로/PGCONNECT_TIMEOUT15 + psql aws-1:5432/postgres.chv.../postgres/-W/-X로 **BEGIN READ ONLY; DB·session_user·superuser·clubs수 SELECT;ROLLBACK**만 안내한다. 비밀번호는 본인 터미널 숨김 입력, 스크립트 재실행/비밀번호 재설정 요구하지 않는다. 그 결과 후 실제 백업 준비·세후보기능확인·점검/차단·최종백업/실복원·전환으로 진행한다.

수동 진행 최신2: 사용자가 recovery-app + 고정project/scope + --prod --skip-domain + 빌드·런타임 MAINTENANCE_MODE=0 명령을 완료했다. 첨부 터미널에서 Ready/Deployment Protection 켜짐, `https://book-club-f7ud7uz75-scone-s-projects.vercel.app` 확인. 기록 `.local-backups/manual-rollout-20261110/recovery-owner-receipt-*.json`. 아직 도메인 연결/DB 차단·전환은 요청·실행하지 않았다. 다음은 single-club-app 폴더의 마지막 후보 생성: 원본148파일/SHA73ea09764e0dbf06b58122a25ef8a90674e44da5e41c3721b285fa78e63353b7를 재대조했고, 같은 --prod --skip-domain + 빌드·런타임 MAINTENANCE_MODE=0 명령을 사용자에게 안내한다. 이 새 앱은 02→03→04 DB 전환·보존 검증 후에만 운영 주소에 연결해야 한다. 3개 Ready 뒤에는 각 배포 ID/소스/운영 환경·보호 및 현재 운영 도메인 유지 검증, 점검/진행 업로드 종료·최종 백업/실제 복원 단계가 남아 있다.

수동 진행 최신: 사용자가 Vercel CLI65.12.1 로그인 성공 후, 안내한 maintenance-bridge 폴더/고정project·scope/--prod --skip-domain/빌드·런타임 MAINTENANCE_MODE=1 명령으로 점검용 후보 생성을 완료했다. 첨부 터미널 화면에서 Ready/Deployment Protection(Vercel Authentication) 켜짐과 URL `https://book-club-ham5e94j8-scone-s-projects.vercel.app` 확인. owner receipt는 `.local-backups/manual-rollout-20261110/maintenance-owner-receipt-*.json`이다. 실제 도메인 연결은 이 screenshot만으로 독립 확인했다고 주장하지 않는다. 사용자 다음 요청은 **복구용 배포본 만드는 방법**. recovery-app 원본138파일/sourceSHA7d95a9...와 폴더를 재대조 완료, 다음 수동 CLI 명령은 recovery-app에 같은 --prod --skip-domain + 빌드·런타임 MAINTENANCE_MODE=0이다. 아직 복구용/새 앱 후보 생성 결과, 운영 DB 변경/차단/도메인 승격은 없다. 구 DB 호환 recovery-app은 실제 구 DB 복구 확인 전에는 운영에 연결하지 않는다.

수동 진행 1단계 결과 수신: 사용자가 SQL Editor 조회로 clubs1/profiles21/members14/meetings11/files14, write_barrier_installed=false, applied_transition_migrations=[]를 보고했다. 전환 전 기준과 일치하며 실제 전환/차단 미실행이다. 이 소유자 보고(실시간 서버 증명/백업 아님)를 `.local-backups/manual-rollout-20261110/owner-baseline-*.json`에 보관했다. 기존 검증된 source tar3개를 오프라인 재검증 후 같은 폴더의 maintenance-bridge/recovery-app/single-club-app에 안전하게 풀어 모든 파일 바이트를 대조했다(138/138/148파일). 앱 환경값/DB/운영 배포 변경 없음. 다음 수동 안내는 **Vercel 표준 CLI 로그인 후, 이 3개 소스만 Production 환경·도메인 미연결(--prod --skip-domain)로 차례로 생성**하는 단계다. 자동 production-control.py나 DB 비밀번호 재입력은 요청하지 않는다. CLI 로그인 명령은 npx --yes vercel@65.12.1 login. 후속 배포에서 임의의 repo-root 업로드나 Preview 테스트 배포를 운영으로 승격하지 않는다.

Vercel 환경변수 화면 최신 관찰: Production의 NEXT_PUBLIC_SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY가 모두 Secret 유형이라 GUI Reveal 버튼이 없고 목록 API 값도 숨겨진다. Preview의 URL/anon은 Config이므로 Reveal 가능. 운영 값을 읽기 위해 유형/값을 바꾸거나 사용자에게 원문 복사/재입력하게 하지 말 것. 새 후보를 Production 환경에서 빌드하고 실제 생성 결과/공개 클라이언트 번들 연결 주소로 검증할 계획이며, 원문을 읽지 못한 Secret을 독립 검증했다고 주장하지 않는다. 새로 연 Vercel env 탭은 2FA 권유 팝업만 있고 설정 저장/값 공개/인증 변경 없음.

최신 사용자 지시(2026-11-10): **기존 사용자 로그아웃 허용**, 이후 절차대로 운영 DB 전환/배포까지 승인했으나 연결 시도 3회가 모두 읽기 전용 사전 확인에서 실패하여 현재 **사용자가 직접 진행하도록 한 단계씩 안내하는 방식으로 전환**했다. 새 운영 DB 변경/차단/배포/승격은 아직 0이다. 소유자 터미널의 숨김 입력을 받는 `production-control.py`를 추가했지만 `Control` 생성 중 실패했고 `control-*.json` 포인터/`deployment-*.json` 제출 기록이 없어 실행 창·배포가 시작되지 않았다. 사용자는 자동 스크립트 재실행 대신 수동 안내를 원한다. 다시 자격증명 입력/자동 변경을 요구하지 말고, 먼저 Supabase SQL Editor의 읽기 전용 현재 상태 조회를 안내하고 결과에 따라 백업·복원·점검·전환을 차례로 돕는다. 운영 반영 승인은 유효하되 진행 방식은 최신 수동 요청을 따른다. Git push는 사용자가 직접 한다는 기존 선호 유지.

이번 시도: `production-cutover.py`의 무조건 False 차단을 기본 거절 + 명시적 `--allow-production-writes --accept-session-logout` 요구로 바꿨다(세션 문제 해결을 주장하지 않음). 데이터/백업/복원/단계 검사는 유지. 새 `production-control.py`는 소유자 터미널에서 토큰·DB 비밀번호를 getpass로 메모리에만 받고 개인 Unix socket으로 고정된 후보 배포·단계 명령만 허용한다. 임의 SQL/환경변수 쓰기/DB 삭제/키 생성 기능 없음. 기본 명령 오프라인. 고정 공식 Vercel CLI65.12.1을 `.local-backups/production-cli/`에만 설치(--ignore-scripts, 앱 의존성 불변), Node24의 @vercel/cli-support로 실행 예정이었다. `VERCEL_TOKEN`은 자식 env만, 전역 설정은 private run 폴더, telemetry/update check 끔. 환경변수 목록은 원문을 감추므로 새 CLI가 쓰는 읽기 전용 `/v3/env/pull/PROJECT/production`을 메모리에서만 읽어 공개 URL/JWT 프로젝트를 검증하도록 보완했다. 실제 이 경로 호출 전 마지막 DB identity 조회가 실패해 배포 미실행. 안전 단위68개 통과.

실패 경과: 첫 `Unexpected Production pooler metadata`는 어댑터가 TEST의 aws-0를 잘못 고정했기 때문. 공식 GET `/v1/projects/chvprcpdfgivnfkgwkem/config/database/pooler`가 **aws-1-ap-northeast-2.pooler.supabase.com / postgres.chvprcpdfgivnfkgwkem**임을 확인해 `cutover-io.py`의 고정 HOST를 aws-1로 수정했다. `production-db-dump.py --diagnose`는 기존 CA/verify-full/5432 TLS 호스트 검증 통과. 두 번째는 DB 읽기 identity 성공 후 Vercel env 목록에서 원문 URL이 감춰져 확인 실패(설정 변경 없음). 세 번째는 DB 읽기 identity 중 `Operator SQL failed`로 중단, 원시 진단/자격증명 저장 없음. 재시도나 자격증명 재설정 대신 사용자의 수동 진행 지시를 따른다. 새 run은 `.local-backups/operation-run-20261109T155238544485Z/`, 입력 토큰은 owner가 book-club 프로젝트 범위/1Day로 직접 발급했다. 그 토큰이나 DB 비밀번호는 파일/채팅에 없고 실패 프로세스는 종료됐다. 기존 tokenSetup screenshot에는 생성 전 설정만 있고 실제 토큰 없음.

이번 읽기 전용 운영 사본 `.local-backups/production-readonly-20261109T154650326434Z/`는 46테이블/14파일, clubs1/profiles21/members14/meetings11/questions67/attendances92/reviews4/invites2다. 이전 사본보다 프로필/멤버 각1 증가하여 **오래된 백업으로 덮어쓰면 안 된다**. 당일 중단 후 최종 dump/파일 백업·실제 복원은 아직 미실행이다. 운영 UI는 기존 dpl_6CfNuZiDymJQPjdqN2Z9KeeG2Zxn/main378cc/도메인 유지 확인. canonical `/more/profile`은 로그인으로 이동했고 실제 운영 로그인은 안 했다. 후보 배포 ID는 아직 없다. 최신 코드 일부는 아직 uncommitted이므로 다음 작업에서 확인한다. 아래 ‘로그아웃 때문에 무조건 실행 보류’와 ‘운영 미승인’ 문단은 과거 기준이다.

최신 2026-11-10 KST: 사용자 요청은 **운영 실행 도구와 당일 최종 백업·실제 복원 검증 연결 준비**이며 운영 DB·배포 변경 금지와 데이터 보존 최우선이다. `production-cutover.py`(오프라인 기본/계획·단계 명령), `cutover-io.py`(고정 운영 대상/TLS/비밀번호 STDIN·파일 캐시 우회), `cutover-engine.py`(서버 실행·릴리스·단계/백업·복원 해시), `verify-cutover-backup.py`(네트워크 없는 새 로컬 DB 전체/public/파일 실제 복원), `rehearse-operational-cutover.py`, 안전 단위 검사를 추가했다. 기존 TEST/local 전용 도구의 운영 거절 제한은 그대로 유지했다. 운영/관리형 TEST 접속0·변경0·배포0·push0·main merge0, 앱/마이그레이션/환경/의존성 변경0이다. 공개 요약은 `docs/operational-backup-linkage.md`.

**새 운영 차단 사유가 최우선이다.** 전체 Auth 쓰기 차단 중 실제 관리형 refresh HTTP500이 설치된 `@supabase/auth-js 2.106.2`에서 저장 세션 제거/`SIGNED_OUT`으로 이어짐을 새 합성 응답 검사로 재현했다. 503→정상 응답은 재시도 후 유지된다. `scripts/check-cutover-session-risk.mjs`는 실제 네트워크/자격증명 없이 설치 SDK를 실행하며 `.local-backups/session-risk-20261109T153026788Z/verification-report.json`에 `production_safe=false`를 남겼다. 기존 서버 40/337 검사의 토큰 재사용 성공은 브라우저 SDK 세션 보존의 증거가 아니다. **`production-cutover.py`의 `PRODUCTION_EXECUTION_ENABLED=False`는 명시적 쓰기 플래그가 있어도 TTY/비밀번호/연결 전에 실제 세션을 거절한다. 이를 단순히 True로 바꾸거나 확인 JSON만 채워 운영 실행하지 말 것.** 기존 사용자 로그인 유지 요구를 충족하기 전 운영 승인/실행 단계로 진행하지 않는다. 이미 열려 있는 구 버전 탭 때문에 새 앱의 fetch 처리만 고쳐서도 충분하지 않다. 다음 실질 작업은 Auth 갱신을 유지하면서 업무·파일 쓰기 및 계정 삭제/식별자 변경을 보호하는 설계를 검토하고, 실제 Auth/SDK 동작과 동시 갱신 중 백업 정합성을 별도 시험하는 것이다. 아직 그 설계/구현은 하지 않았다.

새 연결 검증은 `.local-backups/operational-rehearsal-20261109T152117571438Z/verification-report.json`에 **4흐름·67개**, 3번의 전체/public/파일 실제 복원에 **각130개·합390개**(각50 COPY/2시퀀스/14파일), Python 안전 **59개(이전48+신규11)** 통과다. 네트워크 없는 새 로컬 컨테이너에서 실제 DB명 postgres/실제 부글부글 UUID/비슈퍼유저 postgres로 엔진을 실행했다. 정상전환/전체전환복구/02만적용후복구/전환전취소, 잘못된 실행·단계·옛 온라인 dump·손상 파일·가짜 passed 보고서·차단 해제/SQL 오류 롤백을 검사했다. 복원 승인 호출이 실제 검증기를 직접 실행하고, 아카이브 안 제어 행의 실행/릴리스/차단 시각도 검증해야 서버가 `backup_verified`로 바뀐다. 같은 서버 승인 묶음/보고서 해시가 없으면 비교·복구·재개 불가. `recovering`에서는 확인 실패 후 재개 불가, `recovered_verified`만 가능. 실패/legacy 보관본의 외부 FK를 끊고 별도 영구 쓰기 거절도 설치해 재개 후 계정 cascade 삭제를 방지했다(새 합성 계정 삭제를 ROLLBACK하는 검사). Auth/Storage는 복구 시 덮어쓰지 않는다. 원래 dump·manifest·파일/기존 로컬 DB 행은 그대로이며 시험 컨테이너는 모두 정리했다. `.local-backups/operation-run-20261109T152112832360Z/`는 오프라인 계획일 뿐 운영 승인/당일 백업이 아니다. `readiness-summary.json`에 소스 해시/검사 수/SDK 차단 사유가 있다. 모든 원시 dump/행/복구 SQL은 Git 제외·600으로 보관한다.

운영 연결 코드는 이번에 호출하지 않았다. 준비 기본 명령은 오프라인이며 실제 세션은 위 하드 차단 상태다. 파일/HTTP 전송 종료·다른 postgres 작업 중지·기존 관리자 세션/운영 도메인 확인은 외부 운영자의 실질 확인이 필요하고 체크 JSON의 true 자체가 자동 증명은 아니다. 실제 후보 배포/점검 일정/별도 승인/당일 최종 백업은 여전히 미실행이다. 아래 ‘운영 어댑터 미구현’과 ‘다음은 최종 백업 연결’ 문구는 이전 상태 기록이며 이 문단을 우선한다. 로컬 커밋만 허용, push는 사용자 직접, 운영/main 변경 금지 유지.

최신 2026-11-09 KST 배포후보 소스 준비 완료: 사용자 “다음 운영반영 준비, 운영 DB/배포 변경 금지·데이터 보존”에 대해 다음 단계인 **배포/복구 소스 고정·로컬 빌드**를 수행했다. Production DB 및 TEST DB 접속0/변경0, Vercel 설정저장0/배포0/push0/mainmerge0. `prepare-release-candidates.py`가 기존prep181source/온라인19자료·14files/296·40·92·23증거 + hosted337/b971862의4소스SHA + 승인6DB정리보존report검증→구main378cc runtime-only source(137files)와 maintenance patch정확2files(138), Preview565 runtime148files를tar.gz+filehash로고정. .env/.vercel/.git/.next/node_modules/scripts/supabaseSQL/백업데이터는앱tar에서제외; SQL3개는별도database-migrations에hash고정. 후보 maintenance-bridge(old+patch,MODE1), recovery-app(같은source,MODE0,oldDB복구후), single-club-app(565,MODE0,newDB필요). source파티션이므로근거없는local더미빌드업로드/Preview테스트DBbinary운영alias금지. `verify-release-candidates.mjs` + **기존설치 /opt/homebrew/opt/node@24/bin/node v24.16.0**로 defaultNext16.2.6build(Turbopack) **3개 + 모드/HTTP·source23checks 통과**, Python48(기존44+신규4). root기본node26전역변경안함. node_modules APFS COW별도복사, 더미JWT·localhost가짜Auth수신기·Node외부연결거절, 실제env키상속안함; test/prod/localDB전혀아님. 빌드후source불변·패키지/원본backup증거재대조, 3개workspaces/.next/서버정리. 최종증거 `.local-backups/release-candidates-20261109T143843928389Z/manifest.json`(생성시입력목록), `candidate-verification.json`(3/23·inputmanifestSHA), sources/*.tar.gz/baseline-source.tar.gz/SQL3개/logs. 첫기본sandbox localhostlisten EPERM시remote접속없는확대실행으로freshfolder재생성해성공; 이전실패폴더도보관. 새script/tests만변경, 앱/DBmigration/의존성원본그대로.

Vercel은CUA IAB에서읽기만(현턴초기탭0→임시탭1생성). Current Ready **dpl_6CfNuZiDymJQPjdqN2Z9KeeG2Zxn**, main378cc2e, 고정URL https://book-club-foa9xir5g-scone-s-projects.vercel.app, productiondomainbook-club-five-nu. main자동배포+도메인자동연결ON, Hobby, Node24.x/Next/빌드명령override없음/루트빈값/StandardProtectionRequireLogInON/공유링크0/우회secret목록empty/Prod환경10이름확인(원문reveal안함), retention표시30일/배포checks없음. 스냅샷구조화 `vercel-readonly-observation.json` 최종증거폴더. 공식Docs로 **Hobbyrollback직전prod만** 확인→old원래ID가두단계전이면rollback가정금지, **미승격 recovery-app 별도준비**. 승인후고정프로젝트prj_hKx77tEnplZb6H7gZuvCMKjRyiDE/scone-s-projects에`--prod --skip-domain`source별빌드/런타임MODE각각1/0; 현재main자동도메인설정끄지않아도skipDomain우선. Standard은Prod도메인제외생성URL보호이므로실제후보생성후로그아웃보호검사필수. 현재후보생성한상태아님, 기존Productionenv10내용쓰기안함. 미래CLI/deploy불가승인계속유지.

세션절차보완: 원래운영Cookie는다른후보host로자동공유되지않으므로후보URL에서기존관리자실로그인확인했다고주장금지. 후보Source/환경/보호+DB보존대조→승인된점검시간에운영도메인새앱으로옮기되DBguard유지→같은host의기존관리자세션/기록/files/익명검사→성공시에만unfreeze. 관리자세션유효성은중단전본인이확인, 실패시Auth차단을풀어서테스트하지않음. docscutover/execution-checklist의잘못된기존cookie공유가정도수정. **다음남은준비: 운영연결용실행경로/단계와당일finalfrozen fullDB+public+cacheNoncefiles/복원증거연결**(현재TEST용만, Productionadapter아직아님), 이후점검일정·담당자·별도승인. `production_ready/execution_allowed=false` 유지. 이번요청은운영실행승인이아님. docs/release-candidate-preparation.md가최신후보결과. 아래source후보아직미준비문구는과거기록.

최신 2026-11-09 KST 관리형 테스트 완료: 사용자 요청 “별도 테스트 환경에서 실제 실행 도구와 쓰기 차단·복구 검증, 운영 DB/배포 금지”를 수행했다. 신규 `scripts/test-cutover-executor.py`는 **teecqonbbmsritclbcyc/book-club-preview만 허용**하며 Production 프로젝트 입력은 인증 읽기 전 거절. 기존 local generator는 그대로 두고 검증된 body를 TEST 전용 assertion(runID/currentDB/session_user/단계)으로 감싼 별도 어댑터. TLSverify-full+고정세션pooler5432+기존 test-db-credentials.json을 메모리/STDIN으로만 사용, 키JWTref/role검사, migrations02/03/04이름·SHA고정. 직접 단독 실행은 읽기전용. `verify-hosted-cutover.py --run` + `hosted-cutover-http.py`가 실제 TEST 서비스와 같은프로젝트새합성DB(Production행/파일업로드없음;원본archive에서schema-only추출)+새network-none로컬복원2개를 나누어 시험. 최종 **337검사/실HTTP32건/Python안전44개 통과**. `.local-backups/hosted-cutover-20261109T123702465372Z/verification-report.json`;원본/frozen/afterJSON, frozen full/public dump, synthetic full/public/final dump, files/hash, sourceSHA, services/final-state도같은폴더. 실제TEST버전PG17.11/Auth2.197.0/REST14.18/Storage1.89.13. TEST기존계정4/프로필3/멤버3/일정3/파일1행정확보존. 실제46테이블guard누락없음→REST일반/service503;Auth로그인/갱신/메타수정거절;표준파일덮어쓰기/삭제/기존서명/TUS완료거절;모든frozen행/실파일동일;전체백업격리실복원;guard해제후같은pw/refresh/signedURL/TUS재개/파일bytes성공;추가계정/보이는파일·guard/control정리·원래triggers그대로. 원래운영백업hash/181source/26evidence 사전계획 --verify도성공. **이번작업운영네트워크접속0/운영변경0/배포0/환경·OAuth변경0/push0**.

합성managedDB에서는02실제SQL에divisionbyzero주입→행/ledger/stage불변,잘못된04순서거절→02/03/04각commit전새guard+ledger→all합성원본/fields/보관/Auth/Storage일치→publicOID/defaultACL유지+failed앱/ledger비공개격리+frozenpublic/Storagepolicy/원래이력복구→검증체크전unfreeze거절→recovered_verified후unfreeze→쓰기재개후옛복구SQL재실행거절. 합성DB관리형테이블 소유자는postgres(실서비스소유권과다름)이므로실제API권한검증은기존Preview에서따로함. S3/RPC는이전로컬40시험만, 이번managedS3/Google재시험안함;이미HTTP본문전송중강제종료시험아님. Production용연결adapter아직없고TEST용임. production_ready=false 유지,운영일정/배포후보/당일finalfreeze백업/승인남음.

도중schema필터복원에서auth등스키마생성문누락/전체복원중복, 합성book_author/location_name필수값, pooleridleDROP실패, 캐시된교체전파일GET문제를발견해검증기보완. cacheNonce+no-cache로freshGET후최종337통과(공식CDN문서링크docs). 실제기존데이터수정없음. 캐시실패run의추가계정/정확files는 --cleanup-fixture로원래행대조후정리(backupfolder123145…fixture-cleanup.json). 그실패run의미완료TUS비공개임시리소스는관리형만료까지남을수있음(기존파일아님), 최종성공TUS는완료/bytes확인/보이는파일정리. networknone local컨테이너2개정리완료(기존localDB복원/초기화없음).

**합성 DB 정리 완료(Production 승인 아님)**: 사용자가 질문의 정확한 6개 목록에 “백업한 합성 DB 6개만 삭제”로 명시 승인했다. approved-cleanup.py(비공개 증거 폴더의 일회성 도구)에서 고정6개/TEST프로젝트/소유자/실행ID/합성계정수/기존backupSHA를 재확인하고 전체새백업6개+목록검증을 모두 마친 뒤 6개 삭제·잔여0 확인. 대상은 cutover_rehearsal_0931ee334386, _3d22a46bbf1b, _366350ac649f, _3e492c5e0605, _dd7bd82a3737, _5c18f8e02ae9(각각fullprefix). 최초 사용자승인전 wildcard삭제는자동검토거절되어실행안했고, 이번승인후구체적명령은승인됐다. 첫정리시풀러유휴연결로삭제전중단→read-only상태/권한확인→승인된임시DB만 ALLOW_CONNECTIONS false/해당DB본인역할idle backend종료5000ms대기→일반DROP(noFORCE), 실패시그임시DB연결허용복구. 기존Preview postgres전체비교행/파일bytes전후정확동일, 운영접속0/배포0/환경변경0/push0. 완료증거 `.local-backups/hosted-cutover-20261109T123702465372Z/approved-cleanup-20261109T141458306687Z/cleanup-report.json`, 개별6삭제receipt·fresh-backup-manifest·before/afterjson, 원래inventory cleanup-inventory.json. 옛backup6+최종새backup6(총12)크기/SHA다시검증. 초기중단의추가backup6도별도보존. 기존데이터복원/삭제/초기화없음. 정리승인은완료되었으므로재질문/재삭제금지. **운영반영승인은여전히없음**. 상세docs/hosted-cutover-verification.md, 아래미시험/대기기록은과거상태.

최신 2026-11-09 실행 절차 준비(운영 미접속): 사용자가 흐름 요약 후 다음 준비를 요청했다. 운영 변경/점검/배포/main 병합 금지를 유지하며 **오프라인 입력 검사와 실행 체크리스트**까지만 준비했다. `scripts/prepare-single-club-cutover.py`는 고정 프로젝트/클럽, Preview565의 앱·설정·전체 migration 파일 목록과 바이트, 리허설1d3b0ba의 도구, 02→03→04 해시, 실제 백업·자료19개, 40/92·296·23 보고서를 대조해 `.local-backups/cutover-plan-20261108T155653242038Z/plan.json` 생성 및 `--verify` 재검증 성공. 네트워크/DB/비밀값 조회·SQL·배포 기능 없음. 기존 온라인 manifest는 바꾸지 않고 최종 백업으로 승격 거절. 로컬 계획은 승인 토큰/전자서명/실시간 차단 근거/SQL 실행기가 아니며 execution_allowed/production_ready=false 고정. 입력 변경 시 이 도구가 실패할 뿐 실제 SQL 실행을 강제로 막는 운영 실행기는 아직 아님. 안전 단위 검사35개 통과(기존29+신규6). docs/production-execution-checklist.md에 남은 준비·승인 후6단계/중단 기준·쓰기 재개 전후 복구 경계 정리; single-club-cutover.md의 낡은 게이트웨이/DB·Storage 전체 덮어쓰기 설명을 실제 시험한 public 범위 복구로 수정. **다음 구현은 관리형 Preview에서 시험할 대상/단계 확인 실행 경로**이며 아직 수행 안 함. 실제 운영 승인/점검 시간/당일 최종 DB+public복구덤프+모든파일백업복원은 남아 있다. 이번엔 운영/Preview/기존로컬DB/원본백업 변경0, 새 네트워크 접속0. 앱·마이그레이션 그대로, 로컬 커밋 가능/push 사용자 직접.

최신 2026-11-09 KST 쓰기 차단·복구 조사 완료(운영 미적용): 사용자 요청은 운영에서 쓸 실제 방법 확인이며 **운영DB/배포변경 금지·데이터보존 최우선** 유지. 권장 후보는 앱 점검 화면+임시 BEFORE STATEMENT 거절 트리거. `session_user`가 직접 postgres인 운영자만 허용하므로 서비스-role/RLS우회/SECURITY DEFINER에서도 HTTP DB로그인역할을 기준으로 차단한다. 공식 Supabase managed-schema trigger 허용 기능이며 전용 유지보수 기능이 보증됐다는 주장은 아님.

운영에는 GET 및 Management API `read_only:true` SELECT만 사용했다. 권한은 public/auth/storage45개중41개TRIGGER 가능, 제외4개는 auth/storage마이그레이션이력 및 비활성벡터테이블2개. S3enabled=true/vector=false/진행MPU와parts=0조회. Supabase UI 세션만료로 owner로그인요청→'로그인할게요'답변후실제로로그인확인. 탭18 settings/general읽기만, Save disabled, pause/restart/upgrade안누름. UI는Auth2.197.0/REST14.18/DB17.11.0.003, Storage버전없음. 기존 service-role을API에서메모리로만읽고 **GET Auth admin/users 1건 및 Storage bucket목록**후pg_stat_activity READONLY조회하여 실제로그인역할Auth=supabase_auth_admin/Storage=supabase_storage_admin(PostgreSQL application_name `Supabase Storage API 1.89.13`)/REST=authenticator확인. 키저장·출력없음. 세션생성/로그인/갱신/수정요청안함. 최종운영13개테이블 기존기록이13:50기준과동일, source dump와사전manifest자료19개(실파일14개)해시그대로. 운영mutation0/배포0/Preview DB변경0. 증거 `.local-backups/write-barrier-audit-20261108T141720527220Z/`의 capabilities/config-redacted/live-service-principals/final-preservation/verification-summary.json; 포인터 write-barrier-audit-current.json. `production_ready=false` 유지.

로컬 새Docker컨테이너만 시험: 신규 `scripts/write-barrier-sql.py`는 runtime_verified/single_club_rehearsal만 허용하고 기본 운영 DB명 postgres 거절(생성SQL도 현재DB·session_user검사). 직접 운영 실행 도구가 아님. `scripts/local-write-barrier.mjs` + `verify-local-service-flow.py --write-barrier-rehearsal --write-barrier-matching-services` 최종 **40흐름+92원본보존/파일14** 통과. 같은 Auth2.197.0/REST14.18/Storage1.89.13 공식이미지 별도pull·내부네트워크 사용, 기존로컬서비스교체/로컬.env수정없음. REST/SDF RPC/AdminAuth생성삭제·로그인/refresh/수정, 표준파일교체삭제/기존서명URL, TUS·S3신규/기존분할ID의진행·완료·취소차단, 읽기·전체DBdump복원·해제후같은토큰/URL/업로드재개성공. 차단전후 모든DB행과파일백엔드바이트일치. 최종 `.local-backups/local-write-barrier-20261108T153144751004Z/verification-report.json`, browser-report.json이란내부파일명이나이시험은브라우저UI가아닌실제HTTP/SQL/S3시험. source이미지와preservedchecks보고서참조. localStoragev1.60은prod의partialuniqueindex와안맞아기본upload42P10실패(차단통과로계산안함);호환공식1.84.32로검증후실제운영버전1.89.13확인해일치버전으로최종재검증. 새fs-xattr API setAttribute를기존set과호환처리. 원본백업수정안함. Docker새이미지만캐시에남고시험컨테이너/네트워크/복사앱정리확인.

`verify-production-restore.py --postgres-rehearsal --write-barrier-rehearsal` 최종 **296검사** `.local-backups/production-restore-verified-20261108T153150952866Z/verification-report.json`. 구DB에guard→02/03/04 COMMIT직전새테이블guard+동일Tx이력등록→원본보존→**쓰기를재개하기전**구앱구조·RLS/Storage정책·버전이력복구→guard해제. 처음public스키마rename복구는supabase_admin DEFAULTACL재생성권한부족으로실패해제품아닌로컬복구안을고침. 최종은**public스키마OID/defaultACL보존**, 앱테이블/함수/enum/seq만cutover_failed_public으로이동→frozen public전용덤프를DEFAULTACL TOC제외하여postgres로복구. Auth/Storage데이터그대로, Storage정책원상복구, 실패이력copy후신규3버전만라이브ledger정리,원래24이력보존. 실패변환데이터도비공개정확보존. 기존Realtime대상/API NOTIFY reload schema확인. 원본49COPY/2seq/14파일도검증. public/defaultACL관리형권한상승없이실행. 복구SQL/원시행은ignored폴더Mode600. 쓰기재개후이방식즉시복원금지, 새기록보존/병합계획먼저.

Python 안전회귀29개통과. 새원격배포/ProductionSQLexecutor/push 없음. 다음준비는 운영실행용 대상/단계확인장치와관리형Preview사전시험(권장), 진행HTTP본문종료·다른postgres관리도구중지·점검시간/담당자·최종중단DB/파일백업복원·별도운영승인. local은PG17.6(운영17.11계열)/파일백엔드(운영관리형객체저장소)이므로그차이와운영에서차단직접시험안한범위를명시. protocol ID진행/재개는시험했으나guardcommit시이미본문전송중인HTTP강제종료를시험했다고주장금지. 실제원격업무중단은전혀없음. docs/single-club-cutover.md의2026-11-09절이최신이며아래'지원문의필수/수단미확정'기록은이전상태. 문의/외부메시지는전송안함. 로컬커밋가능,push는사용자직접/mainmerge·운영DB/배포금지계속.

최신 운영 준비(운영 미접속): 사용자 요청으로 다음 안전 준비를 수행했다. `scripts/verify-maintenance-bridge.mjs`가 구 운영 커밋378cc2e+기존점검패치만 새ignored복사본에 적용하고 외부통신차단+가짜loopbackAuth API로 next build --webpack 및 18개실제HTTP(업무/OAuth/API/가상Action/RSC/변경메서드)503/no-store/retry60, 백엔드호출0, 점검해제200+가짜Auth양성대조 등 총23검사통과. Sentry /monitoring은SDK가미들웨어를건너뛰는기존예외라전URL503주장금지. 정적자원도예외. 첫시도/두번째검사의Sentry404·SSR클라이언트로그인표시가정오류는검증기기대값을수정했고제품코드변경없음;최종 .local-backups/maintenance-bridge-20261108T140830800Z/verification-report.json. `scripts/verify-readonly-freeze-limit.py`는 새내부Docker(DB/REST/helper,외부통신/공개포트없음)에합성canary만만들어DB읽기전용기본값on뒤에도기존연결/일반로그인BEGIN READWRITE/실제PostgREST PATCH쓰기가성공함을재현. .local-backups/freeze-limit-20261108T140555088161Z/verification-report.json. 임시서버/복사본/컨테이너/네트워크정리완료,기존로컬DB수정없음. 공식SupabaseKB 2026-11-04 전용유지보수모드없음/softfreeze한계,NetworkRestrictions는DB만이며Auth/REST/Storage API제외를확인. **운영쓰기차단수단은아직미확정**,상상한게이트웨이가준비된것처럼문서쓰지않도록 cutover step2수정. 다음필수관문은원래API도메인Auth/REST/RPC/Storage·service-role/진행업로드쓰기차단+관리자백업읽기를지원할실제수단/플랜지원여부확인및별도시험. 지원문의용항목을docs/single-club-cutover.md끝에준비,실제문의전송안함(명시권한없음). 원본dump및사전manifest자료19개(원본파일14개)해시/크기동일,앱/의존성/마이그레이션은Preview565동일. 종합 .local-backups/cutover-preparation-20261108T141111811264Z/verification-summary.json production_ready=false. 이번turn 운영/테스트Supabase·Vercel연결/변경/배포/점검활성화없음. 원래온라인백업을최종백업이라고간주금지. docs preflight/cutover/readiness/PR갱신. 로컬문서·준비도구커밋가능,push사용자직접/운영DB·배포·mainmerge금지계속유지.

최신 Preview Google 완료: 소유자가 새 클라이언트를 직접 발급하고 Downloads의 JSON 경로만 제공했다. 파일 내용은 메모리에서 검증/사용, 운영 Google ID와 다른 신규 ID·고정/브랜치 Preview 원본2개·테스트 Supabase callback1개를 확인. `.local-backups/preview-google-configuration-20261108T135048313280Z/configure-test-google.py --apply`가 테스트 teecqonbbmsritclbcyc에만 Auth PATCH1회(제공자/ID/Secret/nonce생략false/site_url브랜치/허용callback·next변형4개)를 보냈다. 최초 비밀키 원문readback 가정으로 비교실패했으나 재쓰기/재발급 없음. 조회값은 원문 및 단순SHA256과 달라 원문검증 주장금지; 실제OAuth성공으로 기능확인. 최종 `final-verification.json`은 Google실제연결true/운영config전체지문동일/테스트기타설정동일/운영쓰기0. 브랜치 Preview 새탭17에서 Google버튼→기존 소유자Google SSO/승인 재사용으로 계정선택·추가동의 없이 `/signup?next=%2Fmeetings%2F57e...` 도착. 화면이메일은 새testAuth계정과일치, reload세션/가입전모임차단도확인. 이름완료/승인/회원권한부여는안함. 초기기록31개테이블 기존행보존, 허용변화는 testAuth사용자+1/Googleidentity+1뿐. 테스트현재Auth4/프로필3/회원3/일정3/파일1, 운영Auth23/일정11/파일14와dump해시그대로. 원래immutable Preview멤버탭13/15 세션건드리지않고 새Google탭17 markDeliverable. 현재탭은가입이름화면이며정상. 증거folder포인터 .local-backups/preview-google-current.json, 원시before/after에실데이터있어Git제외유지. google-login-verified.jpg와browser-google-report.json,google-preservation-report.json 참조. 아래발급대기는이전상태. 다음 운영준비는 외부Auth/REST/RPC/Storage 쓰기차단의 구체수단검증과최종중단백업절차이며 운영DB/배포/mainmerge계속금지. push는사용자직접, 문서수정만로컬커밋가능. Kakao/Gemini미설정, Google가입승인이후회원흐름은미실행.

최신 Preview Google 사전 점검: 테스트 teecqonbbmsritclbcyc의 Google은 false/ID·Secret없음, site_url localhost3000/uri_allow_list빈값. 로컬 Google ID는 운영과 동일했다. CUA로 Google Cloud book-club-498111의 클라이언트 목록에서 기존 운영 book-club 웹 클라이언트 1개만 확인. 새 book-club-preview 웹 클라이언트 입력 양식(고정/브랜치 Preview 원본 2개, 테스트 Supabase /auth/v1/callback 1개)을 탭16에 준비하고 **만들기 누르지 않음**, markHandoff. 소유자에게 직접 만들기·JSON 다운로드 후 파일경로만 답하도록 비동기 질문 중(인증정보 채팅금지). 발급/테스트 Supabase 설정/실제 Google 로그인은 아직 미완료이며 기존 운영 클라이언트·공통 동의화면·운영 Auth를 변경하지 않았다. 전후 운영13/테스트18개 테이블 비교대상 동일, Auth config 전체 지문 동일, 원본 dump 해시 동일. 테스트는 사용자 추가 일정 포함 현재3개, 초기화 금지. 증거 .local-backups/preview-google-20261108T133657043756Z/, 포인터 .local-backups/preview-google-current.json. auth-config-baseline.json은 안전 요약/지문만, before/after-records는 비공개. google-client-ready.jpg는 Secret 없는 입력화면이다. 다음은 소유자 JSON 경로를 받아 신규 ID가 운영과 다르고 승인 URI가 테스트만인지 검증→테스트 프로젝트만 고정 대상 PATCH→prod config/records 재대조→브랜치 Preview 로그인으로 owner 직접 인증. 현재 immutable Preview에 사용자 탭15의 새 일정 ae0cb301-b995-4de2-88a3-b527945b2134가 있어 세션/일정 변경 금지. mainmerge/운영DB변경/운영배포금지, push사용자직접 유지. 상세 docs/hosted-preview-verification.md의 Google 사전점검 절.

최신 실제 Preview 완료: 사용자가 직접 `git push -u origin codex/single-club-transition`을 실행했다. 원격 작업브랜치=565c6cea6fb9e5e9a3447ee46ea8f6a22ed023dd, main=378cc2e 유지. Vercel dpl_2Z2S2TfsiEXnpgHMrALxXpD7ejuB, Preview/Ready, 고정 https://book-club-2kuklxtnz-scone-s-projects.vercel.app (브랜치 https://book-club-git-codex-single-club-transition-scone-s-projects.vercel.app). IAB 탭13에 새 Preview를 열고 관리자/멤버/대기 시험계정으로 실제 브라우저22개확인 완료: 로그인/잘못된암호안내/새로고침세션/과거모임/실제클릭PDF한글이름+597바이트해시/권한404/대기차단/기존URL/로그아웃/next목적지유지. 실제관찰Auth resource는 teecqonbbmsritclbcyc.supabase.co 하나. 직접스크립트검사는Vercel인증보호로막혀우회안함(번들검증미실행). 다운로드waitForEvent는타임아웃이나실제파일저장확인; Downloads의 미리보기-테스트.pdf,(1),(2) 모두시험PDF일치하고새로생성됨. 계정암호는비공개fixture파일을메모리로만읽어사용,실회원데이터복사없음. 업무변경버튼은누르지않음. 사후 운영13/테스트18개테이블 비교대상업무/보관/마이그레이션/계정ID·암호해시·identity/Storage행 모두동일(정상로그인시각·세션행제외). 원본dump해시유지. 운영Vercel도기존main378cc/Ready/book-club-five-nu 유지. 로컬tsc/단위66통과. 증거 .local-backups/hosted-preview-20261108T131327152820Z/{browser-report,preservation-report,browser-download-verification,member-download-verification}.json, verified-preview.jpg 등. 로컬재현기준도구는그폴더preservation-check.py before|after(일회성파일이미있어재실행전경로조정필요),공개요약 docs/hosted-preview-verification.md. 탭13은일반멤버시험계정으로지난모임에로그인한상태로deliverable유지. **Preview Google제공자/허용반환주소·Kakao/Gemini는미설정/미검증**. 다음은필요한Preview제공자설정과외부쓰기차단수단시험·최종중단백업준비. mainmerge/운영DB변경/운영배포금지유지. 이후문서커밋만로컬에추가하며push는사용자직접이라는방침유지. 아래'새Preview미실행'기록은이전상태다.

최신 완료: 사용자가 --resume 실행 성공을 보고했고 `.local-backups/preview-isolation-20261108T112238765928Z/vercel-env-20261108T123216739088Z.json`을 실제 확인했다. applied/preview_variables_verified/production_records_preserved=true, Production 기존10개ID유지, 값쓰기0, 신규배포없음. Secret원문검증=false 한계 유지. Vercel 새로고침으로 Preview에 testDB URL/anon Config·service-role Secret 3개가 Preview전용, Production에는 기존 DB/메일/Google 항목이 Production전용임을 확인했다. Preview공개URL을 표시해 https://teecqonbbmsritclbcyc.supabase.co 를 확인했고 실제비밀값은 펼치지 않았다. 메일/Google프로덕션키 Preview제외, Sentry토큰공유와 자동배포설정은기존유지. 운영DB8개테이블모든행 최초기준동일,Auth23/Storage14/운영마이그레이션01/원본dump해시동일(`production-preservation-after-separation.json`). UI증거 preview-final-ui.txt,production-final-ui.txt. **신규 Preview DB 연결 분리 선행조건은 완료**다. 기존Preview배포의 옛값은소급제거안됨, 접근보호유지. 새Preview배포/앱요청검증은미실행. push는사용자직접한다는방침유지,mainmerge/운영배포계속금지. 다음은분리된Preview배포후앱검증과 외부쓰기차단수단시험(운영아직미구성). 이번임시토큰은소유자폐기가능. docs/preview-isolation.md 최신. 아래중단/재개대기기록은이전상태다.

최신 환경 분리 오류 진단: 사용자가 소유자 API토큰을 숨김 입력해 첫 --apply를 실행했고 `.local-backups/preview-isolation-20261108T112238765928Z/vercel-env-20261108T121218703902Z.json`에서 RESEND_API_KEY의 Preview 제외 한 건 뒤 보존 비교로 중단됐다. DB키/Google키 변경은 아직 없다. --inspect 추가 후 사용자가 실행했고 `vercel-inspection-20261108T121648466560Z.json` 저장 확인: 차이는 해당 Resend ID의 visibility null→secret 한 건뿐. 모든 기존 API value는 빈 문자열(실제 비밀값 읽기 불가)이었다. 기존 도구가 표시정보/빈값지문을 실제 보존과 혼동한 점을 인정하고 수정했다. 새 --resume은 해당 실패의 GET-only 진단과 최신 상태/완료 scope를 대조한 후 해당 ID의 sensitive null→secret 보완만 허용하고 나머지 요청을 이어간다. 일반 --apply는 미해결 실패 있으면 차단한다. 토큰은 계속 비저장/소유자 입력. 실제 실패 형태 재현을 포함 Python26개 통과. 운영 8개 업무 테이블 전체 행 동일, Auth23/Storage14/마이그레이션01/원본dump해시 유지(`production-preservation-after-stop.json`). 소유자에게 `python3 scripts/separate-preview-env.py --resume` 실행을 비동기로 요청했다(결과 대기). 운영 값 PATCH/운영DB쓰기/배포/push 없음. Secret 원문 동일함을 직접 검증했다고 주장하지 않는다. 상세 docs/preview-isolation.md 최신. 아래의 'API 인증 대기/미실행' 문구는 첫 실행 전 기록이다.

최신 Preview 분리 작업: 사용자가 별도 테스트 DB/Preview 연결 분리를 명시 승인했고 운영 연결/기록 유지·운영 배포 금지를 재확인했다. 무료 조직에 `book-club-preview` (`teecqonbbmsritclbcyc`) 생성, 빈 DB에 27개 마이그레이션 적용. 실제 데이터 복사 없이 무작위 암호의 시험 계정 admin/member/pending 3개·일정 2개·질문/초대·새 PDF 1개를 만들고 실제 Auth/REST/Storage 검사 11개 통과. 운영 8개 업무 테이블은 전후 모든 행 동일, 계정23/파일14/운영마이그레이션01/원본dump해시 유지. 증거 `.local-backups/preview-isolation-20261108T112238765928Z/`, 포인터 `.local-backups/preview-isolation-current.json`. **Vercel 연결은 아직 공용이며 분리 완료가 아니다.** Secret Edit의 Environments가 disabled, Preview 동일명 추가는 충돌로 거부. 자동 검토가 플러그인(범위불명확) 및 공용항목 Delete 흐름을 거부하여 우회하지 않았다. Preview Branch Tracking은 일시 off가 반영됐지만 on으로 원상복구했고 확인했다. Production 변수/배포 설정·운영 DB·push/merge/deploy 변경 없음. 사용자는 기존 Vercel API토큰이 없다고 답했다. `scripts/separate-preview-env.py`는 소유자가 임시 팀 토큰을 getpass로 입력해 실행하도록 준비했다: scope-only PATCH로 Production 값/ID 보존, Preview에만 테스트 키 생성, 삭제/배포/Production 값 쓰기 차단. 6개 안전 가드 포함 Python21개 통과. 실제 API실행은 인증 대기. 임시토큰을 직접 생성하고 `python3 scripts/separate-preview-env.py --apply` 숨김 입력 실행 가능한지 비동기 질문을 보냈다(답 대기). `docs/preview-isolation.md`가 최신 안내. 이전 '미리보기 분리' 계획을 완료로 오인하지 않는다. 아직 push 금지, 실제 Preview 배포도 없음. Google Preview는 미설정이며 시험 이메일 로그인만 검증했다. 새 토큰은 채팅/파일/인자/로그에 받지 않는다.

최신 운영 준비 점검: Vercel 로그인 후 읽기 전용으로 실제 환경을 확인했다. Supabase URL/anon/service-role, Resend와 Google 변수는 Production/Preview 공용이다. Preview 자동 Branch Tracking, main 운영 배포+도메인 자동 연결이 켜져 있고 Vercel Authentication Standard Protection도 켜져 있다. 설치된 프로젝트 Integration은 없다. 원격 설정 변경/배포/push 없음. **Preview 운영 연결을 분리하기 전에는 현재 작업을 push하지 않는다.** 운영 DB는 `supabase_read_only_user`/읽기 전용으로 역할·소유권·supautils 정책 허용과 최신 버전01을 조회했다. 비밀값 조회/저장/출력 없이 이름·범위만 확인했다. 운영과 같은 비슈퍼유저 postgres로 오프라인 복원본의 02→03→04 실행과 228개 보존 검사 통과. 증거 `.local-backups/production-restore-verified-20261108T111156832783Z/verification-report.json`, 카탈로그 `.local-backups/production-permissions-20261108T111012472185Z/catalog-audit.json`. 검증 도구에 `--postgres-rehearsal` 추가. README의 모든 환경 동일 설정/앱 push 후 DB 적용 안내를 수정했다. 상세 `docs/deployment-readiness-audit.md`. 다음은 승인된 범위에서 Preview만 별도 시험 DB/메일/OAuth로 분리하는 작업이며 아직 원격 변경 승인/실행 전이다. 이후 실제 외부 쓰기 차단 수단을 확정·시험해야 한다. 운영 전환은 계속 금지. 아래는 이전 단계 기록이며 최신 상태는 이 문단과 해당 문서를 우선한다.

Google 실제 인증 결과 확인 완료: 사용자가 “이름 입력·가입 안내가 보여요”라고 답했고, IAB 탭 6의 실제 `/signup`과 인증된 이름 입력 화면을 읽기 전용으로 확인했다. 새 로컬 Auth 사용자 1명/Google identity 1개가 생성됐고 프로필/멤버십은 아직 없다. 동일 제공자 식별자가 운영 백업의 기존 관리자 identity와 일치하며 운영 프로필과 관리자 역할도 보존되어 있다. 원래 로컬 모임/회원/파일/보관 기록 및 기존 인증 ID·비밀번호 해시·Google subject는 그대로다. 운영 dump 해시도 동일. 증거 `.local-backups/google-oauth-check-20261108T103306740995Z/google-login-preservation.json`. 이름 등록·가입 승인·계정 삭제는 수행하지 않았다. 운영 DB 접속/설정·Google 콘솔·push·배포 변경 없음. 아래의 Google 인증 대기 문구는 이전 단계 기록이다. 최신 범위는 `docs/google-oauth-check.md`를 우선한다.

현재 Google 단계: 사용자에게 실제 계정 선택/동의 가능 여부를 물었고 “네, 직접 진행할게요” 답을 받았다. 로컬 Google client ID/secret은 실제 형식으로 설정되어 있고 반환 주소는 `http://127.0.0.1:54321/auth/v1/callback`이다. 실제 동의/최종 화면 결과는 아직 대기 중이며 Google 성공으로 기록하지 않는다. 로컬 앱을 `pnpm dev`로 재시작했다(실행 세션 46700). 사용자 Google 인증 코드가 dev 요청 로그에 있을 수 있으므로 이 세션의 원시 출력을 무심코 읽거나 출력하지 않는다. IAB 탭 6에 `http://localhost:3000/login?next=%2Fmeetings%2F20000000-0000-0000-0000-000000000002`를 열고 사용자가 직접 인증하도록 안내했다. 완료 결과 질문도 비동기로 요청했다.

콜백의 코드 교환 오류 무시 문제와 제어문자 next 주소의 외부 이동 가능성을 보완했다. 로그인 실패/취소는 안내와 원래 내부 목적지를 유지한다. 단위 전체 66개·타입 검사·별도 복사본 운영 빌드 통과. `.local-backups/google-oauth-check-20261108T103306740995Z/`에 기존 17개 테이블 스냅샷/현재 보존 결과와 빌드 로그가 있다. 현재 원래 기록/인증 ID·비밀번호 해시는 보존됐고 새 Google 계정/identity는 아직 관찰하지 않았다. 사용자가 완료하면 UI와 전후 보존을 다시 확인해야 한다. 상세 `docs/google-oauth-check.md`. 운영 DB/설정·Google 콘솔·push·배포 변경 없음.

최신 후속: 별도 복원 DB + 실제 로컬 Auth/REST/Storage + 앱/Playwright로 이메일 로그인, 잘못된 비밀번호, refresh token, 새로고침, 로그아웃, 역할별 이동, 기존 자료 6개 클릭 다운로드와 전체 파일 14개 HTTP 해시를 검증했다. 18개 흐름·92개 보존 검사 통과. 기존 23개 계정·identity·비밀번호 해시, 모든 기존 앱/보관/파일 객체 행, 원래 로컬 DB 17개 테이블과 dump/manifest는 유지됐다. 임시 계정 4개만 별도 복원본에 추가했다. Storage 기동 시 내부 storage.migrations 해시 1건만 재계산됐으며 ID/이름/시각/80개 건수는 동일했다. 외부 통신이 없는 내부 Docker 네트워크와 localhost 게이트웨이를 사용했고 모든 시험 서비스/앱/네트워크는 정리했다. 운영 연결 없음. 요약 `docs/local-service-flow-verification.md`, 원시 보고서 `.local-backups/local-service-flow-20261108T100907061916Z/verification-report.json`, 재현 `python3 -B scripts/verify-local-service-flow.py`. 실제 Google 계정 외부 인증은 미실행이며 운영 역할·배포 환경·쓰기 차단·최종 백업 검증은 계속 남아 있다.

최신 진행: 실제 운영 아카이브 `.local-backups/production-dump-20261108T052113760121Z/database.dump`의 격리 복원·전환 데이터 보존 검증을 완료했다. 운영 연결 없이 `--network none`인 별도 로컬 컨테이너에서 전체 복원, 아카이브 원본 49개 COPY 블록·시퀀스 2개·RLS 정의·파일 14개를 대조하고 두 번째 복원 DB에 02→03→04를 적용해 모든 기존 기록 보존을 확인했다. 226개 검사 통과. 실제 사용 중인 로컬 DB 17개 테이블도 전후 동일했다. 모든 시험 컨테이너는 정리했고 원래 백업/manifest는 유지했다. 생성 당시 manifest의 restore_verified=false를 고치지 않고 옆에 restore-verification.json을 추가했다. 최종 원시 보고서는 `.local-backups/production-restore-verified-20261108T053618984183Z/verification-report.json`, 공개 가능한 요약은 `docs/production-restore-verification.md`, 재현 도구는 `scripts/verify-production-restore.py`다. 역할은 비밀번호 없는 로컬 정의로 초기화했으며 스키마 예행연습은 격리 DB의 supabase_admin으로 수행했다. 실제 운영 역할 권한·Auth/OAuth·파일 HTTP 서비스 검증과 쓰기 중단 후 최종 백업은 남아 있다. 운영 DB/설정·push·배포는 계속 변경하지 않았다.

아래의 “운영 덤프/복원 미실행” 문구들은 이전 단계 당시의 기록이며 최신 상태는 위 문단을 우선한다.

백업 도구 두 번째 후속 수정: 사용자의 접속은 성공했지만 `PGOPTIONS`의 적용을 가정한 읽기 전용 확인에서 중단됐다. 명시적 `BEGIN READ ONLY` 안에서 상태·DB·부글부글 ID를 JSON 확인하고 롤백하도록 수정했다. `pg_dump` 자체의 읽기 전용 트랜잭션을 사용하고 잠금 대기 제한은 `--lock-wait-timeout=5s`로 지정한다. 로컬 새 임시 DB에서 기본 off → 트랜잭션 on, 쓰기 차단, 덤프·목록·복원, 원본/복원 기록 일치를 끝까지 검증했고 안전 가드 단위 테스트 9개 통과. 운영 데이터/역할/기본 설정은 변경하지 않았다. 실제 운영 덤프는 사용자 터미널에서 같은 명령으로 다시 실행해야 한다.

백업 도구 후속 수정: 사용자가 실행 시 연결 오류를 보고했고, 비밀번호 없이 재현한 결과 시스템 CA에 Supabase 루트가 없어 TLS 인증서 검증이 실패한 것이었다. `scripts/certificates/`에 공식 공개 CA를 추가하고 백업 도구가 검증된 파일을 임시 로컬 컨테이너 경로로 전달하도록 수정했다. `verify-full`과 읽기 전용 옵션은 유지했다. `--diagnose`로 실제 운영 경로의 TLS/호스트 검증을 통과했고 비밀번호 인증/전체 덤프는 아직 사용자 터미널 입력이 필요하다. 원시 오류를 숨기되 원인별 한국어 메시지를 제공한다.

운영 반영 준비: `codex/single-club-transition` 브랜치로 분리했다. 기준은 원격 main `378cc2e`이며 구 로컬 HEAD와 파일 내용은 동일하다. 운영 읽기 전용 API에서 `transaction_read_only=on`을 확인한 후 46개 테이블의 레코드 및 파일 14개를 `.local-backups/production-readonly-20261108T045110487853Z/`에 사전 복사하고 해시를 검증했다. 이 사본은 전체 DB 덤프/복원 검증을 대신하지 않는다. 조회된 자동 백업은 0개, PITR 비활성화다. 사용자는 기존 DB 비밀번호를 보관하고 있다. 본인 터미널에서 `python3 scripts/production-db-dump.py`를 실행해 숨김 입력할 수 있도록 준비했으며 실제 운영 덤프는 아직 실행 전이다. 상세 결과와 다음 순서는 `docs/production-preflight.md`, 미등록 PR 초안은 `docs/single-club-pr.md`다. 이 준비 작업은 운영 데이터·권한·설정 변경, push·배포를 하지 않았다. 이후에도 전체 아카이브·파일의 격리 복원 검증과 외부 쓰기 차단 검증 전에는 운영 전환하지 않는다.

1·2·3단계 화면/서버/DB 전환과 이전 구조 정리·회귀 검증을 로컬에서 완료했다. 운영 DB에는 2단계 전환을 적용하지 않았고 배포도 보류 상태다. 과거 기록의 "다음 단계"보다 이 문단과 README·docs/bootstrap.md를 우선한다.

데이터 보존이 최우선이다. 기존 로컬/운영 데이터를 초기화하거나 보관 스키마를 삭제하지 않는다. 승인된 멤버·관리자 권한과 계정·일정 ID·초대코드·파일 경로를 유지한다. 복구 가능한 DB/Storage 백업은 Git에서 제외한 `.local-backups`에 있다.

현재 코드: `lib/auth/membership.ts`, `lib/actions/club.ts`, `lib/services`, `lib/queries/club.ts`. 기존 `/clubs/…` 주소는 호환 연결만 제공한다. DB 구조는 `club_settings`·`members`·`invites`, 원래 테이블은 비공개 `legacy_multiclub`에 보관한다. 데이터 이동 전후 비교·복원·실패 롤백·빈 DB 초기 설치를 검증했다.

통합 테스트는 고정 로컬 컨테이너에서 매 시험을 롤백한다. 과거 다중 그룹 테스트 원본(`.ts.legacy`)은 실행하지 않는다. 기존 `resetDb` 방식도 사용하지 않는다. 최종 단위 31개·DB 통합 52개·조회 전용 브라우저 4개, 타입 검사와 빌드가 통과했다. `.local-backups/phase3-before.json`과 비교해 현재·보관 17개 테이블의 기존 레코드 및 계정 식별·인증 정보가 보존된 것을 확인했다. 화면 테스트는 기존 기록을 읽으며 회원·일정·참석·한줄 평을 수정하지 않는다. 보존 비교: `node scripts/check-local-records.mjs snapshot|compare .local-backups/파일명.json`.

추가 보완: 마이그레이션 04로 과거 참석 DB 우회 차단, 보관본의 외부 FK 분리 및 쓰기 거절을 적용했다. 03의 대상 선택은 검증된 UUID 기준으로 변경했다. 대표 데이터(실제 PDF·한글 파일명·세 공개 방식의 평·탈퇴/대기 사용자·OAuth identity·초대 만료/취소) 리허설 19개 검증을 통과했다. 최종 단위 39개·DB 통합 60개·브라우저 4개 및 빌드 통과. `hardening-before.json` 대비 현재/보관 17개 테이블 보존을 확인했다.

운영 절차는 `docs/single-club-cutover.md`, 구 버전 호환 점검 패치는 `scripts/maintenance-bridge.patch`다. 앱 점검 모드는 준비했지만 운영 게이트웨이에서 Auth/REST/Storage 직접 쓰기를 막는 설정은 아직 실행하지 않았다. 이 검증 전에는 운영 전환하지 않는다. 운영 배포·DB 변경은 계속 보류한다.

---

아래는 2026년 6월 당시의 학습·작업 기록이며 현재 동작 설명이 아니다.

# HANDOFF — 부글부글 앱 단단하게 만들기 (운영 안정성 트랙)

## Goal

사용자(`EUNJEONGMUN`)는 Java/Spring 백엔드 경력 + 현재 C/Nonstop Net24 환경 근무자. **첫 웹앱(Next.js 16 + Supabase + Vercel)을 만들어 운영까지 배포 완료**. SQL 기본기·Git PR 흐름은 익숙하지만 **프론트(React/Next/Node)는 약함**. 앞으로 8주에 걸쳐 앱을 단단하게 만들면서 자연스럽게 프론트/운영 역량을 보강하는 게 목표.

전체 로드맵 (단계별, 각 ~1주):
1. ✅ **관찰 도구 셋업** (Sentry + Vercel Analytics + Speed Insights) — **완료**
2. ✅ **CI/CD 안전망** (GitHub Actions + main 브랜치 보호) — **완료**
3. ✅ **Server Action 단위 테스트** (인프라 + 보안 핵심 3개 / 12 케이스 완료) — 다음 PR에서 나머지 action 확장
4. **React/Next 멘탈 모델 정리** (RSC vs Client, 'use client' 점검, Next 튜토리얼)
5. **E2E 핵심 흐름 확장** (Playwright 1개 → 5개 시나리오)
6. **DB 최적화** (`EXPLAIN ANALYZE`, 인덱스, RLS 회귀 점검)

## Current Progress

### 앱 자체
모든 기능 + 보안 가드 + 모바일 UX 최적화 + 운영 관찰 도구 통합까지 main에 push 되어 Vercel 배포 완료.

### 학습 트랙 (현재 위치)
**단계 1, 2, 3 (첫 PR) 완료.** 단계 3은 인프라 + 보안 핵심 3개 action (12 케이스) 까지 완료. 다음 PR에서 나머지 action 확장 예정.

#### 단계 1에서 깐 것
- **Sentry** (`@sentry/nextjs` v10.56.0)
  - Browser / Server / Edge 3개 환경 SDK init
  - `app/global-error.tsx` 최상위 에러 바운더리
  - Source map 자동 업로드 (`SENTRY_AUTH_TOKEN` Vercel 환경변수)
  - Session Replay + Tracing 활성화
  - Sentry MCP 서버 (`.mcp.json`) — Claude Code가 Sentry 이슈 직접 조회 가능
  - 운영 검증 끝 (스택트레이스 원본 파일명 매핑까지 확인)
- **Vercel Web Analytics** (`@vercel/analytics` v2.0.1) — 페이지뷰 / 방문자 / 인기 페이지 / Referrer
- **Vercel Speed Insights** (`@vercel/speed-insights` v2.0.0) — Web Vitals (LCP/INP/CLS/FCP/FID/TTFB) 측정
  - 첫 측정 결과: **Real Experience Score 96 (Great)** — 거의 모두 녹색, FCP만 노란색(2.23s)

#### 관련 커밋 (단계 1)
- `eb9abcd` chore(sentry): set up error monitoring via @sentry/nextjs wizard
- `f0e27e3` chore(sentry): remove example test pages after production verification
- `a2e7fff` chore(analytics): wire Vercel Web Analytics and Speed Insights
- `663fc9e` chore(sentry): rename project to book-club, tune sample rates, document token

#### 단계 2에서 깐 것 (이번 세션 후반)
- `.github/workflows/ci.yml` — PR + push to main 트리거. pnpm install, tsc --noEmit, vitest run. Node 22 LTS, concurrency cancel-in-progress
- **main 브랜치 보호 룰 (GitHub Rulesets)** — Require PR, Require status check `Typecheck & Unit Tests`, Block force pushes, Restrict deletions. **본인도 우회 못 함** (admin bypass 없음)
- PR 워크플로로 전환 — 실제 PR #1 (`docs(handoff): mark phase 2 complete`)을 만들어 검증. 머지 후 SHA 정렬도 표준 절차 (`git reset --hard origin/main`) 완료

#### 관련 커밋 (단계 2)
- `b379388` ci: add GitHub Actions workflow for typecheck and unit tests
- `d9df123` docs(handoff): mark phase 2 (CI/CD) complete (#1) — **첫 PR squash merge**

#### 단계 1/2 사이 — 관찰 도구 사용법 학습 (이번 세션 후반)
**셋업이 아니라 사용법** 익히기. 깔아둔 도구가 무용지물이 되지 않도록.

**Sentry 깊게 다룬 것**:
- Issues 탭 컬럼 의미 (Users / Events / Age / Trend) + 우선순위 판단 룰
- 이슈 상세 페이지의 **디버깅 4단계 recipe**: Users·Events → Tags 3개(env/release/transaction) → Stack Trace 강조줄 → Breadcrumbs
- 다른 섹션(Highlights / Trace Preview / HTTP Request / Contexts / Activity)은 99% 무시 가능. 1% 까다로운 케이스의 백업
- Alert 시스템: 기본 "high priority issues" 알람 외에 **Regression alert** (production only) 직접 셋업 + 테스트 메일 수신으로 채널 검증
- 테스트 에러 4개 Resolve 처리 → 깨끗한 상태

**관련 커밋**:
- `377c8e6` docs(operations): add operations runbook for daily/weekly monitoring (#3) — **OPERATIONS.md** 신규 문서

#### 운영 테스트 시범 (이번 세션, 2026-06-07)

OPERATIONS.md의 매일/매주 루틴 전에, **OPERATIONS.md가 만든 도구가 실제로 동작하는지 검증**하기 위해 12개 시나리오를 직접 PC + 모바일에서 실행. **이 과정 자체가 운영 안정성 학습의 핵심**이 됨 — 단순 테스트 통과가 아니라, 발견사항을 묶음 PR로 처리하는 흐름까지 한 사이클 완성.

**시나리오 (T1~T12, 12/12 통과)**: PC 로그인 → 모임 생성 (책 검색, 날짜/시간, 장소) → 제출 → PDF 업로드 → Gemini 추출 → 검수 저장 → 수정 → 공유 → 참석 토글 → 모바일 핵심 흐름 → 정리

**발견 사항 처리**:
| # | 처리 | PR |
|---|------|----|
| #1 (날짜/시간 input 간격, cosmetic) | 머지 | PR #7 |
| #2 (검색 헤더 바, cosmetic) | 머지 | PR #7 |
| #3, #4 (Gemini 페이지번호/순서 보존) | 즉시 머지 | PR #5 (`1710e30`) |
| #5 (공유 링크 `?next=` 보존, UX 회귀) | 머지 | PR #7 |
| #6 (모임 상세 Attendance 복원, UX) | **기각** — IA 결정(RSVP 홈 카드 한 곳) 유지 | - |
| #7 (Sentry catch 관찰성 구멍, 긴급) | 즉시 단독 머지 | PR #6 (`4efceb0`) |
| #8 (백그라운드 추출 결과 휘발, UX 회귀) | **유보** — 디자인 옵션 결정 필요 | - |
| #9 (Gemini 503 시 catch-all 메시지) | 진단 완료 → #10 으로 fix | - |
| #10 (Gemini 503 전용 안내 메시지) | 머지 | PR #7 |

**핵심 학습 순간**: 발견 #7 fix (catch에 `Sentry.captureException` 한 줄 추가)가 5분 후 발견 #9 진단을 가능하게 함. catch swallow → unknown → fix → 같은 사고 stack trace + breadcrumb 확보 → Gemini 503 transient임 확정. 운영 관찰성의 가치가 실시간으로 증명된 사례.

**관련 머지 commit**:
- `4efceb0` fix(discussion): capture extract failures in Sentry + console (PR #6) — 발견 #7 긴급 단독 fix
- `<PR #7 squash sha>` fix: post-ops-test bundle — UX polish, auth ?next= preservation, 503 retry copy — 발견 #1/#2/#5/#10 + Suspense bailout 후속 fix

**OPERATIONS.md 내용**:
- 즉시/PR직후 30분/매일 5분/매주 15분/매월 30분 체크리스트
- 알람 메일 도착 시 대응 runbook (New issue vs Regression)
- 이슈 디버깅 4단계 recipe
- 위험 신호 패턴 (빨간 신호 / 노란 신호)
- 빠른 링크 모음

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

#### Sentry 프로젝트 정보 (최신)
- Org slug: `eunjeongmun`
- Project slug: `book-club` (rename 완료)
- DSN: `https://fce608438305676ee890456c8c911d6d@o4511517199368192.ingest.us.sentry.io/4511517223026688` (Project ID 기반이라 rename 후에도 그대로 동작)
- Sentry MCP URL: `https://mcp.sentry.dev/mcp/eunjeongmun/book-club`

## What Worked

### 기술적 접근
- **Sentry wizard 자동 셋업**: `pnpm dlx @sentry/wizard@latest -i nextjs`. OAuth 로그인으로 DSN 자동 fetch + 모든 init 파일 + `next.config.ts` 래핑 + Vercel 환경변수 안내까지 한 방
- **운영 검증 절차**: 로컬 `pnpm dev` → `/sentry-example-page` → 에러 발생 → Sentry 대시보드 확인 → push → 운영에서 동일 절차 → 스택트레이스에 원본 파일명 확인 → 테스트 페이지 삭제
- **Vercel Analytics 자동 활성화**: 별도 토글 없이 패키지 + 컴포넌트 마운트 + 첫 데이터 도착하면 자동. "Enable" 버튼 찾지 말 것
- **`curl` + `grep`으로 운영 HTML 직접 검사**: Network 탭에서 안 잡힐 때 `curl -sL [url] | grep -i analytics`로 컴포넌트가 RSC payload에 들어갔는지 1초만에 확인 가능

### 협업 흐름
- **Spring/Logback 비유**: 거의 모든 새 개념에 비유 anchor 제공 → 학습 속도 크게 향상 (Sentry=Logback+APM, DSN=appender 주소, Source map=stack trace 복원, Web Vitals=APM p75 응답시간, GitHub Actions=Jenkins+Gerrit, Alert=oncall PagerDuty)
- **수동 push 분리**: 사용자가 commit은 위임하지만 push는 직접 — 운영 반영 직전 검토 시간 확보 (사용자가 명시적으로 그렇게 요청함)
- **TaskCreate로 다단계 작업 추적**: Sentry 5단계 + Analytics 4단계 + CI/CD 4단계 + Sentry 사용법 5단계를 task로 분해 → 진행 상황 시각화
- **두 시나리오로 룰셋 검증**: (1) main에 직접 push 시도 → 거절 확인. (2) PR → CI → squash merge → 정상 흐름. 룰셋 셋업 후 이 두 가지로 검증하는 패턴이 강력함
- **"많은 정보 vs 봐야 할 것" 압축**: 사용자가 "정보가 너무 많네요. 제가 주로 봐야할 것들만 알려주세요"라고 명시. → Sentry 이슈 페이지의 ~10개 섹션을 **4단계 recipe**로 압축한 게 결정적. 처음 학습할 땐 도구의 모든 기능 나열 대신 "이 순서로만 보세요" 패턴이 훨씬 유효
- **알람 채널 검증의 표준 절차**: (a) Alert list에서 룰 등록 확인 → (b) 룰 상세에서 저장된 조건 확인 → (c) Send Test Notification으로 실제 채널 검증. 마지막 (c)가 "운영팀의 oncall 콜 테스트"에 해당. 셋업 후 즉시 검증하는 습관 권장
- **TaskCreate 12개 시나리오로 시범 진행**: T1~T12 각각 한 줄 description으로 만든 후 in_progress/completed 토글. 시범 중 끊겨도 재개 가능 + 발견 사항을 누적 PR 목록으로 관리. 다른 학습자에게 권장 패턴
- **Atomic commit per 발견 + squash merge**: 한 PR 안에서 발견별로 commit 분리 (#1, #2, #10, #5 각 commit). 작업 중 진행 추적 명확 + 머지 시 squash로 어차피 합쳐짐. 학습자 입장에서 PR 구성 단계 보이기 좋음
- **Rebase로 commit 제거 후 영향 검증 절차**: 발견 #6 commit을 `git rebase --onto <parent> <commit> <branch>`로 깔끔 제거. 후속 검증 4단계: (a) `git diff main HEAD -- <원래 파일>` 빈 출력 확인 (b) working tree clean (c) 각 commit이 자기 파일만 건드림 확인 (d) `git range-diff`로 rebase된 commit이 원본과 동일한지 확인. 이 절차로 push 전 안전 보장
- **발견 #7 → #9 진단 사례**: 운영 관찰성의 가치가 같은 세션 안에서 한 사이클로 증명됨. catch에 `Sentry.captureException` + `console.error` 한 줄 추가하는 fix가 그 후 같은 에러의 stack trace + breadcrumb 확보로 직결. Spring 환경의 "catch 안 비우기" 원칙이 Next.js / Sentry 환경에서도 그대로 적용됨을 학습

## What Didn't Work (Don't Repeat)

### 기술적 시행착오
- **Claude Code `!` 접두사로 인터랙티브 CLI 실행 시도**: `pnpm dlx @sentry/wizard`가 `ERR_TTY_INIT_FAILED`로 즉사. `!`는 TTY 없는 백그라운드 bash라 `@clack/prompts` 같은 TUI 라이브러리 못 띄움. **인터랙티브 명령은 사용자가 직접 자기 터미널에서 돌려야 함** (memory에 `feedback_interactive_cli`로 저장됨)
- **Sentry wizard의 `pnpm-workspace.yaml` placeholder 버그**: wizard가 `allowBuilds:` 섹션에 `'@sentry/cli': set this to true or false`라는 문자열을 그대로 박아놓음. 다음 `pnpm add` 단계가 invalid value로 깨짐. 수동으로 `true`로 고치고 wizard 재실행해야 했음. 다음에 또 만나면 즉시 패치
- **Vercel 배포 "Initializing" 7분 stuck**: 첫 push 후 Vercel deployment가 Initializing에서 멈춤. 수동 Redeploy 트리거했더니 새 거가 Queued로 들어가 큐가 막힘. **해결**: 멈춘 거 Cancel → 큐 풀림 → 자동 재배포 시작
- **DevTools Network에서 `vercel`로 필터링**: Analytics는 `_vercel/insights/*` 경로라 "vercel" 검색하면 Vercel Toolbar/Feedback 위젯이 잡히고 정작 Analytics는 안 잡힘. **`insights` 또는 `_vercel` (underscore 포함)로 필터링해야 함**
- **Network 탭에서 안 잡힌다고 비활성화로 결론짓기**: 컴포넌트가 HTML에 들어가 있고 Vercel endpoint도 200이면 정상 동작 중. 사용자가 페이지 hydration 직전이나 다른 페이지에서 캡처했을 가능성. **대시보드의 데이터 도착이 ground truth** — 실제로 데이터 도착 확인됨

### 운영 시행착오
- **테스트 페이지 운영 노출 위험 인지**: wizard가 생성한 `/sentry-example-page` + `/api/sentry-example-api`는 공개 URL이라 누구나 에러를 의도적으로 발생시켜 Sentry 쿼터 소진 가능. 검증 끝나면 별도 커밋으로 삭제 (이번 세션 `f0e27e3`)

### CI/CD 시행착오
- **Status check 이름 mismatch (display name vs job ID)**: 워크플로의 `jobs.verify.name: Typecheck & Unit Tests`가 PR에 표시되는 check 이름이고, GitHub branch protection의 required status check도 그 display name을 매치해야 함. 처음에 job ID `verify`를 등록했더니 영원히 "Expected — Waiting for status to be reported"로 머무름. **Rule의 required check 이름은 PR Checks 섹션에 실제로 보이는 이름과 정확히 같아야 함**. 입문자가 거의 다 한 번씩 밟는 함정
- **HANDOFF.md outdated 가능성**: 이전 HANDOFF에서 "단계 3에서 vitest 깔자"라고 적었는데 사실 **vitest와 playwright는 이미 셋업되어 있었음** (validation 단위 테스트 3개, e2e 1개). 다음 세션은 단계 3을 "vitest 도입" 대신 **"Server Action 테스트로 확장"**으로 봐야 함
- **CI에 `pnpm build` 없음 → prerender 에러 Vercel preview에서야 잡힘**: 이번 세션 PR #7에서 `useSearchParams`를 client에서 추가했는데 `pnpm tsc --noEmit` + vitest는 통과. Vercel preview deploy가 처음으로 `useSearchParams() should be wrapped in a suspense boundary` 에러 잡음 → 추가 commit으로 Suspense 감싸기 fix. 교훈: **typecheck ≠ build**. dynamic API (useSearchParams, cookies, headers) 추가 시 PR 전 로컬 `pnpm build` 1회 권장. CI workflow에 `pnpm build` 추가 검토 가치 있음 (메모리 `feedback_local_build_before_pr`로 저장)
- **server action catch가 exception 통째로 삼킴 → 운영 진단 불가**: 단계 1 셋업 단계에 들어가 있던 `extractQuestionsFromPdf`의 catch가 `'발제문 추출에 실패했습니다.'`만 반환하고 `e`를 버려서, 실제 Gemini 503 발생 시 Sentry/Vercel logs 둘 다 비어있어 진단 1시간 지체. `console.error(e) + Sentry.captureException(e)` 두 줄 추가가 5분 후 같은 사고에서 stack trace 확보 → 즉시 원인 확정. 다음 세션에서 `lib/actions/**` 다른 catch들도 같은 패턴인지 grep 1회 권장 (메모리 `feedback_no_catch_swallow`로 저장)

## Next Steps

### 즉시 (다음 세션 시작 시)

**A. 단계 3 확장 (나머지 server action + 부수 발견 2건 fix) ← 주력**

첫 PR에서 인프라 + 보안 핵심 3개 (12 케이스) 완료. 다음 PR 타깃:
- 나머지 action: rotateInvite, transferAdmin, leaveClub, deleteClub, updateClub, createClub, createMeeting, updateMeeting, attendance toggle 등
- UX 버그 2건: approveMember가 비-admin에도 ok=true 리턴, applyToClub가 이미-member에 "신청됨"
- 패턴은 첫 PR과 동일 (`tests/integration/actions/*.test.ts` 추가만)

**B. 발견 #8 처리 (백그라운드 추출 결과 휘발, UX 회귀)**

이번 세션에서 발견되었지만 디자인 옵션 결정 필요해서 유보. 옵션:
- (a) `beforeunload` 가드로 사용자에게 경고
- (b) candidates를 DB에 임시 저장 → 재진입 시 복원 (schema 변경 필요)
- (c) 추출 중 navigation 차단 (UX 손상)

세션 시작 시 옵션 결정 → fix → PR. 단계 3 작업 사이의 짧은 휴식 같은 작업으로 적합.

**C. CI 워크플로에 `pnpm build` 추가 검토**

이번 세션에서 `useSearchParams` Suspense bailout이 Vercel preview에서야 잡힘. CI 워크플로(`.github/workflows/ci.yml`)에 `pnpm build` 단계 추가하면 다음 PR부터 같은 패턴 미리 차단. 단점: CI 소요 시간 증가 (현재 30초 → 1-2분 예상). 가치 판단 후 적용.

**D. Vercel Analytics / Speed Insights 사용법 (보충, 선택)**

지난 세션에 셋업했지만 사용법 학습 안 함. 단계 3 진행 중 짬짬이 5~10분씩 다뤄도 OK. OPERATIONS.md의 "매일 5분 루틴"으로 실습.

### 단계 4 이후 (다음 단계들)
- **단계 4 (React/Next 멘탈 모델)**: RSC vs Client, `'use client'` 점검, Next.js 캐시 계층 (`revalidatePath`/`revalidateTag`)
- **단계 5 (E2E 확장)**: 이미 `tests/e2e/main-flow.spec.ts` 1개 있음. 4개 더 추가 (회원가입, 모임 생성, 발제문 업로드, 공유)
- **단계 6 (DB 최적화)**: `EXPLAIN ANALYZE`, 인덱스 회귀 점검, RLS 정책 audit

### 학습 포인트 (다음 세션이 자연스럽게 다룰 것)
- **Next.js 캐시 계층**: ISR / `revalidatePath` / `revalidateTag` — 모임 수정 후 홈 카드 stale 가능
- **Supabase 통합 테스트 패턴**: 로컬 Docker 컨테이너에 시드 → 진짜 SQL 실행 → 정리. mocking보다 적합
- **Server Action 테스트의 함정**: cookies()/headers() 등 Next 런타임 의존성 → vitest mocking 필요

## 사용자 컨텍스트 (다음 에이전트가 알아야 할 것)

- **언어**: 한국어 응답 선호
- **백엔드 경력**: Java/Spring, 현재 C + Nonstop Net24 (트랜잭션 시스템)
- **SQL**: 기본 이상 (조인·인덱스·정규화 이해)
- **Git**: PR 흐름 익숙. **commit은 위임 OK, push는 본인이 직접 함** (이번 세션에서 명시)
- **프론트**: 처음 (React/Next/Node 학습 중)
- **Supabase/Vercel**: 이번 프로젝트로 처음 접함
- **AI 도구**: deep-interview·code-review·Sentry MCP 사용 경험
- **응답 스타일 선호**: 단계별 + Spring/SQL 비유 + 학습 포인트 명시 + 핵심만 짚기
- **트러블슈팅 스타일**: 막히면 스크린샷을 빠르게 제공 → 진단이 매우 빠르게 진행됨. 이 흐름 유지할 것
- **Bash 도구로 인터랙티브 CLI 절대 호출하지 말 것**: `!` 접두사도 안 됨. 사용자 본인 터미널 안내

## 핵심 파일/문서

### 기존
- `README.md` — Gemini·Kakao·IA·보안 가드 + `SENTRY_AUTH_TOKEN` 명시 완료
- `OPERATIONS.md` — **운영 일과 runbook (이번 세션 신규)**. 매일/주간/월간 체크리스트 + 알람 대응
- `.env.example` — 환경변수 템플릿
- `.omc/specs/deep-interview-meeting-detail-ia.md` — IA 리팩터링 결정 기록
- `lib/actions/discussion-files.ts` — 보안 가드 참고
- `lib/queries/meetings.ts` — `getNextMeeting`
- `components/meeting/MeetingHeaderMenu.tsx` — 3단 공유 폴백

### 단계 1에서 추가됨
- `instrumentation-client.ts`, `instrumentation.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` — Sentry SDK 초기화 (각 파일에서 `tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1`)
- `app/global-error.tsx` — 최상위 에러 바운더리 (Sentry capture)
- `app/layout.tsx` — `<Analytics />` + `<SpeedInsights />` 마운트 (`</body>` 직전)
- `next.config.ts` — `withSentryConfig` 래퍼 (`project: "book-club"`, source map 업로드, tunnelRoute `/monitoring`)
- `.mcp.json` — Sentry MCP 서버 정의 (`book-club` slug, Claude Code 통합)
- `.env.sentry-build-plugin` — `SENTRY_AUTH_TOKEN` (gitignored, Vercel에도 등록 완료)
- `pnpm-workspace.yaml` — `allowBuilds: '@sentry/cli': true` 추가

### 단계 2에서 추가됨
- `.github/workflows/ci.yml` — CI 워크플로 (Node 22 LTS, pnpm 11)
- **GitHub Rulesets (main 보호)** — 코드 외부에 셋업됨. PR 강제, status check `Typecheck & Unit Tests` 필수, force push 금지, deletion 금지

### 이미 셋업되어 있던 것 (HANDOFF가 outdated였음)
- `vitest.config.ts` + `tests/setup.ts`
- `tests/lib/validation/*.test.ts` — zod schema 검증 (3 파일, 12 테스트)
- `playwright.config.ts`
- `tests/e2e/main-flow.spec.ts` — E2E 1개

## 메모리 (자동 참조됨)

- `feedback_interactive_cli`: 인터랙티브 CLI는 `!` 접두사로 못 돌림. 사용자 본인 터미널에 안내
- `feedback_local_build_before_pr`: PR 전 `pnpm build` 1회. tsc/CI는 prerender 에러 못 잡음
- `feedback_no_catch_swallow`: server action catch는 반드시 `console.error` + `Sentry.captureException`. exception 통째로 삼키지 말 것

## 환경

- macOS, zsh
- pnpm 11.5.0
- Node v26.0.0 (매우 신상 — Sentry instrumentation에서 `DEP0205 module.register() deprecated` 경고 발생하지만 동작은 정상)
- Next.js 16.2.6, React 19.2
- 로컬 Supabase Docker 컨테이너 (포트 54323 Studio)
- 운영: Vercel icn1 (서울) + Supabase Cloud + Sentry US
- Branch 정책: **PR + CI 통과 강제** (main 직접 push 차단됨). 작업은 feature branch → PR → Squash merge
- 운영 URL: `https://book-club-five-nu.vercel.app/`

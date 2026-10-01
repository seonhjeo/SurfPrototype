# 공개 PVP 배포 개발단위

대응 기획: [로비의 비공개 방과 방 수명](../기획서/화면구성.md), [경기 설정의 비공개 PVP](../기획서/게임모드.md).
Vercel 화면과 Render 단일 WebSocket 서버로 서로 다른 기기의 비공개 PVP를 제공한다. 로그인·6자리 코드·서버 전투 판정·덱 비공개·설정 공유·이탈·재대전 규칙을 유지한다. 아래 배포 검증은 2026-09-30 당시의 세 프리셋 기록이며 2026-10-01 팝업 변경의 공개 배포 검증은 별도다.
2026-09-30 실제 서버 배포와 공개 브라우저 두 탭의 대전·재대전을 검증했다. 서로 다른 기기·네트워크 검증은 미확인으로 구분한다.

## Render 단일 WebSocket 서버 배포

- 기획: [비공개 방과 초대 코드](../기획서/화면구성.md#로비), [방 수명](../기획서/화면구성.md#방-수명과-오류-처리--2026-09-30-확정).
- 기존 `server/start.mjs`와 `server/multiplayer.mjs`를 Node.js 24.19.0의 단일 프로세스에서 실행한다. 방과 전투 상태를 메모리에서 공유하므로 복수 인스턴스로 나누지 않는다.
- 현재 서비스는 Render 대시보드에서 수동 구성한 Singapore 지역 Free 단일 Web Service이며 `main`의 `9291655`를 배포했다. `Auto-Deploy=On Commit`으로 main 커밋을 자동 반영한다. `render.yaml`의 브랜치는 이전 작업 브랜치 `0.3.1-private-connection-fix`로 현재 서비스 설정과 다르다.
- 실제 빌드는 `npm ci && npm run build`, 시작은 `npm run start`, `NODE_VERSION=24.19.0`, 상태 확인은 `/healthz`다. Render가 제공한 `PORT`를 사용해 `0.0.0.0`에서 접속을 받는다.
- `MULTIPLAYER_ALLOWED_ORIGINS=https://surf-prototype.vercel.app`로 Production 출처만 허용한다. Preview 검증은 해당 출처를 별도로 추가해야 한다.
- `/healthz`의 정상 응답과 `/ws`의 WebSocket 연결을 확인한다. 상태 확인 응답에 방·덱·인증 정보를 넣지 않는다.
- 서버 재시작·재배포·절전 시 메모리의 방이 사라진다. 경기 중 연결 종료는 기존 이탈 규칙을 적용하며 재접속을 추가하지 않는다.
- 초기 배포 증거 (`main`의 `5df7f3a`): 서비스 `srv-daubkvdg1s2s73c9ouk0`, 배포 `dep-daubl05g1s2s73c9p1hg`가 50.6초 후 Live 상태로 확인됐다. 공개 WebSocket은 `wss://surf-multiplayer.onrender.com/ws`다.
- 검증: [실제 서버 상태 확인](https://surf-multiplayer.onrender.com/healthz)이 HTTP 200과 `{"status":"ok","service":"surf-multiplayer"}`를 반환했다. 세 모드에서 공개 WebSocket 연결·방 생성·참가·덱 비공개·전투·소환·이탈을 통과했다.
- [x] 개발 완료

## Vercel 화면 연결과 공개 대전 검증

- 기획: [경기 설정과 경기 유지](../기획서/게임모드.md), [비공개 방·게임·결과](../기획서/화면구성.md).
- 최초 공개 배포에서는 Vercel Production의 `VITE_MULTIPLAYER_URL=wss://surf-multiplayer.onrender.com/ws`를 설정하고 `main`의 `5df7f3a`를 재배포했다. 로컬 실행은 같은 출처의 `/ws`를 사용한다.
- 초기 배포 증거: Vercel 배포 `4EpFoupAs8JRaYwaNzJbCnb4abpW`가 8초 후 Ready 상태로 확인됐다. 공개 화면은 [surf-prototype.vercel.app](https://surf-prototype.vercel.app/)이다.
- 독립된 두 클라이언트에서 6자리 방 생성·코드 참가·방 모드 공유·덱 비공개·준비·소환·결과·이탈·재대전을 검증한다. 서로 다른 디바이스·네트워크의 확인 범위를 구분한다.
- 대기방 방장 이탈은 방 종료, 참가자 이탈은 준비·선택 타이머 초기화, 경기 중 이탈은 패배로 처리하는 기존 규칙을 확인한다.
- Render Free는 수신 HTTP 요청이나 기존 WebSocket 메시지가 15분 없으면 절전하며 다음 요청·새 연결에서 기동하는 데 약 1분이 걸릴 수 있다. [공식 절전 제한](https://render.com/docs/free#spinning-down-on-idle).
- 클라이언트는 최초 연결 전에 `/healthz`를 확인하고 최대 120초 동안 기동을 기다린다. 개별 요청 제한은 10초, 재시도 간격은 2초다. 이 대기는 최초 연결에만 적용하며 경기 재접속을 추가하지 않는다.
- PVP 화면은 좌표를 150ms 동안 보간한다. 전투 판정·SP·소환·승패는 서버 상태를 따르고 AI 대전 계산은 유지한다.
- 구현 검증: 2026-09-30 Node.js 24에서 자동 테스트 59개·타입 검사·프로덕션 빌드가 통과했다. 기존 전투·WebSocket 48개, 상태 확인과 기동 대기 4개, 화면 보간 7개를 포함한다.
- 로컬 브라우저 두 클라이언트(`http://localhost:5192`)의 생성·참가·준비·양쪽 전투·소환·상대 나가기 후 승리 화면을 확인했다.
- 공개 WebSocket 자동 흐름 검증에서 기본·자동획득 금지·처치획득 금지의 세 모드별 방 생성·참가·덱 비공개·전투 시작·소환·기권 결과를 통과했다.
- 공개 대기방에서 방장 이탈 시 양쪽 방 종료·코드 무효화, 참가자 이탈 시 방장 준비 해제·타이머 초기화·상대 연결 해제·같은 코드 재입장을 확인했다.
- 공개 WebSocket 정상 대전은 25.83초에 `fort-destroyed`로 종료하며 양쪽 결과가 같았다. 방장 재대전 요청을 상대에게 표시하고 참가자 동의 후 같은 코드·모드 유지, 양쪽 덱·준비·재대전 상태 초기화와 새 30초 타이머를 확인했다. 다시 양쪽 준비 후 새 경기의 경과 1초 미만·양쪽 SP 5·유닛 0을 확인했다. 오류 메시지 없이 테스트 방과 연결을 정리했다.
- 실제 공개 브라우저 두 탭에서 방 `914772` 생성·참가 → 시간 만료 후 덱 자동 보충·경기 시작 → 양쪽 전사 소환 → 성채 파괴로 무승부 결과를 확인했다.
- 양쪽 다시 대전 선택 후 같은 방 코드와 새 늪 맵의 대기방 → 양쪽 전사 선택·준비 완료 → 새 경기·양쪽 소환 → 참가자 나가기 후 방장 승리 화면까지 확인했다.
- 확인 범위: 한 브라우저의 독립된 두 탭과 공개 WebSocket 클라이언트다. 서로 다른 기기·네트워크 및 실제 15분 절전 후 최초 기동 대기 시간은 아직 검증하지 않았다.
- 배포·에이전트 검증 완료는 사용자 로컬 테스트나 `dev`·`main` 병합 요청을 대신하지 않는다.
- [x] 개발 완료

## 모드 설정 리팩터링 Production 검증 — 2026-09-30

- 사용자 로컬 테스트 완료와 명시적인 `dev` 병합·배포 요청 후 [PR #8](https://github.com/seonhjeo/SurfPrototype/pull/8)을 병합했다. Production 커밋은 `9291655de441e1426ab270e1960b097b2f4acb86`이며 기존 세 모드의 새 기능 OFF·라인 0을 유지한다.
- 구현 검증은 Node.js 24의 자동 테스트 95/95개·타입 검사·프로덕션 빌드 통과다. PR과 병합된 main의 GitHub `Typecheck and build` CI도 SUCCESS로 확인했다.
- Vercel Production 배포 `AeRoLrh9Dc1KLg4K5b3JtsxeVTyo`, GitHub 배포 `6756122773`의 커밋이 위 main SHA와 같고 배포 완료/SUCCESS다. 공개 고정 주소 [surf-prototype.vercel.app](https://surf-prototype.vercel.app/)는 HTTP 200이며 [고유 배포 URL](https://surf-prototype-i6dhm8oxu-hoya14.vercel.app)도 기록한다.
- Render 서비스 `srv-daubkvdg1s2s73c9ouk0`는 main을 추적하며 `Auto-Deploy=On Commit`이다. 배포 `dep-dauddp2vcj2c73eotak0`가 45.6초 후 같은 main SHA의 Live 상태로 확인됐다. 서비스 설정을 변경하지 않았다.
- 배포된 공개 WebSocket에서 기본·자동획득 금지·처치획득 금지 세 모드를 확인했다. `room.rules`는 각 로컬 preset과 동일하고 양쪽의 모드·규칙이 같았다. 상대 덱 비공개, 구조물 없음, 경기 시작, 양쪽 사냥꾼 소환, 참가자 이탈 후 방장 승리를 확인했으며 오류는 없었다.
- 실제 Production 브라우저 두 탭에서 기본 모드 방 `410332`, 성 도로·맑음 환경을 사용했다. 방장 전사·참가자 궁수 선택과 준비, 양쪽 소환, 경기 경과 약 22초에 참가자 이탈 후 방장 승리와 성채 HP 874/874를 확인했다. 양쪽 콘솔 오류는 0건이었다.
- 확인 범위는 공개 서버의 WebSocket 클라이언트와 한 브라우저의 독립된 두 탭이다. 서로 다른 기기·네트워크, 실제 휴대기기 터치와 장기 밸런스 검증은 이번 확인에 포함하지 않는다. 앞선 `5df7f3a` 배포와 대전·재대전 기록은 당시 결과로 보존한다.

[README의 배포 절차](../../README.md#render-websocket-서버-배포) · [Render Web Service 설정](https://render.com/docs/web-services) · [개발문서 인덱스](index.md)

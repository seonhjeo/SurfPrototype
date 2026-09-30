# Surf Prototype

본 개발 전 게임 아이디어와 조작감을 검증하는 가벼운 웹게임 실험 공간입니다.
`성채 공방전`은 유닛 10종 중 5종으로 덱을 만들고 SP로 병력을 소환하는 세로형 1대1 RTS입니다.
AI 대전과 6자리 코드로 참가하는 비공개 PVP를 지원합니다. 맵 4종·날씨 3종, 중립 웨이브와 보스, 자동 전투·스킬을 기획서 기준으로 구현합니다.

## 실행

Node.js **24.x**와 npm을 사용합니다. nvm 사용자는 `nvm install && nvm use`로 `.nvmrc`의 버전을 적용할 수 있습니다.

```sh
npm ci
npm run dev
```

개발 서버는 기본적으로 `http://localhost:5173`에 열리며 Vite 화면과 WebSocket 서버(`/ws`)를 함께 실행합니다.
`PORT=5174 npm run dev`처럼 포트를 바꿀 수 있습니다. Node.js 24의 TypeScript 실행 기능을 사용합니다.

로비에서 게임 모드를 고른 뒤 AI 대전 또는 비공개 방 생성·참가를 선택합니다. `기본 모드`는 5 SP로 시작해 초당 1 SP를 얻고, `한정 SP 모드`는 20 SP로 시작하며 자연 회복이 없습니다. 두 모드의 소환 비용·처치 SP 보상과 최대 보유량 50은 같습니다.
비공개 방에 코드로 참가하면 방장이 정한 모드를 사용하며, 재대전에서도 같은 모드를 유지합니다. 대기방에서 맵·날씨를 보고 유닛을 고르세요.
양쪽 입장 후 30초가 지나거나 양쪽이 준비하면 빈 슬롯을 중복 없이 채워 전투를 시작합니다.
카드를 누르면 성채 앞에 소환하고, 카드를 아군 전장으로 끌면 놓은 곳에 소환합니다. 경계 밖·성채 위 드롭은 취소됩니다.
성채 파괴 또는 5분 종료 시 체력 비교로 승패를 정합니다. 경기 중 이탈·연결 종료는 패배이며 재접속은 없습니다.

```sh
npm run typecheck
npm run build
npm test
npm run preview
```

`build`는 타입 검사를 포함하며 결과물은 `dist/`입니다. `npm test`는 전투 규칙과 WebSocket 방 흐름을 검증합니다.
`npm run preview`는 정적 화면 확인용 서버이며 기본 주소는 `http://127.0.0.1:4173`입니다. 자체 PVP 서버를 제공하지 않습니다.

## 다른 기기에서 PVP 테스트

1. 한 컴퓨터에서 `npm run dev`를 실행합니다. 기본적으로 모든 네트워크 인터페이스에서 연결을 받습니다.
2. 같은 네트워크의 두 기기에서 `http://서버컴퓨터의내부IP:5173`에 접속합니다. 운영체제 방화벽에서 이 포트의 접속이 허용되어야 합니다.
3. 첫 기기에서 비공개 방을 만들고, 두 번째 기기에서 표시된 6자리 코드로 참가합니다.
4. 양쪽에서 덱 선택·준비 후 대전합니다. 상대 덱은 전송하지 않으며 전투 판정·SP·소환은 서버가 검증합니다.

서로 다른 외부 네트워크에서는 두 기기가 접근할 수 있는 공개 Node.js 서버가 필요합니다.
`npm run build` 후 `npm start`로 화면과 PVP 서버를 함께 실행할 수 있으며 `PORT`로 포트를 지정합니다.
프로덕션 서버에는 `dist/`, `server/`, `src/game/`, `package.json`과 설치된 의존성이 필요합니다.
HTTPS 앞단에서는 WebSocket 업그레이드를 `/ws`로 전달하도록 구성합니다.

화면과 서버를 따로 배포할 경우 빌드 환경에 `VITE_MULTIPLAYER_URL`을 공개 `wss://서버주소/ws`로 설정합니다.
이 값은 공개 접속 주소이며 비밀키가 아닙니다. 서버의 `MULTIPLAYER_ALLOWED_ORIGINS`에는 허용할 화면 출처를 쉼표로 구분해 지정할 수 있습니다.
선택 환경변수는 값 없는 [.env.example](.env.example)에 정리했습니다. `PORT`·서버 출처 제한은 프로세스 환경으로 전달합니다.

## 구성

| 위치 | 역할 |
| --- | --- |
| `src/main.ts`, `src/ui.ts` | 앱 시작, 로비·대기방·경기·결과, 입력과 AI/PVP 흐름 |
| `src/game/data.ts` | 유닛·맵·날씨·스킬과 밸런스 수치 |
| `src/game/simulation.ts` | 브라우저·서버 공용 전투 계산과 AI |
| `src/game/BattleScene.ts` | 연속 좌표 전장과 유닛·성채·효과 렌더링 |
| `src/network.ts`, `server/` | WebSocket 연결, 비공개 방, 서버 전투 판정 |
| `tests/`, `server/multiplayer.test.mjs` | 전투·스킬·환경·방 수명 자동 검증 |
| `src/style.css`, `index.html` | 모바일 세로 화면과 접근성 구조 |
| `public/` | 원본 이름 그대로 배포할 에셋 |
| `AGENTS.md`, `AgentDocs/` | 지침 관리·연결 링크와 분야별 작업 지침 |
| `Docs/agents.md`, `Docs/` | 기획서·개발문서, 개발단위별 완료 체크와 파트별 인덱스 |
| `.github/workflows/ci.yml` | GitHub Actions 타입 검사·빌드 |
| `vercel.json` | Vercel 설치·빌드·출력 설정 |

## GitHub → Vercel 배포

저장소: [seonhjeo/SurfPrototype](https://github.com/seonhjeo/SurfPrototype)

- 테스트 주소: [surf-prototype.vercel.app](https://surf-prototype.vercel.app/)
- Vercel 프로젝트: [hoya14 / surf-prototype](https://vercel.com/hoya14/surf-prototype)
- 2026-09-29 검증: GitHub CI, `main` Production 자동 배포, 작업 브랜치 Preview 자동 배포 성공.
- 초기 Preview 확인: [검증용 배포](https://surf-prototype-js6kgsj5u-hoya14.vercel.app)

Vercel 설정은 다음 값을 사용합니다.

| 항목 | 값 |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | 저장소 루트 (`./`) |
| Node.js | 24.x (`package.json` 기준) |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Production Branch | `main` |
| 환경변수 | 외부 PVP 서버 사용 시 `VITE_MULTIPLAYER_URL` |

Vercel에서 이 저장소를 Import하고 Git 연동을 유지하면 다음 흐름으로 테스트합니다.

현재 Vercel 설정은 정적 프런트엔드를 배포합니다. 이번에 추가한 상시 WebSocket 서버는 별도 Node.js 호스트에서 실행해야 합니다.
외부 서버 주소를 설정하지 않은 정적 배포에서는 AI 대전은 실행되지만 비공개 PVP 연결은 사용할 수 없습니다. 공개 PVP 서버 배포는 아직 수행하지 않았습니다.

1. 최신 `dev`에서 새 개발 브랜치를 만들고 구현·검증합니다.
2. 구현 후 로컬 서버를 실행하고 브라우저를 팝업해 사용자가 직접 테스트하도록 합니다.
3. 사용자가 테스트를 완료하고 `dev` 병합을 요청한 때에만 병합합니다. 사용한 개발 브랜치는 유지합니다.
4. `main`에 대한 직접 push와 직접 merge는 금지합니다. `main` 대상 PR은 사용자가 요청한 경우에만 만들며, PR 생성 요청은 병합 권한을 포함하지 않습니다.

지침·문서만 수정하는 작업은 최신 `dev`에서 직접 작업·커밋하고 `dev`에 push합니다. 문서 변경에도 `main` 직접 push·merge 금지는 동일하게 적용됩니다.
`main` push는 Production, 다른 브랜치 push는 Preview 배포를 유발합니다. Preview는 사용자 로컬 테스트를 대신하지 않습니다.
상세 절차는 [Git·테스트 지침](AgentDocs/GitAndTesting.md)을 따릅니다.

GitHub Actions는 현재 `main` push, PR, 수동 실행에서 `npm ci`와 `npm run build`를 수행합니다. `dev` push 전용 트리거는 아직 없습니다.
배포는 Vercel Git 연동이 담당하며 별도의 Vercel 토큰을 GitHub Secrets에 넣지 않습니다.
**CI와 Vercel은 독립적으로 실행됩니다.** 현재 CI 성공을 강제하는 브랜치 보호나 배포 게이트는 설정하지 않았습니다.
필요해지면 `main` 보호 규칙에 `Typecheck and build`를 필수 검사로 지정합니다.

배포가 실패하면 GitHub Actions와 Vercel Build Logs를 각각 확인합니다. 복구 변경도 개발 브랜치에서 준비하고 [Git·테스트 지침](AgentDocs/GitAndTesting.md)에 따라 반영합니다.

초기화 당시 로컬 HTTPS Git 인증에는 `workflow` 권한이 없어 CI 파일을 GitHub 웹 편집기로 등록했습니다.
일반 코드 push는 정상입니다. `.github/workflows/` 파일을 수정할 때는 GitHub 웹 편집기 또는 workflow 변경 권한을 갖춘 Git 인증을 사용합니다.

## 개발 원칙

- 빠른 반복과 최소한의 구조를 우선합니다. 엔진·백엔드·게임 규칙을 추가할 때는 먼저 범위를 정합니다.
- `node_modules/`, `dist/`, `.vercel/`, `.env*`는 Git에서 제외합니다. 의존성 변경 시 잠금 파일은 함께 커밋합니다.
- 브라우저에서 사용하는 `VITE_*` 환경변수는 사용자에게 노출됩니다. 비밀키를 넣지 않습니다.
- 자동 검증은 타입 검사·빌드·전투 규칙·WebSocket 방 흐름을 포함합니다. 입력·화면 크기·모바일 터치는 브라우저에서 확인합니다.

참고: [Phaser](https://phaser.io/), [Vite 배포](https://vercel.com/docs/frameworks/frontend/vite), [Vercel GitHub 연동](https://vercel.com/docs/git/vercel-for-github), [Node.js 버전](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

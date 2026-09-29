# Surf Prototype

본 개발 전 게임 아이디어와 조작감을 검증하는 가벼운 웹게임 실험 공간입니다.
초기 화면은 Phaser 렌더링·입력·배포를 확인하기 위한 샘플이며 게임 규칙은 아직 정하지 않았습니다.

## 실행

Node.js **24.x**와 npm을 사용합니다. nvm 사용자는 `nvm install && nvm use`로 `.nvmrc`의 버전을 적용할 수 있습니다.

```sh
npm ci
npm run dev
```

개발 서버는 기본적으로 `http://127.0.0.1:5173`에 열립니다.
화면을 클릭·터치하면 원이 이동하고, 화면에 포커스가 있을 때 방향키 또는 WASD로 움직일 수 있습니다.
`위치 초기화` 버튼은 원을 중앙으로 되돌립니다.

```sh
npm run typecheck
npm run build
npm run preview
```

`build`는 타입 검사를 포함하며 결과물은 `dist/`입니다. Preview 서버는 기본적으로 `http://127.0.0.1:4173`을 사용합니다.
실제 휴대폰으로 같은 네트워크에서 테스트하려면 `npm run dev -- --host 0.0.0.0`을 실행하고 PC의 내부 IP로 접속합니다.

## 구성

| 위치 | 역할 |
| --- | --- |
| `src/main.ts` | Phaser 시작, DOM 이벤트 연결 |
| `src/game/PrototypeScene.ts` | 렌더링·키보드·포인터 확인용 씬 |
| `src/style.css`, `index.html` | 테스트 화면과 안내 |
| `public/` | 원본 이름 그대로 배포할 에셋 |
| `AGENTS.md` | 에이전트 작업 범위와 검증 규칙 |
| `.github/workflows/ci.yml` | GitHub Actions 타입 검사·빌드 |
| `vercel.json` | Vercel 설치·빌드·출력 설정 |

## GitHub → Vercel 배포

저장소: [seonhjeo/SurfPrototype](https://github.com/seonhjeo/SurfPrototype)

- 테스트 주소: [surf-prototype.vercel.app](https://surf-prototype.vercel.app/)
- Vercel 프로젝트: [hoya14 / surf-prototype](https://vercel.com/hoya14/surf-prototype)
- Git 연결과 `main`의 첫 Production 배포 성공을 2026-09-29에 확인했습니다.

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
| 환경변수 | 초기 버전에는 없음 |

Vercel에서 이 저장소를 Import하고 Git 연동을 유지하면 다음 흐름으로 테스트합니다.

1. 작업 브랜치에서 수정하고 로컬 빌드를 확인합니다.
2. 브랜치를 push하고 PR을 열면 GitHub CI와 Vercel Preview에서 확인합니다.
3. 검증된 변경을 `main`으로 병합하면 Vercel Production에 자동 배포됩니다.

GitHub Actions는 `npm ci`와 `npm run build`를 수행합니다. 배포는 Vercel Git 연동이 담당하며 별도의 Vercel 토큰을 GitHub Secrets에 넣지 않습니다.
**CI와 Vercel은 독립적으로 실행됩니다.** 현재 CI 성공을 강제하는 브랜치 보호나 배포 게이트는 설정하지 않았습니다.
필요해지면 `main` 보호 규칙에 `Typecheck and build`를 필수 검사로 지정합니다.

배포가 실패하면 GitHub Actions와 Vercel Build Logs를 각각 확인합니다. 되돌리기는 문제 커밋의 revert를 push해 다시 배포하거나 Vercel의 이전 배포 복구 기능을 사용합니다.

## 개발 원칙

- 빠른 반복과 최소한의 구조를 우선합니다. 엔진·백엔드·게임 규칙을 추가할 때는 먼저 범위를 정합니다.
- `node_modules/`, `dist/`, `.vercel/`, `.env*`는 Git에서 제외합니다. 의존성 변경 시 잠금 파일은 함께 커밋합니다.
- 브라우저에서 사용하는 `VITE_*` 환경변수는 사용자에게 노출됩니다. 비밀키를 넣지 않습니다.
- 현재 자동 검증 범위는 타입 검사와 빌드입니다. 입력·화면 크기·모바일 터치는 브라우저에서 확인합니다.

참고: [Phaser](https://phaser.io/), [Vite 배포](https://vercel.com/docs/frameworks/frontend/vite), [Vercel GitHub 연동](https://vercel.com/docs/git/vercel-for-github), [Node.js 버전](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

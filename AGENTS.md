# 프로젝트 지침 안내

## 지침 문서 관리 방법

- 이 문서는 지침 문서 관리 방법과 분야별 지침의 연결 링크만 담는다.
- 분야별 지침은 저장소 루트의 `./AgentDocs/` 안에 작성한다. 작업 전에 아래 링크에서 해당 분야의 지침을 읽는다.
- 모든 작업에서 Git·테스트 지침을 먼저 확인하고, 나머지 지침은 작업 분야에 맞게 확인한다.
- 한 분야의 지침이 많아지면 `AgentDocs/<분야>/` 폴더로 나누고, 그 폴더의 `Index.md`에서 지침들을 인덱싱한다.
- 분야별 폴더를 만들면 이 문서의 해당 링크를 그 폴더의 `Index.md`로 바꾼다.
- 지침 문서 하나는 빈 줄을 포함해 100줄을 넘기지 않는다. 이 문서와 지침 인덱스에도 같은 제한을 적용한다.
- 지침을 추가·이동·분리할 때 관련 인덱스와 링크를 함께 갱신하고, 중복되거나 충돌하는 규칙을 정리한다.
- `Docs/agents.md`는 기획·개발 문서 관리를 위한 별도 진입점으로 유지하며, 상세 지침은 `AgentDocs/Documentation.md`와 연결한다.

## 분야별 지침

| 분야 | 지침 문서 |
| --- | --- |
| 프로젝트 목적·기술 구성 | [Project.md](AgentDocs/Project.md) |
| 구현·개발 문서 확인·검증 | [Development.md](AgentDocs/Development.md) |
| Git·브랜치·사용자 로컬 테스트 | [GitAndTesting.md](AgentDocs/GitAndTesting.md) |
| GitHub CI·Vercel 배포 | [Deployment.md](AgentDocs/Deployment.md) |
| 기획·개발 문서·보고서 관리 | [Documentation.md](AgentDocs/Documentation.md) |
| 기획·개발 문서 인덱스 진입점 | [Docs/agents.md](Docs/agents.md) |

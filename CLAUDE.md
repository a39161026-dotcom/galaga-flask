# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 명령어

가상환경은 저장소 안의 `.venv`를 쓰고, gitignore 대상입니다.

```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py                    # http://127.0.0.1:5000 (개발 서버)
gunicorn app:app --workers 1 --bind 127.0.0.1:8000   # 배포와 같은 실행 방식
```

- 테스트, 린터, 포맷터 설정은 없습니다. 검증은 브라우저에서 직접 플레이하거나 Flask 테스트 클라이언트로 API를 호출하는 식으로 합니다.
- JavaScript 문법만 빠르게 확인하려면 `node --check static/game.js`를 쓸 수 있습니다.

## 구조 (큰 그림)

게임 로직과 서버 역할이 명확히 나뉘어 있습니다.

- **`static/game.js`**: 게임 전체 로직과 Canvas 렌더링이 여기 있습니다. 즉시 실행 함수(IIFE) 하나로 감싸져 있고, 전역 상태는 `G` 하나입니다. `newGame()`이 상태를 초기화하고, `tick()`이 게임 한 틱을 진행하고, `render()`가 그립니다.
- **`app.py`**: Flask 서버입니다. 페이지(`/`)와 최고 점수 API(`GET/POST /api/scores`)만 제공하고, 게임 로직은 없습니다. 점수는 `scores.json`에 상위 10개만 저장합니다. 파일 쓰기는 `threading.Lock`으로 보호합니다.
- **`templates/index.html`**: Canvas와 점수판 패널이 있는 단일 페이지입니다. 이미지 경로는 `<canvas>`의 `data-*` 속성으로 JS에 넘깁니다.

### game.js 작업할 때 알아둘 점

- 로직은 원래 Java Swing 버전(`GalagaGame.java`, 이 저장소에는 없음)의 수치와 순서를 그대로 옮긴 것입니다. 속도, 쿨다운, 보스 HP, 드롭 확률 같은 값을 바꿀 때는 원본과 어떻게 달라지는지 의도를 확인하세요.
- 시간은 10ms 고정 틱(`TICK_MS`)으로 누적해서 처리합니다. 그래서 프레임레이트와 무관하게 게임 속도가 같습니다. 이동량, 쿨다운, 타이머 값은 모두 "틱" 단위입니다.
- `tick()` 안의 처리 순서(플레이어 → 발사 → 아이템 → 총알 → 적/보스 → 충돌 → 레벨 판정)가 원본과 맞춰져 있습니다. 순서를 바꾸면 충돌 결과가 달라질 수 있습니다.
- 보스 등장 중(`bossEntering`)에는 플레이어 총알이 보스에 맞지 않습니다. 폭탄(X)은 등장 중에도 보스에 데미지를 줍니다.
- 테스트용 훅은 없습니다. 상태를 확인하려면 Playwright로 페이지에 접근자를 주입하는 방식을 씁니다. 이때 `G`가 IIFE 안에 있으니 `})();` 바로 앞에 `window.G_get = () => G;`를 넣어야 합니다.

### 서버 작업할 때 알아둘 점

- **워커는 1개로 유지해야 합니다.** `scores.json` 락은 프로세스 안에서만 유효하므로, 워커가 여럿이면 쓰기가 꼬일 수 있습니다. `render.yaml`과 PythonAnywhere 설정도 이 전제를 따릅니다.
- `scores.json`은 `.gitignore`에 있어서 저장소에 올라가지 않습니다. 배포 환경에서 재배포나 재시작 때 지워질 수 있는 파일입니다(Render 무료 플랜).
- 점수 검증은 서버에서 합니다. 정수 여부와 0~10,000,000 범위만 확인하고, 이름은 12자로 자릅니다.

## 배포

- **PythonAnywhere (현재 운영)**: 단계별 설정은 `DEPLOY_PYTHONANYWHERE.md`에 있습니다. 사용자 이름은 `leeseongheon`이고, 코드는 `/home/leeseongheon/galaga-flask`에 있습니다. 코드를 바꾸면 PythonAnywhere 콘솔에서 `git pull` 후 Web 탭의 **Reload**를 눌러야 반영됩니다.
- **Render**: `render.yaml`이 Blueprint 설정이고, `gunicorn app:app --workers 1`로 시작합니다.
- 저장소는 public입니다. 비밀값이나 토큰을 커밋하지 마세요.

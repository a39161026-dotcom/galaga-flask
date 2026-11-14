# Galaga - Flask 웹 버전

원본 Java Swing 갤러그(`GalagaGame.java`)의 규칙과 수치를 옮긴 웹 버전입니다.
Flask가 페이지와 이미지를 서빙하고, 게임 로직은 브라우저의 JavaScript(Canvas)에서 돌아갑니다.
최고 점수는 Flask API(`/api/scores`)에 `scores.json`으로 저장됩니다.

## 실행 방법

```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

브라우저에서 http://127.0.0.1:5000 접속

## 조작키

| 키 | 동작 |
|---|---|
| ← / A, → / D, ↑ / W, ↓ / S | 이동 |
| 마우스 이동 | 좌우 이동 |
| SPACE | 기본 발사 |
| Z | 미사일 (3방향) |
| X | 폭탄 (화면의 모든 적 제거) |
| R | 재시작 (게임 오버 후) |

## 규칙

- 모든 적을 처치하면 다음 레벨
- 레벨 3, 6, 9는 보스전 (보스 처치 시 +2000점)
- 레벨 10 클리어 시 GAME CLEAR
- 목숨 3개, 피격 시 1개 감소. 적기와 직접 부딪히면 즉시 게임 오버
- 적 처치 시 20% 확률로 아이템 드롭: ❤ 목숨 +1, ⚡ 속사 3초, 🔰 보호막 1.8초

## 파일 구조

```
app.py                 Flask 서버, 최고 점수 API
templates/index.html   게임 화면
static/game.js         게임 로직 + 렌더링 (Canvas)
static/style.css       스타일
static/images/         원본 프로젝트의 player / enemy / boss 이미지
requirements.txt
```

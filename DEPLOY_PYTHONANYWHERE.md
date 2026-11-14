# PythonAnywhere 배포 가이드 (무료 플랜)

무료 플랜 기준: 웹 앱 1개, `본인아이디.pythonanywhere.com` 주소, 하루 CPU 100초.
이 게임은 게임 로직이 브라우저에서 돌고 서버는 점수 저장만 하므로 이 한도 안에서 충분합니다.
`scores.json`은 PythonAnywhere 디스크에 남기 때문에 재배포해도 점수가 지워지지 않습니다.

`본인아이디`는 PythonAnywhere 가입 시 정한 아이디로 바꿔서 읽으세요.

## 1. 가입
https://www.pythonanywhere.com 에서 **Beginner(무료)** 계정을 만듭니다.

## 2. 코드 받기 (Bash 콘솔)
Dashboard → **Consoles → Bash** 를 열고 아래를 실행합니다.

```bash
git clone https://github.com/a39161026-dotcom/galaga-flask.git
cd galaga-flask
```

> 저장소가 비공개(private)라서 clone이 인증을 요구하면, GitHub에서 Personal Access Token(repo 권한)을 만들어
> `https://<토큰>@github.com/a39161026-dotcom/galaga-flask.git` 형태로 주소를 바꿔 쓰거나,
> 저장소를 Public으로 바꾸면 됩니다. (점수 저장 파일이나 비밀값은 저장소에 없습니다.)

## 3. 가상환경 만들고 패키지 설치
```bash
mkdir -p ~/.virtualenvs
python3.12 -m venv ~/.virtualenvs/galaga
source ~/.virtualenvs/galaga/bin/activate
pip install -r ~/galaga-flask/requirements.txt
```

## 4. 웹 앱 만들기
1. **Web** 탭 → **Add a new web app**
2. 도메인은 기본값(`본인아이디.pythonanywhere.com`) 그대로 두고 **Next**
3. **Manual configuration**을 고르고 **Python 3.12** 선택 → 마침

## 5. 설정 (Web 탭에서)
- **Source code**: `/home/본인아이디/galaga-flask`
- **Working directory**: `/home/본인아이디/galaga-flask`
- **Virtualenv**: `/home/본인아이디/.virtualenvs/galaga`
- **Static files** 표에 하나 추가:
  - URL: `/static/`
  - Directory: `/home/본인아이디/galaga-flask/static/`

## 6. WSGI 파일 수정
Web 탭의 **WSGI configuration file** 링크를 열어서, 기존 내용을 전부 지우고 아래로 바꿉니다.

```python
import sys

path = "/home/본인아이디/galaga-flask"
if path not in sys.path:
    sys.path.insert(0, path)

from app import app as application
```

저장한 뒤 Web 탭 맨 위의 **Reload** 버튼을 누릅니다.

## 7. 확인
`https://본인아이디.pythonanywhere.com` 을 열어 게임이 뜨고, 게임 오버 후 점수 등록이 되는지 확인하세요.
에러가 나면 Web 탭의 **Error log** 링크 내용을 복사해서 보내 주세요.

## 코드 업데이트할 때
Bash 콘솔에서 `cd ~/galaga-flask && git pull` 후, Web 탭에서 **Reload**를 누르면 됩니다.

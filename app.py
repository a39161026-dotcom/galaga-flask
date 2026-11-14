import json
import os
import tempfile
import threading

from flask import Flask, jsonify, render_template, request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SCORES_FILE = os.path.join(BASE_DIR, "scores.json")
MAX_SCORES = 10
MAX_NAME_LEN = 12
MAX_SCORE = 10_000_000

app = Flask(__name__)
_lock = threading.Lock()


def load_scores():
    try:
        with open(SCORES_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (OSError, ValueError):
        return []


def save_scores(scores):
    # 임시 파일에 쓴 뒤 교체해서 파일이 중간에 깨지지 않게 함
    fd, tmp = tempfile.mkstemp(dir=BASE_DIR, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(scores, f, ensure_ascii=False, indent=2)
    os.replace(tmp, SCORES_FILE)


@app.route("/")
def index():
    return render_template("index.html")


@app.get("/api/scores")
def get_scores():
    with _lock:
        return jsonify(load_scores())


@app.post("/api/scores")
def post_score():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()[:MAX_NAME_LEN] or "PLAYER"
    score = data.get("score")
    if not isinstance(score, int) or isinstance(score, bool) or not (0 <= score <= MAX_SCORE):
        return jsonify(error="invalid score"), 400

    with _lock:
        scores = load_scores()
        scores.append({"name": name, "score": score})
        scores.sort(key=lambda s: s["score"], reverse=True)
        scores = scores[:MAX_SCORES]
        save_scores(scores)
    return jsonify(scores)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)

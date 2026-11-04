# SuperSoul

One-to-one and one-to-many video calling with JWT auth, Agora RTC + Chat, and call logs.

> Monorepo lives at the repo root (not under `supersoul-video/`).

## Phase 0 — local setup

### Prerequisites
- Docker Desktop (Postgres + Redis) — required for `docker compose up`
- Python 3.11+ and Node.js 20+

If `docker` is not on your PATH, install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and restart the terminal before bringing up Postgres/Redis.

### 1. Environment
```bash
cp .env.example .env
# Fill AGORA_APP_ID, AGORA_APP_CERTIFICATE, and later Chat keys
```

### 2. Infra
```bash
docker compose up -d
```

### 3. Backend
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Health check: [http://localhost:8000/health](http://localhost:8000/health)

### 4. Frontend
```bash
cd frontend
npm install
npm run dev
```
App: [http://localhost:3000](http://localhost:3000)

See [PLAN.md](PLAN.md) for the full build phases.

# SuperSoul

One-to-one and one-to-many video calling with JWT auth, Agora RTC + Chat, call logs, and Redis presence.

Monorepo at the repository root. Live media never touches our API — browsers talk to Agora with tokens minted by FastAPI.

```
Browser → Nginx → FastAPI x2 → PostgreSQL / Redis / Agora REST
       ↘ Agora RTC + Chat (media & messages)
```

## Quick start (after Phase 6 — local hybrid)

Use this while developing: Docker only for Postgres + Redis, API and Next.js on the host.

```powershell
cd C:\Users\vipad\SuperSoul
copy .env.example .env
# Edit .env: AGORA_APP_ID, AGORA_APP_CERTIFICATE, AGORA_CHAT_*, JWT_SECRET
# Frontend: set NEXT_PUBLIC_* in frontend\.env.local (or root .env for reference)

# Infra only — if full compose is heavy, run:
docker compose up -d postgres redis

cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# New terminal
cd C:\Users\vipad\SuperSoul\frontend
npm install
npm run dev
```

- App: http://localhost:3000  
- API: http://localhost:8000/health  
- `NEXT_PUBLIC_API_URL=http://localhost:8000`

## Full stack (`docker compose up`)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```powershell
cd C:\Users\vipad\SuperSoul
copy .env.example .env
# Fill Agora + JWT secrets. For compose UI:
# NEXT_PUBLIC_API_URL=http://localhost/api
# CORS_ORIGINS=http://localhost,http://127.0.0.1

docker compose up --build -d
```

- App via Nginx: http://localhost  
- API via Nginx: http://localhost/api/health  
- Two API replicas (`api1`, `api2`), migrations run once via `migrate`

```powershell
docker compose logs -f api1
docker compose down
```

## Environment

See [`.env.example`](.env.example). Never commit `.env`.

| Var | Where |
|---|---|
| `AGORA_APP_CERTIFICATE`, `JWT_SECRET`, Chat REST host | Backend only |
| `NEXT_PUBLIC_AGORA_APP_ID`, `NEXT_PUBLIC_AGORA_CHAT_APP_KEY` | Frontend build |

## Scaling

- APIs are **stateless**; presence and rate limits live in **Redis**.
- Nginx `least_conn` load-balances `api1` + `api2`.
- Add more API services behind the same upstream to scale horizontally.

## Deploy (HTTPS)

1. **EC2 (or any Linux VM):** install Docker, clone repo, create `.env`, open ports 80/443.
2. Put **Caddy** or **Nginx + Certbot** in front for TLS (camera/mic require HTTPS off localhost).
3. Point DNS at the box; set `CORS_ORIGINS` and `NEXT_PUBLIC_API_URL` to `https://your.domain/api`.
4. Rebuild web with production `NEXT_PUBLIC_*` args.
5. Optional: host frontend on **Vercel** and API stack on EC2; set Vercel env + CORS accordingly.
6. Test with two real devices on the shared room link.

## API (main)

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/signup`, `/auth/login` | JWT |
| GET | `/auth/me` | Current user |
| POST | `/rooms` | Create room |
| POST | `/rooms/{slug}/join` | RTC + chat tokens |
| POST | `/rooms/{slug}/heartbeat` | Presence |
| POST | `/rooms/{slug}/leave` | Leave + session close |
| GET | `/rooms/{slug}/sessions` | Call logs |
| GET | `/health` | Health |

Full plan: [PLAN.md](PLAN.md).

## Known limitations

- Chat needs Agora Chat enabled + App Key / REST host.
- Recording / STT / screen share are Phase 8 bonus.
- Docker must be installed for `docker compose up` on a clean clone.

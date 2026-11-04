# SuperSoul Video Calling App: Master Plan

> For the Cursor agent. Read this whole file first, then work **one phase at a time**.

## 0. Agent working rules
1. Before each phase, write a plan of 10 lines or fewer (files to touch, why). Then code.
2. Finish a phase, run it, verify it works, then `git commit -m "phase N: ..."`. Never start the next phase on broken code.
3. Small typed modules. No giant files. No blind generation: explain non-obvious choices in one line.
4. **Never guess Agora SDK or token-builder APIs.** Check the current Agora docs first. If a doc is ambiguous, stop and ask.
5. No secrets in git. Everything goes through `.env`, and `.env.example` is committed.
6. If something here conflicts with reality, tell me and propose a change. Don't silently deviate.

## 1. Goal and constraints
- One-to-one **and** one-to-many video calls, JWT auth, call logs in the DB, live chat during calls, scalability for concurrent calls.
- Bonus: screen share, call recording and replay, speech-to-text.
- Deadline: 48 hours. Submission needs a **GitHub URL and a live hosted link**.
- Browsers only allow camera and mic on **HTTPS** (or localhost), so deployment must use HTTPS.

## 2. Stack (decided)
| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router, TypeScript), Tailwind, `agora-rtc-sdk-ng`, `agora-chat` |
| Backend | FastAPI, SQLAlchemy 2 (async), Alembic, Pydantic v2 |
| DB | PostgreSQL (metadata only; Agora stores chat) |
| Video and chat | Agora RTC + Agora Chat |
| Auth | JWT (HS256, passlib/bcrypt) |
| Cache and queue | Redis (presence, rate limit, Celery broker) |
| Infra | Docker Compose, Nginx, 2 API replicas |

## 3. Architecture
```
Browser (Next.js)
  |-- REST (JWT) ------------> Nginx --> FastAPI x2 --> PostgreSQL
  |                                          |--------> Redis
  |                                          '--------> Agora REST (chat user/room, cloud recording)
  |-- media (RTC token) ----> Agora RTC     (video never touches our backend)
  '-- chat (chat token) ----> Agora Chat
```

## 4. Repo structure
> **Layout note:** Monorepo is at the **repository root** (not nested under `supersoul-video/`).

```
backend/
  app/
    main.py  config.py  db.py  models.py  schemas.py  security.py  deps.py
    routers/{auth.py, rooms.py}
    services/{agora.py, redis_client.py, presence.py, rate_limit.py}
    tasks/
  alembic/  Dockerfile  requirements.txt
frontend/
  app/{login, signup, dashboard, room/[slug]}
  components/{VideoGrid, ChatPanel, Controls}
  lib/{api.ts, auth.ts}
nginx/nginx.conf
docker-compose.yml  .env.example  README.md  PLAN.md
```

## 5. Environment variables
Backend: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_EXPIRE_MINUTES`, `CORS_ORIGINS`, `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, `AGORA_CHAT_APP_KEY`, `AGORA_CHAT_REST_HOST`, bonus: `S3_*` / `R2_*`.
Frontend: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_AGORA_APP_ID`, `NEXT_PUBLIC_AGORA_CHAT_APP_KEY`.

> **Doc conflict:** Current Agora Chat uses App Key + REST host; tokens use App ID + App Certificate. No separate Chat client id/secret in the current enable flow.

The App Certificate **never** reaches the frontend.

## 6. Database schema
- `users`: `id uuid pk`, `email unique`, `password_hash`, `name`, `agora_uid int unique`, `created_at`
- `rooms`: `id uuid pk`, `slug unique`, `title`, `host_id fk users`, `max_participants int default 10`, `chat_room_id text null`, `is_active bool`, `created_at`
- `call_sessions`: `id uuid pk`, `room_id fk`, `started_at`, `ended_at null`, `recording_url null`, `transcript text null`
- `participants`: `id uuid pk`, `session_id fk`, `user_id fk`, `joined_at`, `left_at null`

Indexes: `rooms(slug)`, `call_sessions(room_id, started_at desc)`, `participants(session_id)`, `participants(user_id)`.

## 7. API
| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/signup` | Create user, register Agora Chat user, return JWT |
| POST | `/auth/login` | Return JWT (rate limited) |
| GET | `/auth/me` | Current user |
| POST | `/rooms` | Create room + Agora chat room |
| GET | `/rooms/mine` | My rooms |
| GET | `/rooms/{slug}` | Room info |
| POST | `/rooms/{slug}/join` | Access check + tokens |
| POST | `/rooms/{slug}/heartbeat` | Refresh presence |
| POST | `/rooms/{slug}/leave` | Leave; close session when empty |
| GET | `/rooms/{slug}/sessions` | Call logs |
| POST | `/rooms/{slug}/recording/start` and `/stop` | Bonus |
| GET | `/health` | Docker / Nginx |

Channel name = room slug.

## 8. Redis usage
1. Presence ZSET `room:{slug}:members` (90s prune, join limit → 409).
2. Rate limiting `rl:{route}:{ip or user}`.
3. Celery broker (bonus).

## 9. Phases
- Phase 0: Setup (this phase)
- Phase 1: Auth backend
- Phase 2: Rooms and Agora tokens
- Phase 3: Frontend auth and dashboard
- Phase 4: Video call UI
- Phase 5: Live chat
- Phase 6: Call logs and Redis
- Phase 7: Docker, scaling, deploy
- Phase 8: Bonus (screen share, recording, STT)
- Phase 9: README and submit

## 10. Definition of done
- Two+ devices can join the same link and see/hear each other; chat works; call logs visible; full room → 409; `docker compose up` from clean clone; HTTPS live link; no secrets in repo; README complete.

## 11. Submission
Email **bhavesh@levelsupermind.com** and **hr@levelsupermind.com**.
Subject: `SuperSoul Tech Hiring - [Your Name]`.
Body: GitHub URL and live link only.
GitHub: https://github.com/AKteen/supersoul.git

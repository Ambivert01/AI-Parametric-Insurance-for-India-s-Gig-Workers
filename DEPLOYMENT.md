# DEPLOYMENT.md — Production Deployment

For local development, see [`SETUP.md`](./SETUP.md) instead — this document is production only.

---

## 1. Hosting Platform

**Recommended: a single VPS running the provided `docker-compose.yml` directly.** This matches what's actually built (5-container stack: mongo, redis, backend, ml-service, frontend, nginx) with no adaptation needed. A 4 vCPU / 8GB RAM box (DigitalOcean, Hetzner, Linode, AWS Lightsail — any of them) comfortably runs the whole stack for moderate traffic.

**Alternative: split managed services**, if you outgrow a single box or want provider-managed scaling per component:

| Component | Where it could move | What changes |
|---|---|---|
| MongoDB | MongoDB Atlas | Swap `MONGO_URI` to the Atlas connection string; drop the `mongo` service from `docker-compose.yml` |
| Redis | Upstash / Redis Cloud | Swap `REDIS_HOST`/`REDIS_PASS`; drop the `redis` service |
| Backend + ML service | Render, Railway, Fly.io | Each already has a working `Dockerfile` — deploy them as-is on any container-based PaaS |
| Frontend | Vercel, Netlify, Cloudflare Pages | Static build output from `npm run build`; point `VITE_API_BASE_URL` at wherever the backend ends up |

The single-VPS path is what the rest of this document assumes, since it requires zero code changes.

---

## 2. Build Command

```bash
docker compose build
```

Builds all three application images (`backend`, `frontend`, `ml-service`) from their Dockerfiles. Individually, if you need to rebuild just one:
```bash
docker compose build backend
docker compose build frontend
docker compose build ml-service
```

The frontend's Dockerfile is a multi-stage build (`npm run build` via Vite, then served as static files by `serve`) — there's no separate "build step" to run outside Docker unless you're deploying the frontend to a static host (Vercel/Netlify), in which case their own build command is just `npm run build` with output in `frontend/dist/`.

---

## 3. Environment Variables

Same `.env` file, `env_file: .env` in `docker-compose.yml` for every service. Production-specific differences from local dev (§4 of `SETUP.md`):

```bash
NODE_ENV=production
ALLOWED_ORIGINS=https://your-domain.com
```

**Before going live, fill in for real** (all safely mock in dev, none safe to leave mocked in production):
- `OPENWEATHER_API_KEY`, `AQICN_API_KEY` — the trigger engine can't detect anything without these.
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_PAYOUT_ACCOUNT` / `RAZORPAY_WEBHOOK_SECRET` — no real payments happen without these; also register your production webhook URL (`https://your-domain.com/api/v1/webhooks/razorpay`) in the Razorpay dashboard.
- `TWILIO_*` — OTP delivery and WhatsApp/SMS notifications.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `ENCRYPTION_KEY` — generate fresh, strong random values for production; **never reuse dev secrets.**
- `ML_SERVICE_SECRET` — same value must be set on both `backend` and `ml-service`; make sure `ML_SERVICE_TESTING` is **not** set (or explicitly `false`) — that flag disables ML service auth entirely.

**Secrets management:** for anything beyond a single trusted operator, don't keep production secrets in a plain `.env` file on disk long-term. Use your platform's secret store (Docker Swarm/Kubernetes secrets, or at minimum restrict `.env`'s file permissions to `600` and keep it out of any backup that isn't itself encrypted). Rotate `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` periodically — rotating invalidates all existing sessions, so plan for a brief re-login wave.

Optional, for real (not mock) blockchain logging:
```bash
ETHEREUM_RPC_URL=https://sepolia.infura.io/v3/<your-key>   # or a mainnet/L2 RPC once you're past testnet
ORACLE_PRIVATE_KEY=<funded wallet private key>
GIGSHIELD_CONTRACT_ADDRESS=<from `npm run deploy:sepolia` output>
LOYALTY_POOL_CONTRACT_ADDRESS=<same>
```
Leave all three unset and blockchain logging runs in mock mode — honestly labeled as such everywhere it's surfaced in the UI (see `PHASE5_CHANGELOG.md`), never presented as if it were real.

---

## 4. Domain

Point an A record (and AAAA if you have IPv6) at your VPS's public IP:
```
your-domain.com.       A     <VPS_IP>
www.your-domain.com.   A     <VPS_IP>
```
Propagation is usually minutes, occasionally up to 24-48h depending on your registrar/DNS provider. Verify with `dig your-domain.com` before moving to SSL setup — certbot's domain validation will fail if DNS isn't live yet.

If you split services across managed platforms (§1 alternative), each gets its own subdomain instead (`api.your-domain.com` → backend, `app.your-domain.com` → frontend), and `ALLOWED_ORIGINS`/`VITE_API_BASE_URL` need to reflect that split.

---

## 5. SSL

`nginx/nginx.conf` ships with the HTTP server block active and the HTTPS block commented out, so the stack runs on plain HTTP the moment you deploy it — HTTPS is a deliberate second step once your domain is live, not a blocker to first deploy.

**Get a free certificate with certbot:**
```bash
# On the VPS, once nginx is already running via docker-compose (§7):
sudo apt-get install -y certbot
sudo certbot certonly --webroot -w /opt/gigshield/nginx/webroot \
  -d your-domain.com -d www.your-domain.com

# Copy the issued cert where nginx.conf expects it:
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/
```

Then in `nginx/nginx.conf`:
1. Uncomment the `return 301 https://$host$request_uri;` line in the HTTP server block.
2. Uncomment the entire HTTPS `server { listen 443 ssl; ... }` block.
3. Replace `your-domain.com` in that block with your real domain.
4. `docker compose restart nginx`.

**Auto-renewal** (certs expire every 90 days):
```bash
sudo crontab -e
# add:
0 3 * * * certbot renew --quiet --deploy-hook "cp /etc/letsencrypt/live/your-domain.com/*.pem /opt/gigshield/nginx/ssl/ && docker compose -f /opt/gigshield/docker-compose.yml restart nginx"
```

---

## 6. Reverse Proxy

`nginx/nginx.conf` (already in the repo) handles all external traffic:

| Path | Routed to | Notes |
|---|---|---|
| `/api/*` | `backend:5000` | Rate-limited at the edge (20 req/s/IP, burst 40) in front of the backend's own per-endpoint limiters |
| `/socket.io/*` | `backend:5000` | WebSocket upgrade headers included — real-time claim/trigger updates |
| `/health` | `backend:5000/health` | For external uptime monitors |
| `/*` | `frontend:3000` | Everything else — the React SPA |

The **ML service is intentionally never exposed through nginx** — it's internal-network-only, reachable at `http://ml-service:8000` from the `backend` container via Docker's internal network, gated by `x-service-secret`. There's no reason for it to be internet-facing, and keeping it off the public path is a real security boundary, not an oversight.

`client_max_body_size 15m` is set for KYC selfie/document uploads — raise it if you add larger upload types later.

---

## 7. Docker

```bash
# First deploy
git clone <your-repo-url> /opt/gigshield && cd /opt/gigshield
cp .env.example .env   # fill in real production values (§3)
docker compose up -d --build

# Subsequent deploys
git pull origin main
docker compose up -d --build
docker image prune -f   # clean up old image layers
```

All five services (`mongo`, `redis`, `backend`, `ml-service`, `frontend`) plus `nginx` are `restart: unless-stopped` — they come back automatically after a VPS reboot or crash, without manual intervention.

**Check everything's actually healthy:**
```bash
docker compose ps                       # all should show "healthy" or "running"
curl http://localhost/health             # via nginx
curl http://localhost:5000/health        # backend directly
curl http://localhost:8000/health        # ml-service directly
docker compose logs -f backend           # tail logs for any service
```

**Persistent data** lives in two named Docker volumes (`mongo_data`, `redis_data`) — these survive `docker compose down` (but not `docker compose down -v`, which deletes volumes too — never run that in production without a fresh backup first).

---

## 8. CI/CD

`.github/workflows/ci.yml` runs on every push/PR to `main`/`develop`: backend test suite (95 tests), frontend build, ML service install + syntax check, and a real Solidity compile check (via the `solc` npm package directly, sidestepping Hardhat's own compiler-binary download so it isn't dependent on that CDN being reachable from the CI runner).

`.github/workflows/deploy.yml` is a ready-to-use **template** for continuous deployment: on every push to `main`, it runs the full CI suite first, then SSHes into your server and does `git pull && docker compose up -d --build`. It needs three GitHub repo secrets before it'll actually run (**Settings → Secrets and variables → Actions**):

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | Your VPS's IP or domain |
| `DEPLOY_USER` | The SSH user with deploy access (don't use `root` — create a dedicated `deploy` user) |
| `DEPLOY_SSH_KEY` | Private key for that user (add the matching public key to the server's `~/.ssh/authorized_keys`) |

Until those three secrets are set, `deploy.yml` will fail at the SSH step — that's expected and safe (it won't silently do nothing, it'll show a clear failed run). Set them up when you're ready for push-to-deploy; until then, deploy manually via §7.

---

## 9. Production Checklist

Before pointing real users at this:

- [ ] `.env` has real, unique, non-dev values for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `MONGO_PASS`, `REDIS_PASS` (all generated fresh — see the command in `SETUP.md` §4)
- [ ] `NODE_ENV=production` set
- [ ] `ALLOWED_ORIGINS` restricted to your real domain(s) only — not `*`, not `localhost`
- [ ] Real `OPENWEATHER_API_KEY` + `AQICN_API_KEY` configured (trigger engine is inert without them)
- [ ] Real Razorpay credentials configured, webhook registered and pointing at `https://your-domain.com/api/v1/webhooks/razorpay`
- [ ] Real Twilio credentials configured (or accept that OTP/notifications stay console-logged, which is not viable for real users)
- [ ] SSL certificate installed and HTTPS redirect active (§5)
- [ ] `ML_SERVICE_SECRET` set and matching between `backend` and `ml-service`, `ML_SERVICE_TESTING` unset or `false`
- [ ] MongoDB and Redis passwords are not the `.env.example` placeholders
- [ ] `docker compose ps` shows every service healthy
- [ ] Backend test suite passes (`cd backend && npm test` — 95/95)
- [ ] Ran `npm run seed` **only if** you actually want demo data in production (you probably don't — it's for demos/testing, not real launch)
- [ ] Confirmed a real end-to-end flow manually: register → OTP → onboard → buy a policy → (optionally) manually inject a test trigger as admin → see a claim process
- [ ] Backup strategy in place for `mongo_data` (see §11)
- [ ] Blockchain: either genuinely configured with a funded wallet (`ETHEREUM_RPC_URL`/`ORACLE_PRIVATE_KEY`/`GIGSHIELD_CONTRACT_ADDRESS`), or consciously accepted as mock-mode-only for now — don't leave it half-configured (e.g., an RPC URL set but no contract address), which would just cause every on-chain-logging attempt to fail

---

## 10. Monitoring

**Built-in health endpoints** (already wired into Docker healthchecks in `docker-compose.yml`):
- `GET /health` on the backend (port 5000) — checks DB/Redis connectivity too, not just "process is up"
- `GET /health` on the ml-service (port 8000) — confirms both ML models loaded

**Recommended, not currently integrated (nothing in this codebase does this yet):**
- An uptime monitor (UptimeRobot, Better Stack, or similar) hitting `https://your-domain.com/health` every 1-5 minutes, alerting on failure.
- An error-tracking service (Sentry is the common choice for a Node + React + Python stack) — none of the three services currently report errors anywhere external; right now, an error is only visible if someone is actively watching `docker compose logs`.
- Structured log shipping (the backend already uses a structured logger — piping `docker compose logs` into something like Loki, CloudWatch Logs, or even just rotated files with `logrotate` beats relying on `docker logs` history, which is not infinite).

**What to actually watch:**
- Trigger-engine cron health — if `OPENWEATHER_API_KEY`/`AQICN_API_KEY` quota runs out or the keys expire, trigger detection silently stops working with no user-facing error. Watch backend logs for repeated `Weather API failed` / `AQI API failed` entries.
- Bull queue depth — a growing backlog in the claim-processing or payout queues (visible via Redis, or add Bull Board if you want a UI for it) means something downstream is failing repeatedly and retrying.
- Razorpay webhook delivery failures (visible in the Razorpay dashboard) — a missed webhook means a payment/payout status update never reached the backend.

---

## 11. Scaling Notes

**The single most important thing to know before scaling horizontally: workers and cron jobs run in-process with the API server**, not as separate processes (see `SETUP.md` §9). If you naively run multiple `backend` replicas behind a load balancer:
- Cron jobs (trigger polling, daily analytics snapshot, selfie-hold expiry) fire **once per replica**, not once total — N replicas means the weather API gets called N× as often, and the daily analytics snapshot gets computed (and upserted) N times.
- Bull queue workers from every replica pull from the *same* Redis-backed queues, which Bull handles safely (no duplicate job processing) — this part scales fine.

**Before scaling backend replicas**, split cron/worker responsibility out of the API-serving process: either (a) run exactly one replica with an env flag like `ENABLE_CRON=true` and the rest with it disabled, or (b) extract `workers/queueManager.js` and `jobs/cronJobs.js` into their own separate service/container that runs as a singleton, with the API-serving replicas only handling HTTP/WebSocket traffic. Neither exists yet in this codebase — this is a genuine "before you scale past one instance" task, not a hypothetical.

**Other scaling considerations:**
- **Socket.IO** currently runs in-memory per backend instance. Multiple replicas need the [Redis adapter for Socket.IO](https://socket.io/docs/v4/redis-adapter/) so real-time events reach clients connected to a different replica than the one that emitted the event — not configured yet.
- **MongoDB**: a single `mongo:7.0` container has no redundancy. For real production, move to a replica set (self-hosted 3-node, or MongoDB Atlas, which handles this for you) before you have data you can't afford to lose.
- **Redis**: similarly single-instance here. Redis Cluster or a managed Redis (Upstash/Redis Cloud/ElastiCache) if queue/cache availability becomes critical.
- **Frontend**: it's a static SPA after build — trivially scales by putting it behind a CDN (Cloudflare in front of nginx, or move it to Vercel/Netlify entirely per the §1 alternative) rather than running more `frontend` container replicas.
- **ML service**: stateless per-request (models are loaded once at startup, read-only after that) — safe to run multiple replicas behind the same internal load balancing Docker Compose/Swarm/K8s gives you, with zero code changes.

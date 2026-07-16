# SETUP.md — Local Development

How to get GigShield running on your own machine. For production deployment, see [`DEPLOYMENT.md`](./DEPLOYMENT.md) instead — this document is local dev only.

---

## 1. Requirements

| Tool | Version | Why |
|---|---|---|
| Node.js | ≥ 18 | Backend, frontend, blockchain tooling |
| npm | ≥ 9 (ships with Node 18) | Package management |
| Python | 3.11 | ML service |
| MongoDB | 7.0 | Primary database |
| Redis | 7.2 | Caching, queues (Bull), rate limiting |
| Git | any recent | Clone the repo |

You do **not** need Docker to develop locally — it's optional (§8). You **do** need MongoDB and Redis running somehow, either natively installed or via Docker just for those two.

---

## 2. Clone

```bash
git clone <your-repo-url> gigshield
cd gigshield
```

Repo layout:
```
backend/       Node.js/Express API, workers, cron jobs
frontend/      React + Vite SPA
ml-service/    Python/FastAPI ML microservice
blockchain/    Solidity contracts (Hardhat)
nginx/         Reverse proxy config (production only — see DEPLOYMENT.md)
```

---

## 3. Install

Each service has its own dependencies — install all four:

```bash
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
cd ml-service && pip install -r requirements.txt && cd ..
cd blockchain && npm install && cd ..
```

---

## 4. Environment Variables

```bash
cp .env.example .env
```

Open `.env` and fill in real values. For pure local development, you only strictly need these to get the app running end to end — everything else has a safe mock fallback and can stay blank:

```bash
NODE_ENV=development
MONGO_URI=mongodb://gigshield:changeme@localhost:27017/gigshield?authSource=admin
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASS=changeme
JWT_ACCESS_SECRET=<any random string>
JWT_REFRESH_SECRET=<a different random string>
ENCRYPTION_KEY=<a 64-character hex string — see the warning below>
ML_SERVICE_URL=http://localhost:8000
ML_SERVICE_SECRET=<any random string, must match what ml-service uses>
```

Generate random secrets quickly:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**⚠️ `ENCRYPTION_KEY` — set this before your first run, not after.** If it's unset, the backend generates a random one at startup and uses it for the life of that process. Restart the server without having set it explicitly, and every previously-encrypted field (bank/UPI details) becomes permanently undecryptable. Generate one once with the command above and put it in `.env`.

Left blank, these fall back to an honest mock/dev mode automatically — no crash, no silent fake success:
- `OPENWEATHER_API_KEY` / `AQICN_API_KEY` — trigger engine polling will fail gracefully and log errors; get free keys from [openweathermap.org](https://openweathermap.org/api) and [aqicn.org/api](https://aqicn.org/data-platform/token/) if you want live weather/AQI data.
- `RAZORPAY_*` — payments run through a mock payout function instead of a real gateway.
- `TWILIO_*` / `FIREBASE_*` — OTPs and notifications log to the console instead of sending (see §10 for exactly what this looks like).
- `ETHEREUM_RPC_URL` / `ORACLE_PRIVATE_KEY` / `GIGSHIELD_CONTRACT_ADDRESS` — blockchain logging runs in mock mode, honestly labeled as such everywhere it's shown in the UI.

---

## 5. Database Setup

**Option A — native install (Ubuntu/Debian):**
```bash
# MongoDB
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update && sudo apt-get install -y mongodb-org
sudo systemctl start mongod

# Redis
sudo apt-get install -y redis-server
sudo systemctl start redis-server
```

**Option A — macOS (Homebrew):**
```bash
brew tap mongodb/brew && brew install mongodb-community@7.0 redis
brew services start mongodb-community@7.0
brew services start redis
```

**Option B — just the two databases via Docker**, no need to containerize the app itself for local dev:
```bash
docker run -d --name gigshield-mongo -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=gigshield -e MONGO_INITDB_ROOT_PASSWORD=changeme \
  mongo:7.0
docker run -d --name gigshield-redis -p 6379:6379 \
  redis:7.2-alpine redis-server --requirepass changeme
```

Either way, make sure `MONGO_URI` and `REDIS_*` in your `.env` match whatever credentials you actually set above.

No migrations to run — Mongoose creates collections and indexes automatically on first connection.

---

## 6. Run Backend

```bash
cd backend
npm run dev
```

Starts on `http://localhost:5000`. `npm run dev` uses `nodemon` (auto-restarts on file changes). This single process also starts:
- **Background workers** (`startAllWorkers`) — claim processing, payouts, blockchain logging, notifications. These run in-process, not as a separate command (see §9).
- **Cron jobs** (`startCronJobs`) — trigger-engine polling (every 5 min), daily analytics snapshot, selfie-verification-hold expiry, weather/AQI cache flush.

Confirm it's up:
```bash
curl http://localhost:5000/health
```

---

## 7. Run Frontend

```bash
cd frontend
npm run dev
```

Starts on `http://localhost:3000`. Vite's dev server proxies `/api` and `/socket.io` to `http://localhost:5000` automatically (see `frontend/vite.config.js`) — you don't need to configure CORS or a proxy yourself for local dev.

---

## 8. Run the ML Service

```bash
cd ml-service
uvicorn main:app --reload --port 8000
```

On first startup it trains and saves two demo models (`models/saved/premium_model.pkl`, `fraud_model.pkl`) from synthetic data — this takes a few seconds and only happens once (subsequent starts load the saved `.pkl` files).

Confirm it's up:
```bash
curl http://localhost:8000/health
```

`ML_SERVICE_SECRET` in `.env` must match between `backend/.env` and `ml-service/.env` (or your shared root `.env`, if using one file for both) — every ML endpoint requires it as the `x-service-secret` header. Missing or mismatched → `401 Invalid service secret` (this is a fail-closed security fix — see the header comment in `ml-service/main.py` if you're curious why).

---

## 9. Run Workers, Redis, and Other Background Things

**You don't run these separately.** Unlike some setups with dedicated worker processes, GigShield's Bull queue workers and cron jobs are started inside the same `backend` process by `npm run dev` / `npm start` (see §6). As long as Redis is running and reachable, they work automatically — nothing extra to launch.

What actually needs Redis specifically:
- Bull queues (claim processing, payouts, notifications, blockchain logging)
- Rate limiting
- Weather/AQI/forecast response caching
- Session/token blocklist on logout

If Redis isn't reachable, the backend will still start, but queue-dependent features (claims never auto-process past "detected", payouts never fire) silently stall — check `redis-cli ping` returns `PONG` first if things seem stuck.

---

## 10. Default Credentials (Demo Data)

After seeding (§11), log in as any of these. **Phone/OTP is the only auth method** — there are no passwords anywhere in this system.

| Rider | Phone | What to look at |
|---|---|---|
| Ravi Kumar | `9821000001` | Clean happy path — GREEN auto-approved claim, paid out, blockchain-logged |
| Priya Sharma | `9821000002` | Income Bridge advance → reconciled after selfie verification |
| Amit Singh | `9821000003` | RED-tier rejection (mock location), appeal pending review |
| Sunita Devi | `9821000004` | Gold loyalty tier, 11-week streak, referred Mohammed |
| Mohammed Farhan | `9821000005` | Fresh account, KYC in progress, referred by Sunita |
| Deepak Yadav | `9821000006` | Active Micro-Shift policy right now |
| Kavita Reddy / Sanjay Gupta | `9821000007` / `9821000008` | Device + UPI collusion ring, both rejected |
| Lakshmi Nair | `9821000009` | Income Bridge advance → clawed back after verification timeout |
| Rajesh Patel | `9821000010` | Brand new, zero claims — the empty-state view |
| Admin | `9800000001` | Admin dashboard, executive dashboard, fraud review |

**Getting the OTP:** with `TWILIO_ACCOUNT_SID` unset (the default for local dev), the backend logs the OTP straight to its own console instead of sending a real SMS:
```
[DEV] OTP for ***0001: 482913
```
Watch the terminal running `npm run dev` after requesting an OTP for any of the numbers above.

---

## 11. Seed Data

```bash
cd backend
npm run seed          # populate a fresh database
npm run seed:fresh    # wipe existing GigShield collections first, then populate
```

This is the dataset behind §10 above — see [`PHASE8_CHANGELOG.md`](./PHASE8_CHANGELOG.md) or `backend/seed/seedData.js` for exactly what it covers (every KYC stage, all 4 tiers + shift insurance, all 4 fraud tiers, both Income Bridge outcomes, a referral chain, a fraud ring, loyalty pool history, and a week of analytics).

Run it against an empty database the first time; use `--clear` if you need to reset later.

---

## 12. Troubleshooting

**`MongoServerError: bad auth`**
`MONGO_URI` credentials don't match what Mongo was actually started with. If you used the Docker one-liner in §5, the username/password are `gigshield`/`changeme` — make sure `.env` matches exactly, including `?authSource=admin` at the end of the URI.

**`ECONNREFUSED` on Redis**
Redis isn't running, or `REDIS_PASS` doesn't match. Test directly: `redis-cli -a changeme ping` should return `PONG`.

**Frontend loads but every API call fails / CORS errors in the browser console**
Check the backend is actually running on port 5000 and `ALLOWED_ORIGINS` in `.env` includes `http://localhost:3000`. If you changed the frontend's dev port, update both `vite.config.js`'s `server.port` and `ALLOWED_ORIGINS`.

**`401 Invalid service secret` from the ML service**
`ML_SERVICE_SECRET` differs between the backend's env and the ML service's env. They must be identical. Also check `ML_SERVICE_TESTING` isn't accidentally left `true` in a real dev session — that flag disables ML auth entirely and should only be set by automated tests.

**OTP never arrives**
You're not looking at the right place — see §10. If `TWILIO_ACCOUNT_SID` is set in `.env`, the backend will try to send a *real* SMS via Twilio instead of logging to console; unset it for local dev unless you specifically want to test the real integration.

**Claims/payouts seem stuck at "detected" forever**
Almost always Redis. The trigger→claims→payout pipeline runs through Bull queues, which need Redis. Confirm `redis-cli ping` works, then check the backend console for queue connection errors.

**`npx hardhat compile` fails or hangs (blockchain folder)**
Hardhat 3 downloads its own managed `solc` binary from its own CDN on first compile — this needs outbound internet access to `binaries.soliditylang.org` (or wherever Hardhat's installed version points). If you're behind a restrictive firewall/proxy, this is the most likely cause. You can sanity-check the contracts compile correctly without Hardhat's own compiler management:
```bash
cd blockchain
npm install solc@0.8.20 --no-save
node -e "
const solc = require('solc'); const fs = require('fs');
const files = ['GigShieldPolicy.sol','GigShieldLoyaltyPool.sol'];
const sources = {}; for (const f of files) sources[f] = {content: fs.readFileSync('contracts/'+f,'utf8')};
const out = JSON.parse(solc.compile(JSON.stringify({language:'Solidity', sources, settings:{outputSelection:{'*':{'*':['abi']}}}})));
console.log((out.errors||[]).filter(e=>e.severity==='error').length ? 'FAILED' : 'OK');
"
```

**Blockchain: `ReferenceError` or deploy script fails immediately**
Make sure you're running `npx hardhat run scripts/deploy.cjs --network hardhatMainnet` for a local test deploy (starts an in-memory local chain automatically) — not against `sepolia` unless you actually have `ETHEREUM_RPC_URL` and a funded `ORACLE_PRIVATE_KEY` configured.

**Backend tests fail**
Run `cd backend && npm test` — all 95 should pass with zero setup (they use mocked models/Redis, no live database needed). If they don't, `npm install` likely didn't complete cleanly — delete `node_modules` and reinstall.

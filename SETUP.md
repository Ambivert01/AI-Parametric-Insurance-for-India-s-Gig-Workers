# SETUP.md — Local Development Guide

Complete step-by-step guide to run GigShield on your local machine.
For production deployment on Render, see [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone the Repo](#2-clone-the-repo)
3. [Install Dependencies](#3-install-dependencies)
4. [Create External Accounts & Get API Keys](#4-create-external-accounts--get-api-keys)
5. [Configure Environment Variables](#5-configure-environment-variables)
6. [Start MongoDB & Redis Locally](#6-start-mongodb--redis-locally)
7. [Seed the Database](#7-seed-the-database)
8. [Run All Services](#8-run-all-services)
9. [Verify Everything Works](#9-verify-everything-works)
10. [Demo Login Credentials](#10-demo-login-credentials)
11. [Run Tests](#11-run-tests)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

Install these before starting:

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 18 | https://nodejs.org or `nvm install 18` |
| npm | ≥ 9 (comes with Node 18) | Ships with Node |
| Python | 3.11 | https://python.org or `pyenv install 3.11` |
| Git | any | https://git-scm.com |
| Redis | 7.x | See §6 below |
| MongoDB | 7.0 | See §6 below (or use Atlas free cloud) |

Check versions:

```bash
node --version    # must show v18.x.x or higher
npm --version     # must show 9.x.x or higher
python3 --version # must show 3.11.x
git --version
```

---

## 2. Clone the Repo

```bash
git clone https://github.com/Ambivert01/AI-Parametric-Insurance-for-India-s-Gig-Workers.git gigshield
cd gigshield
```

Project structure:

```
gigshield/
├── backend/        Node.js + Express API, workers, cron jobs
├── frontend/       React + Vite SPA
├── ml-service/     Python FastAPI — ML risk & fraud models
├── blockchain/     Solidity smart contracts (Hardhat)
├── nginx/          Reverse proxy config (production only)
├── .env.example    Template — copy to .env and fill values
├── SETUP.md        This file — local dev guide
└── DEPLOYMENT.md   Production deploy guide
```

---

## 3. Install Dependencies

Each service has its own dependencies. Install all:

```bash
# Backend (Node.js)
cd backend && npm install && cd ..

# Frontend (Node.js)
cd frontend && npm install && cd ..

# Blockchain tooling (optional — only needed to compile/deploy contracts)
cd blockchain && npm install && cd ..
```

ML service (Python — use a virtual environment):

```bash
cd ml-service
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

---

## 4. Create External Accounts & Get API Keys

### 4.1 MongoDB Atlas (Free Cloud DB — Recommended for Local Too)

> Skip this if you prefer a local MongoDB install (see §6).

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com) → **Sign up free**
2. Create a **free M0 cluster** (512MB — enough for dev + demo)
3. **Database Access** → Add database user:
   - Username: `gigshield`
   - Password: `your-strong-password`
   - Role: `Atlas admin`
4. **Network Access** → Add IP Address → **Allow access from anywhere** (`0.0.0.0/0`)
5. **Connect** → **Connect your application** → Driver: Node.js
6. Copy the connection string. It looks like:
   ```
   mongodb+srv://gigshield:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
7. Add `/gigshield` before the `?` — this sets the database name:
   ```
   mongodb+srv://gigshield:<password>@cluster0.xxxxx.mongodb.net/gigshield?retryWrites=true&w=majority&appName=Cluster0
   ```

This becomes your `MONGO_URI`.

---

### 4.2 OpenWeatherMap API Key (Free — Required for Trigger Engine)

> Without this, the trigger engine logs errors and no weather-based claims trigger automatically. App still works otherwise.

1. Go to [openweathermap.org/api](https://home.openweathermap.org/users/sign_up) → **Sign up free**
2. Check your email and verify your account
3. Go to **API Keys** tab in your dashboard
4. Copy the **Default** key (or create a new one)
5. Note: New keys take **10–15 minutes** to activate after signup

This becomes your `OPENWEATHER_API_KEY`.

---

### 4.3 AQICN API Token (Free — Required for AQI Triggers)

> Without this, AQI-based claim triggers don't fire.

1. Go to [aqicn.org/data-platform/token](https://aqicn.org/data-platform/token/)
2. Enter your email → click **Submit**
3. Check your email → copy the token

This becomes your `AQICN_API_KEY`.

---

### 4.4 Upstash Redis (Free Cloud Redis — Optional for Local)

> For local dev, just use a native Redis install (§6). Use Upstash for production.

1. Go to [upstash.com](https://upstash.com) → **Sign up free**
2. **Create Database** → Region: **Asia Pacific (Mumbai)**
3. Go to database **Details** tab
4. Copy:
   - **Endpoint** → `REDIS_HOST`
   - **Port** → `REDIS_PORT` (usually 6379)
   - **Password** → `REDIS_PASS`
   - Full **REDIS_URL** (starts with `rediss://`)
5. Set `REDIS_TLS=true` (Upstash requires TLS)

---

### 4.5 Other Services (Optional for Local Dev)

These are **not required** for local development. The app runs in mock/dev mode without them:

| Service | Purpose | Without it |
|---|---|---|
| **Twilio** | Real SMS OTPs & WhatsApp | OTPs print to backend console |
| **Firebase** | Push notifications | Notifications skipped silently |
| **Razorpay** | Real payments | Mock payout function used |
| **AWS S3** | KYC document storage | Upload mocked locally |
| **Infura/Ethereum** | Blockchain logging | Mock mode (labeled in UI) |

See [.env.example](./.env.example) for setup instructions for each.

---

## 5. Configure Environment Variables

### Step 1 — Copy the template

```bash
cp .env.example .env
```

### Step 2 — Create a symlink so backend/seed can find it

```bash
ln -s ../.env backend/.env
```

### Step 3 — Fill in your values

Open `.env` in your editor. Minimum required for local dev:

```bash
# Core
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:3000

# MongoDB (Atlas URI from §4.1, or local URI from §6)
MONGO_URI=mongodb+srv://gigshield:yourpass@cluster0.xxxxx.mongodb.net/gigshield?retryWrites=true&w=majority&appName=Cluster0

# Redis (local — no password)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASS=
REDIS_URL=redis://localhost:6379
REDIS_TLS=false

# Auth secrets — generate each with:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_ACCESS_SECRET=<64-char-hex>
JWT_REFRESH_SECRET=<different-64-char-hex>
ENCRYPTION_KEY=<another-64-char-hex>   # ⚠️ SET ONCE, NEVER CHANGE

# ML service
ML_SERVICE_URL=http://localhost:8000
ML_SERVICE_SECRET=any-local-secret-string

# Weather & AQI (from §4.2 and §4.3)
OPENWEATHER_API_KEY=your-openweather-key
AQICN_API_KEY=your-aqicn-token

# Frontend
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

### Step 3b — ML service also needs its secret

```bash
echo "ML_SERVICE_SECRET=any-local-secret-string" > ml-service/.env
echo "ML_SERVICE_TESTING=false" >> ml-service/.env
```

The `ML_SERVICE_SECRET` value must be **identical** in both `.env` and `ml-service/.env`.

---

## 6. Start MongoDB & Redis Locally

### Option A — Docker (Easiest — just the two databases)

```bash
# MongoDB
docker run -d --name gigshield-mongo -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=gigshield \
  -e MONGO_INITDB_ROOT_PASSWORD=changeme \
  mongo:7.0

# Redis (no password for local dev)
docker run -d --name gigshield-redis -p 6379:6379 \
  redis:7.2-alpine
```

If using Docker MongoDB, set in `.env`:
```bash
MONGO_URI=mongodb://gigshield:changeme@localhost:27017/gigshield?authSource=admin
```

### Option B — Native Install (Ubuntu/Debian)

```bash
# MongoDB 7.0
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update && sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod

# Redis
sudo apt-get install -y redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

### Option C — Native Install (macOS with Homebrew)

```bash
brew tap mongodb/brew
brew install mongodb-community@7.0 redis
brew services start mongodb-community@7.0
brew services start redis
```

### Verify databases are running

```bash
# MongoDB
mongosh --eval "db.runCommand({ connectionStatus: 1 })"

# Redis
redis-cli ping
# Should return: PONG
```

---

## 7. Seed the Database

Populate the database with 10 demo riders, policies, claims, and analytics:

```bash
cd backend
npm run seed
```

To wipe everything and reseed fresh:

```bash
npm run seed:fresh
```

Expected output:

```
✅ Users: inserted 12
✅ Trigger Events: inserted 6
✅ Policies: inserted 10
✅ Claims: inserted 7
✅ Payouts: inserted 5
✅ Fraud Logs: inserted 3
✅ Loyalty Pools: inserted 2
✅ Analytics Snapshots: inserted 7
🎉 Demo dataset seeded successfully.
```

---

## 8. Run All Services

Open **3 separate terminal tabs/windows**:

### Terminal 1 — Backend

```bash
cd backend
npm run dev
```

Wait for:

```
✅ Redis connected
✅ Redis ready
✅ All queue workers running
📅 All cron jobs registered
✅ GigShield backend fully operational
🚀 GigShield API running on port 5000 [development]
```

### Terminal 2 — Frontend

```bash
cd frontend
npm run dev
```

Wait for:

```
VITE v5.x.x  ready in xxx ms
➜  Local:   http://localhost:3000/
```

### Terminal 3 — ML Service

```bash
cd ml-service
source venv/bin/activate    # Windows: venv\Scripts\activate
uvicorn main:app --reload --port 8000
```

First run trains models (~10 seconds). Wait for:

```
⚡ Pre-loading ML models...
✅ ML models ready (premium + fraud + predictive)
INFO:     Application startup complete.
```

---

## 9. Verify Everything Works

```bash
# Backend health (should return {"status":"healthy",...})
curl http://localhost:5000/health

# ML service health
curl http://localhost:8000/health
```

Open browser: **http://localhost:3000**

---

## 10. Demo Login Credentials

Phone/OTP is the only auth method — no passwords.

**Getting OTP in local dev:** Backend terminal prints it:

```
[DEV] OTP for ***0001: 482913
```

Watch Terminal 1 (backend) after requesting an OTP.

| Phone | Rider | What to Demo |
|---|---|---|
| `9821000001` | Ravi Kumar | Happy path — GREEN claim, paid, blockchain-logged |
| `9821000002` | Priya Sharma | Income Bridge advance → reconciled |
| `9821000003` | Amit Singh | RED fraud rejection — mock location — appeal pending |
| `9821000004` | Sunita Devi | Gold loyalty tier, 11-week streak |
| `9821000005` | Mohammed Farhan | KYC in progress, referred by Sunita |
| `9821000006` | Deepak Yadav | Active Micro-Shift policy right now |
| `9821000007` | Kavita Reddy | Device + UPI collusion ring — rejected |
| `9821000008` | Sanjay Gupta | Same collusion ring as Kavita — rejected |
| `9821000009` | Lakshmi Nair | Income Bridge → clawback (timeout) |
| `9821000010` | Rajesh Patel | Brand new account — empty state |
| `9800000001` | Admin | Full admin + fraud dashboard |

---

## 11. Run Tests

```bash
cd backend
npm test
# All 95 tests should pass — no live DB or Redis needed (fully mocked)
```

---

## 12. Troubleshooting

**`❌ MONGO_URI is not set`**
Run `ln -s ../.env backend/.env` from the project root. The symlink connects the root `.env` to where the seed script looks.

**`MongoServerError: bad auth`**
Credentials in `MONGO_URI` don't match what MongoDB was started with. Check username/password and `?authSource=admin` at end of URI for local installs.

**`Redis error: getaddrinfo ENOTFOUND redis`**
`REDIS_HOST` is set to `redis` (Docker internal name). For local dev set it to `localhost`.

**`Redis error: ECONNREFUSED`**
Redis isn't running. Run `redis-cli ping` — if no PONG, start Redis with `sudo systemctl start redis-server` or `brew services start redis`.

**`401 Invalid service secret` from ML service**
`ML_SERVICE_SECRET` in `.env` and `ml-service/.env` don't match. They must be identical strings.

**`429 Too Many Requests` in browser**
Rate limiter is hitting in dev. This is fixed in `constants.js` — dev mode allows 10,000 req/15min. Restart backend if you made this change after starting.

**Frontend loads but all API calls fail / CORS errors**
Backend is not running on port 5000, or `ALLOWED_ORIGINS` doesn't include `http://localhost:3000`.

**OTP not showing in terminal**
Make sure `TWILIO_ACCOUNT_SID` is NOT set in `.env` — when set, it tries to send real SMS instead of logging to console.

**Claims stuck at "detected" forever**
Redis is not running or not reachable. The claim processing pipeline runs entirely through Bull queues which need Redis.

**ML models not loading / `pkl` file error**
Delete `ml-service/models/saved/` and restart the ML service — it will retrain from scratch.

**`npm run seed` gives `Cannot find module`**
The `backend/.env` symlink is missing. Run `ln -s ../.env backend/.env` from project root.

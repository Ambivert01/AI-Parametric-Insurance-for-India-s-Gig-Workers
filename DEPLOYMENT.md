# DEPLOYMENT.md — Production Deployment Guide (Render)

Complete step-by-step guide to deploy GigShield to production using Render.
For local development, see [SETUP.md](./SETUP.md).

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Create All External Accounts](#2-create-all-external-accounts)
3. [MongoDB Atlas Setup](#3-mongodb-atlas-setup)
4. [Upstash Redis Setup](#4-upstash-redis-setup)
5. [Get API Keys](#5-get-api-keys)
6. [Generate Production Secrets](#6-generate-production-secrets)
7. [Push Code to GitHub](#7-push-code-to-github)
8. [Deploy Backend on Render](#8-deploy-backend-on-render)
9. [Deploy ML Service on Render](#9-deploy-ml-service-on-render)
10. [Deploy Frontend on Render](#10-deploy-frontend-on-render)
11. [Final Configuration Updates](#11-final-configuration-updates)
12. [Seed Production Database](#12-seed-production-database)
13. [Verify Deployment](#13-verify-deployment)
14. [Production Checklist](#14-production-checklist)
15. [Monitoring & Logs](#15-monitoring--logs)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Architecture Overview

GigShield deploys as 3 services on Render + 2 managed cloud databases:

```
Internet
   │
   ├── https://gigshield-frontend-xxxx.onrender.com  ← Render Static Site
   │      React SPA (built by Vite, served as static files)
   │
   ├── https://gigshield-backend-xxxx.onrender.com   ← Render Web Service (Node)
   │      Express API + Socket.IO + Workers + Cron Jobs
   │      └── calls internally →
   │             https://gigshield-ml-xxxx.onrender.com  ← Render Web Service (Docker/Python)
   │
   ├── MongoDB Atlas (cloud.mongodb.com)  ← Managed database
   └── Upstash Redis (upstash.com)        ← Managed Redis
```

**Key points:**
- ML service is never public-facing — only the backend calls it
- Workers and cron jobs run inside the backend process (no separate worker service needed)
- Frontend is a static build — no server needed, just file serving

---

## 2. Create All External Accounts

Create accounts on all these platforms before starting. All have free tiers:

| Platform | URL | Purpose | Free Tier |
|---|---|---|---|
| **Render** | https://render.com | Host backend, ML, frontend | 3 free services |
| **MongoDB Atlas** | https://cloud.mongodb.com | Database | 512MB M0 cluster |
| **Upstash** | https://upstash.com | Redis | 10K commands/day |
| **OpenWeatherMap** | https://openweathermap.org | Weather data | 60 calls/min |
| **AQICN** | https://aqicn.org/data-platform/token | AQI data | Free token |
| **GitHub** | https://github.com | Host code for Render | Free |

Optional (app works in mock mode without these):

| Platform | URL | Purpose |
|---|---|---|
| **Twilio** | https://twilio.com | Real SMS OTPs | $15 trial credit |
| **Firebase** | https://console.firebase.google.com | Push notifications | Free |
| **Razorpay** | https://razorpay.com | Real payments | Test mode free |

---

## 3. MongoDB Atlas Setup

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com) → **Sign up / Log in**

2. **Create a new project** → Name: `GigShield`

3. **Build a Database** → Choose **M0 Free** tier → Region: **Mumbai (ap-south-1)**

4. **Authentication** → Username + Password:
   - Username: `gigshield` (or your choice)
   - Password: Generate a strong password → **save it**
   - Click **Create User**

5. **Network Access** → **Add IP Address** → **Allow Access from Anywhere** (`0.0.0.0/0`)
   > This is required because Render uses dynamic IPs

6. Wait for cluster to provision (~2 minutes)

7. Click **Connect** → **Connect your application** → Driver: **Node.js**, Version: **5.5 or later**

8. Copy the connection string:
   ```
   mongodb+srv://gigshield:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
   ```

9. **Important — add database name:** Insert `/gigshield` before the `?`:
   ```
   mongodb+srv://gigshield:<password>@cluster0.xxxxx.mongodb.net/gigshield?retryWrites=true&w=majority&appName=Cluster0
   ```

10. Replace `<password>` with your actual password. **Save this full URI** — this is your `MONGO_URI`.

---

## 4. Upstash Redis Setup

1. Go to [upstash.com](https://upstash.com) → **Sign up / Log in**

2. Click **Create Database**:
   - Name: `gigshield-redis`
   - Type: **Regional**
   - Region: **Asia Pacific (Mumbai)**
   - Click **Create**

3. Open the database → **Details** tab

4. Copy these values:
   - **Endpoint** → `REDIS_HOST` (e.g., `summary-raccoon-130780.upstash.io`)
   - **Port** → `REDIS_PORT` (usually `6379`)
   - **Password** → `REDIS_PASS`

5. Also copy the full **REDIS_URL** (starts with `rediss://`):
   ```
   rediss://default:<password>@<endpoint>:6379
   ```

6. **Important:** Upstash always requires TLS → set `REDIS_TLS=true`

---

## 5. Get API Keys

### OpenWeatherMap (Required for trigger engine)

1. Sign up at [openweathermap.org](https://home.openweathermap.org/users/sign_up)
2. Verify your email
3. Go to **API Keys** tab in your account dashboard
4. Copy the **Default** key
5. Note: New keys take **10–15 minutes** to activate

→ This is your `OPENWEATHER_API_KEY`

### AQICN (Required for AQI triggers)

1. Go to [aqicn.org/data-platform/token](https://aqicn.org/data-platform/token/)
2. Enter your email → Submit
3. Check inbox → copy the token

→ This is your `AQICN_API_KEY`

---

## 6. Generate Production Secrets

Run each command separately in your terminal:

```bash
# JWT_ACCESS_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# JWT_REFRESH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# ENCRYPTION_KEY — ⚠️ CRITICAL: Set once, never change
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# ML_SERVICE_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Save all 4 values** — you'll need them when configuring Render env vars.

> ⚠️ **ENCRYPTION_KEY warning:** This key encrypts bank/UPI account details in the database. Once set and data is stored, changing this key makes all existing encrypted fields permanently unreadable. Generate it once, save it somewhere safe.

---

## 7. Push Code to GitHub

Make sure your latest code is on GitHub:

```bash
git add -A
git commit -m "production ready"
git push origin main
```

Render will pull code directly from your GitHub repo.

---

## 8. Deploy Backend on Render

1. Go to [render.com](https://render.com) → Dashboard → **New +** → **Web Service**

2. Connect GitHub → select your `AI-Parametric-Insurance-for-India-s-Gig-Workers` repo

3. Configure the service:

   | Field | Value |
   |---|---|
   | **Name** | `gigshield-backend` |
   | **Root Directory** | `backend` |
   | **Environment** | `Node` |
   | **Build Command** | `npm install` |
   | **Start Command** | `node src/app.js` |
   | **Instance Type** | `Free` (or `Starter` for no sleep) |

4. Scroll down to **Environment Variables** → add each one:

   ```
   NODE_ENV                = production
   PORT                    = 5000
   MONGO_URI               = mongodb+srv://gigshield:<pass>@cluster0.xxxxx.mongodb.net/gigshield?retryWrites=true&w=majority&appName=Cluster0
   REDIS_HOST              = your-upstash-endpoint.upstash.io
   REDIS_PORT              = 6379
   REDIS_PASS              = your-upstash-password
   REDIS_TLS               = true
   REDIS_URL               = rediss://default:your-upstash-password@your-upstash-endpoint.upstash.io:6379
   JWT_ACCESS_SECRET       = <generated in §6>
   JWT_REFRESH_SECRET      = <generated in §6>
   JWT_EXPIRE              = 15m
   JWT_REFRESH_EXPIRE      = 7d
   BCRYPT_ROUNDS           = 10
   ENCRYPTION_KEY          = <generated in §6>
   ML_SERVICE_SECRET       = <generated in §6>
   ML_SERVICE_TESTING      = false
   OPENWEATHER_API_KEY     = <from §5>
   OPENWEATHER_BASE_URL    = https://api.openweathermap.org/data/2.5
   AQICN_API_KEY           = <from §5>
   ```

   > Leave `ML_SERVICE_URL` and `ALLOWED_ORIGINS` **blank for now** — you'll add them after ML and Frontend are deployed.

5. Click **Create Web Service**

6. Wait for deploy to complete (~3–5 minutes). Watch the build logs.

7. **Note your backend URL** — it will be something like:
   ```
   https://gigshield-backend-xxxx.onrender.com
   ```

---

## 9. Deploy ML Service on Render

1. Render → **New +** → **Web Service**

2. Same repo → Configure:

   | Field | Value |
   |---|---|
   | **Name** | `gigshield-ml` |
   | **Root Directory** | `ml-service` |
   | **Environment** | `Docker` |
   | **Instance Type** | `Free` |

3. **Environment Variables:**

   ```
   ML_SERVICE_SECRET   = <same value as backend's ML_SERVICE_SECRET>
   ML_SERVICE_TESTING  = false
   ```

4. Click **Create Web Service**

5. First deploy takes ~5–8 minutes (Docker build + model training)

6. **Note your ML URL:**
   ```
   https://gigshield-ml-xxxx.onrender.com
   ```

---

## 10. Deploy Frontend on Render

1. Render → **New +** → **Static Site**

2. Same repo → Configure:

   | Field | Value |
   |---|---|
   | **Name** | `gigshield-frontend` |
   | **Root Directory** | `frontend` |
   | **Build Command** | `npm install && npm run build` |
   | **Publish Directory** | `dist` |

3. **Environment Variables:**

   ```
   VITE_API_BASE_URL = https://gigshield-backend-xxxx.onrender.com/api/v1
   ```

   > Replace `xxxx` with your actual backend URL suffix from §8.

4. Click **Create Static Site**

5. Wait for build (~2–3 minutes)

6. **Note your frontend URL:**
   ```
   https://gigshield-frontend-xxxx.onrender.com
   ```

---

## 11. Final Configuration Updates

Now that all 3 services are deployed, go back and update the backend with the remaining 2 env vars:

1. Render → `gigshield-backend` → **Environment** tab

2. Add/Update:

   ```
   ML_SERVICE_URL  = https://gigshield-ml-xxxx.onrender.com
   ALLOWED_ORIGINS = https://gigshield-frontend-xxxx.onrender.com
   ```

   > Use your actual Render URLs with the unique suffixes (e.g., `-4wmh`, `-swb3`, `-4ad7`)

3. Click **Save Changes** → backend will auto-redeploy

---

## 12. Seed Production Database

After all services are deployed and healthy, seed the demo data into Atlas from your local machine:

```bash
cd backend
MONGO_URI="mongodb+srv://gigshield:<pass>@cluster0.xxxxx.mongodb.net/gigshield?retryWrites=true&w=majority&appName=Cluster0" node seed/seed.js
```

> Only do this for demos/presentations. Skip for a real production launch.

---

## 13. Verify Deployment

### Health checks

```bash
# Backend health
curl https://gigshield-backend-xxxx.onrender.com/health
# Expected: {"status":"healthy","services":{"mongodb":"connected","redis":"connected"}}

# ML service health
curl https://gigshield-ml-xxxx.onrender.com/health
# Expected: {"status":"ok","models":{"premium":true,"fraud":true}}
```

### Frontend

Open in browser: `https://gigshield-frontend-xxxx.onrender.com`

### Test login

1. Open the frontend URL
2. Enter phone: `9821000001`
3. Check backend logs on Render (Logs tab) for OTP:
   ```
   [DEV] OTP for ***0001: 482913
   ```
4. Enter the OTP → you should reach the rider dashboard

> **Free tier cold start:** First request after 15 minutes of inactivity takes 30–60 seconds. This is normal for Render free tier. Subsequent requests are fast.

---

## 14. Production Checklist

Before sharing with real users:

- [ ] All 3 Render services show **"Live"** status
- [ ] Backend `/health` returns `{"status":"healthy"}`
- [ ] `ENCRYPTION_KEY` is set and will never be changed
- [ ] `NODE_ENV=production` is set
- [ ] `ALLOWED_ORIGINS` is set to exact frontend Render URL (no trailing slash)
- [ ] `ML_SERVICE_URL` points to ML Render URL
- [ ] `ML_SERVICE_SECRET` is identical in both backend and ML service
- [ ] `ML_SERVICE_TESTING=false` (never true in production)
- [ ] `OPENWEATHER_API_KEY` and `AQICN_API_KEY` are set
- [ ] MongoDB Atlas Network Access allows Render IPs (`0.0.0.0/0`)
- [ ] Upstash Redis `REDIS_TLS=true` is set
- [ ] JWT secrets are properly generated (not `changeme`)
- [ ] Seed data run only if demo/presentation (not for real launch)
- [ ] Test full flow: login → OTP → dashboard → policy → claim

---

## 15. Monitoring & Logs

### Render Logs

For each service: Render Dashboard → service → **Logs** tab

Watch for:
- Backend: `Weather API failed` (means OpenWeather key issue)
- Backend: `Redis error` (means Upstash connection issue)
- ML: `ML models ready` (confirms startup success)

### Health Endpoints

```
GET https://gigshield-backend-xxxx.onrender.com/health
GET https://gigshield-ml-xxxx.onrender.com/health
```

### Free Tier Sleep

Render free services sleep after 15 minutes of no traffic. First request after sleep takes 30–60 seconds. To prevent sleep:
- Upgrade to **Starter** plan ($7/month per service)
- Or use a free uptime monitor like [UptimeRobot](https://uptimerobot.com) to ping `/health` every 10 minutes

---

## 16. Troubleshooting

**Backend crashes on startup**
Check Render logs. Most common causes:
- `MongoDB connection failed` → Check `MONGO_URI` and Atlas Network Access
- `Redis error: ENOTFOUND` → Check `REDIS_HOST` (should be Upstash endpoint, not `redis` or `localhost`)
- `Redis error: WRONGPASS` → Check `REDIS_PASS` matches Upstash password

**`401 Invalid service secret` in backend logs**
`ML_SERVICE_SECRET` doesn't match between backend and ML service. They must be exactly the same string.

**CORS errors in browser console**
`ALLOWED_ORIGINS` in backend must exactly match the frontend URL — no trailing slash, correct `https://` prefix, and the full Render URL with unique suffix (e.g., `https://gigshield-frontend-4ad7.onrender.com` not `https://gigshield-frontend.onrender.com`).

**Frontend loads but shows blank white page**
Check browser console. If JS files blocked with wrong MIME type:
- Verify `frontend/public/_headers` file exists in your repo
- Verify Render Static Site publish directory is `dist`
- Trigger a manual redeploy

**OTP not showing / can't login**
Backend logs (Render → Logs tab) show the OTP:
```
[DEV] OTP for ***0001: 482913
```
If `TWILIO_ACCOUNT_SID` is set, it tries to send real SMS instead.

**Frontend can't reach backend API**
`VITE_API_BASE_URL` is a build-time variable — check it was set correctly BEFORE the frontend built. If you changed it after deploy, trigger a manual redeploy of the frontend.

**ML service shows "unhealthy"**
First startup trains models which takes ~1–2 minutes. If still failing after that, check Render logs for Python/pip errors during Docker build.

**Weather triggers not firing**
Check backend Render logs for `Weather API failed: 401` — OpenWeather key may not be activated yet (takes 10–15 min after signup) or key is wrong.

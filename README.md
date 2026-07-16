<div align="center">

# GigShield

### AI-Powered Parametric Insurance for India's Gig Delivery Workers

**Protecting Income. Not Just Lives.**

An AI-driven, fully automated parametric insurance platform that protects gig workers against income loss caused by heavy rain, floods, extreme heat, air pollution, traffic shutdowns, government restrictions, and platform outages.

Built for **Guidewire DEVTrails 2026**

![Status](https://img.shields.io/badge/Status-Live-success)
![Version](https://img.shields.io/badge/Version-1.0-blue)
![License](https://img.shields.io/badge/License-MIT-orange)
![AI-Powered](https://img.shields.io/badge/AI-Powered-purple)
![Blockchain](https://img.shields.io/badge/Blockchain-Enabled-yellow)
![InsurTech](https://img.shields.io/badge/InsurTech-Platform-red)

</div>

---

## Vision

Millions of India's gig workers lose income every year because of events beyond their control — heavy rain, floods, extreme heat, air pollution, curfews, platform outages. Current insurance products protect vehicles, health, or life. They do **not** protect lost earnings.

GigShield changes that. Workers receive compensation **automatically** whenever verified external disruptions prevent them from earning. No paperwork. No claim forms. No waiting.

---

## Problem

India has ~12 million platform-based gig delivery workers. They earn per order — miss a shift, earn nothing. A single rainy day can wipe out 20–30% of weekly income. No insurance product covers this gap.

| Traditional Insurance | GigShield |
|---|---|
| File a claim manually | Zero-touch — auto-triggered |
| Submit proof of loss | Objective data = proof |
| Wait 3–15 days for settlement | Payout in under 15 minutes |
| Requires employment proof | No employment proof needed |
| Annual, one-size-fits-all | Weekly, AI-personalized premium |

---

## Solution

GigShield combines AI, parametric insurance, real-time weather intelligence, fraud detection, blockchain transparency, and instant UPI payouts into one autonomous income protection platform.

**How it works:**

```
External Event (Rain / AQI / Curfew / Outage)
        ↓
Trigger Engine detects + dual-source verifies
        ↓
Policy match → Fraud screening (14 signals)
        ↓
Payout calculated → UPI transfer initiated
        ↓
Blockchain logged → Rider notified
   (under 15 minutes, zero manual steps)
```

---

## Key Features

| Feature | Description |
|---|---|
| **AI Risk Assessment** | Personalized weekly premiums per rider, zone, platform, season |
| **Automatic Trigger Detection** | Real-time monitoring — Rain, AQI, Heat, Curfew, Outage |
| **Zero-Touch Claims** | No manual submission — auto-detected and auto-paid |
| **AI Fraud Detection** | 14 signals: GPS, physics, device, behavior, network collusion |
| **Income Bridge** | Advance payout on high-confidence triggers before full verification |
| **Micro-Shift Insurance** | Hourly coverage for individual work sessions |
| **Blockchain Transparency** | Immutable on-chain record of every trigger, claim, and payout |
| **Loyalty Pool** | Community mutual pool — 10% of unclaimed premiums redistributed |
| **Analytics Dashboards** | Rider, Admin, Executive, Fraud dashboards with real-time data |

---

## Live Demo

| Service | URL |
|---|---|
| **Frontend** | https://gigshield-frontend-4ad7.onrender.com |
| **Backend API** | https://gigshield-backend-4wmh.onrender.com/health |
| **ML Service** | https://gigshield-ml-swb3.onrender.com/health |

> Free tier — first load may take 30–60 seconds (cold start)

**Demo login:** Phone `9821000001` → OTP from backend logs → Ravi Kumar's dashboard

**Admin login:** Phone `9800000001`

---

## Demo Accounts

| Phone | Rider | Scenario |
|---|---|---|
| `9821000001` | Ravi Kumar | Happy path — GREEN claim, paid, blockchain-logged |
| `9821000002` | Priya Sharma | Income Bridge advance → reconciled after selfie |
| `9821000003` | Amit Singh | RED fraud — mock location detected — appeal pending |
| `9821000004` | Sunita Devi | Gold loyalty tier, 11-week streak |
| `9821000005` | Mohammed Farhan | KYC in progress, referred by Sunita |
| `9821000006` | Deepak Yadav | Active Micro-Shift policy |
| `9821000009` | Lakshmi Nair | Income Bridge → clawback (verification timeout) |
| `9821000010` | Rajesh Patel | Fresh empty-state account |
| `9800000001` | Admin | Full admin + fraud + executive dashboard |

OTP appears in backend terminal: `[DEV] OTP for ***0001: 482913`

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite, Redux Toolkit, TailwindCSS, Socket.IO, Framer Motion |
| **Backend** | Node.js, Express, MongoDB Atlas, Redis (Upstash), Bull queues, Socket.IO |
| **ML Service** | Python, FastAPI, scikit-learn, XGBoost, LightGBM |
| **Blockchain** | Solidity, Hardhat, Ethereum Sepolia, Ethers.js |
| **Infrastructure** | Render (PaaS), MongoDB Atlas, Upstash Redis, GitHub Actions |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 GIGSHIELD PLATFORM               │
├───────────────┬────────────────┬─────────────────┤
│   FRONTEND    │    BACKEND     │   ML SERVICE    │
│  React + Vite │ Node + Express │ Python FastAPI  │
│  Redux + WS   │ Bull + Cron    │ XGBoost + IF    │
└───────┬───────┴───────┬────────┴────────┬────────┘
        │               │                 │
        ▼               ▼                 ▼
   Render CDN    MongoDB Atlas      Render Docker
                 Upstash Redis
                 Blockchain (Sepolia)
```

---

## Project Structure

```
gigshield/
├── backend/        Node.js + Express API, workers, cron jobs
├── frontend/       React + Vite SPA
├── ml-service/     Python FastAPI — ML risk & fraud models
├── blockchain/     Solidity smart contracts (Hardhat)
├── nginx/          Reverse proxy config
├── Docs/           Full project documentation (30+ files)
├── SETUP.md        → Local development guide
├── DEPLOYMENT.md   → Production deploy guide (Render)
└── .env.example    → Environment configuration template
```

---

## Getting Started

### Local Development

See **[SETUP.md](./SETUP.md)** — complete guide with account creation, API keys, and troubleshooting.

```bash
# 1. Clone + install
git clone https://github.com/Ambivert01/AI-Parametric-Insurance-for-India-s-Gig-Workers.git
cd AI-Parametric-Insurance-for-India-s-Gig-Workers
cd backend && npm install && cd ../frontend && npm install && cd ..

# 2. Setup environment
cp .env.example .env
ln -s ../.env backend/.env
# Edit .env — fill MONGO_URI, JWT secrets, ENCRYPTION_KEY

# 3. Seed demo data
cd backend && npm run seed

# 4. Start services (3 terminals)
cd backend && npm run dev                    # API → :5000
cd frontend && npm run dev                   # UI  → :3000
cd ml-service && source venv/bin/activate && uvicorn main:app --reload --port 8000
```

### Production Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** — Render deployment guide with MongoDB Atlas, Upstash Redis, all 3 services.

---

## Security

- JWT authentication with refresh tokens
- Phone + OTP login (no passwords)
- Role-based access control (Rider / Admin / Insurer)
- AES-256 encryption for bank/UPI details
- Rate limiting (per endpoint + edge)
- Fraud scoring on every claim (14 signals)
- Audit logging on all mutations
- Blockchain immutability for payouts

---

## Future Roadmap

- Mobile apps (iOS + Android)
- IoT sensor network integration
- WhatsApp AI assistant
- Satellite weather data
- Embedded insurance APIs for platforms
- DAO governance for loyalty pool
- International expansion

---

## Documentation

Full technical and business documentation in [`Docs/`](./Docs/):

| File | Contents |
|---|---|
| [PROJECT_DOCUMENTATION.md](./Docs/PROJECT_DOCUMENTATION.md) | Complete business + technical master doc |
| [01_SYSTEM_ARCHITECTURE.md](./Docs/01_SYSTEM_ARCHITECTURE.md) | System architecture |
| [06_AI_ML_SYSTEM.md](./Docs/06_AI_ML_SYSTEM.md) | ML models and risk engine |
| [07_TRIGGER_ENGINE.md](./Docs/07_TRIGGER_ENGINE.md) | Trigger detection system |
| [08_FRAUD_ENGINE.md](./Docs/08_FRAUD_ENGINE.md) | Fraud detection system |
| [30_MASTER_INDEX.md](./Docs/30_MASTER_INDEX.md) | Full docs index |

---

## Development Principles

- Clean Architecture + SOLID Principles
- Event-Driven Communication (Bull queues + Socket.IO)
- AI-Assisted Decisions (ML scoring on every claim)
- Zero-Trust Security (fail-closed everywhere)
- Documentation-First Development

---

<div align="center">

**GigShield — Protecting Every Delivery. Protecting Every Income.**

*Built with ❤️ for India's 12 million gig workers*

*Guidewire DEVTrails 2026*

</div>

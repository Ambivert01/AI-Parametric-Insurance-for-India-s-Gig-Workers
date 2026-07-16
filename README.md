<div align="center">

# GigShield

### AI-Powered Parametric Insurance for India's Gig Delivery Workers

**Protecting Income. Not Just Lives.**

Built for **Guidewire DEVTrails 2026**

![Status](https://img.shields.io/badge/Status-Live-success)
![Version](https://img.shields.io/badge/Version-1.0-blue)
![License](https://img.shields.io/badge/License-MIT-orange)
![AI-Powered](https://img.shields.io/badge/AI-Powered-purple)
![Blockchain](https://img.shields.io/badge/Blockchain-Enabled-yellow)

</div>

---

## What is GigShield?

India has ~12 million gig delivery workers. When heavy rain, an AQI spike, a curfew, or a platform outage prevents them from working — they earn nothing. No insurance product covers this.

GigShield is a fully automated parametric insurance platform that:

- **Pays out automatically** when a verified external event occurs — no claim filing needed
- **Prices weekly** (₹30–₹150/week) — aligned with gig workers' earning cycles
- **Settles in under 15 minutes** — trigger detected → fraud checked → UPI payout
- **Uses ML** to compute personalized premiums per rider, zone, and season
- **Logs every payout on-chain** for transparent, immutable audit trails

---

## Live Demo

| Service | URL |
|---|---|
| **Frontend** | https://gigshield-frontend-4ad7.onrender.com |
| **Backend API** | https://gigshield-backend-4wmh.onrender.com/health |
| **ML Service** | https://gigshield-ml-swb3.onrender.com/health |

**Demo login:** Phone `9821000001` → get OTP from backend logs → Ravi Kumar's dashboard

**Admin login:** Phone `9800000001`

> Free tier — first load may take 30–60 seconds (cold start)

---

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React 18, Vite, Redux Toolkit, TailwindCSS, Socket.IO |
| Backend | Node.js, Express, MongoDB (Atlas), Redis (Upstash), Bull queues |
| ML Service | Python, FastAPI, scikit-learn, XGBoost |
| Blockchain | Solidity, Hardhat, Ethereum Sepolia |
| Infrastructure | Render (PaaS), MongoDB Atlas, Upstash Redis |

---

## Project Structure

```
gigshield/
├── backend/        Node.js + Express API, workers, cron jobs
├── frontend/       React + Vite SPA
├── ml-service/     Python FastAPI — ML risk & fraud models
├── blockchain/     Solidity smart contracts (Hardhat)
├── nginx/          Reverse proxy config
├── Docs/           Full project documentation
├── SETUP.md        Local development guide
├── DEPLOYMENT.md   Production deploy guide (Render)
└── .env.example    Environment configuration template
```

---

## Getting Started

### Local Development

See **[SETUP.md](./SETUP.md)** for complete step-by-step guide including:
- All prerequisites and install steps
- Account creation for MongoDB Atlas, OpenWeatherMap, AQICN
- Environment variable configuration
- Running all 3 services locally
- Seeding demo data
- Troubleshooting

Quick start:

```bash
git clone https://github.com/Ambivert01/AI-Parametric-Insurance-for-India-s-Gig-Workers.git
cd AI-Parametric-Insurance-for-India-s-Gig-Workers
cp .env.example .env && ln -s ../.env backend/.env
# Edit .env — fill MONGO_URI, JWT secrets, ENCRYPTION_KEY
cd backend && npm install && npm run seed
```

Then start 3 terminals:

```bash
cd backend && npm run dev          # API on :5000
cd frontend && npm install && npm run dev   # UI on :3000
cd ml-service && source venv/bin/activate && uvicorn main:app --reload --port 8000
```

### Production Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for complete Render deployment guide including:
- MongoDB Atlas + Upstash Redis setup
- All 3 Render service configurations
- Environment variables for production
- Post-deploy verification

---

## Demo Accounts

| Phone | Rider | Scenario |
|---|---|---|
| `9821000001` | Ravi Kumar | Happy path — GREEN claim, paid, blockchain-logged |
| `9821000002` | Priya Sharma | Income Bridge advance → reconciled |
| `9821000003` | Amit Singh | RED fraud — mock location — appeal pending |
| `9821000004` | Sunita Devi | Gold loyalty, 11-week streak |
| `9821000010` | Rajesh Patel | Fresh empty-state account |
| `9800000001` | Admin | Full admin + fraud dashboard |

OTP appears in backend terminal: `[DEV] OTP for ***0001: 482913`

---

## Documentation

Full project documentation is in the [`Docs/`](./Docs/) folder:

| File | Contents |
|---|---|
| [PROJECT_DOCUMENTATION.md](./Docs/PROJECT_DOCUMENTATION.md) | Complete technical + business documentation |
| [00_PROJECT_VISION.md](./Docs/00_PROJECT_VISION.md) | Vision and problem statement |
| [01_SYSTEM_ARCHITECTURE.md](./Docs/01_SYSTEM_ARCHITECTURE.md) | System architecture |
| [04_BACKEND_ARCHITECTURE.md](./Docs/04_BACKEND_ARCHITECTURE.md) | Backend design |
| [05_FRONTEND_ARCHITECTURE.md](./Docs/05_FRONTEND_ARCHITECTURE.md) | Frontend design |
| [06_AI_ML_SYSTEM.md](./Docs/06_AI_ML_SYSTEM.md) | ML models and risk engine |
| [08_FRAUD_ENGINE.md](./Docs/08_FRAUD_ENGINE.md) | Fraud detection system |
| [30_MASTER_INDEX.md](./Docs/30_MASTER_INDEX.md) | Full docs index |

---

## Key Innovation Points

- **Zero-touch claims** — riders never file anything; the system detects and pays automatically
- **Dual-source verification** — every trigger cross-checked across 2 independent data sources
- **4-tier fraud scoring** — 14 signals from GPS physics to behavioral biometrics
- **Income Bridge** — partial advance paid instantly for high-confidence events before full verification
- **Micro-Shift policies** — hourly coverage for individual work sessions
- **On-chain audit** — every trigger and payout logged to Ethereum (mock in demo, real when configured)

---

## License

MIT — Built with ❤️ for India's gig workers.

*Guidewire DEVTrails 2026 — AI-Powered InsurTech for India's Gig Economy*

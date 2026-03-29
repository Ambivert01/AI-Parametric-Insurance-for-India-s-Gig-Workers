# GigShield — Architecture Decisions & Competitive Analysis
## Why each technical choice was made

---

## Competitor Analysis (What Exists, What We Beat)

| Platform | What They Do | What They Miss | GigShield Advantage |
|---|---|---|---|
| **Lemonade** (USA) | AI-first insurance, instant claims | No parametric, no gig focus, USA only | Auto-trigger, India-specific, zero-claim-filing |
| **Acko** (India) | Digital insurance, bike/health | No gig income protection, manual claims | Parametric automation, weekly pricing |
| **Digit Insurance** | AQI pilot for outdoor workers | Single trigger type, no ring fraud defense | 6 trigger types, 17-signal fraud |
| **Cover Genius** | Embedded parametric globally | B2B only, not consumer-facing | Direct rider onboarding + B2B API |
| **Etherisc** | Blockchain parametric (crop) | No gig worker focus, no India | India-first, gig-specific, UPI native |
| **SEWA Insurance** | Heatwave cover, 225k workers | Manual enrollment, limited triggers | Automated, multi-trigger, ML pricing |
| **Ola/Uber Insurance** | Accident/vehicle cover | NOT income protection, not parametric | Income only, parametric triggers |

## What GigShield Does That None Of These Do
1. Multi-trigger parametric (6 types) with real-time auto-fire
2. 17-signal GPS spoof + ring fraud defense
3. ML-computed personalized WEEKLY premium (not annual)
4. Blockchain audit trail riders can self-verify
5. WhatsApp-native claim notifications
6. P2P community loyalty pool
7. Per-shift micro-coverage option

---

## Backend Architecture Decisions

### Why Microservices (not monolith)?
- Each service scales independently (fraud detection CPU-heavy, auth is lightweight)
- Services can fail independently — payment service down ≠ trigger engine down
- Teams can work on different services simultaneously
- Production insurance platforms (Lemonade, Cover Genius) all use microservices

### Why Node.js + Express (not Go or Java)?
- Async I/O is perfect for our workload: polling APIs, webhook handling, DB queries
- npm ecosystem: Razorpay SDK, Web3.js, Twilio — all first-class Node support
- Faster iteration: hackathon + production viable simultaneously
- Node.js handles 10,000 concurrent connections easily — enough for Phase 1

### Why MongoDB Atlas (not PostgreSQL)?
- Rider profiles, trigger events, claims — all document-shaped, schema-flexible
- Atlas free tier → paid tiers: zero migration needed
- Built-in time-series collections for sensor/API readings
- Geospatial indexing for zone-based policy matching

### Why Redis?
- Job queues (Bull) for async fraud + payment processing
- Rate limiting storage (in-memory, fast)
- Session cache (JWT blacklisting on logout)
- Pub/Sub for real-time dashboard updates (Socket.IO backend)

### Service Communication
- Synchronous: REST APIs (service-to-service via internal URLs)
- Asynchronous: Bull queues on Redis (fraud checks, payment processing)
- Real-time: Socket.IO (admin dashboard live updates)

---

## API Design Principles
- RESTful with versioning: /api/v1/...
- Every endpoint: authenticate → validate → rate-limit → execute → audit-log
- Standard response envelope: { success, data, error, meta }
- Pagination on all list endpoints
- Idempotency keys on payment endpoints

---

## Directory Structure
gigshield/
├── backend/                    # Node.js API server
│   ├── src/
│   │   ├── config/             # DB, Redis, constants, env
│   │   ├── models/             # All Mongoose schemas
│   │   ├── middleware/         # Auth, rateLimit, error, logger, validate
│   │   ├── utils/              # Helpers: geo, crypto, date, response
│   │   ├── services/           # Business logic modules
│   │   │   ├── auth/
│   │   │   ├── policy/
│   │   │   ├── trigger-engine/
│   │   │   ├── claims/
│   │   │   ├── fraud/
│   │   │   ├── payment/
│   │   │   ├── notification/
│   │   │   └── analytics/
│   │   ├── routes/             # Express routers
│   │   ├── workers/            # Bull queue workers
│   │   ├── jobs/               # Cron jobs (trigger polling)
│   │   ├── webhooks/           # Razorpay, Stripe incoming webhooks
│   │   └── app.js              # Express app setup
│   ├── tests/                  # Jest unit + integration tests
│   └── package.json
├── ml-service/                 # Python FastAPI ML server
│   ├── models/                 # Trained model files
│   ├── routers/                # API routes
│   ├── services/               # Model inference logic
│   └── main.py
├── blockchain/                 # Solidity contracts + oracle
│   ├── contracts/
│   ├── scripts/
│   ├── oracle/
│   └── hardhat.config.js
├── frontend/                   # React SaaS app
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── store/              # Redux Toolkit
│   │   ├── hooks/
│   │   ├── services/           # API calls
│   │   └── utils/
│   └── package.json
├── docker-compose.yml
├── .env.example
└── README.md

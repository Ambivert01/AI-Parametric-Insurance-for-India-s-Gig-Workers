# 22_FOLDER_STRUCTURE.md

# Complete Project Folder Structure

Version: 1.0

Status: Master Repository Structure

---

# Purpose

This document defines the official folder architecture for the entire platform.

Every developer and AI coding assistant must strictly follow this structure.

The project follows a modular, feature-based architecture with clear separation of concerns.

Each module is independently maintainable, scalable, and testable.

---

# Repository Overview

```
gigshield/
│
├── apps/
├── packages/
├── services/
├── infrastructure/
├── blockchain/
├── ai/
├── docs/
├── scripts/
├── docker/
├── tests/
├── .github/
├── .husky/
├── .vscode/
│
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── docker-compose.yml
├── .gitignore
├── README.md
└── LICENSE
```

---

# Root Structure

```
gigshield/

├── apps/
├── packages/
├── services/
├── ai/
├── blockchain/
├── infrastructure/
├── tests/
├── docs/
├── scripts/
├── docker/
├── .github/
└── configs/
```

---

# apps/

Contains all user-facing applications.

```
apps/

├── web/
├── admin/
├── worker/
└── landing/
```

---

## apps/web

Main insurance application.

```
web/

src/

assets/

components/

hooks/

pages/

layouts/

router/

styles/

lib/

services/

types/

constants/

contexts/

providers/

utils/

store/

animations/

theme/

tests/

public/
```

---

## apps/admin

```
admin/

dashboard/

claims/

payments/

analytics/

fraud/

workers/

policies/

risk/

settings/

reports/

components/

hooks/

services/

store/

utils/

tests/
```

---

## apps/landing

```
landing/

components/

pages/

assets/

animations/

seo/

blog/

pricing/

about/

contact/

```

---

# services/

Contains backend services.

```
services/

api/

auth/

policy/

claims/

payment/

fraud/

notification/

analytics/

trigger/

gateway/

scheduler/
```

---

# Backend Structure

```
services/api/

src/

config/

controllers/

routes/

middlewares/

services/

repositories/

validators/

models/

events/

queues/

workers/

jobs/

adapters/

utils/

constants/

errors/

types/

lib/

tests/
```

---

# Controllers

```
controllers/

auth/

policy/

claim/

payment/

fraud/

analytics/

dashboard/

worker/

admin/
```

---

# Services

```
services/

auth/

policy/

premium/

claim/

payment/

fraud/

risk/

analytics/

notification/

trigger/

reward/

blockchain/
```

Business logic only.

---

# Repositories

```
repositories/

user/

policy/

claim/

payment/

fraud/

analytics/

reward/

audit/
```

Database access only.

---

# Models

```
models/

User.ts

Policy.ts

Claim.ts

Payment.ts

Notification.ts

Reward.ts

Fraud.ts

Audit.ts

Weather.ts

AQI.ts

Trigger.ts
```

---

# Validators

```
validators/

auth/

policy/

claim/

payment/

notification/

admin/

worker/
```

---

# Middlewares

```
middlewares/

auth.middleware.ts

admin.middleware.ts

logger.middleware.ts

error.middleware.ts

validation.middleware.ts

rateLimit.middleware.ts

cache.middleware.ts

security.middleware.ts
```

---

# Events

```
events/

policy.events.ts

claim.events.ts

payment.events.ts

notification.events.ts

analytics.events.ts

reward.events.ts

system.events.ts
```

---

# Workers

```
workers/

weather.worker.ts

aqi.worker.ts

traffic.worker.ts

claim.worker.ts

payment.worker.ts

analytics.worker.ts

notification.worker.ts

reward.worker.ts
```

---

# Queues

```
queues/

claim.queue.ts

payment.queue.ts

notification.queue.ts

analytics.queue.ts

fraud.queue.ts

blockchain.queue.ts
```

---

# ai/

```
ai/

api/

models/

training/

datasets/

feature-store/

pipelines/

inference/

evaluation/

monitoring/

utils/

tests/
```

---

## AI Models

```
models/

risk/

premium/

fraud/

recommendation/

forecast/

trust/

coverage/
```

---

## Training

```
training/

premium_training.py

fraud_training.py

risk_training.py

forecast_training.py
```

---

# blockchain/

```
blockchain/

contracts/

scripts/

deploy/

oracles/

services/

listeners/

tests/

artifacts/

abis/

utils/
```

---

## Smart Contracts

```
contracts/

PolicyRegistry.sol

ClaimRegistry.sol

PaymentRegistry.sol

RewardPool.sol

AuditRegistry.sol
```

---

# packages/

Reusable shared packages.

```
packages/

ui/

types/

config/

eslint/

tsconfig/

utils/

hooks/

constants/

api-client/
```

---

# infrastructure/

```
infrastructure/

docker/

kubernetes/

terraform/

nginx/

monitoring/

grafana/

prometheus/

logging/

cloud/
```

---

# tests/

```
tests/

unit/

integration/

api/

e2e/

performance/

security/

chaos/

fixtures/

mocks/
```

---

# docs/

```
docs/

architecture/

api/

database/

workflows/

security/

deployment/

testing/

research/

diagrams/

adr/

meeting-notes/
```

---

# scripts/

```
scripts/

seed.ts

backup.ts

restore.ts

cleanup.ts

migration.ts

healthcheck.ts
```

---

# docker/

```
docker/

backend/

frontend/

ai/

redis/

mongodb/

nginx/

docker-compose.yml
```

---

# .github/

```
.github/

workflows/

ISSUE_TEMPLATE/

PULL_REQUEST_TEMPLATE/

CODEOWNERS/

dependabot.yml
```

---

# Public Assets

```
public/

images/

icons/

logos/

illustrations/

fonts/

lottie/

videos/
```

---

# Configs

```
configs/

database/

redis/

jwt/

cloudinary/

payment/

weather/

traffic/

aqi/

blockchain/

notification/
```

---

# Naming Convention

Folders

```
kebab-case
```

Files

```
camelCase.ts
```

Components

```
PascalCase.tsx
```

Interfaces

```
IUser
```

Enums

```
UserRole
```

Constants

```
UPPER_CASE
```

---

# Maximum Folder Responsibility

Every folder should have one responsibility.

Example

```
claims/

controllers/

services/

validators/

repositories/

events/

tests/
```

Never mix unrelated business domains.

---

# Import Rules

Allowed

```
Controller

↓

Service

↓

Repository

↓

Database
```

Not Allowed

```
Controller

↓

Database
```

---

# Future Expansion

```
microservices/

partner-api/

mobile/

desktop/

iot/

satellite/

reinsurance/

marketplace/

sdk/

public-api/

graphql/

kafka/

data-lake/

warehouse/
```

---

# Folder Structure Principles

Every module must be independent.

Every service must have a single responsibility.

Business domains should remain isolated.

Shared code belongs inside packages.

Infrastructure should never mix with business logic.

AI should remain independently deployable.

Blockchain should remain independently deployable.

Testing mirrors production structure.

Documentation evolves alongside implementation.

The repository structure should support growth from a hackathon MVP to an enterprise-scale insurance platform without requiring major reorganization.
# 26_ENVIRONMENT_SETUP.md

# Development Environment & Local Setup Guide

Version: 1.0

Status: Master Environment Setup Documentation

---

# Purpose

This document defines the official development environment for the GigShield platform.

Every developer, AI coding assistant, CI/CD pipeline, and deployment environment should follow this setup to ensure consistency across

Development

Testing

Staging

Production

The environment should be reproducible, secure, scalable, and easy to maintain.

---

# 1. Development Philosophy

Every developer should be able to clone the repository and start developing with minimal manual configuration.

No hidden dependencies.

No undocumented setup.

No machine-specific configuration.

The setup should work consistently across

Linux

macOS

Windows (WSL Recommended)

---

# 2. Recommended Technology Stack

## Frontend

React 19

TypeScript

Vite

TailwindCSS

Framer Motion

React Router

TanStack Query

React Hook Form

Zod

Chart.js / Recharts

Leaflet / Mapbox

---

## Backend

Node.js LTS

Express.js

TypeScript

MongoDB

Redis

BullMQ

JWT

Socket.IO

Cloudinary SDK

---

## AI Services

Python 3.12+

FastAPI

Scikit-learn

TensorFlow

PyTorch

XGBoost

LightGBM

Pandas

NumPy

Joblib

---

## Blockchain

Solidity

Hardhat

Ethers.js

OpenZeppelin

Polygon

Sepolia

---

## DevOps

Docker

Docker Compose

GitHub Actions

Nginx

Cloudflare

Prometheus

Grafana

---

# 3. Required Software

Git

Node.js LTS

pnpm (preferred)

Python

pip

Docker Desktop / Docker Engine

Docker Compose

MongoDB (or Atlas)

Redis

VS Code

Hardhat

---

# 4. Recommended VS Code Extensions

ESLint

Prettier

Tailwind CSS IntelliSense

GitLens

Docker

Thunder Client

REST Client

Error Lens

Pretty TypeScript Errors

Material Icon Theme

Path IntelliSense

MongoDB Extension

GitHub Copilot (Optional)

Claude Code (Optional)

---

# 5. Repository Setup

Clone repository

```
git clone <repository-url>

cd gigshield
```

---

Install dependencies

```
pnpm install
```

---

Install backend dependencies

```
cd services/api

pnpm install
```

---

Install frontend dependencies

```
cd apps/web

pnpm install
```

---

Install AI dependencies

```
cd ai

pip install -r requirements.txt
```

---

Install blockchain dependencies

```
cd blockchain

pnpm install
```

---

# 6. Environment Variables

Each service maintains its own

```
.env

.env.development

.env.staging

.env.production
```

Never commit

```
.env
```

Use

```
.env.example
```

for documentation.

---

# 7. Backend Environment

Example

```
NODE_ENV=

PORT=

JWT_SECRET=

JWT_REFRESH_SECRET=

MONGODB_URI=

REDIS_URL=

CLOUDINARY_NAME=

CLOUDINARY_KEY=

CLOUDINARY_SECRET=

PAYMENT_PROVIDER=

OPENWEATHER_API_KEY=

AQI_API_KEY=

GOOGLE_MAPS_API_KEY=

BLOCKCHAIN_RPC=

PRIVATE_KEY=
```

---

# 8. Frontend Environment

```
VITE_API_URL=

VITE_MAP_KEY=

VITE_ENV=

VITE_SOCKET_URL=
```

---

# 9. AI Environment

```
MODEL_PATH=

DATASET_PATH=

MODEL_VERSION=

GPU_ENABLED=

API_PORT=
```

---

# 10. Blockchain Environment

```
RPC_URL=

PRIVATE_KEY=

ETHERSCAN_KEY=

CHAIN_ID=
```

---

# 11. Local Services

Required

MongoDB

Redis

Backend

Frontend

AI Service

Optional

Blockchain Local Node

Prometheus

Grafana

Mailhog

---

# 12. Docker Services

Recommended Containers

```
MongoDB

Redis

Backend

Frontend

AI

Nginx

Prometheus

Grafana
```

---

# 13. Startup Order

```
MongoDB

↓

Redis

↓

Backend

↓

AI

↓

Blockchain

↓

Frontend

↓

Workers

↓

Scheduler
```

---

# 14. Development Commands

Frontend

```
pnpm dev
```

Backend

```
pnpm dev
```

AI

```
uvicorn main:app --reload
```

Blockchain

```
npx hardhat node
```

Worker

```
pnpm worker
```

Scheduler

```
pnpm scheduler
```

---

# 15. Seed Data

Development database should include

Workers

Policies

Claims

Payments

Weather Data

AQI Data

Traffic Data

Notifications

Reward Pool

Fraud Samples

Admin Accounts

Synthetic Disaster Events

---

# 16. Local Accounts

Worker

Admin

Fraud Analyst

Finance

Operations

Super Admin

Development accounts only.

Never use production credentials.

---

# 17. Local AI Models

Load

Risk Model

Premium Model

Fraud Model

Recommendation Model

Forecast Model

Fallback to mock models if unavailable.

---

# 18. Local Blockchain

Deploy

Policy Contract

Claim Contract

Payment Contract

Reward Pool

Audit Registry

Use local Hardhat network.

---

# 19. Development Data

Synthetic

Anonymous

Reproducible

No real customer information.

---

# 20. Code Quality Tools

ESLint

Prettier

TypeScript

Husky

Lint Staged

Commitlint

---

# 21. Pre-Commit Checks

Run

Formatting

Lint

Type Check

Unit Tests

Changed File Validation

Block commit if failed.

---

# 22. Local Monitoring

Prometheus

Grafana

Redis Insight

Mongo Express

Bull Board

Swagger

---

# 23. API Documentation

Swagger

OpenAPI

Postman Collection

REST Client

Thunder Client

Available locally.

---

# 24. Troubleshooting

Common Issues

Port already in use

Redis unavailable

Mongo connection failed

Missing environment variables

Docker containers stopped

AI model missing

Blockchain node unavailable

Incorrect Node version

Corrupted dependencies

Clear cache before reinstalling.

---

# 25. Development Rules

Always use latest LTS versions.

Keep dependencies updated.

Never modify production configuration locally.

Always validate environment variables before startup.

Restart services after configuration changes.

---

# 26. Security During Development

Never commit secrets.

Never expose private keys.

Never hardcode API keys.

Use mock payment providers.

Use sandbox blockchain.

Use sandbox payment gateways.

---

# 27. Future Environment

Kubernetes

Helm

Terraform

Multi-region deployment

GitOps

Secrets Manager

Service Mesh

Cloud Build

Remote Development Containers

---

# 28. Environment Principles

Every developer should have the same environment.

Every environment should be reproducible.

Every dependency should be documented.

Every configuration should be version controlled.

Every secret should remain outside the repository.

Development should closely mirror production while remaining safe for experimentation.

The environment should allow rapid onboarding, predictable behavior, and reliable development across teams and AI coding assistants.
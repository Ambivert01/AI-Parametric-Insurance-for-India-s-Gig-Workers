# 02_TECH_STACK.md

# Technology Stack Documentation

**Version:** 1.0

**Status:** Master Technology Specification

---

# Purpose

This document defines every technology, framework, runtime, infrastructure component, programming language, AI framework, database, cloud service, blockchain technology, DevOps tool, testing framework, monitoring solution, and development standard used throughout the platform.

Every technology selected has been evaluated for scalability, maintainability, production readiness, developer experience, AI integration capability, and long-term extensibility.

No developer should substitute technologies without proper architectural approval.

---

# 1. Technology Selection Philosophy

Every technology selected must satisfy the following principles.

• Production Ready

• Stable Community

• Large Ecosystem

• Open Source Preferred

• Cloud Native

• AI Friendly

• High Performance

• Scalable

• Well Documented

• Secure

• Future Proof

---

# 2. Programming Languages

## TypeScript

Primary language for entire application.

Used For

Backend

Frontend

Shared Types

Utilities

Configuration

API Contracts

Validation

Reason

Strong typing

Developer productivity

Excellent tooling

Large ecosystem

---

## Python

Used only for AI/ML.

Responsibilities

Machine Learning

Model Training

Fraud Detection

Risk Prediction

Data Analysis

Prediction APIs

Model Serving

Reason

Best AI ecosystem

Large ML libraries

Fast experimentation

---

## Solidity

Used for blockchain layer.

Responsibilities

Smart Contracts

Audit Storage

Immutable Logs

Future DAO

Reason

Industry standard

Ethereum ecosystem

Large tooling support

---

# 3. Frontend Stack

Framework

React 19

Reason

Component architecture

Large ecosystem

Excellent performance

Production ready

---

Framework

Next.js (App Router)

Reason

Server Components

Routing

SEO

SSR

Optimization

---

Language

TypeScript

---

Styling

TailwindCSS

Reason

Fast development

Consistent design

Scalable

---

Component Library

shadcn/ui

Reason

Accessible

Modern

Fully customizable

---

Icons

Lucide Icons

---

Animation

Framer Motion

Responsibilities

Page transitions

Route transitions

Micro interactions

Gesture animations

Loading animations

Hero animations

Dashboard animations

Card animations

Hover effects

---

Charts

Recharts

Future

Apache ECharts

Mapbox Visualization

---

Maps

Mapbox

Future

Google Maps

Leaflet

---

Forms

React Hook Form

Validation

Zod

---

Data Fetching

TanStack Query

Responsibilities

Caching

Retries

Optimistic Updates

Background Refresh

---

State Management

Zustand

Responsibilities

Global State

Authentication

Theme

User

Notifications

Temporary State

---

Theme

next-themes

Supports

Dark

Light

System

---

Notifications

Sonner

---

Tables

TanStack Table

---

Date Handling

date-fns

---

PDF

React PDF

---

# 4. Backend Stack

Runtime

Node.js LTS

---

Framework

Express.js

Reason

Lightweight

Flexible

Production proven

---

Language

TypeScript

---

Validation

Zod

---

Authentication

JWT

Refresh Tokens

OTP

---

Password Hashing

bcrypt

---

File Upload

Multer

---

Storage

Cloudinary

Future

AWS S3

---

Email

Nodemailer

---

SMS

Twilio

Future

MSG91

---

Logging

Pino

---

Environment

dotenv

---

# 5. Database Stack

Primary Database

MongoDB Atlas

Reason

Flexible schema

Fast iteration

Scalable

---

ODM

Mongoose

---

Caching

Redis

Responsibilities

Caching

Sessions

Rate Limiting

OTP

Queue Cache

Temporary Data

---

Search

MongoDB Atlas Search

Future

ElasticSearch

---

# 6. Queue & Background Jobs

BullMQ

Redis

Responsibilities

Claim Processing

Notifications

Payments

Analytics

Blockchain Sync

Weather Sync

Risk Recalculation

Premium Recalculation

Retry Jobs

Dead Letter Queue

---

# 7. AI / Machine Learning Stack

Language

Python

---

Framework

FastAPI

Reason

Fast APIs

Easy deployment

Async

---

ML Libraries

scikit-learn

XGBoost

LightGBM

TensorFlow

PyTorch

CatBoost

---

Data Libraries

Pandas

NumPy

Polars

---

Visualization

Matplotlib

Plotly

---

Experiment Tracking

MLflow

---

Model Registry

MLflow

---

Serving

FastAPI

ONNX Runtime

Future

TorchServe

---

# 8. AI Models

Risk Prediction

Premium Prediction

Fraud Detection

Income Prediction

Anomaly Detection

Forecasting

Recommendation Engine

Behavior Classification

Explainability Engine

---

# 9. Blockchain Stack

Network

Polygon

Reason

Low Fees

Fast

Ethereum Compatible

---

Development

Hardhat

---

Language

Solidity

---

Wallet

MetaMask

---

Library

ethers.js

---

Storage

IPFS (Future)

---

Oracle

Chainlink (Future)

Custom Oracle

---

# 10. External APIs

Weather

OpenWeatherMap

Visual Crossing

Tomorrow.io

IMD

---

AQI

CPCB

IQAir

OpenAQ

---

Traffic

Google Maps

TomTom

HERE

---

Payments

Razorpay

Stripe

UPI

---

Notifications

Firebase Cloud Messaging

Twilio

SendGrid

WhatsApp Cloud API

---

Authentication

Firebase OTP

Future

Auth0

---

# 11. DevOps

Docker

Docker Compose

GitHub Actions

NGINX

PM2

---

Future

Kubernetes

Helm

Terraform

---

# 12. Monitoring

Prometheus

Grafana

Loki

OpenTelemetry

Sentry

Health Checks

---

# 13. Security

Helmet

CORS

Rate Limiter

JWT

HTTPS

bcrypt

Encryption

Secrets Manager

Audit Logging

---

# 14. Testing

Unit

Vitest

---

Backend

Jest

Supertest

---

Frontend

React Testing Library

Playwright

---

API

Postman

Bruno

---

Load Testing

k6

---

Security Testing

OWASP ZAP

---

# 15. Development Tools

VS Code

Claude Code

Git

GitHub

ESLint

Prettier

Husky

lint-staged

Commitlint

Markdownlint

---

# 16. Folder Philosophy

Feature Based

Modular

Independent

Reusable

Scalable

No God Files

No Circular Imports

Shared Utilities

Strict Layer Separation

---

# 17. Code Standards

Strict TypeScript

No Any

Async Await Only

Dependency Injection Preferred

Thin Controllers

Business Logic in Services

Repository Pattern

DTO Pattern

Validation First

Central Error Handler

Structured Logging

No Magic Numbers

Environment Driven Configuration

Reusable Components

---

# 18. Performance Targets

API Response

< 200 ms

Dashboard

< 2 sec

Claim Processing

< 30 sec

AI Prediction

< 2 sec

Premium Calculation

< 500 ms

Notification

< 5 sec

Blockchain Logging

Async

---

# 19. Future Technology Roadmap

Apache Kafka

Temporal

Kubernetes

ElasticSearch

Vector Database

LLM Agents

RAG

IoT Sensors

Satellite Data

Digital Twin

Federated Learning

Edge AI

Drone Data

Digital Identity

Open Insurance APIs

---

# 20. Technology Principles

Every technology added to the project must improve at least one of the following.

Scalability

Reliability

Developer Experience

Security

Performance

Maintainability

AI Capability

Automation

Observability

Cost Efficiency

Future Extensibility

If it does not improve any of these areas, it should not be introduced into the platform.
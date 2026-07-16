# 04_BACKEND_ARCHITECTURE.md

# Backend Architecture Documentation

Version: 1.0

Status: Master Backend Specification

---

# Purpose

This document defines the complete backend architecture of the AI-Powered Parametric Insurance Platform.

It explains every backend module, service, business layer, controller, middleware, repository, communication pattern, event flow, dependency, API philosophy, validation strategy, queue processing, scalability, observability, and implementation standards.

The backend is designed as an enterprise-grade, modular, event-driven system capable of serving millions of workers while remaining maintainable and highly extensible.

No backend implementation should violate the architecture defined here.

---

# 1. Backend Philosophy

The backend follows the following principles.

• Modular Architecture

• Feature Based Development

• Domain Driven Design (DDD Inspired)

• Thin Controllers

• Fat Services

• Repository Pattern

• Service Isolation

• Event Driven Communication

• AI Native

• Queue First

• Secure by Default

• Cloud Native

• Horizontally Scalable

• Test First Development

---

# 2. Overall Backend Structure

```
Client

↓

API Gateway

↓

Express Application

↓

Global Middleware

↓

Authentication

↓

Route Layer

↓

Controller Layer

↓

Service Layer

↓

Repository Layer

↓

Database

↓

Background Workers

↓

AI Services

↓

External APIs

↓

Notification Layer

↓

Analytics

```

---

# 3. Folder Structure

```
backend/

src/

app.ts

server.ts

config/

constants/

middlewares/

utils/

core/

modules/

shared/

jobs/

workers/

events/

queues/

services/

repositories/

database/

validators/

types/

interfaces/

hooks/

cron/

tests/

```

---

# 4. Module Based Architecture

Every feature exists as an independent module.

Example

```
modules/

auth/

user/

policy/

claim/

payment/

fraud/

risk/

premium/

trigger/

notification/

analytics/

blockchain/

admin/

dashboard/

```

Each module contains

```
controller/

service/

repository/

model/

routes/

validators/

dto/

types/

events/

tests/

```

Every module is self-contained.

No module should directly depend on another module's implementation.

Communication occurs only through Services or Events.

---

# 5. Request Lifecycle

Every request follows the same lifecycle.

Incoming Request

↓

Helmet

↓

CORS

↓

Rate Limiter

↓

Logger

↓

Authentication

↓

Authorization

↓

Request Validation

↓

Controller

↓

Service

↓

Repository

↓

Database

↓

Response Formatter

↓

Logger

↓

Response

---

# 6. Controller Layer

Responsibilities

Receive Request

Validate DTO

Call Service

Return Response

Nothing else.

Controllers must NEVER

Contain business logic

Perform calculations

Access database directly

Call external APIs

Contain AI logic

---

# 7. Service Layer

This is the brain of the backend.

Responsibilities

Business Rules

Workflow Execution

Decision Making

Module Communication

Queue Creation

Event Publishing

Calling AI

Calling External APIs

Validation

Fraud Logic

Payment Logic

Risk Logic

Claims Logic

Policy Logic

---

# 8. Repository Layer

Only responsible for database interaction.

Responsibilities

CRUD

Aggregation

Transactions

Pagination

Search

Indexes

No business logic.

---

# 9. Shared Core Layer

Contains reusable platform logic.

Examples

Response Builder

Error Classes

Logger

Config Loader

Date Helpers

Money Helpers

Geo Helpers

AI Client

Payment Client

Blockchain Client

Notification Client

Retry Helpers

Circuit Breakers

---

# 10. Middleware

Global Middleware

Helmet

Compression

CORS

Request Logger

Rate Limiter

JSON Parser

Error Handler

Authentication

Authorization

Validation

Request ID

Response Time

Audit Middleware

Device Detection

Geo Detection

Language Detection

---

# 11. Authentication Flow

Phone Number

↓

OTP

↓

Verify OTP

↓

Generate JWT

↓

Generate Refresh Token

↓

Register Device

↓

Create Session

↓

Return Tokens

---

# 12. Authorization

Roles

Worker

Admin

Insurance Manager

Fraud Analyst

Finance Team

AI Administrator

Super Admin

Every endpoint requires RBAC validation.

---

# 13. Business Services

Major services

AuthenticationService

UserService

PolicyService

PremiumService

RiskService

ClaimService

FraudService

TriggerService

WeatherService

AQIService

TrafficService

PaymentService

NotificationService

BlockchainService

AnalyticsService

DashboardService

AdminService

AuditService

AIService

---

# 14. AI Integration Layer

Backend never implements AI.

Backend communicates with AI through APIs.

```
Backend

↓

AI Gateway

↓

Python FastAPI

↓

ML Models

↓

Prediction

↓

Backend
```

Every prediction stores

Prediction

Confidence

Model Version

Timestamp

Explanation

---

# 15. Queue Architecture

Heavy operations must always be asynchronous.

Queues

Trigger Queue

Risk Queue

Premium Queue

Claim Queue

Fraud Queue

Payment Queue

Blockchain Queue

Notification Queue

Analytics Queue

Weather Sync Queue

AQI Sync Queue

Traffic Sync Queue

Retry Queue

Dead Letter Queue

---

# 16. Event Architecture

System communicates using events.

Example

PolicyCreated

↓

RiskCalculated

↓

PremiumGenerated

↓

PolicyActivated

↓

DashboardUpdated

Another

WeatherTriggerDetected

↓

VerifyTrigger

↓

FindEligibleWorkers

↓

RunFraudCheck

↓

CalculatePayout

↓

InitiatePayment

↓

StoreBlockchainRecord

↓

NotifyWorker

↓

UpdateDashboard

---

# 17. Scheduler Architecture

Cron Jobs

Every Minute

Weather Sync

AQI Sync

Traffic Sync

Government Alerts

Expired Policies

Notification Retry

Failed Payment Retry

Analytics Snapshot

Weekly Renewals

Reward Distribution

Model Retraining Trigger

---

# 18. Error Handling

Centralized.

Every error contains

Request ID

Error Code

Module

Stack Trace

Timestamp

User

Device

Severity

Recovery Action

---

# 19. Logging Strategy

Every request logged.

Every database query logged.

Every AI prediction logged.

Every trigger logged.

Every fraud decision logged.

Every payment logged.

Every blockchain transaction logged.

Every notification logged.

Every failed operation logged.

Log Levels

Debug

Info

Warning

Error

Critical

---

# 20. Observability

Metrics

CPU

Memory

Latency

Queue Size

API Success Rate

Claim Processing Time

Fraud Detection Time

Premium Calculation Time

Prediction Accuracy

Dashboard Refresh Time

---

# 21. Retry Strategy

External APIs

3 retries

Exponential Backoff

Payments

5 retries

Blockchain

Retry until confirmed

Notifications

Retry until delivered

Weather APIs

Switch provider if unavailable

---

# 22. Transaction Management

Financial operations must always be atomic.

Example

Create Claim

↓

Reserve Funds

↓

Create Payment

↓

Write Audit

↓

Blockchain Log

↓

Commit

If any step fails

↓

Rollback

---

# 23. Security

Input Validation

Output Sanitization

JWT

HTTPS

Encryption

Secrets Manager

Environment Variables

Audit Logs

Device Validation

Replay Protection

Rate Limiting

IP Blocking

SQL/NoSQL Injection Prevention

XSS Protection

CSRF Protection

---

# 24. Performance Optimizations

Redis Cache

Response Compression

Lazy Loading

Aggregation Pipelines

Pagination

Projection

Bulk Writes

Connection Pooling

Async Processing

Background Jobs

Read Optimization

---

# 25. Edge Cases

Duplicate Requests

Duplicate Payments

Duplicate Claims

Weather API Timeout

Payment Gateway Failure

Blockchain Delay

AI Prediction Failure

Redis Failure

Database Failure

Network Partition

Policy Expired During Processing

Worker Changes Zone

Multiple Devices

Clock Drift

Partial Transaction Failure

Government Alert Revoked

False Trigger

Manual Override

---

# 26. Backend Principles

Every controller must be stateless.

Every service must be testable.

Every repository must be replaceable.

Every workflow must be observable.

Every financial action must be auditable.

Every AI prediction must be explainable.

Every external API must support retry and fallback.

No business logic outside the Service layer.

No database access outside the Repository layer.

No controller should exceed ~150 lines.

No service should become a God Object.

The backend must always prioritize correctness, security, auditability, and scalability over implementation convenience.
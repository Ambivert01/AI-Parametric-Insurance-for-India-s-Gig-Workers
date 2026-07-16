# 24_AI_AGENT_INSTRUCTIONS.md

# Master AI Development Instructions

Version: 1.0

Status: PRIMARY IMPLEMENTATION DOCUMENT

**Priority:** Highest

---

# Purpose

This document is the primary instruction manual for any AI coding agent (Claude Code, Cursor, GitHub Copilot, OpenAI Codex, Gemini CLI, etc.) implementing this project.

This file defines

- Project philosophy
- Development rules
- Architecture constraints
- Coding methodology
- Feature implementation order
- UI/UX expectations
- Testing requirements
- Security requirements
- Performance targets
- Definition of Done

**If this document conflicts with any assumption made by the AI, this document always wins.**

---

# 1. Mission

Build an enterprise-grade AI-powered Parametric Insurance Platform for India's Gig Workers.

This is **NOT** a hackathon prototype.

This is **NOT** an MVP with shortcuts.

Build the software exactly like a production SaaS platform that could eventually serve millions of workers.

Every decision should prioritize

- Scalability
- Maintainability
- Security
- User Experience
- Modularity
- Reliability
- Future Expansion

---

# 2. Project Goal

Protect gig workers from income loss caused by external disruptions through

- AI Risk Assessment
- Dynamic Weekly Insurance
- Automatic Parametric Claims
- AI Fraud Detection
- Instant Payments
- Blockchain Transparency
- Real-Time Analytics

---

# 3. Project Principles

Never optimize for writing less code.

Optimize for writing better architecture.

Never simplify the system by removing modules.

If something is documented,

Implement it.

Do not invent new workflows.

Follow documentation.

---

# 4. Documentation Hierarchy

Read documents in this order before implementation.

```
01_SYSTEM_ARCHITECTURE

↓

20_SYSTEM_WORKFLOWS

↓

02_DATABASE

↓

03_BACKEND

↓

04_FRONTEND

↓

05_AI_ENGINE

↓

06_TRIGGER_ENGINE

↓

07_FRAUD_ENGINE

↓

08_POLICY_ENGINE

↓

09_CLAIMS_ENGINE

↓

10_PAYMENT_ENGINE

↓

11_BLOCKCHAIN_ENGINE

↓

12_ANALYTICS

↓

13_NOTIFICATION_ENGINE

↓

14_EXTERNAL_INTEGRATIONS

↓

15_SECURITY

↓

16_DEVOPS

↓

17_TESTING

↓

18_API

↓

19_WORKFLOWS

↓

22_FOLDER_STRUCTURE

↓

23_CODING_STANDARDS

↓

THIS DOCUMENT
```

Never implement before understanding the architecture.

---

# 5. Development Philosophy

Think like

Senior Software Architect

↓

Principal Engineer

↓

Staff Engineer

↓

Production Developer

↓

UI Designer

↓

QA Engineer

↓

DevOps Engineer

↓

Security Engineer

↓

AI Engineer

Every feature should satisfy all perspectives.

---

# 6. Architecture Rules

Use

Clean Architecture

Feature-Based Structure

SOLID

Repository Pattern

Service Layer

Dependency Injection

Domain Separation

Event Driven Communication

Never mix responsibilities.

---

# 7. Implementation Rules

For every feature

```
Understand

↓

Design

↓

Implement

↓

Validate

↓

Test

↓

Refactor

↓

Document

↓

Complete
```

Never skip a stage.

---

# 8. Folder Rules

Strictly follow

22_FOLDER_STRUCTURE.md

Do not invent folders.

Do not rename modules.

Do not flatten architecture.

---

# 9. Backend Rules

Controllers

↓

Validation

↓

Services

↓

Repositories

↓

Database

Controllers never contain business logic.

Repositories never contain business logic.

Services contain all business rules.

---

# 10. Frontend Rules

UI Components

↓

Hooks

↓

API Layer

↓

Backend

Never

```
fetch(...)
```

inside components.

Never duplicate components.

Build reusable UI.

---

# 11. AI Rules

AI never makes final decisions.

AI provides

Predictions

Confidence

Reason

Recommendation

Backend validates.

Business rules decide.

---

# 12. Blockchain Rules

Blockchain is

Transparency Layer

Not

Business Logic Layer

Never block application because blockchain is slow.

Always queue blockchain writes.

---

# 13. UI Expectations

The UI should feel like

Stripe

Linear

Vercel

Apple

Notion

Arc Browser

Modern SaaS

Premium Enterprise Software

Not Bootstrap.

Not Admin Template.

Not Generic Dashboard.

---

# 14. UI Design Language

Minimal

Elegant

Premium

Smooth

Modern

High Contrast

Readable

Professional

Rounded

Accessible

Responsive

Dark Mode Ready

---

# 15. Animations

Use

Framer Motion

Page transitions

Shared Layout Animations

Micro Interactions

Hover Animations

Button Animations

Card Animations

Loading Skeletons

Progressive Loading

Smooth Modals

Drawer Animations

Do not over animate.

Animations should improve UX.

---

# 16. Component Design

Every component should be

Reusable

Composable

Independent

Responsive

Accessible

Animated

Typed

Tested

---

# 17. UX Expectations

Every screen must support

Loading

Error

Success

Empty

Offline

Permission Denied

Retry

No blank screens.

---

# 18. Error Handling

Every async operation

↓

Loading

↓

Success

OR

↓

Failure

↓

Retry

↓

Fallback

Never silently fail.

---

# 19. API Rules

Use centralized API client.

JWT.

Refresh Token.

Retries.

Timeout.

Cancellation.

Typed Responses.

---

# 20. Performance Rules

Lazy Loading

Memoization

Caching

Pagination

Virtualization

Image Optimization

Bundle Splitting

Suspense

Code Splitting

---

# 21. Security Rules

Validate everything.

Escape everything.

Encrypt everything sensitive.

Audit everything important.

Rate limit APIs.

Never expose secrets.

Never trust frontend.

---

# 22. Logging Rules

Every important action logs

Timestamp

Request ID

Correlation ID

User

Module

Action

Duration

Status

Never log

Passwords

OTP

JWT

Secrets

---

# 23. Testing Rules

Every implemented feature

↓

Unit Tests

↓

Integration Tests

↓

Manual Verification

↓

Pass

↓

Merge

---

# 24. Accessibility Rules

Keyboard Navigation

ARIA

Contrast

Reduced Motion

Responsive

Focus Indicators

Screen Reader Support

---

# 25. Code Quality

Strict TypeScript

ESLint

Prettier

No Dead Code

No Any

No Duplicate Logic

Readable Naming

Small Functions

Reusable Components

---

# 26. Git Rules

Small commits.

Feature branches.

Meaningful commit messages.

No broken main branch.

---

# 27. Feature Completion Checklist

Every feature is complete only if

Architecture follows documentation

UI completed

Backend completed

Validation completed

Error handling completed

Security completed

Tests completed

Loading states completed

Empty states completed

Responsive

Accessible

Documented

Reviewed

---

# 28. Things Never To Do

Never remove documented functionality.

Never simplify architecture for convenience.

Never bypass validation.

Never hardcode secrets.

Never ignore edge cases.

Never ignore failures.

Never ignore retries.

Never duplicate code.

Never create God components.

Never create God services.

Never expose stack traces.

Never break folder structure.

Never change business logic without updating documentation.

---

# 29. Development Workflow

For every module

```
Read Documentation

↓

Understand Business Flow

↓

Create Database

↓

Create Models

↓

Create Validation

↓

Create Repository

↓

Create Services

↓

Create Controllers

↓

Create Routes

↓

Create Tests

↓

Create UI

↓

Connect APIs

↓

Test End-to-End

↓

Document

↓

Done
```

---

# 30. Definition of Production Ready

The feature must

Compile successfully

Pass all tests

Have no TypeScript errors

Have no lint errors

Be responsive

Be accessible

Support loading/error states

Have audit logging

Be secure

Be documented

Be scalable

Be reusable

Be maintainable

---

# 31. If Uncertain

If implementation details are unclear

Do NOT invent architecture.

Infer using

Business Rules

↓

System Workflows

↓

Module Documentation

↓

Coding Standards

↓

Implementation Guide

If still unclear

Choose the solution that is

Most scalable

Most maintainable

Most modular

Most secure

Most production-ready

---

# 32. Final Instruction

Treat this repository as if it will become a real insurance platform used by millions of workers.

Write code that a FAANG-level engineering team would be comfortable deploying.

Every module should be independently scalable.

Every workflow should be deterministic.

Every financial operation should be auditable.

Every UI should feel premium.

Every API should be predictable.

Every AI prediction should be explainable.

Every decision should improve the long-term quality of the platform.

**The final outcome should resemble an enterprise insurtech platform—not a hackathon demo—with architecture, code quality, UX, and engineering practices that can evolve into a real production product.**
# 21_IMPLEMENTATION_GUIDE.md

# Master Development & Implementation Guide

Version: 1.0

Status: Development Bible

---

# Purpose

This document defines the exact implementation strategy for the project.

It is intended for AI coding agents (Claude Code, Cursor, Copilot), software engineers, reviewers, and maintainers.

The objective is to ensure every contributor builds the system consistently.

No module should be implemented without following this document.

---

# 1. Core Development Philosophy

The platform must be built as a production-grade software system.

Not as a hackathon prototype.

Every feature should be

Scalable

Modular

Testable

Maintainable

Reusable

Secure

Observable

Fault Tolerant

---

# 2. Development Principles

Single Responsibility Principle

Open Closed Principle

Dependency Injection

Repository Pattern

Service Layer Pattern

Clean Architecture

Feature Based Architecture

SOLID Principles

DRY

KISS

Composition over Inheritance

---

# 3. General Rules

Never hardcode values.

Never hardcode URLs.

Never duplicate business logic.

Never place business logic inside controllers.

Never directly access database from controllers.

Never call external APIs from controllers.

Never skip validation.

Never trust frontend validation.

Never expose internal errors.

Never ignore logging.

Never ignore error handling.

---

# 4. Backend Rules

Controllers

Only request handling.

Services

Business logic only.

Repositories

Database only.

Models

Schema only.

Validators

Validation only.

Middlewares

Authentication

Authorization

Logging

Rate Limiting

Caching

Error Handling

Interceptors

Response Formatting

---

# 5. Frontend Rules

Pages contain layout only.

Business logic belongs inside hooks.

Components should be reusable.

API calls through centralized API layer.

Never call fetch directly inside components.

Use optimistic updates when appropriate.

Support loading states.

Support error states.

Support empty states.

Support offline states.

---

# 6. AI Rules

Models never directly modify database.

AI only recommends.

Backend validates.

Every prediction includes

Confidence

Reason

Model Version

Timestamp

Fallback Rule

If confidence is low

↓

Business Rules

---

# 7. Payment Rules

Payments must be

Atomic

Idempotent

Auditable

Retryable

Verified

Never execute duplicate transfers.

Never trust gateway callback without verification.

---

# 8. Blockchain Rules

Never store personal information.

Store hashes only.

Never block business workflow waiting for blockchain.

Always queue blockchain operations.

---

# 9. Database Rules

Indexes required.

Soft delete preferred.

Version critical entities.

Audit every mutation.

Never delete financial history.

Never overwrite audit records.

---

# 10. API Rules

REST only.

Versioned.

JWT protected.

Consistent response.

Pagination.

Filtering.

Sorting.

Validation.

OpenAPI documentation.

---

# 11. Logging Rules

Every business event logs

Timestamp

User

Module

Action

Status

Correlation ID

Request ID

Duration

Never log secrets.

---

# 12. Error Handling Rules

Every exception

↓

Global Error Handler

↓

Standard Response

↓

Logging

↓

Monitoring

↓

Alerting (if critical)

---

# 13. Event Rules

Every important action publishes an event.

Examples

PolicyCreated

ClaimApproved

PaymentCompleted

NotificationSent

FraudDetected

RewardDistributed

---

# 14. Code Quality

ESLint

Prettier

TypeScript Strict Mode

No Any

No Dead Code

Meaningful Names

Small Functions

Maximum Function Size

~40 lines preferred

---

# 15. Folder Naming

camelCase

PascalCase

kebab-case

Use consistent naming.

No random abbreviations.

---

# 16. Git Rules

Every feature

↓

Branch

↓

PR

↓

Review

↓

Tests

↓

Merge

Never commit directly to main.

---

# 17. Testing Rules

Every feature

↓

Unit Test

↓

Integration Test

↓

Manual Test

↓

Merge

Coverage target

90%+

---

# 18. Performance Rules

API

<300ms

Dashboard

<2s

AI

<2s

Payments

<30s

Notifications

<5s

---

# 19. Accessibility Rules

Keyboard navigation.

ARIA.

Contrast.

Responsive.

Reduced motion.

Screen reader support.

---

# 20. Security Rules

Validate everything.

Sanitize everything.

Encrypt everything sensitive.

Audit everything important.

Least privilege everywhere.

---

# 21. Documentation Rules

Every module must include

README

Architecture

API

Examples

Sequence Diagram

Tests

Future Improvements

Known Limitations

---

# 22. UI Standards

Modern.

Minimal.

Premium.

Glassmorphism (light use).

Soft shadows.

Rounded corners.

Smooth motion.

Micro interactions.

Responsive.

Accessible.

Professional.

---

# 23. Animation Standards

Framer Motion.

Spring animations.

Layout transitions.

Page transitions.

Loading skeletons.

Animated counters.

Chart animations.

No excessive motion.

---

# 24. Color Standards

Primary

Blue

Success

Green

Warning

Orange

Danger

Red

Neutral

Gray

Background

White

Dark Mode Ready

---

# 25. Typography

Inter

Geist

System Font Fallback

Consistent spacing.

8px grid.

---

# 26. Build Order

Authentication

↓

Users

↓

Policies

↓

Risk

↓

Premium

↓

Trigger Engine

↓

Claims

↓

Fraud

↓

Payments

↓

Blockchain

↓

Notifications

↓

Analytics

↓

Dashboard

↓

Testing

↓

Optimization

---

# 27. Definition of Done

Feature Complete

Tests Passing

Responsive

Accessible

Secure

Logged

Documented

Reviewed

Merged

No Critical Bugs

---

# 28. Things Never To Do

Never bypass validation.

Never skip tests.

Never hardcode secrets.

Never commit .env.

Never duplicate APIs.

Never ignore edge cases.

Never ignore retries.

Never leave TODOs in production.

Never expose stack traces.

---

# 29. AI Coding Agent Instructions

When implementing any feature

Understand architecture first.

Read related documentation.

Follow folder structure.

Write production-quality code.

Create reusable components.

Implement loading states.

Implement error handling.

Implement validation.

Implement tests.

Do not simplify architecture.

Do not remove features.

Do not invent undocumented behavior.

If requirements conflict

Prefer documentation.

If documentation is unclear

Follow business rules.

---

# 30. Final Principle

Every line of code should make the platform

More Reliable

More Maintainable

More Scalable

More Secure

More Observable

More Beautiful

More Professional

The implementation should be of production quality, suitable for enterprise insurance software, while remaining modular enough for future expansion beyond the hackathon.
# 23_CODING_STANDARDS.md

# Enterprise Coding Standards & Best Practices

Version: 1.0

Status: Master Coding Standard

---

# Purpose

This document defines the official coding standards for the AI-Powered Parametric Insurance Platform.

These standards ensure the codebase remains

Readable

Maintainable

Scalable

Consistent

Secure

Testable

Production Ready

Every contributor, whether human or AI, must follow these standards.

Consistency is more valuable than personal preference.

---

# 1. Coding Philosophy

Code is written once.

It is read thousands of times.

Optimize for readability over cleverness.

The best code is

Simple

Predictable

Explicit

Modular

Reusable

---

# 2. General Principles

Follow SOLID principles.

Follow DRY.

Follow KISS.

Prefer composition over inheritance.

Avoid premature optimization.

Optimize after measurement.

Write self-documenting code.

---

# 3. Naming Conventions

Variables

```ts
workerName
riskScore
weeklyPremium
```

Functions

```ts
calculatePremium()

createPolicy()

verifyClaim()

detectFraud()
```

Classes

```ts
PolicyService

ClaimRepository

FraudEngine
```

Interfaces

```ts
IWorker

IPolicy

IPaymentGateway
```

Enums

```ts
UserRole

PolicyStatus

ClaimStatus
```

Constants

```ts
MAX_RETRY

DEFAULT_TIMEOUT

API_VERSION
```

---

# 4. Folder Naming

Use

```
kebab-case
```

Example

```
policy-engine/

notification-engine/

payment-engine/
```

---

# 5. File Naming

React Components

```
WorkerDashboard.tsx
```

Utilities

```
dateFormatter.ts
```

Services

```
paymentService.ts
```

Repositories

```
claimRepository.ts
```

Validators

```
policyValidator.ts
```

---

# 6. Function Standards

Every function should

Do one thing.

Return one responsibility.

Be easy to test.

Avoid side effects.

Preferred

20–30 lines

Maximum

50 lines

Split larger functions.

---

# 7. Class Standards

Classes should have

Single Responsibility

Constructor Injection

Private Members

Clear Public API

Avoid God Classes.

---

# 8. Component Standards

React components should be

Reusable

Composable

Small

Stateless where possible

Separate UI from business logic.

Business logic belongs inside hooks/services.

---

# 9. Hook Standards

Custom hooks

```
usePolicy()

useClaims()

usePayments()

useRisk()

useNotifications()
```

Hooks must never mutate unrelated state.

---

# 10. API Standards

Never call fetch directly.

Use centralized API client.

Every request

Authentication

Retry

Error Handling

Logging

Timeout

Cancellation

---

# 11. Error Handling

Never ignore exceptions.

Always

Catch

Log

Wrap

Return standard errors.

Never expose stack traces to clients.

---

# 12. Validation

Validate

Frontend

Backend

Database

Business Rules

External API

Never trust client input.

---

# 13. Async Rules

Always

Use async/await

Avoid callback nesting

Handle promise rejection

Support cancellation where possible

---

# 14. TypeScript Rules

Strict Mode

Enabled

No

any

Prefer

unknown

Use

Readonly

Generics

Enums

Utility Types

Discriminated Unions

---

# 15. State Management

Global State

Only when necessary.

Prefer

Local State

↓

Context

↓

Global Store

Avoid deeply nested state.

---

# 16. Styling Standards

Tailwind CSS

Utility First

Reusable Components

Consistent Spacing

Responsive

Accessible

Dark Mode Ready

Avoid inline styles.

---

# 17. Comments

Comment

Why

Not

What

Bad

```ts
// increment x
x++;
```

Good

```ts
// Prevent duplicate payout retries after gateway timeout.
```

---

# 18. Logging

Log

Business Events

Errors

Warnings

Performance

Security Events

Never log

Passwords

OTP

JWT

Secrets

Bank Details

---

# 19. Magic Numbers

Avoid

```ts
if (score > 80)
```

Prefer

```ts
const HIGH_RISK_THRESHOLD = 80;
```

---

# 20. Configuration

Never hardcode

URLs

Keys

Secrets

Timeouts

Thresholds

Use environment variables or configuration files.

---

# 21. Imports

Order

External Libraries

↓

Internal Packages

↓

Components

↓

Hooks

↓

Utilities

↓

Styles

Remove unused imports.

---

# 22. Code Formatting

ESLint

Prettier

Consistent indentation

No trailing spaces

Maximum line length

100–120 characters preferred

---

# 23. Git Standards

Small commits.

Meaningful commit messages.

Example

```
feat(policy): implement weekly premium engine

fix(payment): resolve duplicate payout retry

refactor(claim): simplify approval workflow
```

---

# 24. Pull Requests

Every PR must include

Purpose

Screenshots (if UI)

Tests

Checklist

Reviewer

Linked Issue

---

# 25. Testing Standards

Every feature

↓

Unit Tests

↓

Integration Tests

↓

Manual Verification

↓

Merge

Never merge untested features.

---

# 26. Performance

Avoid unnecessary renders.

Memoize expensive calculations.

Lazy load heavy modules.

Virtualize long lists.

Cache expensive requests.

Optimize database queries.

---

# 27. Security Standards

Validate inputs.

Escape outputs.

Encrypt sensitive data.

Rotate secrets.

Verify webhooks.

Rate limit endpoints.

Use HTTPS only.

---

# 28. Accessibility

Keyboard Navigation

ARIA

Screen Readers

Contrast

Responsive Layout

Reduced Motion

Visible Focus

---

# 29. Documentation

Every module must contain

README

Architecture

API

Tests

Examples

Known Limitations

Future Improvements

---

# 30. Refactoring Rules

Refactor only after tests exist.

Never change behavior unintentionally.

Keep commits focused.

Document breaking changes.

---

# 31. Anti-Patterns

Avoid

God Classes

God Components

Long Functions

Deep Nesting

Duplicate Logic

Circular Dependencies

Hidden Side Effects

Tight Coupling

Global Mutable State

Callback Hell

---

# 32. Code Review Checklist

Naming

Architecture

Performance

Security

Testing

Accessibility

Error Handling

Logging

Documentation

Maintainability

Scalability

---

# 33. Definition of Good Code

Good code is

Readable

Predictable

Reusable

Testable

Secure

Maintainable

Observable

Scalable

Performant

Beautiful

---

# 34. Future Standards

Event Sourcing

CQRS

Domain-Driven Design

Microservices

Service Mesh

GraphQL

Kubernetes

AI Code Review

Autonomous Refactoring

Static Architecture Validation

---

# 35. Coding Principles

Every line of code should solve one problem clearly.

Optimize for future maintainers.

Consistency is more important than cleverness.

Prefer explicit code over implicit behavior.

Business logic should remain independent of frameworks.

Every module should be replaceable.

Every feature should be testable.

Every change should improve the quality of the codebase.

The codebase should feel like it was written by one disciplined engineering team, even if developed by many humans and AI agents.
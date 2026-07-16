# 03_DATABASE_DESIGN.md

# Database Architecture & Data Modeling Documentation

**Version:** 1.0

**Status:** Master Database Design

---

# Purpose

This document defines the complete database architecture, data model, collections, relationships, indexing strategy, lifecycle, auditing, soft deletion, versioning, analytics storage, AI datasets, and future scalability.

This database is designed to support millions of workers while maintaining high performance, auditability, and modularity.

The database must remain independent from business logic.

Business rules belong inside Services, not Models.

---

# 1. Database Philosophy

The database follows the following principles.

• Modular

• Event Driven

• Audit Friendly

• AI Ready

• Analytics Ready

• Normalized where necessary

• Denormalized where performance benefits

• Immutable audit history

• Soft Delete Support

• Version Controlled

• Future Proof

---

# 2. Database Architecture

```
Application

↓

Service Layer

↓

Repository Layer

↓

MongoDB

↓

Collections

↓

Indexes

↓

Analytics

↓

AI Features
```

---

# 3. Database Selection

Primary Database

MongoDB Atlas

Reason

Flexible schema

Rapid development

Horizontal scalability

GeoJSON support

Aggregation Pipeline

Atlas Search

Cloud managed

High availability

---

Caching Layer

Redis

Responsibilities

OTP

Sessions

API Cache

Risk Cache

Premium Cache

Dashboard Cache

Weather Cache

Queue Cache

Temporary Tokens

---

Object Storage

Cloudinary

Future

AWS S3

Azure Blob

Google Cloud Storage

---

# 4. Database Naming Standards

Collections

lowercase

plural

Examples

users

policies

claims

transactions

notifications

Never use

User

Policy

ClaimData

Random naming

---

Fields

camelCase

Examples

createdAt

updatedAt

riskScore

weeklyPremium

---

IDs

Mongo ObjectId

External UUID where necessary

---

Dates

Always UTC

ISO Format

---

Money

Never Float

Always Decimal128

or Integer Paisa

---

Coordinates

GeoJSON

---

# 5. Core Collections

---

## users

Stores worker information.

Fields

_id

phone

email

name

avatar

gender

dob

kycStatus

aadhaarHash

panHash

deliveryPlatform

vehicleType

city

zone

location

currentStatus

workingShift

experience

weeklyIncome

averageDailyIncome

averageOrders

riskProfileId

deviceIds

wallet

preferences

language

notificationSettings

createdAt

updatedAt

deletedAt

Indexes

phone

email

location

riskProfileId

deliveryPlatform

city

---

## userSessions

Stores active sessions.

Fields

userId

jwt

refreshToken

deviceId

ip

browser

os

expiresAt

lastSeen

---

## devices

Stores registered devices.

Fields

userId

deviceId

fingerprint

model

manufacturer

os

appVersion

lastLocation

isTrusted

riskLevel

---

## policies

Stores insurance policies.

Fields

policyNumber

userId

status

coveragePlan

coverageAmount

weeklyPremium

coverageStart

coverageEnd

renewalDate

renewalStatus

coverageRules

triggerConfiguration

riskSnapshot

rewardPoolEligible

blockchainHash

createdAt

updatedAt

Indexes

userId

status

coverageEnd

renewalDate

---

## premiumCalculations

Stores every premium calculation.

Fields

userId

riskScore

weatherScore

aqiScore

trafficScore

platformScore

seasonScore

coverageMultiplier

discount

rewardDiscount

finalPremium

modelVersion

predictionConfidence

generatedAt

Purpose

AI explainability

Historical pricing

Premium audits

---

## riskProfiles

Stores AI generated risk profiles.

Fields

userId

overallRisk

weatherRisk

heatRisk

pollutionRisk

trafficRisk

locationRisk

behaviorRisk

fraudRisk

incomeRisk

seasonRisk

predictionWindow

modelVersion

generatedAt

---

## triggers

Stores detected disruption events.

Fields

triggerId

triggerType

city

zone

latitude

longitude

severity

confidence

source

verifiedSources

triggerStart

triggerEnd

status

affectedRadius

metadata

Indexes

triggerType

status

city

zone

---

## claims

Stores insurance claims.

Fields

claimNumber

userId

policyId

triggerId

claimType

claimStatus

eligibilityStatus

fraudScore

riskScore

estimatedLoss

approvedLoss

approvalMethod

aiDecision

reviewReason

paymentId

blockchainHash

timeline

createdAt

updatedAt

Indexes

userId

policyId

claimStatus

triggerId

---

## claimTimeline

Stores every claim event.

Fields

claimId

event

description

actor

timestamp

metadata

Purpose

Complete audit trail

---

## payments

Stores payouts.

Fields

paymentId

claimId

userId

gateway

amount

currency

status

transactionReference

gatewayResponse

retryCount

failureReason

processedAt

completedAt

---

## transactions

Stores every financial transaction.

Fields

userId

type

amount

balanceBefore

balanceAfter

reference

status

metadata

---

## rewardPool

Stores community reward pool.

Fields

poolBalance

weeklyContribution

distributionHistory

eligibleUsers

lastDistribution

---

## notifications

Fields

userId

type

title

message

priority

channel

status

read

sentAt

---

## fraudCases

Stores detected fraud.

Fields

userId

claimId

fraudScore

reason

gpsValidation

deviceValidation

behaviorValidation

duplicateValidation

networkValidation

decision

reviewStatus

resolvedAt

---

## auditLogs

Stores immutable logs.

Fields

actor

action

entity

entityId

before

after

ip

device

timestamp

Purpose

Compliance

Investigation

Recovery

---

## blockchainLogs

Stores blockchain events.

Fields

claimId

policyId

transactionHash

blockNumber

network

status

gasFee

confirmedAt

---

## weatherData

Historical weather.

Fields

city

zone

temperature

humidity

rainfall

wind

storm

forecast

provider

recordedAt

---

## aqiData

Fields

city

zone

aqi

pm25

pm10

provider

recordedAt

---

## trafficData

Fields

city

zone

congestion

roadClosure

travelDelay

provider

recordedAt

---

## governmentAlerts

Fields

city

zone

alertType

severity

description

effectiveFrom

effectiveTo

source

---

## aiPredictions

Stores ML outputs.

Fields

predictionType

modelVersion

inputFeatures

prediction

confidence

explanation

generatedAt

---

## mlFeatures

Stores training features.

Purpose

Offline training

Model improvement

Dataset generation

---

## analyticsSnapshots

Stores dashboard aggregates.

Fields

date

claims

payouts

premiums

fraudCases

workers

lossRatio

renewals

---

## systemEvents

Stores platform events.

Fields

event

severity

service

status

payload

createdAt

---

# 6. Relationships

```
User
│
├── Policies
│
├── Claims
│
├── Payments
│
├── Notifications
│
├── Risk Profile
│
├── Premium History
│
├── Sessions
│
├── Devices
│
└── Fraud Cases

Policy
│
├── Claims
├── Blockchain Logs
└── Premium History

Claim
│
├── Timeline
├── Payment
├── Fraud Case
├── Trigger
└── Blockchain Log

Trigger
│
└── Claims
```

---

# 7. Indexing Strategy

Index

phone

email

policyNumber

claimNumber

paymentId

transactionHash

userId

status

city

zone

location

createdAt

Geo Index

location

Compound Index

city + zone

userId + status

claimStatus + createdAt

policyStatus + renewalDate

---

# 8. Soft Delete Policy

Never permanently delete

Users

Policies

Claims

Transactions

Audit Logs

Blockchain Logs

Use

deletedAt

deletedBy

deleteReason

---

# 9. Data Retention

Audit Logs

Permanent

Claims

Permanent

Policies

Permanent

Weather

5 Years

Notifications

1 Year

Sessions

30 Days

OTP

10 Minutes

AI Features

Permanent

---

# 10. Edge Cases

Duplicate Policy

Duplicate Claim

Concurrent Claims

Policy Renewal During Trigger

Multiple Active Devices

Location Change During Event

Payment Retry

Payment Rollback

Weather API Delay

AI Prediction Failure

Database Transaction Failure

Fraud Investigation Pending

Blockchain Transaction Pending

User Deleted During Claim

Expired Session

Redis Failure

---

# 11. Future Collections

iotSensors

satelliteData

droneData

communityPools

daoGovernance

platformPartners

climateModels

reinsurance

digitalIdentity

globalRiskProfiles

policyMarketplace

---

# 12. Database Principles

Every collection must have

createdAt

updatedAt

Indexes

Validation

Audit Support

Soft Delete Support

Version Compatibility

Future Extensibility

Every write operation must be traceable.

Every financial operation must be auditable.

Every AI prediction must be reproducible.

Every policy decision must be explainable.

No business logic should ever exist inside the database layer.
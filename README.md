# foundry-stack
An enterprise-grade SaaS boilerplate with React, Node.js, Prisma, and Stripe.
# Location-Based Social Networking Platform

A production-ready social networking application with real-time messaging, proximity-based discovery, and subscription monetization.

## Features

- 🔐 **Enterprise Authentication** - JWT with refresh token rotation, device binding, TOTP 2FA
- 💳 **Stripe Integration** - Subscription billing, one-time purchases, webhook handling
- 📍 **Geospatial Queries** - PostGIS-powered proximity search and location-based discovery
- 💬 **Real-time Messaging** - Socket.IO for instant communication
- 🗄️ **PostgreSQL + Prisma** - Type-safe database operations with migrations
- 🔒 **Security** - Helmet, rate limiting, CORS, encrypted passwords
- 📊 **Monitoring** - Prometheus metrics, Pino logging, Sentry error tracking
- 🚀 **Production Ready** - Docker support, environment configs, deployment guides

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL with PostGIS
- **ORM**: Prisma
- **Auth**: JWT, bcrypt
- **Payments**: Stripe
- **Real-time**: Socket.IO
- **Storage**: AWS S3
- **Caching**: Redis (optional)

## Quick Start

### Prerequisites

- Node.js 18+ ([Download](https://nodejs.org/))
- PostgreSQL 15+ ([Download](https://www.postgresql.org/download/))
- Redis (optional) ([Download](https://redis.io/download))

### Installation
```powershell

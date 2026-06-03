# BloodConnect — AI-Powered Blood Donation Platform

A full-stack MERN SaaS platform connecting blood donors with patients in real time, powered by **Groq AI** for urgency classification and donor matching.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite + React Router |
| Backend | Node.js + Express |
| Database | MongoDB + Mongoose (with 2dsphere geo index) |
| AI | Groq — llama-3.1-8b-instant |
| Real-time | Socket.io |
| Email | Nodemailer (Gmail) |
| Charts | Recharts |
| Auth | JWT + bcryptjs |

## Features

- 🩸 **Live request feed** with Socket.io — new requests appear instantly
- 🤖 **AI urgency classifier** — Groq AI classifies every request as critical/urgent/normal
- 🗺️ **Geo-based donor matching** — MongoDB 2dsphere index finds nearest compatible donors
- 🤖 **AI donor match scoring** — ranks donors by compatibility, health score, last donation
- 📧 **Email notifications** — critical requests trigger email alerts to nearby donors
- 🏆 **Leaderboard** — top donors ranked by total donations
- 👥 **3 user roles** — donor, requester, admin
- ✅ **Admin dashboard** — verify donors, view stats, blood type charts

## Setup

### 1. Server
```bash
cd server
cp .env.example .env    # fill in your keys
npm install
npm run dev
```

### 2. Client
```bash
cd client
npm install
npm run dev
```

### 3. Get API keys (all free)
- **Groq**: https://console.groq.com → free API key
- **MongoDB Atlas**: https://cloud.mongodb.com → free M0 cluster
- **Gmail**: Enable 2FA → App Passwords → generate one for EMAIL_PASS

### 4. Seed data
Register an admin account, go to /admin → click "Seed Test Data"

## API Endpoints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | /api/auth/register | — | Register |
| POST | /api/auth/login | — | Login |
| GET | /api/requests | — | List requests |
| POST | /api/requests | User | Post request (AI classified) |
| POST | /api/requests/:id/respond | Donor | Pledge donation |
| GET | /api/match/:requestId | — | AI-scored donor matches |
| GET | /api/donors/nearby | — | Nearby donors (geo query) |
| GET | /api/donors/leaderboard | — | Top donors |
| PUT | /api/donors/profile | Donor | Update profile |
| GET | /api/admin/stats | Admin | Platform stats |
| POST | /api/admin/seed | Admin | Seed test data |
| PUT | /api/donors/:id/verify | Admin | Verify donor |

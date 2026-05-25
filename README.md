# Trowd Backend ⚙️

The backend service for Trowd, providing real-time bus tracking, crowdsourced report validation, and ML-powered ETA predictions.

## 🛠 Tech Stack
- **Framework**: Node.js, Express.js
- **Database**: PostgreSQL (via `pg`), Supabase
- **Caching & State**: Redis (`ioredis`)
- **Real-Time**: Socket.io
- **Machine Learning**: Integration with Python ML services (FastAPI) for ETA prediction
- **Security & Validation**: Zod, JSON Web Tokens (JWT), Bcrypt

## 🧠 Core Systems

1. **Crowdsource Report Engine**: Receives user reports of bus arrivals, calculates reporter credibility, and validates arrivals based on consensus.
2. **Progression Tracking**: Stores the last confirmed stop in Redis for immediate access.
3. **ML ETA Fusion**: Combines historical travel times, schedule baselines, and real-time delay data to generate a dynamic ETA.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL
- Redis
- Supabase account (optional, based on config)

### Installation

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up your environment variables:
   Create a `.env` file in the root of the backend directory.
   ```env
   PORT=3000
   DATABASE_URL=postgres://user:password@localhost:5432/trowd
   REDIS_URL=redis://localhost:6379
   # Add your JWT and Supabase secrets here
   ```

### Running the Server
Start the development server:
```bash
npm start
```
*(Make sure your Redis and Postgres instances are running!)*

## 📂 Project Structure
- `/src`: Main application logic (routes, controllers, services).
- `/ml`: Python/FastAPI machine learning models for ETA and feature engineering.
- `/scripts`: Utility and migration scripts.

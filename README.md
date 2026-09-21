# Badboy Barber - Cloudflare Version

Full-stack barbershop POS and reporting system deployed on Cloudflare.

## Project Structure

```
cloudflare-barbershop/
├── worker/               # Cloudflare Workers backend
│   └── src/
│       ├── index.ts      # Worker entry point
│       ├── routes/       # API route handlers
│       │   ├── auth.ts
│       │   ├── items.ts
│       │   ├── transactions.ts
│       │   ├── reports.ts
│       │   └── dbadmin.ts
│       ├── utils/        # Shared utilities
│       │   ├── router.ts
│       │   └── jwt.ts
│       └── db/           # Database schema
│           └── schema.ts
├── pages/                # Frontend (Cloudflare Pages)
│   └── index.html        # React SPA
├── wrangler.toml         # Cloudflare Workers config
└── package.json
```

## Features

- **POS (Point of Sale)**: Quick transaction entry with cash/QRIS payment
- **Item Management**: Services and products with categories
- **Daily Reports**: Revenue breakdown, item sales, CSV export
- **Multi-user**: Admin/cashier roles with PIN authentication
- **Branch Support**: Multiple locations (cabang)

## Tech Stack

- **Frontend**: React (vanilla JS SPA) → Cloudflare Pages
- **Backend**: TypeScript → Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)

## Setup

### Prerequisites

- Node.js 18+
- Cloudflare account
- Wrangler CLI: `npm install -g wrangler`

### Local Development

```bash
# Install dependencies
npm install

# Login to Cloudflare
npx wrangler login

# Create D1 database
npx wrangler d1 create badboy-barber-db

# Replace D1_DATABASE_ID in wrangler.toml
# Create .dev.vars file:
echo 'D1_DATABASE_ID=your_id_here' > .dev.vars
echo 'SECRET_KEY=your-secure-secret-key' >> .dev.vars

# Start local dev
npm run dev
```

### Deploy

```bash
# Deploy Worker
npm run deploy

# Deploy Pages (frontend)
npm run pages
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | Login with username + PIN |
| POST | /api/auth/refresh | Refresh JWT token |
| GET | /api/auth/me | Get current user |
| GET | /api/items | List items |
| POST | /api/items | Create item |
| PATCH | /api/items/:id | Update item |
| DELETE | /api/items/:id | Delete item |
| POST | /api/transactions | Create transaction |
| GET | /api/transactions | List transactions |
| GET | /api/transactions/daily | Daily summary |
| GET | /api/reports/daily-summary | Full daily report |
| GET | /api/reports/daily-detail | Detailed daily report |
| GET | /api/reports/csv | Export CSV |
| GET | /api/db/tables | List tables (admin) |
| GET | /api/db/table/:name | View table (admin) |
| PATCH | /api/db/row/:table/:id | Update row (admin) |
| DELETE | /api/db/row/:table/:id | Delete row (admin) |

## Default Credentials

After first deploy, seed an admin user via Cloudflare Dashboard:

```sql
-- In D1 console
INSERT INTO users (username, pin_hash, role) VALUES ('admin', 'pinhash_here', 'admin');
```

Or use the seed script (when available).

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SECRET_KEY` | JWT signing secret (keep secure!) |
| `ALLOWED_ORIGINS` | CORS allowed origins (default: `*`) |

## Cloudflare Resources Used

- **Cloudflare Pages**: Frontend hosting (free tier)
- **Cloudflare Workers**: Backend API (free tier: 100k req/day)
- **Cloudflare D1**: Database (free tier: 1k writes/day, 100MB)

## Migrating from VPS

The original FastAPI + PostgreSQL backend is replaced with Workers + D1. Data must be migrated manually:

1. Export PostgreSQL data
2. Import to D1 via `INSERT` statements
3. Update frontend API URLs if needed

## License

Proprietary - Badboy Barber

/**
 * D1 Database Schema for Badboy Barber
 * 
 * Run this once to initialize your D1 database.
 * Then seed the admin user separately.
 */

export const SCHEMA = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  pin_hash TEXT NOT NULL,
  role TEXT DEFAULT 'cashier',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Branches (cabang) table
CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Items (layanan/barang) table
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  category TEXT DEFAULT 'service',
  branch_id INTEGER REFERENCES branches(id),
  is_active INTEGER DEFAULT 1,
  is_hidden INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Transactions (transaksi) table
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  total_amount REAL NOT NULL,
  cash_amount REAL DEFAULT 0,
  qris_amount REAL DEFAULT 0,
  change_amount REAL DEFAULT 0,
  status TEXT DEFAULT 'completed',
  notes TEXT,
  date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Transaction items (item transaksi) table
CREATE TABLE IF NOT EXISTS transaction_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER REFERENCES transactions(id),
  item_id INTEGER REFERENCES items(id),
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_items_branch ON items(branch_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_txn_items_txn ON transaction_items(transaction_id);
`;

/**
 * Initialize database - creates tables if not exist
 */
export async function initDb(db: D1Database): Promise<void> {
  await db.prepare(SCHEMA).run();
}

/**
 * Seed admin user
 */
export async function seedAdminUser(db: D1Database, username: string, pin: string): Promise<void> {
  const { hashPin } = await import('../utils/jwt');
  const pinHash = hashPin(pin);
  
  const existing = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (!existing) {
    await db.prepare('INSERT INTO users (username, pin_hash, role) VALUES (?, ?, ?)').bind(username, pinHash, 'admin').run();
    console.log(`Admin user '${username}' created`);
  } else {
    console.log(`Admin user '${username}' already exists`);
  }
}

/**
 * Seed default branch
 */
export async function seedDefaultBranch(db: D1Database, name: string = 'Cabang Utama'): Promise<void> {
  const existing = await db.prepare('SELECT id FROM branches WHERE name = ?').bind(name).first();
  if (!existing) {
    await db.prepare('INSERT INTO branches (name) VALUES (?)').bind(name).run();
    console.log(`Branch '${name}' created`);
  } else {
    console.log(`Branch '${name}' already exists`);
  }
}

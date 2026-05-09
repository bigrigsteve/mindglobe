import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import bcrypt from "bcryptjs";

const dataDir = path.join(process.cwd(), "data");

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "mindglobe.db");

/** SQLite via Node’s bundled engine — no native compile (see package.json engines). */
export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    body TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    anon_ip TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    edit_token_hash TEXT NOT NULL,
    locked INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);
  CREATE INDEX IF NOT EXISTS idx_posts_lat_lng ON posts(lat, lng);

  CREATE TABLE IF NOT EXISTS replies (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_replies_post ON replies(post_id);

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS traffic_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    method TEXT,
    path TEXT,
    ip TEXT,
    ua TEXT,
    referer TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    payload TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

/** @param {{ username?: string; password?: string }} creds */
export function seedAdminFromEnv(creds) {
  if (!creds?.username || !creds.password) return;
  const row = db.prepare("SELECT id FROM admins WHERE username = ?").get(creds.username);
  if (row) return;
  const hash = bcrypt.hashSync(creds.password, 12);
  db.prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)").run(creds.username, hash);
}

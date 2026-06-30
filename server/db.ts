import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";

// ── Data directory ────────────────────────────────────────────────────────────
// In the packaged Electron app, main.js passes DATA_DIR = app.getPath('userData')
//   Windows : C:\Users\<name>\AppData\Roaming\AstraNovaAI
//   macOS   : ~/Library/Application Support/AstraNovaAI
//   Linux   : ~/.config/AstraNovaAI
//
// In dev (npm run dev without Electron), falls back to ./data in the project root.
// That's fine — the fallback is only used during local development.
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH  = path.join(DATA_DIR, "astranova.db");

let _db: Database.Database | null = null;

export async function createDb() {
  if (_db) return getDbMethods(_db);

  // Ensure the directory exists (safe on first launch)
  fs.mkdirSync(DATA_DIR, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  console.log(`[db] SQLite database → ${DB_PATH}`);

  initSchema(_db);

  return getDbMethods(_db);
}

// ── Schema ────────────────────────────────────────────────────────────────────

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'basic',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cached_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      org_id INTEGER NOT NULL,
      user_data TEXT NOT NULL,
      vultr_token TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      industry TEXT,
      website TEXT,
      address TEXT,
      phone TEXT,
      email TEXT,
      contact_name TEXT,
      contact_title TEXT,
      notes TEXT,
      gbp_place_id TEXT,
      gbp_rating REAL,
      gbp_review_count INTEGER,
      health_score INTEGER DEFAULT 0,
      monthly_budget REAL,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL DEFAULT 1,
      client_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT DEFAULT 'medium',
      type TEXT DEFAULT 'seo',
      due_date TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL DEFAULT 1,
      client_id INTEGER,
      title TEXT NOT NULL,
      body TEXT,
      type TEXT DEFAULT 'blog',
      status TEXT DEFAULT 'draft',
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS client_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(client_id, key),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      author TEXT,
      rating INTEGER,
      body TEXT,
      published_at TEXT,
      reply TEXT,
      replied_at TEXT,
      google_review_id TEXT UNIQUE,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );
  `);
}

// ── DB methods ────────────────────────────────────────────────────────────────

function getDbMethods(db: Database.Database) {
  return {

    // ── Cached users (offline login) ──────────────────────────────────────────
    async upsertCachedUser(email: string, plainPassword: string, userData: any, vultrToken: string) {
      const hash = await bcrypt.hash(plainPassword, 10);
      db.prepare(`
        INSERT INTO cached_users (email, password_hash, user_id, org_id, user_data, vultr_token, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(email) DO UPDATE SET
          password_hash = excluded.password_hash,
          user_id       = excluded.user_id,
          org_id        = excluded.org_id,
          user_data     = excluded.user_data,
          vultr_token   = excluded.vultr_token,
          updated_at    = datetime('now')
      `).run(email, hash, userData.id, userData.orgId || 1, JSON.stringify(userData), vultrToken);
    },

    getCachedUser(email: string) {
      const row = db.prepare("SELECT * FROM cached_users WHERE email = ?").get(email) as any;
      if (!row) return null;
      return {
        email:        row.email,
        passwordHash: row.password_hash,
        userId:       row.user_id,
        orgId:        row.org_id,
        userData:     JSON.parse(row.user_data),
        vultrToken:   row.vultr_token,
      };
    },

    // ── Clients ───────────────────────────────────────────────────────────────
    getClients(orgId: number) {
      return db.prepare("SELECT * FROM clients WHERE organization_id = ? ORDER BY name").all(orgId);
    },

    getClient(id: number, orgId: number) {
      return db.prepare("SELECT * FROM clients WHERE id = ? AND organization_id = ?").get(id, orgId);
    },

    createClient(data: any) {
      const result = db.prepare(`
        INSERT INTO clients
          (organization_id, name, industry, website, address, phone, email,
           contact_name, contact_title, notes, gbp_place_id, monthly_budget, status)
        VALUES
          (@organizationId, @name, @industry, @website, @address, @phone, @email,
           @contactName, @contactTitle, @notes, @gbpPlaceId, @monthlyBudget, @status)
      `).run({
        organizationId: data.organizationId || 1,
        name:           data.name,
        industry:       data.industry       || null,
        website:        data.website        || null,
        address:        data.address        || null,
        phone:          data.phone          || null,
        email:          data.email          || null,
        contactName:    data.contactName    || null,
        contactTitle:   data.contactTitle   || null,
        notes:          data.notes          || null,
        gbpPlaceId:     data.gbpPlaceId     || null,
        monthlyBudget:  data.monthlyBudget  || null,
        status:         data.status         || "active",
      });
      return db.prepare("SELECT * FROM clients WHERE id = ?").get(result.lastInsertRowid);
    },

    updateClient(id: number, orgId: number, data: any) {
      const fields = Object.keys(data)
        .filter(k => !["id", "organizationId", "createdAt"].includes(k))
        .map(k => `${camelToSnake(k)} = @${k}`)
        .join(", ");
      if (!fields) return db.prepare("SELECT * FROM clients WHERE id = ?").get(id);
      db.prepare(`UPDATE clients SET ${fields} WHERE id = @id AND organization_id = @orgId`)
        .run({ ...data, id, orgId });
      return db.prepare("SELECT * FROM clients WHERE id = ?").get(id);
    },

    deleteClient(id: number, orgId: number) {
      db.prepare("DELETE FROM clients WHERE id = ? AND organization_id = ?").run(id, orgId);
    },

    // ── Tasks ─────────────────────────────────────────────────────────────────
    getTasks(orgId: number) {
      return db.prepare("SELECT * FROM tasks WHERE organization_id = ? ORDER BY created_at DESC").all(orgId);
    },

    getTasksByClient(clientId: number, orgId: number) {
      return db.prepare("SELECT * FROM tasks WHERE client_id = ? AND organization_id = ? ORDER BY created_at DESC")
        .all(clientId, orgId);
    },

    createTask(data: any) {
      const result = db.prepare(`
        INSERT INTO tasks (organization_id, client_id, title, description, status, priority, type, due_date)
        VALUES (@organizationId, @clientId, @title, @description, @status, @priority, @type, @dueDate)
      `).run({
        organizationId: data.organizationId || 1,
        clientId:       data.clientId       || null,
        title:          data.title,
        description:    data.description    || null,
        status:         data.status         || "pending",
        priority:       data.priority       || "medium",
        type:           data.type           || "seo",
        dueDate:        data.dueDate        || null,
      });
      return db.prepare("SELECT * FROM tasks WHERE id = ?").get(result.lastInsertRowid);
    },

    updateTask(id: number, orgId: number, data: any) {
      const fields = Object.keys(data)
        .filter(k => !["id", "organizationId", "createdAt"].includes(k))
        .map(k => `${camelToSnake(k)} = @${k}`)
        .join(", ");
      if (!fields) return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
      db.prepare(`UPDATE tasks SET ${fields} WHERE id = @id AND organization_id = @orgId`)
        .run({ ...data, id, orgId });
      return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    },

    deleteTask(id: number, orgId: number) {
      db.prepare("DELETE FROM tasks WHERE id = ? AND organization_id = ?").run(id, orgId);
    },

    // ── Content / Blog ────────────────────────────────────────────────────────
    getContent(orgId: number) {
      return db.prepare("SELECT * FROM content WHERE organization_id = ? ORDER BY created_at DESC").all(orgId);
    },

    getContentByClient(clientId: number, orgId: number) {
      return db.prepare("SELECT * FROM content WHERE client_id = ? AND organization_id = ? ORDER BY created_at DESC")
        .all(clientId, orgId);
    },

    createContent(data: any) {
      const result = db.prepare(`
        INSERT INTO content (organization_id, client_id, title, body, type, status)
        VALUES (@organizationId, @clientId, @title, @body, @type, @status)
      `).run({
        organizationId: data.organizationId || 1,
        clientId:       data.clientId       || null,
        title:          data.title,
        body:           data.body           || null,
        type:           data.type           || "blog",
        status:         data.status         || "draft",
      });
      return db.prepare("SELECT * FROM content WHERE id = ?").get(result.lastInsertRowid);
    },

    updateContent(id: number, orgId: number, data: any) {
      const fields = Object.keys(data)
        .filter(k => !["id", "organizationId", "createdAt"].includes(k))
        .map(k => `${camelToSnake(k)} = @${k}`)
        .join(", ");
      if (!fields) return db.prepare("SELECT * FROM content WHERE id = ?").get(id);
      db.prepare(`UPDATE content SET ${fields} WHERE id = @id AND organization_id = @orgId`)
        .run({ ...data, id, orgId });
      return db.prepare("SELECT * FROM content WHERE id = ?").get(id);
    },

    deleteContent(id: number, orgId: number) {
      db.prepare("DELETE FROM content WHERE id = ? AND organization_id = ?").run(id, orgId);
    },

    // ── Reviews ───────────────────────────────────────────────────────────────
    getReviewsByClient(clientId: number) {
      return db.prepare("SELECT * FROM reviews WHERE client_id = ? ORDER BY published_at DESC").all(clientId);
    },

    upsertReview(clientId: number, data: any) {
      db.prepare(`
        INSERT INTO reviews (client_id, author, rating, body, published_at, reply, replied_at, google_review_id)
        VALUES (@clientId, @author, @rating, @body, @publishedAt, @reply, @repliedAt, @googleReviewId)
        ON CONFLICT(google_review_id) DO UPDATE SET
          reply      = excluded.reply,
          replied_at = excluded.replied_at
      `).run({
        clientId:       clientId,
        author:         data.author         || null,
        rating:         data.rating         || null,
        body:           data.body           || null,
        publishedAt:    data.publishedAt    || null,
        reply:          data.reply          || null,
        repliedAt:      data.repliedAt      || null,
        googleReviewId: data.googleReviewId || null,
      });
    },

    updateReviewReply(id: number, reply: string) {
      db.prepare("UPDATE reviews SET reply = ?, replied_at = datetime('now') WHERE id = ?").run(reply, id);
      return db.prepare("SELECT * FROM reviews WHERE id = ?").get(id);
    },

    // ── Client key-value data ─────────────────────────────────────────────────
    getClientData(clientId: number) {
      const rows = db.prepare("SELECT key, value FROM client_data WHERE client_id = ?").all(clientId) as any[];
      return rows.reduce((acc, row) => {
        try { acc[row.key] = JSON.parse(row.value); } catch { acc[row.key] = row.value; }
        return acc;
      }, {} as Record<string, any>);
    },

    setClientData(clientId: number, key: string, value: any) {
      db.prepare(`
        INSERT INTO client_data (client_id, key, value, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(client_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
      `).run(clientId, key, JSON.stringify(value));
    },

  };
}

// ── Utility ───────────────────────────────────────────────────────────────────

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

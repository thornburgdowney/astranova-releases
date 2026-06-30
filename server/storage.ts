import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import path from "path";
import fs from "fs";

// Load native binding from prebuilt path (bypasses bindings module lookup)
function loadSqliteAddon() {
  const candidates = [
    path.resolve(process.cwd(), "node_modules/better-sqlite3/build/Release/better_sqlite3.node"),
    path.resolve(process.cwd(), "prebuilds/linux-x64/better_sqlite3.node"),
    path.resolve(__dirname, "../node_modules/better-sqlite3/build/Release/better_sqlite3.node"),
    path.resolve(__dirname, "../prebuilds/linux-x64/better_sqlite3.node"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const binding = { exports: {} as any };
        process.dlopen(binding, candidate);
        console.log("[sqlite] loaded native addon from:", candidate);
        return binding.exports;
      } catch (e) {
        console.warn("[sqlite] dlopen failed for", candidate, ":", (e as any).message);
      }
    }
  }
  console.warn("[sqlite] no prebuilt binary found, falling back to default bindings");
  return null;
}

const dbPath = path.resolve(process.cwd(), "data.db");
const nativeAddon = loadSqliteAddon();
const sqlite = nativeAddon ? new Database(dbPath, { nativeBinding: nativeAddon } as any) : new Database(dbPath);
console.log("[sqlite] database opened:", dbPath);
const db = drizzle(sqlite, { schema });

// ─── Schema Bootstrap ───────────────────────────────────────────────────────
sqlite.exec(`
  -- Organizations (tenants)
  CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL DEFAULT 'basic',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    subscription_status TEXT DEFAULT 'trialing',
    trial_ends_at TEXT,
    plan_ends_at TEXT,
    logo_url TEXT,
    whitelabel_name TEXT,
    whitelabel_domain TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Users (scoped to org)
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner',
    is_owner INTEGER DEFAULT 0,
    email_verified INTEGER DEFAULT 0,
    verify_token TEXT,
    reset_token TEXT,
    reset_token_expires_at TEXT,
    galaxy_theme TEXT DEFAULT 'milky-way',
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Clients (scoped to org)
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    industry TEXT NOT NULL,
    website TEXT,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    logo TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    social_accounts TEXT DEFAULT '[]',
    notes TEXT,
    google_business_url TEXT,
    description TEXT,
    monthly_traffic INTEGER,
    gbp_rating REAL,
    gbp_review_count INTEGER,
    gbp_phone TEXT,
    gbp_address TEXT,
    gbp_last_synced TEXT
  );

  CREATE TABLE IF NOT EXISTS traffic_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    sessions INTEGER DEFAULT 0,
    unique_visitors INTEGER DEFAULT 0,
    bounce_rate REAL DEFAULT 0,
    avg_session_duration INTEGER DEFAULT 0,
    pageviews INTEGER DEFAULT 0,
    source TEXT DEFAULT 'manual'
  );

  CREATE TABLE IF NOT EXISTS seo_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'on-page',
    priority TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'todo',
    description TEXT,
    target_url TEXT,
    target_keyword TEXT,
    due_date TEXT,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    keyword TEXT NOT NULL,
    search_volume INTEGER,
    difficulty INTEGER,
    current_rank INTEGER,
    target_rank INTEGER,
    status TEXT DEFAULT 'tracking',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS social_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    platform TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    scheduled_at TEXT,
    published_at TEXT,
    image_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS generated_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    keywords TEXT DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    platform TEXT NOT NULL DEFAULT 'google',
    reviewer_name TEXT NOT NULL,
    rating INTEGER NOT NULL,
    content TEXT NOT NULL,
    review_date TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    ai_draft_response TEXT,
    published_response TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS ads_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    platform TEXT NOT NULL DEFAULT 'google',
    campaign_name TEXT,
    spend REAL DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    conversions INTEGER DEFAULT 0,
    start_date TEXT,
    end_date TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS team_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    invited_by INTEGER NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'editor',
    token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT
  );

  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    metric TEXT NOT NULL,
    target_value INTEGER NOT NULL,
    current_value INTEGER DEFAULT 0,
    period TEXT NOT NULL,
    due_date TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS google_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at INTEGER,
    scope TEXT,
    google_account_email TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS client_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(client_id, key)
  );
`);

// ─── Safe column/table migrations (existing DBs) ────────────────────────────
const migrations = [
  // Add org columns to existing tables that previously used user_id
  "ALTER TABLE users ADD COLUMN organization_id INTEGER",
  "ALTER TABLE users ADD COLUMN is_owner INTEGER DEFAULT 0",
  "ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0",
  "ALTER TABLE users ADD COLUMN verify_token TEXT",
  "ALTER TABLE users ADD COLUMN reset_token TEXT",
  "ALTER TABLE users ADD COLUMN reset_token_expires_at TEXT",
  "ALTER TABLE users ADD COLUMN galaxy_theme TEXT DEFAULT 'milky-way'",
  "ALTER TABLE clients ADD COLUMN organization_id INTEGER",
  "ALTER TABLE settings ADD COLUMN organization_id INTEGER",
  "ALTER TABLE google_tokens ADD COLUMN organization_id INTEGER",
  // Legacy client columns
  "ALTER TABLE clients ADD COLUMN description TEXT",
  "ALTER TABLE clients ADD COLUMN monthly_traffic INTEGER",
  "ALTER TABLE clients ADD COLUMN gbp_rating REAL",
  "ALTER TABLE clients ADD COLUMN gbp_review_count INTEGER",
  "ALTER TABLE clients ADD COLUMN gbp_phone TEXT",
  "ALTER TABLE clients ADD COLUMN gbp_address TEXT",
  "ALTER TABLE clients ADD COLUMN gbp_last_synced TEXT",
  "ALTER TABLE clients ADD COLUMN contact_name TEXT",
  "ALTER TABLE clients ADD COLUMN contact_email TEXT",
  "ALTER TABLE clients ADD COLUMN contact_phone TEXT",
];
for (const m of migrations) {
  try { sqlite.exec(m); } catch (_) { /* already exists */ }
}

// ─── Bootstrap: migrate existing single-user data into org #1 ───────────────
function bootstrapOrg() {
  // Check if org 1 exists
  const existingOrg = sqlite.prepare("SELECT id FROM organizations WHERE id = 1").get();
  if (existingOrg) return;

  // Find the first/existing user
  const firstUser = sqlite.prepare("SELECT * FROM users LIMIT 1").get() as any;
  if (!firstUser) return;

  // Create org for existing user
  sqlite.prepare(`
    INSERT INTO organizations (id, name, slug, plan, subscription_status, created_at)
    VALUES (1, ?, ?, 'enterprise', 'active', datetime('now'))
  `).run(
    firstUser.name ? `${firstUser.name}'s Agency` : "Thornburg & Downey Marketing",
    "thornburg-downey"
  );

  // Link user to org and mark as owner
  sqlite.prepare(`
    UPDATE users SET organization_id = 1, is_owner = 1, role = 'owner', email_verified = 1
    WHERE id = ?
  `).run(firstUser.id);

  // Migrate existing clients: set organization_id = 1 where it's null
  sqlite.prepare("UPDATE clients SET organization_id = 1 WHERE organization_id IS NULL").run();

  // Migrate settings
  sqlite.prepare("UPDATE settings SET organization_id = 1 WHERE organization_id IS NULL").run();

  // Migrate google_tokens
  sqlite.prepare("UPDATE google_tokens SET organization_id = 1 WHERE organization_id IS NULL").run();

  console.log("[bootstrap] Migrated existing data to org #1");
}

bootstrapOrg();

// ─── Storage interface ───────────────────────────────────────────────────────
export interface IStorage {
  // Organizations
  getOrgById(id: number): schema.Organization | undefined;
  getOrgBySlug(slug: string): schema.Organization | undefined;
  createOrg(data: schema.InsertOrganization): schema.Organization;
  updateOrg(id: number, data: Partial<schema.Organization>): schema.Organization | undefined;

  // Users
  getUserById(id: number): schema.User | undefined;
  getUserByEmail(email: string): schema.User | undefined;
  getUsersByOrgId(orgId: number): schema.User[];
  createUser(data: schema.InsertUser): schema.User;
  updateUser(id: number, data: Partial<schema.User>): schema.User | undefined;
  getAllUsers(): schema.User[];

  // Clients
  getClientsByOrgId(orgId: number): schema.Client[];
  getClientById(id: number): schema.Client | undefined;
  createClient(data: schema.InsertClient): schema.Client;
  updateClient(id: number, data: Partial<schema.Client>): schema.Client | undefined;
  deleteClient(id: number): void;

  // Traffic
  getTrafficByClientId(clientId: number): schema.TrafficData[];
  upsertTrafficData(data: schema.InsertTrafficData): schema.TrafficData;

  // SEO Tasks
  getSeoTasksByClientId(clientId: number): schema.SeoTask[];
  createSeoTask(data: schema.InsertSeoTask): schema.SeoTask;
  updateSeoTask(id: number, data: Partial<schema.SeoTask>): schema.SeoTask | undefined;
  deleteSeoTask(id: number): void;

  // Keywords
  getKeywordsByClientId(clientId: number): schema.Keyword[];
  createKeyword(data: schema.InsertKeyword): schema.Keyword;
  updateKeyword(id: number, data: Partial<schema.Keyword>): schema.Keyword | undefined;
  deleteKeyword(id: number): void;

  // Social Posts
  getSocialPostsByClientId(clientId: number): schema.SocialPost[];
  createSocialPost(data: schema.InsertSocialPost): schema.SocialPost;
  updateSocialPost(id: number, data: Partial<schema.SocialPost>): schema.SocialPost | undefined;
  deleteSocialPost(id: number): void;

  // Generated Content
  getGeneratedContentByClientId(clientId: number): schema.GeneratedContent[];
  createGeneratedContent(data: schema.InsertGeneratedContent): schema.GeneratedContent;
  updateGeneratedContent(id: number, data: Partial<schema.GeneratedContent>): schema.GeneratedContent | undefined;
  deleteGeneratedContent(id: number): void;

  // Reviews
  getReviewsByClientId(clientId: number): schema.Review[];
  createReview(data: schema.InsertReview): schema.Review;
  updateReview(id: number, data: Partial<schema.Review>): schema.Review | undefined;
  deleteReview(id: number): void;

  // Settings
  getSettingsByOrgId(orgId: number): schema.Setting[];
  getSetting(orgId: number, key: string): schema.Setting | undefined;
  upsertSetting(orgId: number, key: string, value: string): schema.Setting;

  // Ads
  getAdsByClientId(clientId: number): schema.AdsData[];
  createAdsData(data: schema.InsertAdsData): schema.AdsData;
  updateAdsData(id: number, data: Partial<schema.AdsData>): schema.AdsData | undefined;

  // Team Invites
  getTeamInvitesByOrgId(orgId: number): schema.TeamInvite[];
  getTeamInviteByToken(token: string): schema.TeamInvite | undefined;
  createTeamInvite(data: schema.InsertTeamInvite): schema.TeamInvite;
  updateTeamInviteStatus(id: number, status: string): void;

  // Goals
  getGoalsByClientId(clientId: number): any[];
  createGoal(data: any): any;
  updateGoal(id: number, data: any): any;
  deleteGoal(id: number): void;

  // Google OAuth tokens (org-scoped)
  getGoogleToken(orgId: number): any;
  upsertGoogleToken(orgId: number, data: any): void;
  deleteGoogleToken(orgId: number): void;

  // Client data KV store
  getClientData(clientId: number, key: string): any;
  upsertClientData(clientId: number, key: string, value: any): void;
  deleteClientData(clientId: number, key: string): void;

  // Legacy compat (team membership for auth middleware)
  getTeamMembership(userId: number): any;
}

// ─── Storage implementation ──────────────────────────────────────────────────
export class Storage implements IStorage {

  // ── Organizations ──
  getOrgById(id: number) {
    return db.select().from(schema.organizations).where(eq(schema.organizations.id, id)).get();
  }
  getOrgBySlug(slug: string) {
    return db.select().from(schema.organizations).where(eq(schema.organizations.slug, slug)).get();
  }
  createOrg(data: schema.InsertOrganization) {
    return db.insert(schema.organizations).values(data).returning().get();
  }
  updateOrg(id: number, data: Partial<schema.Organization>) {
    return db.update(schema.organizations).set(data).where(eq(schema.organizations.id, id)).returning().get();
  }

  // ── Users ──
  getUserById(id: number) {
    return db.select().from(schema.users).where(eq(schema.users.id, id)).get();
  }
  getUserByEmail(email: string) {
    return db.select().from(schema.users).where(eq(schema.users.email, email)).get();
  }
  getUsersByOrgId(orgId: number) {
    return db.select().from(schema.users).where(eq(schema.users.organizationId, orgId)).all();
  }
  createUser(data: schema.InsertUser) {
    return db.insert(schema.users).values(data).returning().get();
  }
  updateUser(id: number, data: Partial<schema.User>) {
    return db.update(schema.users).set(data).where(eq(schema.users.id, id)).returning().get();
  }
  getAllUsers() {
    return db.select().from(schema.users).all();
  }
  // Legacy team membership check (for auth middleware compat)
  getTeamMembership(userId: number) {
    // In the new model, all users in an org see the same data
    // Return null so getEffectiveUserId falls back to req.userId
    return null;
  }

  // ── Clients ──
  getClientsByOrgId(orgId: number) {
    return db.select().from(schema.clients).where(eq(schema.clients.organizationId, orgId)).all();
  }
  // Legacy compat
  getClientsByUserId(userId: number) {
    const user = this.getUserById(userId);
    if (!user?.organizationId) return [];
    return this.getClientsByOrgId(user.organizationId);
  }
  getClientById(id: number) {
    return db.select().from(schema.clients).where(eq(schema.clients.id, id)).get();
  }
  createClient(data: schema.InsertClient) {
    return db.insert(schema.clients).values(data).returning().get();
  }
  updateClient(id: number, data: Partial<schema.Client>) {
    return db.update(schema.clients).set(data).where(eq(schema.clients.id, id)).returning().get();
  }
  deleteClient(id: number) {
    db.delete(schema.clients).where(eq(schema.clients.id, id)).run();
  }

  // ── Traffic ──
  getTrafficByClientId(clientId: number) {
    return db.select().from(schema.trafficData).where(eq(schema.trafficData.clientId, clientId)).all();
  }
  upsertTrafficData(data: schema.InsertTrafficData) {
    const existing = db.select().from(schema.trafficData)
      .where(and(eq(schema.trafficData.clientId, data.clientId), eq(schema.trafficData.month, data.month))).get();
    if (existing) {
      return db.update(schema.trafficData).set(data).where(eq(schema.trafficData.id, existing.id)).returning().get()!;
    }
    return db.insert(schema.trafficData).values(data).returning().get();
  }

  // ── SEO Tasks ──
  getSeoTasksByClientId(clientId: number) {
    return db.select().from(schema.seoTasks).where(eq(schema.seoTasks.clientId, clientId)).all();
  }
  createSeoTask(data: schema.InsertSeoTask) {
    return db.insert(schema.seoTasks).values(data).returning().get();
  }
  updateSeoTask(id: number, data: Partial<schema.SeoTask>) {
    return db.update(schema.seoTasks).set(data).where(eq(schema.seoTasks.id, id)).returning().get();
  }
  deleteSeoTask(id: number) {
    db.delete(schema.seoTasks).where(eq(schema.seoTasks.id, id)).run();
  }

  // ── Keywords ──
  getKeywordsByClientId(clientId: number) {
    return db.select().from(schema.keywords).where(eq(schema.keywords.clientId, clientId)).all();
  }
  createKeyword(data: schema.InsertKeyword) {
    return db.insert(schema.keywords).values(data).returning().get();
  }
  updateKeyword(id: number, data: Partial<schema.Keyword>) {
    return db.update(schema.keywords).set(data).where(eq(schema.keywords.id, id)).returning().get();
  }
  deleteKeyword(id: number) {
    db.delete(schema.keywords).where(eq(schema.keywords.id, id)).run();
  }

  // ── Social Posts ──
  getSocialPostsByClientId(clientId: number) {
    return db.select().from(schema.socialPosts).where(eq(schema.socialPosts.clientId, clientId)).all();
  }
  createSocialPost(data: schema.InsertSocialPost) {
    return db.insert(schema.socialPosts).values(data).returning().get();
  }
  updateSocialPost(id: number, data: Partial<schema.SocialPost>) {
    return db.update(schema.socialPosts).set(data).where(eq(schema.socialPosts.id, id)).returning().get();
  }
  deleteSocialPost(id: number) {
    db.delete(schema.socialPosts).where(eq(schema.socialPosts.id, id)).run();
  }

  // ── Content ──
  getGeneratedContentByClientId(clientId: number) {
    return db.select().from(schema.generatedContent).where(eq(schema.generatedContent.clientId, clientId)).all();
  }
  createGeneratedContent(data: schema.InsertGeneratedContent) {
    return db.insert(schema.generatedContent).values(data).returning().get();
  }
  updateGeneratedContent(id: number, data: Partial<schema.GeneratedContent>) {
    return db.update(schema.generatedContent).set(data).where(eq(schema.generatedContent.id, id)).returning().get();
  }
  deleteGeneratedContent(id: number) {
    db.delete(schema.generatedContent).where(eq(schema.generatedContent.id, id)).run();
  }

  // ── Reviews ──
  getReviewsByClientId(clientId: number) {
    return db.select().from(schema.reviews).where(eq(schema.reviews.clientId, clientId)).all();
  }
  createReview(data: schema.InsertReview) {
    return db.insert(schema.reviews).values(data).returning().get();
  }
  updateReview(id: number, data: Partial<schema.Review>) {
    return db.update(schema.reviews).set(data).where(eq(schema.reviews.id, id)).returning().get();
  }
  deleteReview(id: number) {
    db.delete(schema.reviews).where(eq(schema.reviews.id, id)).run();
  }

  // ── Settings (org-scoped) ──
  getSettingsByOrgId(orgId: number) {
    return db.select().from(schema.settings).where(eq(schema.settings.organizationId, orgId)).all();
  }
  // Legacy compat
  getSettingsByUserId(userId: number) {
    const user = this.getUserById(userId);
    if (!user?.organizationId) return [];
    return this.getSettingsByOrgId(user.organizationId);
  }
  getSetting(orgId: number, key: string) {
    return db.select().from(schema.settings)
      .where(and(eq(schema.settings.organizationId, orgId), eq(schema.settings.key, key))).get();
  }
  upsertSetting(orgId: number, key: string, value: string) {
    const existing = this.getSetting(orgId, key);
    if (existing) {
      return db.update(schema.settings).set({ value }).where(eq(schema.settings.id, existing.id)).returning().get()!;
    }
    return db.insert(schema.settings).values({ organizationId: orgId, key, value }).returning().get();
  }

  // ── Ads ──
  getAdsByClientId(clientId: number) {
    return db.select().from(schema.adsData).where(eq(schema.adsData.clientId, clientId)).all();
  }
  createAdsData(data: schema.InsertAdsData) {
    return db.insert(schema.adsData).values(data).returning().get();
  }
  updateAdsData(id: number, data: Partial<schema.AdsData>) {
    return db.update(schema.adsData).set(data).where(eq(schema.adsData.id, id)).returning().get();
  }

  // ── Team Invites ──
  getTeamInvitesByOrgId(orgId: number) {
    return db.select().from(schema.teamInvites).where(eq(schema.teamInvites.organizationId, orgId)).all();
  }
  getTeamInviteByToken(token: string) {
    return db.select().from(schema.teamInvites).where(eq(schema.teamInvites.token, token)).get();
  }
  createTeamInvite(data: schema.InsertTeamInvite) {
    return db.insert(schema.teamInvites).values(data).returning().get();
  }
  updateTeamInviteStatus(id: number, status: string) {
    db.update(schema.teamInvites).set({ status }).where(eq(schema.teamInvites.id, id)).run();
  }

  // ── Goals ──
  getGoalsByClientId(clientId: number) {
    return sqlite.prepare('SELECT * FROM goals WHERE client_id = ? ORDER BY created_at DESC').all(clientId);
  }
  createGoal(data: any) {
    return sqlite.prepare(`
      INSERT INTO goals (client_id, user_id, title, metric, target_value, current_value, period, due_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.clientId, data.userId, data.title, data.metric, data.targetValue,
           data.currentValue ?? 0, data.period, data.dueDate ?? null, data.status ?? 'active');
  }
  updateGoal(id: number, data: any) {
    const fields = Object.keys(data).map(k => `${k.replace(/([A-Z])/g, '_$1').toLowerCase()} = ?`).join(', ');
    return sqlite.prepare(`UPDATE goals SET ${fields} WHERE id = ?`).run(...Object.values(data), id);
  }
  deleteGoal(id: number) {
    sqlite.prepare('DELETE FROM goals WHERE id = ?').run(id);
  }

  // ── Google Tokens (org-scoped) ──
  getGoogleToken(orgId: number) {
    return sqlite.prepare('SELECT * FROM google_tokens WHERE organization_id = ? LIMIT 1').get(orgId) || null;
  }
  upsertGoogleToken(orgId: number, data: any) {
    // Delete existing and re-insert (simpler than ON CONFLICT with org_id)
    sqlite.prepare('DELETE FROM google_tokens WHERE organization_id = ?').run(orgId);
    sqlite.prepare(`
      INSERT INTO google_tokens (organization_id, access_token, refresh_token, expires_at, scope, google_account_email)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(orgId, data.access_token, data.refresh_token ?? null,
           data.expires_at ?? null, data.scope ?? null, data.google_account_email ?? null);
  }
  deleteGoogleToken(orgId: number) {
    sqlite.prepare('DELETE FROM google_tokens WHERE organization_id = ?').run(orgId);
  }
  // Legacy compat for google-oauth-routes.ts
  getGoogleTokenLegacy(userId: number, clientId?: number | null) {
    const user = this.getUserById(userId);
    if (!user?.organizationId) return null;
    return this.getGoogleToken(user.organizationId);
  }
  upsertGoogleTokenLegacy(userId: number, clientId: number | null, data: any) {
    const user = this.getUserById(userId);
    if (!user?.organizationId) return;
    this.upsertGoogleToken(user.organizationId, data);
  }
  deleteGoogleTokenLegacy(userId: number, clientId?: number | null) {
    const user = this.getUserById(userId);
    if (!user?.organizationId) return;
    this.deleteGoogleToken(user.organizationId);
  }

  // ── Client data KV ──
  getClientData(clientId: number, key: string) {
    const row = sqlite.prepare('SELECT value FROM client_data WHERE client_id = ? AND key = ?').get(clientId, key) as any;
    if (!row) return null;
    try { return JSON.parse(row.value); } catch { return row.value; }
  }
  upsertClientData(clientId: number, key: string, value: any) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    sqlite.prepare(`
      INSERT INTO client_data (client_id, key, value, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(client_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(clientId, key, serialized);
  }
  deleteClientData(clientId: number, key: string) {
    sqlite.prepare('DELETE FROM client_data WHERE client_id = ? AND key = ?').run(clientId, key);
  }
}

export const storage = new Storage();

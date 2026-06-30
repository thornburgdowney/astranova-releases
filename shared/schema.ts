import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// ORGANIZATIONS — top-level tenant (one per agency / customer account)
// ─────────────────────────────────────────────────────────────────────────────
export const organizations = sqliteTable("organizations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),          // used in URLs e.g. acme-agency
  plan: text("plan").notNull().default("basic"),  // basic, pro, enterprise
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status").default("trialing"), // trialing, active, past_due, canceled
  trialEndsAt: text("trial_ends_at"),
  planEndsAt: text("plan_ends_at"),
  logoUrl: text("logo_url"),
  whitelabelName: text("whitelabel_name"),        // e.g. "My Agency Dashboard"
  whitelabelDomain: text("whitelabel_domain"),    // e.g. "app.myagency.com"
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const insertOrganizationSchema = createInsertSchema(organizations).omit({ id: true, createdAt: true });
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizations.$inferSelect;

// Plan limits
export const PLAN_LIMITS: Record<string, { clients: number; teamMembers: number; label: string; price: number }> = {
  basic:      { clients: 5,   teamMembers: 2,  label: "Basic",      price: 49  },
  pro:        { clients: 15,  teamMembers: 10, label: "Pro",        price: 149 },
  enterprise: { clients: 999, teamMembers: 999,label: "Enterprise", price: 299 },
};

// ─────────────────────────────────────────────────────────────────────────────
// USERS — scoped to an organization
// ─────────────────────────────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id"),     // null only during registration flow
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("owner"),  // owner, admin, editor, viewer
  isOwner: integer("is_owner").default(0),        // 1 = org owner (billing contact)
  emailVerified: integer("email_verified").default(0),
  verifyToken: text("verify_token"),
  resetToken: text("reset_token"),
  resetTokenExpiresAt: text("reset_token_expires_at"),
  galaxyTheme: text("galaxy_theme").default("milky-way"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// CLIENTS — scoped to organization
// ─────────────────────────────────────────────────────────────────────────────
export const clients = sqliteTable("clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull(),
  name: text("name").notNull(),
  industry: text("industry").notNull(),
  website: text("website"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  logo: text("logo"),
  status: text("status").notNull().default("active"),
  socialAccounts: text("social_accounts").default("[]"),
  notes: text("notes"),
  googleBusinessUrl: text("google_business_url"),
  description: text("description"),
  monthlyTraffic: integer("monthly_traffic"),
  gbpRating: real("gbp_rating"),
  gbpReviewCount: integer("gbp_review_count"),
  gbpPhone: text("gbp_phone"),
  gbpAddress: text("gbp_address"),
  gbpLastSynced: text("gbp_last_synced"),
});

export const insertClientSchema = createInsertSchema(clients).omit({ id: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// TEAM INVITES — scoped to organization
// ─────────────────────────────────────────────────────────────────────────────
export const teamInvites = sqliteTable("team_invites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull(),
  invitedBy: integer("invited_by").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("editor"),
  token: text("token").notNull().unique(),
  status: text("status").notNull().default("pending"), // pending, accepted, expired
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  expiresAt: text("expires_at"),
});

export const insertTeamInviteSchema = createInsertSchema(teamInvites).omit({ id: true, createdAt: true });
export type InsertTeamInvite = z.infer<typeof insertTeamInviteSchema>;
export type TeamInvite = typeof teamInvites.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// All tables below are scoped by clientId (which belongs to an org)
// ─────────────────────────────────────────────────────────────────────────────

export const trafficData = sqliteTable("traffic_data", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  month: text("month").notNull(),
  sessions: integer("sessions").default(0),
  uniqueVisitors: integer("unique_visitors").default(0),
  bounceRate: real("bounce_rate").default(0),
  avgSessionDuration: integer("avg_session_duration").default(0),
  pageviews: integer("pageviews").default(0),
  source: text("source").default("manual"),
});

export const insertTrafficDataSchema = createInsertSchema(trafficData).omit({ id: true });
export type InsertTrafficData = z.infer<typeof insertTrafficDataSchema>;
export type TrafficData = typeof trafficData.$inferSelect;

export const seoTasks = sqliteTable("seo_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  title: text("title").notNull(),
  type: text("type").notNull().default("on-page"),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("todo"),
  description: text("description"),
  targetUrl: text("target_url"),
  targetKeyword: text("target_keyword"),
  dueDate: text("due_date"),
  completedAt: text("completed_at"),
});

export const insertSeoTaskSchema = createInsertSchema(seoTasks).omit({ id: true });
export type InsertSeoTask = z.infer<typeof insertSeoTaskSchema>;
export type SeoTask = typeof seoTasks.$inferSelect;

export const keywords = sqliteTable("keywords", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  keyword: text("keyword").notNull(),
  searchVolume: integer("search_volume"),
  difficulty: integer("difficulty"),
  currentRank: integer("current_rank"),
  targetRank: integer("target_rank"),
  status: text("status").default("tracking"),
  notes: text("notes"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const insertKeywordSchema = createInsertSchema(keywords).omit({ id: true, createdAt: true });
export type InsertKeyword = z.infer<typeof insertKeywordSchema>;
export type Keyword = typeof keywords.$inferSelect;

export const socialPosts = sqliteTable("social_posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  platform: text("platform").notNull(),
  content: text("content").notNull(),
  status: text("status").notNull().default("draft"),
  scheduledAt: text("scheduled_at"),
  publishedAt: text("published_at"),
  imageUrl: text("image_url"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const insertSocialPostSchema = createInsertSchema(socialPosts).omit({ id: true, createdAt: true });
export type InsertSocialPost = z.infer<typeof insertSocialPostSchema>;
export type SocialPost = typeof socialPosts.$inferSelect;

export const generatedContent = sqliteTable("generated_content", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  keywords: text("keywords").default("[]"),
  status: text("status").notNull().default("draft"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const insertGeneratedContentSchema = createInsertSchema(generatedContent).omit({ id: true, createdAt: true });
export type InsertGeneratedContent = z.infer<typeof insertGeneratedContentSchema>;
export type GeneratedContent = typeof generatedContent.$inferSelect;

export const reviews = sqliteTable("reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  platform: text("platform").notNull().default("google"),
  reviewerName: text("reviewer_name").notNull(),
  rating: integer("rating").notNull(),
  content: text("content").notNull(),
  reviewDate: text("review_date"),
  status: text("status").notNull().default("pending"),
  aiDraftResponse: text("ai_draft_response"),
  publishedResponse: text("published_response"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const insertReviewSchema = createInsertSchema(reviews).omit({ id: true, createdAt: true });
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviews.$inferSelect;

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull(),
  key: text("key").notNull(),
  value: text("value"),
});

export const insertSettingSchema = createInsertSchema(settings).omit({ id: true });
export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settings.$inferSelect;

export const adsData = sqliteTable("ads_data", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  platform: text("platform").notNull().default("google"),
  campaignName: text("campaign_name"),
  spend: real("spend").default(0),
  clicks: integer("clicks").default(0),
  impressions: integer("impressions").default(0),
  conversions: integer("conversions").default(0),
  startDate: text("start_date"),
  endDate: text("end_date"),
  status: text("status").default("active"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const insertAdsDataSchema = createInsertSchema(adsData).omit({ id: true, createdAt: true });
export type InsertAdsData = z.infer<typeof insertAdsDataSchema>;
export type AdsData = typeof adsData.$inferSelect;

export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  metric: text("metric").notNull(),
  targetValue: integer("target_value").notNull(),
  currentValue: integer("current_value").default(0),
  period: text("period").notNull(),
  dueDate: text("due_date"),
  status: text("status").default("active"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const insertGoalSchema = createInsertSchema(goals).omit({ id: true, createdAt: true });
export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type Goal = typeof goals.$inferSelect;

export const clientData = sqliteTable("client_data", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  key: text("key").notNull(),
  value: text("value"),
});

export const googleTokens = sqliteTable("google_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: text("expires_at"),
  scope: text("scope"),
});

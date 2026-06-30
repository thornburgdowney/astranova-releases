import type { Express, Request, Response } from "express";
import { createDb } from "./db";
import { authenticate, requirePlan, signToken, comparePassword, AuthRequest } from "./auth";
import bcrypt from "bcryptjs";
import fetch from "node-fetch";

const VULTR_URL = process.env.VULTR_URL || "http://104.156.247.16";

// ── Vultr reachability check ──────────────────────────────────────────────────
// Cached so we don't hammer the network on every AI request check
let _onlineCache: { value: boolean; at: number } = { value: false, at: 0 };
const ONLINE_TTL_MS = 10_000; // reuse result for 10s

async function isVultrOnline(): Promise<boolean> {
  const now = Date.now();
  if (now - _onlineCache.at < ONLINE_TTL_MS) return _onlineCache.value;

  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    const res   = await fetch(`${VULTR_URL}/api/health`, { signal: ctrl.signal as any });
    clearTimeout(timer);
    _onlineCache = { value: res.ok, at: now };
  } catch {
    _onlineCache = { value: false, at: now };
  }
  return _onlineCache.value;
}

// ── Route registration ────────────────────────────────────────────────────────

export async function registerRoutes(app: Express) {
  const db = await createDb();

  // ────────────────────────────────────────────────────────────────────────────
  // HEALTH
  // ────────────────────────────────────────────────────────────────────────────
  app.get("/api/health", (_req, res) => res.json({ ok: true, version: process.env.npm_package_version }));

  // ────────────────────────────────────────────────────────────────────────────
  // TASK 4 — Online / offline detector
  // ────────────────────────────────────────────────────────────────────────────
  app.get("/api/online-status", async (_req, res) => {
    const online = await isVultrOnline();
    res.json({ online });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // TASK 5 — Auth: login, logout, /me  (Vultr primary, local cache fallback)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/auth/login
   * 1. If online → forward to Vultr, get real JWT + subscription tier
   * 2. Cache credentials + tier locally for offline use
   * 3. If offline → validate against local cache, issue a short-lived local token
   */
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const online = await isVultrOnline();

    // ── Online path: authenticate against Vultr ──────────────────────────────
    if (online) {
      try {
        const vRes = await fetch(`${VULTR_URL}/api/auth/login`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ email, password }),
        });
        const vData: any = await vRes.json();

        if (!vRes.ok) {
          return res.status(401).json({ error: vData.error || "Invalid credentials" });
        }

        // Pull plan/tier from Vultr response (field may vary)
        const plan = vData.user?.plan ?? vData.plan ?? vData.subscription?.plan ?? "basic";

        // Build a local token that embeds plan so offline routes can gate features
        const localToken = signToken({
          userId: vData.user?.id,
          orgId:  vData.user?.organizationId ?? vData.user?.orgId ?? 1,
          email,
          plan,
        });

        // Cache for offline fallback
        await db.upsertCachedUser(email, password, { ...vData.user, plan }, vData.token);

        return res.json({
          token:  localToken,
          vultrToken: vData.token,   // keep for direct Vultr proxy calls
          user:   { ...vData.user, plan },
          online: true,
        });
      } catch (err) {
        console.error("[auth] Vultr login error:", err);
        // Fall through to offline path
      }
    }

    // ── Offline path: validate against local cache ───────────────────────────
    const cached = db.getCachedUser(email);
    if (!cached) {
      return res.status(401).json({
        error:   "No internet connection and no saved credentials for this account. Please connect to the internet to log in for the first time.",
        offline: true,
      });
    }

    const valid = await bcrypt.compare(password, cached.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Incorrect password" });
    }

    const plan = cached.userData?.plan ?? "basic";
    const localToken = signToken({
      userId: cached.userId,
      orgId:  cached.orgId,
      email,
      plan,
    });

    return res.json({
      token:  localToken,
      user:   { ...cached.userData },
      online: false,
      offlineMode: true,
    });
  });

  /** GET /api/auth/me — verify token and return user info */
  app.get("/api/auth/me", authenticate, (req: AuthRequest, res) => {
    res.json({
      user: {
        id:    req.userId,
        email: req.email,
        orgId: req.orgId,
        plan:  req.plan,
      },
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // TASK 6 — AI proxy  (Anthropic key NEVER leaves the Vultr server)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/ai/chat
   * Body: { messages: [...], systemPrompt?: string, model?: string }
   * - Requires internet (503 with offline:true if not)
   * - Forwards to Vultr /api/ai/chat which holds the Anthropic key
   * - Streams or returns the response transparently
   */
  app.post("/api/ai/chat", authenticate, async (req: AuthRequest, res) => {
    const online = await isVultrOnline();
    if (!online) {
      return res.status(503).json({
        error:   "AI features require an internet connection",
        offline: true,
      });
    }

    try {
      const cached    = db.getCachedUser(req.email!);
      const authHeader = cached?.vultrToken
        ? `Bearer ${cached.vultrToken}`
        : (req.headers.authorization ?? "");

      const vRes = await fetch(`${VULTR_URL}/api/ai/chat`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          ...req.body,
          orgId:  req.orgId,
          userId: req.userId,
          plan:   req.plan,
        }),
      });

      const contentType = vRes.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream")) {
        // Stream SSE straight through
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        vRes.body?.pipe(res as any);
      } else {
        const data = await vRes.json();
        res.status(vRes.status).json(data);
      }
    } catch (err) {
      console.error("[ai-proxy] error:", err);
      res.status(503).json({ error: "AI service unavailable", offline: false });
    }
  });

  /**
   * POST /api/ai/seo-tasks
   * POST /api/ai/blog
   * POST /api/ai/social
   * POST /api/ai/review-reply
   * POST /api/ai/growth-coach
   * All route through Vultr — Anthropic key is never exposed to the desktop.
   */
  const AI_ROUTES = [
    "/api/ai/seo-tasks",
    "/api/ai/blog",
    "/api/ai/social",
    "/api/ai/review-reply",
    "/api/ai/growth-coach",
    "/api/ai/twin",
    "/api/ai/executor",
  ];

  for (const route of AI_ROUTES) {
    app.post(route, authenticate, async (req: AuthRequest, res) => {
      const online = await isVultrOnline();
      if (!online) {
        return res.status(503).json({
          error:   "This feature requires an internet connection",
          offline: true,
          feature: route.split("/").pop(),
        });
      }

      try {
        const cached     = db.getCachedUser(req.email!);
        const authHeader = cached?.vultrToken
          ? `Bearer ${cached.vultrToken}`
          : (req.headers.authorization ?? "");

        const vRes = await fetch(`${VULTR_URL}${route}`, {
          method:  "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": authHeader,
          },
          body: JSON.stringify({
            ...req.body,
            orgId:  req.orgId,
            userId: req.userId,
            plan:   req.plan,
          }),
        });

        const data = await vRes.json();
        res.status(vRes.status).json(data);
      } catch {
        res.status(503).json({ error: "AI service unavailable", offline: false });
      }
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // LOCAL DATA — Clients, Tasks, Content, Reviews (all work offline)
  // ────────────────────────────────────────────────────────────────────────────

  // ── Clients ──────────────────────────────────────────────────────────────
  app.get("/api/clients", authenticate, (req: AuthRequest, res) => {
    res.json(db.getClients(req.orgId!));
  });

  app.post("/api/clients", authenticate, (req: AuthRequest, res) => {
    const client = db.createClient({ ...req.body, organizationId: req.orgId });
    res.status(201).json(client);
  });

  app.get("/api/clients/:id", authenticate, (req: AuthRequest, res) => {
    const client = db.getClient(parseInt(req.params.id), req.orgId!);
    if (!client) return res.status(404).json({ error: "Client not found" });
    res.json(client);
  });

  app.patch("/api/clients/:id", authenticate, (req: AuthRequest, res) => {
    const client = db.updateClient(parseInt(req.params.id), req.orgId!, req.body);
    res.json(client);
  });

  app.delete("/api/clients/:id", authenticate, (req: AuthRequest, res) => {
    db.deleteClient(parseInt(req.params.id), req.orgId!);
    res.json({ ok: true });
  });

  // Client key-value data
  app.get("/api/clients/:id/data", authenticate, (req: AuthRequest, res) => {
    res.json(db.getClientData(parseInt(req.params.id)));
  });

  app.put("/api/clients/:id/data/:key", authenticate, (req: AuthRequest, res) => {
    db.setClientData(parseInt(req.params.id), req.params.key, req.body.value);
    res.json({ ok: true });
  });

  // ── Tasks ─────────────────────────────────────────────────────────────────
  app.get("/api/tasks", authenticate, (req: AuthRequest, res) => {
    res.json(db.getTasks(req.orgId!));
  });

  app.get("/api/clients/:id/tasks", authenticate, (req: AuthRequest, res) => {
    res.json(db.getTasksByClient(parseInt(req.params.id), req.orgId!));
  });

  app.post("/api/tasks", authenticate, (req: AuthRequest, res) => {
    const task = db.createTask({ ...req.body, organizationId: req.orgId });
    res.status(201).json(task);
  });

  app.patch("/api/tasks/:id", authenticate, (req: AuthRequest, res) => {
    const task = db.updateTask(parseInt(req.params.id), req.orgId!, req.body);
    res.json(task);
  });

  app.delete("/api/tasks/:id", authenticate, (req: AuthRequest, res) => {
    db.deleteTask(parseInt(req.params.id), req.orgId!);
    res.json({ ok: true });
  });

  // ── Content / Blog ────────────────────────────────────────────────────────
  app.get("/api/content", authenticate, (req: AuthRequest, res) => {
    res.json(db.getContent(req.orgId!));
  });

  app.get("/api/clients/:id/content", authenticate, (req: AuthRequest, res) => {
    res.json(db.getContentByClient(parseInt(req.params.id), req.orgId!));
  });

  app.post("/api/content", authenticate, (req: AuthRequest, res) => {
    const item = db.createContent({ ...req.body, organizationId: req.orgId });
    res.status(201).json(item);
  });

  app.patch("/api/content/:id", authenticate, (req: AuthRequest, res) => {
    const item = db.updateContent(parseInt(req.params.id), req.orgId!, req.body);
    res.json(item);
  });

  app.delete("/api/content/:id", authenticate, (req: AuthRequest, res) => {
    db.deleteContent(parseInt(req.params.id), req.orgId!);
    res.json({ ok: true });
  });

  // ── Reviews ───────────────────────────────────────────────────────────────
  app.get("/api/clients/:id/reviews", authenticate, (req: AuthRequest, res) => {
    res.json(db.getReviewsByClient(parseInt(req.params.id)));
  });

  app.post("/api/clients/:id/reviews", authenticate, (req: AuthRequest, res) => {
    db.upsertReview(parseInt(req.params.id), req.body);
    res.json({ ok: true });
  });

  app.patch("/api/reviews/:id/reply", authenticate, (req: AuthRequest, res) => {
    const review = db.updateReviewReply(parseInt(req.params.id), req.body.reply);
    res.json(review);
  });
}

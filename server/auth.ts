import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET || "astranova-desktop-secret-2026";

// ── Token helpers ─────────────────────────────────────────────────────────────

export function signToken(payload: object, expiresIn = "30d"): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as any);
}

export function verifyToken(token: string): any | null {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── Request extension ─────────────────────────────────────────────────────────

export interface AuthRequest extends Request {
  userId?: number;
  orgId?:  number;
  email?:  string;
  plan?:   string;   // "basic" | "pro" | "enterprise"
}

// ── authenticate middleware ───────────────────────────────────────────────────
// Validates the Bearer JWT attached by the desktop app.
// On success, attaches userId / orgId / email / plan to the request.

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const payload = verifyToken(header.slice(7));
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token — please log in again" });
  }

  req.userId = payload.userId  ?? payload.id;
  req.orgId  = payload.orgId   ?? payload.organizationId ?? 1;
  req.email  = payload.email   ?? "";
  req.plan   = payload.plan    ?? "basic";

  next();
}

// ── requirePlan middleware ────────────────────────────────────────────────────
// Gates a route behind a minimum subscription tier.
// Usage: app.post("/api/ai", authenticate, requirePlan("pro"), handler)

const PLAN_RANK: Record<string, number> = {
  basic:      1,
  pro:        2,
  enterprise: 3,
};

export function requirePlan(minimum: "basic" | "pro" | "enterprise") {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const userRank = PLAN_RANK[req.plan ?? "basic"] ?? 0;
    const minRank  = PLAN_RANK[minimum];
    if (userRank < minRank) {
      return res.status(403).json({
        error:    `This feature requires the ${minimum} plan or higher`,
        upgrade:  true,
        required: minimum,
        current:  req.plan ?? "basic",
      });
    }
    next();
  };
}

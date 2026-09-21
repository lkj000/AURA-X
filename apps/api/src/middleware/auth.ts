import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

export interface ArtistPayload {
  artist_id: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      artist?: ArtistPayload;
    }
  }
}

export function verifyToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided" });
    return;
  }
  const token = header.slice(7);
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET not configured");
    const payload = jwt.verify(token, secret) as ArtistPayload;
    req.artist = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Attach the caller's identity IF they presented one; never refuse for its absence.
 *
 * For routes with more than one legitimate kind of caller. The approval endpoint is the case that
 * needed it: a human moderator arrives with an artist token, and the machine integration arrives with
 * a shared secret and no token at all. `verifyToken` would reject the machine at the door, before the
 * route could consider the secret.
 *
 * THIS IS NOT A RELAXATION. It authorises nothing — it only records who is asking. Every route using
 * it must decide authority itself, and must treat a missing `req.artist` as "no identity" rather than
 * as permission. An INVALID token is still rejected outright: presenting a broken credential is an
 * error, not an absence, and letting it through as anonymous would turn an expired token into a
 * silent downgrade.
 */
export function optionalToken(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) { next(); return; }

  const token = header.slice(7);
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET not configured");
    req.artist = jwt.verify(token, secret) as ArtistPayload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}


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

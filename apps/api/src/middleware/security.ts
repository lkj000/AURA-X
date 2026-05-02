import { Request, Response, NextFunction } from "express";

// In production Railway terminates TLS and sets X-Forwarded-Proto: https.
// Redirect any plain HTTP requests to HTTPS. No-op in dev/test.
export function httpsRedirect(req: Request, res: Response, next: NextFunction): void {
  if (
    process.env.NODE_ENV === "production" &&
    req.headers["x-forwarded-proto"] !== "https"
  ) {
    res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    return;
  }
  next();
}

// Security response headers for every request.
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
}

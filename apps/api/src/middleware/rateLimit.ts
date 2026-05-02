import rateLimit from "express-rate-limit";

const jsonMessage = (msg: string) => ({ error: msg });

// 120 req / 15 min — baseline IP protection across all routes
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: jsonMessage("Too many requests — please slow down"),
});

// 10 req / 15 min — brute-force protection for auth/OTP endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: jsonMessage("Too many auth attempts — try again later"),
});

// 10 req / min — each generation kicks off expensive AI inference
export const generationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: jsonMessage("Generation rate limit reached — max 10 per minute"),
});

// 20 req / min — evaluation pipeline (CPU-bound WAV analysis)
export const evaluateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: jsonMessage("Evaluation rate limit reached — max 20 per minute"),
});

import rateLimit from "express-rate-limit";

const jsonMessage = (msg: string) => ({ error: msg });

/**
 * RATE LIMITS DO NOT FIRE UNDER TEST.
 *
 * A suite exercising a limited route makes its requests in milliseconds, so it trips a per-minute
 * budget that no real caller would reach — and the failure is opaque: the handler is never entered,
 * the assertion sees zero calls, and nothing says "rate limited". That is how this surfaced: applying
 * the generation limiter to /api/agent/run made ten legitimate test requests throttle each other.
 *
 * Keyed on NODE_ENV === "test" only. Not dev, and emphatically not on a missing value — an unset
 * NODE_ENV must behave as production, because the one place this must never be disabled by accident is
 * the place where nobody set it deliberately.
 */
const skipUnderTest = () => process.env.NODE_ENV === "test";

// 120 req / 15 min — baseline IP protection across all routes
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: skipUnderTest,
  message: jsonMessage("Too many requests — please slow down"),
});

// 10 req / 15 min — brute-force protection for auth/OTP endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: skipUnderTest,
  message: jsonMessage("Too many auth attempts — try again later"),
});

// 10 req / min — each generation kicks off expensive AI inference
export const generationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: skipUnderTest,
  message: jsonMessage("Generation rate limit reached — max 10 per minute"),
});

// 20 req / min — evaluation pipeline (CPU-bound WAV analysis)
export const evaluateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: skipUnderTest,
  message: jsonMessage("Evaluation rate limit reached — max 20 per minute"),
});

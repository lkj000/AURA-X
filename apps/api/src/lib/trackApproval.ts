/**
 * WHO MAY MARK A TRACK APPROVED FOR THE MARKETPLACE.
 *
 * ── WHAT WAS WRONG ─────────────────────────────────────────────────────────────────────────────────
 *
 * `POST /api/tracks/:id/suno-result` verified a JWT and then updated the track named in the URL. The
 * middleware checks that a token is validly signed — nothing more. It carries `artist_id` and `email`
 * and no notion of a role, so **any artist with any valid token could set `suno_approved` on any
 * track, including one they do not own.**
 *
 * That flag is not cosmetic: it is half the marketplace listing gate. An artist could approve their
 * own unlisted track and put it on sale, or un-approve a competitor's and remove it.
 *
 * ── WHY THIS IS NOT SOLVED BY AN OWNERSHIP CHECK ───────────────────────────────────────────────────
 *
 * The obvious fix — "only the track's creator may set this" — is the wrong one, and worth naming so it
 * is not introduced later as an improvement. Approval is a GATE. A gate the applicant operates is not
 * a gate. Restricting the flag to the track's owner would convert "any artist may approve any track"
 * into "every artist may approve their own", which is the same defect with better manners.
 *
 * ── WHO LEGITIMATELY CALLS THIS ────────────────────────────────────────────────────────────────────
 *
 * Two callers, and they authenticate differently:
 *
 *   THE INTEGRATION   The route is named `suno-result` and its body is a classification result. A
 *                     machine reporting an outcome is not an artist, and should not be presenting an
 *                     artist's token. It carries a shared secret.
 *   A MODERATOR       A human making a judgement, identified by an explicit allowlist of artist ids.
 *
 * NEITHER IS CONFIGURED BY DEFAULT, AND THE ENDPOINT THEN REFUSES EVERYONE. That is deliberate: an
 * approval gate with no configured approver should decline, not fall back to accepting whoever asks.
 * A deployment that wants approvals sets one of the two variables; until then the flag cannot move.
 *
 * And a moderator may not approve their OWN track even when listed, because the conflict does not
 * disappear because the person is trusted in general.
 */
import type { Request } from "express";

export type ApprovalAuthority =
  | { ok: true; actor: string; via: "integration" | "moderator" }
  | { ok: false; status: number; reason: string; error: string };

/** Moderator artist ids, comma-separated. Read at call time so a test can set it. */
function moderatorIds(): string[] {
  return (process.env.TRACK_MODERATOR_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function integrationSecret(): string | null {
  const s = process.env.SUNO_INTEGRATION_SECRET;
  return s && s.length > 0 ? s : null;
}

/**
 * Constant-time comparison, so a wrong secret costs the same as any other wrong secret.
 *
 * `===` on a secret leaks its prefix through timing. The exposure is small over a network and the
 * cost of avoiding it is one function, which is the wrong trade to lose.
 */
function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * May this caller set `suno_approved` on this track?
 *
 * `trackCreatedBy` is passed in rather than looked up here, because the caller has already fetched the
 * track and a second read could disagree with the first.
 */
export function approvalAuthority(req: Request, trackCreatedBy: string | null): ApprovalAuthority {
  const presented = req.headers["x-integration-secret"];
  const expected = integrationSecret();

  if (typeof presented === "string" && presented.length > 0) {
    if (!expected) {
      return {
        ok: false,
        status: 403,
        reason: "INTEGRATION_NOT_CONFIGURED",
        error: "No integration secret is configured, so integration callers cannot be authenticated.",
      };
    }
    if (!secretMatches(presented, expected)) {
      // Deliberately the same shape as any other refusal: a distinct "wrong secret" confirms that a
      // correct one exists and is worth finding.
      return { ok: false, status: 403, reason: "NOT_AUTHORISED", error: "Not authorised to approve tracks" };
    }
    return { ok: true, actor: "suno-integration", via: "integration" };
  }

  const artistId = req.artist?.artist_id;
  if (!artistId) {
    return { ok: false, status: 401, reason: "NO_IDENTITY", error: "No token provided" };
  }

  const moderators = moderatorIds();
  if (moderators.length === 0 || !moderators.includes(artistId)) {
    return {
      ok: false,
      status: 403,
      reason: "NOT_AUTHORISED",
      error: "Not authorised to approve tracks",
    };
  }

  // A moderator approving their own track is the applicant operating the gate. Trust in general does
  // not resolve a conflict in particular.
  if (trackCreatedBy && trackCreatedBy === artistId) {
    return {
      ok: false,
      status: 403,
      reason: "SELF_APPROVAL",
      error: "A track cannot be approved by the artist who created it",
    };
  }

  return { ok: true, actor: artistId, via: "moderator" };
}

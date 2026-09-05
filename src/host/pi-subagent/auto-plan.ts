/**
 * Zero-token gate: campaign-shaped first messages may spawn the planner.
 * Unsure skips. This is not a second cost router.
 */

export const AUTO_PLAN_TIMEOUT_MS = 45_000;
export const PLAN_DIGEST_HEADER = "Plan digest (also in scratch/plan.md):";

const PLURAL_WORK =
  /\b(\d+\s+)?(jobs|roles|positions|companies|applications|listings|openings)\b/i;
const CAMPAIGN_WORK = /\b(each|every|several|multiple|tailor|campaign|and then)\b/i;
const FILE_WORK = /\b(cv|cvs|resume|resumes)\b/i;
const SKIP_SINGLE =
  /\b(this tab|this page|this form|on this page|submit this|just click|just fill|sign in|log in|log into|login)\b/i;

export function shouldAutoPlan(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 8) return false;
  if (trimmed.startsWith("/")) return false;
  const words = trimmed.split(/\s+/);
  if (/^https?:\/\//i.test(trimmed) && words.length < 4) return false;

  const lower = trimmed.toLowerCase();
  const plural = PLURAL_WORK.test(lower);
  const campaign = CAMPAIGN_WORK.test(lower);
  const file = FILE_WORK.test(lower);
  if (SKIP_SINGLE.test(lower) && !plural && !campaign && !file) return false;
  return plural || (campaign && (file || plural)) || (file && /\b(apply|job|role|tailor|jobs|roles)\b/i.test(lower));
}

export function prependPlanDigest(userText: string, digest: string): string {
  return `${PLAN_DIGEST_HEADER}\n\n${digest.trim()}\n\n---\n${userText}`;
}

/**
 * Redaction applied on the way into model context and on the way onto disk (D22).
 *
 * The risk being managed is exfiltration, not mutation: a probe or a trace runs
 * against the user's real authenticated browser, and whatever it returns outlives
 * the session in logs and transcripts.
 */

const MASK = "[redacted]";

/** Keys whose values are never recorded, whatever they contain. */
const SENSITIVE_KEY = /(password|passwd|secret|token|api[_-]?key|authorization|cookie|session[_-]?id|credential|private[_-]?key)/i;

const PATTERNS: Array<{ re: RegExp; replace: string }> = [
  // Provider-style keys: sk-..., ghp_..., xoxb-...
  { re: /\b(?:sk|pk|rk|ghp|gho|ghu|ghs|ghr)[-_][A-Za-z0-9_-]{16,}\b/g, replace: MASK },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, replace: MASK },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, replace: MASK },
  // JWTs
  { re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g, replace: MASK },
  // Authorization headers
  { re: /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/gi, replace: `Bearer ${MASK}` },
  // key=value / key: value for sensitive names
  {
    re: /\b(password|passwd|secret|token|api[_-]?key|authorization|session)\b\s*[:=]\s*"?[^\s",;}]{4,}"?/gi,
    replace: `$1=${MASK}`,
  },
  // Long hex blobs (session ids, hashes used as credentials)
  { re: /\b[A-Fa-f0-9]{32,}\b/g, replace: MASK },
];

export function redactString(value: string): string {
  let out = value;
  for (const { re, replace } of PATTERNS) {
    out = out.replace(re, replace);
  }
  return out;
}

/**
 * Redact a whole structure. Sensitive keys are masked outright; every string is
 * pattern-scrubbed. Depth and breadth are bounded so a hostile page cannot make
 * redaction itself expensive.
 */
export function redactDeep<T>(value: T, depth = 0): T {
  if (depth > 8) return MASK as unknown as T;
  if (typeof value === "string") return redactString(value) as unknown as T;
  if (Array.isArray(value)) {
    return value.slice(0, 500).map((entry) => redactDeep(entry, depth + 1)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? MASK : redactDeep(entry, depth + 1);
    }
    return out as unknown as T;
  }
  return value;
}

export const REDACTION_MASK = MASK;

export function tokensEqual(expected: string | undefined, provided: string | undefined): boolean {
  if (!expected) return true;
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

export function bearerFromHeader(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

export function basicUserPass(): { user: string; pass: string } | undefined {
  const user = process.env.BSA_BASIC_USER;
  const pass = process.env.BSA_BASIC_PASS;
  if (!user || !pass) return undefined;
  return { user, pass };
}

export function checkBasicAuth(header: string | undefined): boolean {
  const creds = basicUserPass();
  if (!creds) return true;
  if (!header?.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep < 0) return false;
    return tokensEqual(creds.user, decoded.slice(0, sep)) && tokensEqual(creds.pass, decoded.slice(sep + 1));
  } catch {
    return false;
  }
}

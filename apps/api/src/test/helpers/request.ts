/**
 * Parse Set-Cookie header to extract session cookie attributes.
 */
export const parseSetCookie = (
  headers: Record<string, string | string[] | undefined>
): {
  value: string;
  httpOnly: boolean;
  secure: boolean;
  maxAge: number | null;
  sameSite: string | null;
  path: string | null;
} | null => {
  const setCookie = headers['set-cookie'];
  if (!setCookie) return null;

  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const sidCookie = cookies.find((c) => c.startsWith('sid='));
  if (!sidCookie) return null;

  const parts = sidCookie.split(';').map((p) => p.trim());
  const value = parts[0]?.split('=')[1] ?? '';

  const httpOnly = parts.some((p) => p.toLowerCase() === 'httponly');
  const secure = parts.some((p) => p.toLowerCase() === 'secure');

  const maxAgePart = parts.find((p) => p.toLowerCase().startsWith('max-age='));
  const maxAge = maxAgePart ? parseInt(maxAgePart.split('=')[1] ?? '0', 10) : null;

  const sameSitePart = parts.find((p) => p.toLowerCase().startsWith('samesite='));
  const sameSite = sameSitePart ? (sameSitePart.split('=')[1]?.toLowerCase() ?? null) : null;

  const pathPart = parts.find((p) => p.toLowerCase().startsWith('path='));
  const path = pathPart ? (pathPart.split('=')[1] ?? null) : null;

  return { value, httpOnly, secure, maxAge, sameSite, path };
};

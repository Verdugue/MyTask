// Connexion à l'interface web : un seul utilisateur, un mot de passe (secret APP_PASSWORD),
// et un cookie de session signé (HMAC avec SESSION_SECRET).

const COOKIE = "mt_session";
const SESSION_DAYS = 60;
const MAX_FAILS = 8; // tentatives ratées autorisées…
const FAIL_WINDOW = 15 * 60; // …par tranche de 15 minutes et par adresse IP

const enc = new TextEncoder();

export function assertSecrets(env: Env): string | null {
  if (!env.APP_PASSWORD || env.APP_PASSWORD.length < 8) {
    return "Le secret APP_PASSWORD est manquant ou trop court (8 caractères minimum).";
  }
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    return "Le secret SESSION_SECRET est manquant ou trop court (32 caractères minimum).";
  }
  return null;
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function safeEqual(a: string, b: string): Promise<boolean> {
  // On compare des empreintes de même longueur, en temps constant
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export async function isLoggedIn(request: Request, env: Env): Promise<boolean> {
  const raw = readCookie(request, COOKIE);
  if (!raw) return false;
  const [exp, sig] = raw.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) * 1000 < Date.now()) return false;
  const expected = await hmac(env.SESSION_SECRET, `session.v1.${exp}`);
  return safeEqual(sig, expected);
}

export async function sessionCookie(env: Env): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const sig = await hmac(env.SESSION_SECRET, `session.v1.${exp}`);
  return `${COOKIE}=${exp}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "local";
}

export type PasswordCheck = "ok" | "wrong" | "blocked";

/** Vérifie le mot de passe, avec une limite de tentatives stockée dans KV. */
export async function checkPassword(request: Request, env: Env, password: string): Promise<PasswordCheck> {
  const key = `login-fail:${clientIp(request)}`;
  const fails = Number((await env.OAUTH_KV.get(key)) ?? "0");
  if (fails >= MAX_FAILS) return "blocked";
  if (await safeEqual(password, env.APP_PASSWORD)) {
    if (fails) await env.OAUTH_KV.delete(key);
    return "ok";
  }
  await env.OAUTH_KV.put(key, String(fails + 1), { expirationTtl: FAIL_WINDOW });
  return "wrong";
}

/** Protection CSRF pour l'API : même origine + JSON obligatoire sur les écritures. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return request.headers.get("Sec-Fetch-Site") !== "cross-site";
  return origin === new URL(request.url).origin;
}

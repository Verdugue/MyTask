// Routes non protégées par OAuth : interface web, connexion, API de l'interface,
// et page /authorize où tu autorises Claude à se connecter.

import { AuthorizationError, CimdFetchError, type OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { appPage } from "./app-page";
import {
  assertSecrets,
  checkPassword,
  clearSessionCookie,
  isLoggedIn,
  sameOrigin,
  sessionCookie,
} from "./auth";
import {
  addItems,
  createTask,
  deleteItem,
  deleteTask,
  listCategories,
  listTasks,
  updateItem,
  updateTask,
  ValidationError,
  type TaskStatus,
} from "./db";
import { consentPage, htmlResponse, loginPage, messagePage } from "./html";
import { ICON_180_PNG, ICON_512_PNG, ICON_SVG } from "./icons";

type WebEnv = Env & { OAUTH_PROVIDER: OAuthHelpers };

export const SCOPE = "taches";
const OWNER = "proprietaire";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

const redirect = (location: string, headers: HeadersInit = {}) => {
  const h = new Headers(headers);
  h.set("Location", location);
  return new Response(null, { status: 302, headers: h });
};

function safeNext(value: string | null): string {
  // Seulement des chemins locaux, jamais « //autre-site »
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

export const webHandler = {
  async fetch(request: Request, baseEnv: Env): Promise<Response> {
    // La librairie OAuth injecte OAUTH_PROVIDER dans l'environnement
    const env = baseEnv as WebEnv;
    const url = new URL(request.url);
    const path = url.pathname;

    // Fichiers statiques (pas besoin de secrets)
    if (path === "/icon.svg") return asset(ICON_SVG, "image/svg+xml");
    if (path === "/icon-180.png") return asset(base64ToBytes(ICON_180_PNG), "image/png");
    if (path === "/icon-512.png") return asset(base64ToBytes(ICON_512_PNG), "image/png");
    if (path === "/favicon.ico") return asset(ICON_SVG, "image/svg+xml");
    if (path === "/manifest.webmanifest") return manifest();
    if (path === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n");

    const misconfigured = assertSecrets(env);
    if (misconfigured) {
      return htmlResponse(messagePage("Configuration incomplète", misconfigured), { status: 500 });
    }

    try {
      if (path === "/login") return await login(request, env, url);
      if (path === "/logout") {
        if (request.method !== "POST" || !sameOrigin(request)) return new Response("Méthode non autorisée", { status: 405 });
        return redirect("/login", { "Set-Cookie": clearSessionCookie() });
      }
      if (path === "/authorize") return await authorize(request, env, url);

      const loggedIn = await isLoggedIn(request, env);

      if (path.startsWith("/api/")) {
        if (!loggedIn) return json({ error: "Session expirée, reconnecte-toi." }, 401);
        return await api(request, env, url);
      }

      if (path === "/" && request.method === "GET") {
        if (!loggedIn) return redirect("/login");
        const [tasks, categories] = await Promise.all([
          listTasks(env.DB, { status: "open" }),
          listCategories(env.DB),
        ]);
        const { html, scriptNonce } = appPage({ tasks, categories });
        return htmlResponse(html, {}, scriptNonce);
      }

      return new Response("Page introuvable", { status: 404 });
    } catch (e) {
      if (e instanceof ValidationError) return json({ error: e.message }, 400);
      throw e;
    }
  },
};

// ---------- Connexion ----------

async function login(request: Request, env: WebEnv, url: URL): Promise<Response> {
  if (request.method === "GET") {
    const next = safeNext(url.searchParams.get("next"));
    if (await isLoggedIn(request, env)) return redirect(next);
    return htmlResponse(loginPage({ next }));
  }
  if (request.method !== "POST") return new Response("Méthode non autorisée", { status: 405 });
  if (!sameOrigin(request)) return new Response("Requête refusée", { status: 403 });

  const form = await request.formData();
  const next = safeNext(String(form.get("next") ?? "/"));
  const result = await checkPassword(request, env, String(form.get("password") ?? ""));
  if (result === "ok") return redirect(next, { "Set-Cookie": await sessionCookie(env) });
  const error =
    result === "blocked"
      ? "Trop de tentatives. Réessaie dans 15 minutes."
      : "Mot de passe incorrect.";
  return htmlResponse(loginPage({ next, error }), { status: result === "blocked" ? 429 : 401 });
}

// ---------- Autorisation OAuth (connexion de Claude) ----------

async function authorize(request: Request, env: WebEnv, url: URL): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  try {
    // Il faut d'abord être connecté à l'app : on renvoie vers /login puis on revient ici
    if (!(await isLoggedIn(request, env))) {
      if (request.method === "GET") return redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
      return htmlResponse(
        messagePage("Session expirée", "Relance la connexion depuis les réglages des connecteurs de Claude."),
        { status: 401 },
      );
    }

    if (request.method === "GET") {
      const authRequest = await oauth.parseAuthRequest(request);
      const details = await oauth.describeConsent(authRequest);
      const consent = await oauth.beginConsent(authRequest);
      const res = htmlResponse(consentPage(details, consent.handle));
      consent.headers.forEach((value, key) => {
        if (key.toLowerCase() === "set-cookie") res.headers.append(key, value);
        else res.headers.set(key, value);
      });
      return res;
    }

    if (request.method === "POST") {
      const form = await request.formData();
      const handle = String(form.get("handle") ?? "");
      if (form.get("decision") !== "approve") {
        const denied = await oauth.denyConsent(request, handle);
        return new Response(null, { status: 302, headers: denied.headers });
      }
      const approved = await oauth.approveConsent(request, handle, { scope: [SCOPE] });
      const { redirectTo } = await oauth.completeAuthorization({
        request: approved.request,
        userId: OWNER,
        metadata: { label: "Connecteur Claude" },
        scope: [SCOPE],
        props: { userId: OWNER },
      });
      approved.headers.set("Location", redirectTo);
      return new Response(null, { status: 302, headers: approved.headers });
    }

    return new Response("Méthode non autorisée", { status: 405 });
  } catch (error) {
    if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302);
    if (error instanceof AuthorizationError || error instanceof CimdFetchError) {
      const message =
        error instanceof AuthorizationError
          ? `${error.description} Relance la connexion depuis Claude.`
          : "Impossible de vérifier l'application qui demande l'accès.";
      return htmlResponse(messagePage("Autorisation impossible", message), { status: 400 });
    }
    throw error;
  }
}

// ---------- API de l'interface web ----------

function parseId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get("Content-Type") ?? "";
  if (!type.includes("application/json")) throw new ValidationError("JSON attendu");
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("JSON invalide");
  return body as Record<string, unknown>;
}

async function api(request: Request, env: WebEnv, url: URL): Promise<Response> {
  const db = env.DB;
  const method = request.method;
  const parts = url.pathname.split("/").filter(Boolean); // ["api", "tasks", "12", "items"]

  if (method !== "GET" && !sameOrigin(request)) return json({ error: "Requête refusée" }, 403);

  // GET /api/tasks?status=open|done|all
  if (parts[1] === "tasks" && parts.length === 2 && method === "GET") {
    const s = url.searchParams.get("status");
    const status: TaskStatus = s === "done" || s === "all" ? s : "open";
    const [tasks, categories] = await Promise.all([listTasks(db, { status }), listCategories(db)]);
    return json({ tasks, categories });
  }

  // POST /api/tasks
  if (parts[1] === "tasks" && parts.length === 2 && method === "POST") {
    const b = await readJson(request);
    const items =
      typeof b.items === "string"
        ? b.items.split("\n")
        : Array.isArray(b.items)
          ? b.items
          : undefined;
    const task = await createTask(db, {
      title: b.title as string,
      notes: (b.notes as string) ?? null,
      list: (b.list as string) ?? null,
      due_date: (b.due_date as string) ?? null,
      items: items as string[] | undefined,
      source: "web",
    });
    return json({ task }, 201);
  }

  const taskId = parts[1] === "tasks" ? parseId(parts[2]) : null;

  // PATCH /api/tasks/:id
  if (taskId && parts.length === 3 && method === "PATCH") {
    const b = await readJson(request);
    const task = await updateTask(db, taskId, {
      title: b.title as string | undefined,
      notes: b.notes as string | null | undefined,
      list: b.list as string | undefined,
      due_date: b.due_date as string | null | undefined,
      done: typeof b.done === "boolean" ? b.done : undefined,
    });
    return task ? json({ task }) : json({ error: "Tâche introuvable" }, 404);
  }

  // DELETE /api/tasks/:id
  if (taskId && parts.length === 3 && method === "DELETE") {
    return (await deleteTask(db, taskId)) ? json({ ok: true }) : json({ error: "Tâche introuvable" }, 404);
  }

  // POST /api/tasks/:id/items
  if (taskId && parts[3] === "items" && parts.length === 4 && method === "POST") {
    const b = await readJson(request);
    const labels = typeof b.label === "string" ? [b.label] : b.labels;
    const task = await addItems(db, taskId, labels);
    return task ? json({ task }, 201) : json({ error: "Tâche introuvable" }, 404);
  }

  const itemId = parts[1] === "items" ? parseId(parts[2]) : null;

  // PATCH /api/items/:id
  if (itemId && parts.length === 3 && method === "PATCH") {
    const b = await readJson(request);
    const item = await updateItem(db, itemId, {
      done: typeof b.done === "boolean" ? b.done : undefined,
      label: typeof b.label === "string" ? b.label : undefined,
    });
    return item ? json({ item }) : json({ error: "Élément introuvable" }, 404);
  }

  // DELETE /api/items/:id
  if (itemId && parts.length === 3 && method === "DELETE") {
    return (await deleteItem(db, itemId)) ? json({ ok: true }) : json({ error: "Élément introuvable" }, 404);
  }

  return json({ error: "Route inconnue" }, 404);
}

// ---------- Statique ----------

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function asset(body: BodyInit, type: string): Response {
  return new Response(body, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" } });
}

function manifest(): Response {
  return new Response(
    JSON.stringify({
      name: "Mes tâches",
      short_name: "Tâches",
      lang: "fr",
      start_url: "/",
      display: "standalone",
      background_color: "#F1F3EF",
      theme_color: "#F1F3EF",
      icons: [
        { src: "/icon-180.png", sizes: "180x180", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      ],
    }),
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=86400" } },
  );
}

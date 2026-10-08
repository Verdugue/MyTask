// Gabarit HTML commun + pages simples (connexion, autorisation de Claude, erreur).

import type { ConsentDescription } from "@cloudflare/workers-oauth-provider";

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function nonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

// Jetons de design partagés par toutes les pages
export const TOKENS_CSS = `
:root {
  color-scheme: light dark;
  --paper: #F1F3EF;
  --surface: #FBFCFA;
  --ink: #1D2A33;
  --ink-soft: #55636B;
  --rule: #D6DCD6;
  --action: #2F4BD8;
  --action-ink: #FFFFFF;
  --danger: #B42318;
  --c1: #3F7D5C; --c2: #2F4BD8; --c3: #8A3F86; --c4: #A06E10; --c5: #1F7A87; --c6: #C2416B;
  --font: "Atkinson Hyperlegible Next", "Atkinson Hyperlegible", system-ui, -apple-system, "Segoe UI", sans-serif;
  --radius: 10px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #172026;
    --surface: #1E2930;
    --ink: #E4EAE6;
    --ink-soft: #9AA8AE;
    --rule: #2E3B42;
    --action: #8FA2FF;
    --action-ink: #101836;
    --danger: #FF8A7A;
    --c1: #7CC39C; --c2: #8FA2FF; --c3: #D49AD0; --c4: #E2B45C; --c5: #6CC5D1; --c6: #F08AAA;
  }
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font);
  font-size: 17px;
  line-height: 1.45;
}
button, input, textarea, select { font: inherit; color: inherit; }
:focus-visible { outline: 3px solid var(--action); outline-offset: 2px; border-radius: 4px; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
.field {
  width: 100%;
  padding: 12px 14px;
  border: 1.5px solid var(--rule);
  border-radius: var(--radius);
  background: var(--surface);
}
.field:focus { border-color: var(--action); outline: none; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 46px; padding: 0 20px;
  border: 0; border-radius: var(--radius);
  background: var(--action); color: var(--action-ink);
  font-weight: 700; cursor: pointer;
}
.btn.quiet { background: transparent; color: var(--ink); border: 1.5px solid var(--rule); }
.btn:disabled { opacity: 0.55; cursor: progress; }
`;

export function page(opts: {
  title: string;
  body: string;
  css?: string;
  script?: string;
  scriptNonce?: string;
}): string {
  const scriptTag =
    opts.script && opts.scriptNonce ? `<script nonce="${opts.scriptNonce}">${opts.script}</script>` : "";
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F1F3EF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#172026" media="(prefers-color-scheme: dark)">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(opts.title)}</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;600;700;800&display=swap">
<style>${TOKENS_CSS}${opts.css ?? ""}</style>
</head>
<body>
${opts.body}
${scriptTag}
</body>
</html>`;
}

export function htmlResponse(html: string, init: ResponseInit = {}, scriptNonce?: string): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  if (!headers.has("Content-Security-Policy")) {
    headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        `script-src ${scriptNonce ? `'nonce-${scriptNonce}'` : "'none'"}`,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com",
        "img-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'none'",
      ].join("; "),
    );
  }
  return new Response(html, { ...init, headers });
}

// ---------- Pages « carte centrée » : connexion, autorisation, erreur ----------

const SOLO_CSS = `
.solo { min-height: 100dvh; display: grid; place-items: center; padding: 24px 16px; }
.solo-box { width: 100%; max-width: 400px; }
.solo h1 { font-size: clamp(34px, 9vw, 44px); line-height: 1; letter-spacing: -0.02em; font-weight: 800; margin: 0 0 12px; }
.solo p { margin: 0 0 20px; color: var(--ink-soft); max-width: 60ch; }
.solo label { display: block; font-weight: 600; margin: 0 0 6px; }
.solo .error { color: var(--danger); font-weight: 600; margin: 12px 0 0; }
.solo .row { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
.solo .row .btn { flex: 1 1 140px; }
.solo .facts { margin: 0 0 20px; padding: 14px 16px; background: var(--surface); border-left: 4px solid var(--action); border-radius: 0 var(--radius) var(--radius) 0; }
.solo .facts p { margin: 0; color: var(--ink); }
.solo .facts p + p { margin-top: 6px; }
.solo .warn { color: var(--danger); font-weight: 600; }
`;

export function loginPage(opts: { next: string; error?: string }): string {
  return page({
    title: "Connexion · Mes tâches",
    css: SOLO_CSS,
    body: `<main class="solo"><div class="solo-box">
  <h1>Mes tâches</h1>
  <p>Entre ton mot de passe pour ouvrir ta liste.</p>
  <form method="post" action="/login">
    <input type="hidden" name="next" value="${escapeHtml(opts.next)}">
    <label for="pw">Mot de passe</label>
    <input class="field" id="pw" name="password" type="password" autocomplete="current-password" required autofocus>
    ${opts.error ? `<p class="error" role="alert">${escapeHtml(opts.error)}</p>` : ""}
    <div class="row"><button class="btn" type="submit">Se connecter</button></div>
  </form>
</div></main>`,
  });
}

export function consentPage(d: ConsentDescription, handle: string): string {
  const name = escapeHtml(d.clientName);
  const origin = d.clientDomain
    ? `<p>Application publiée par <strong>${escapeHtml(d.clientDomain)}</strong>.</p>`
    : `<p>Cette application s'est enregistrée elle-même : son nom n'est pas vérifié.</p>`;
  return page({
    title: "Autoriser l'accès · Mes tâches",
    css: SOLO_CSS,
    body: `<main class="solo"><div class="solo-box">
  <h1>Autoriser ${name} ?</h1>
  <p>${name} pourra lire, créer, modifier et supprimer tes tâches.</p>
  <div class="facts">
    ${origin}
    <p>L'accès sera envoyé à <strong>${escapeHtml(d.redirectHost)}</strong>.</p>
    ${d.redirectIsLoopback ? `<p class="warn">Attention : l'accès part vers une application de ton ordinateur. Continue seulement si tu viens de lancer la connexion depuis celle-ci.</p>` : ""}
  </div>
  <p>Si tu n'as pas lancé cette connexion toi-même depuis Claude, refuse.</p>
  <form method="post" action="/authorize">
    <input type="hidden" name="handle" value="${escapeHtml(handle)}">
    <div class="row">
      <button class="btn" name="decision" value="approve" type="submit">Autoriser</button>
      <button class="btn quiet" name="decision" value="deny" type="submit">Refuser</button>
    </div>
  </form>
</div></main>`,
  });
}

export function messagePage(title: string, message: string): string {
  return page({
    title: `${title} · Mes tâches`,
    css: SOLO_CSS,
    body: `<main class="solo"><div class="solo-box">
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
  <div class="row"><a class="btn quiet" href="/">Ouvrir mes tâches</a></div>
</div></main>`,
  });
}

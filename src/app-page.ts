// Page principale : la liste des tâches (HTML + CSS + JS vanilla, aucune dépendance).

import type { Task } from "./db";
import { nonce, page } from "./html";

const CSS = `
.app { max-width: 680px; margin: 0 auto; padding: max(20px, env(safe-area-inset-top)) 16px 120px; }

/* En-tête : le jour, en grand */
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.today .wd { display: block; font-size: clamp(46px, 14vw, 76px); font-weight: 800; letter-spacing: -0.035em; line-height: 0.92; }
.today .dm { display: block; font-size: clamp(20px, 5.4vw, 26px); font-weight: 600; color: var(--ink-soft); margin-top: 6px; }
.link { background: none; border: 0; padding: 8px 0; color: var(--ink-soft); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; font-size: 15px; }
.summary { margin: 18px 0 14px; font-size: 19px; }

/* Catégories */
.chips { display: flex; gap: 8px; overflow-x: auto; padding: 2px 2px 10px; margin: 0 -16px; padding-left: 16px; padding-right: 16px; scrollbar-width: none; }
.chips::-webkit-scrollbar { display: none; }
.chip { flex: none; display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 14px; border-radius: 999px; border: 1.5px solid var(--rule); background: var(--surface); cursor: pointer; font-weight: 600; font-size: 15px; }
.chip .dot { width: 10px; height: 10px; border-radius: 3px; background: var(--c, var(--ink-soft)); }
.chip .n { color: var(--ink-soft); font-weight: 400; }
.chip[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: var(--paper); }
.chip[aria-pressed="true"] .n { color: inherit; opacity: 0.75; }

/* Ajout */
.composer { margin: 8px 0 28px; }
.composer .big { font-size: 18px; padding: 14px 16px; }
.composer .more { display: grid; gap: 12px; margin-top: 12px; }
.composer .more[hidden] { display: none; }
.composer .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.composer label { display: grid; gap: 6px; font-weight: 600; font-size: 15px; }
.composer .hint { font-weight: 400; color: var(--ink-soft); }
.composer textarea { resize: vertical; min-height: 92px; }
.row { display: flex; gap: 10px; flex-wrap: wrap; }

/* Tâches */
.task { position: relative; padding: 14px 0 16px 16px; border-left: 4px solid var(--c, var(--ink-soft)); margin-bottom: 22px; }
.task.flash { animation: flash 1.8s ease-out; }
@keyframes flash { from { background: color-mix(in srgb, var(--c) 18%, transparent); } to { background: transparent; } }
.head { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: start; }
.title { margin: 0; font-size: 20px; line-height: 1.25; font-weight: 700; overflow-wrap: anywhere; }
.task.is-done .title { color: var(--ink-soft); text-decoration: line-through; text-decoration-thickness: 2px; }
.meta { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 4px; font-size: 15px; color: var(--ink-soft); }
.meta .cat { color: var(--c); font-weight: 700; }
.meta .late { color: var(--danger); font-weight: 700; }
.meta .soon { color: var(--ink); font-weight: 700; }
.notes { margin: 8px 0 0 46px; color: var(--ink-soft); white-space: pre-wrap; max-width: 62ch; }

/* Cases à cocher */
.box { flex: none; width: 26px; height: 26px; border-radius: 7px; border: 2px solid var(--ink-soft); background: var(--surface); display: grid; place-items: center; transition: background .15s, border-color .15s; }
.box::after { content: ""; width: 12px; height: 7px; border: solid var(--paper); border-width: 0 0 3px 3px; transform: translateY(-2px) rotate(-45deg) scale(0); transition: transform .15s; }
[aria-checked="true"] > .box, .box[aria-checked="true"] { background: var(--c); border-color: var(--c); }
[aria-checked="true"] > .box::after, .box[aria-checked="true"]::after { transform: translateY(-2px) rotate(-45deg) scale(1); }
.box.big { width: 34px; height: 34px; border-radius: 9px; cursor: pointer; padding: 0; }
.box.big::after { width: 15px; height: 9px; }

/* Éléments */
.items { list-style: none; margin: 10px 0 0; padding: 0 0 0 46px; }
.item { display: flex; align-items: flex-start; gap: 4px; }
.item-btn { flex: 1; display: flex; align-items: flex-start; gap: 12px; padding: 7px 0; background: none; border: 0; text-align: left; cursor: pointer; min-height: 40px; }
.item-btn .label { padding-top: 1px; background: linear-gradient(currentColor, currentColor) no-repeat 0 58% / 0% 2px; -webkit-box-decoration-break: clone; box-decoration-break: clone; transition: background-size .25s ease, color .25s; }
.item-btn[aria-checked="true"] .label { background-size: 100% 2px; color: var(--ink-soft); }
.x { flex: none; width: 36px; height: 40px; border: 0; background: none; color: var(--ink-soft); font-size: 22px; line-height: 1; cursor: pointer; opacity: 0.45; }
.x:hover, .x:focus-visible { opacity: 1; color: var(--danger); }
.add-item { margin: 6px 0 0 46px; }
.field.slim { padding: 8px 12px; font-size: 16px; background: transparent; border-style: dashed; }
.field.slim:focus { border-style: solid; background: var(--surface); }
.finish { margin: 10px 0 0 46px; min-height: 42px; padding: 0 16px; border-radius: var(--radius); border: 2px solid var(--c); background: none; color: var(--ink); font-weight: 700; cursor: pointer; }

/* Menu de tâche */
.menu { position: relative; }
.menu summary { list-style: none; width: 40px; height: 40px; display: grid; place-items: center; border-radius: 8px; cursor: pointer; color: var(--ink-soft); font-size: 22px; letter-spacing: 1px; }
.menu summary::-webkit-details-marker { display: none; }
.menu[open] summary { background: var(--surface); color: var(--ink); }
.menu-pop { position: absolute; right: 0; top: 44px; z-index: 5; min-width: 250px; padding: 6px; background: var(--surface); border: 1.5px solid var(--rule); border-radius: var(--radius); display: grid; box-shadow: 0 10px 28px -12px rgb(20 30 40 / 0.35); }
.menu-pop button, .menu-pop label { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 42px; padding: 0 10px; border: 0; background: none; text-align: left; cursor: pointer; border-radius: 6px; font-size: 16px; }
.menu-pop button:hover { background: var(--paper); }
.menu-pop input[type="date"] { border: 1.5px solid var(--rule); border-radius: 6px; padding: 4px 6px; background: var(--paper); font-size: 15px; }
.menu-pop .danger { color: var(--danger); font-weight: 700; }

/* Vide, terminées, notifications */
.empty { padding: 28px 0; color: var(--ink-soft); max-width: 46ch; }
.empty strong { display: block; color: var(--ink); font-size: 20px; margin-bottom: 4px; }
.done-zone { margin-top: 36px; border-top: 1.5px solid var(--rule); padding-top: 14px; }
.toast { position: fixed; left: 50%; bottom: max(20px, env(safe-area-inset-bottom)); transform: translate(-50%, 140%); display: flex; gap: 14px; align-items: center; max-width: calc(100% - 32px); padding: 12px 16px; border-radius: var(--radius); background: var(--ink); color: var(--paper); font-weight: 600; transition: transform .25s ease, visibility 0s .25s; z-index: 10; visibility: hidden; }
.toast.show { transform: translate(-50%, 0); visibility: visible; transition: transform .25s ease; }
.toast button { background: none; border: 0; color: inherit; text-decoration: underline; text-underline-offset: 3px; font-weight: 700; cursor: pointer; padding: 4px; }
@media (max-width: 420px) { .composer .grid2 { grid-template-columns: 1fr; } .items, .add-item, .finish, .notes { margin-left: 0; padding-left: 0; } .add-item, .finish { margin-left: 0; } }
`;

const SCRIPT = `
(() => {
  const INITIAL = JSON.parse(document.getElementById("initial").textContent);
  const state = { tasks: INITIAL.tasks, categories: INITIAL.categories, filter: null, showDone: false, done: [], addingTo: null };
  const $ = (s, el = document) => el.querySelector(s);
  const listEl = $("#list"), doneEl = $("#done-list"), chipsEl = $("#chips"), summaryEl = $("#summary");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");

  // Couleur stable par catégorie
  const KNOWN = { courses: 1, perso: 2, travail: 3, sorties: 4, maison: 5, "santé": 6, sante: 6 };
  function color(name) {
    const k = String(name || "").toLowerCase();
    if (KNOWN[k]) return "var(--c" + KNOWN[k] + ")";
    let h = 0; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return "var(--c" + ((h % 6) + 1) + ")";
  }

  // Dates en heure locale
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  function dueLabel(due) {
    if (!due) return null;
    const today = new Date(); const t = ymd(today);
    const tm = new Date(today); tm.setDate(tm.getDate() + 1);
    const d = new Date(due + "T12:00:00");
    const short = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
    if (due < t) return { text: "en retard, " + short, cls: "late" };
    if (due === t) return { text: "aujourd'hui", cls: "soon" };
    if (due === ymd(tm)) return { text: "demain", cls: "soon" };
    return { text: "pour " + short, cls: "" };
  }

  function header() {
    const now = new Date();
    $("#wd").textContent = now.toLocaleDateString("fr-FR", { weekday: "long" });
    $("#dm").textContent = now.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  }

  function visible(tasks) {
    return state.filter ? tasks.filter((t) => t.list.toLowerCase() === state.filter.toLowerCase()) : tasks;
  }

  function renderChips() {
    const total = state.tasks.length;
    const cats = state.categories.filter((c) => c.open > 0 || (state.filter && c.list.toLowerCase() === state.filter.toLowerCase()));
    let html = '<button class="chip" data-cat="" aria-pressed="' + (!state.filter) + '">Toutes <span class="n">' + total + "</span></button>";
    for (const c of cats) {
      html += '<button class="chip" style="--c:' + color(c.list) + '" data-cat="' + esc(c.list) + '" aria-pressed="' +
        (state.filter && state.filter.toLowerCase() === c.list.toLowerCase()) + '"><span class="dot"></span>' +
        esc(c.list) + ' <span class="n">' + c.open + "</span></button>";
    }
    chipsEl.innerHTML = html;
    $("#cats").innerHTML = state.categories.map((c) => '<option value="' + esc(c.list) + '">').join("");
  }

  function taskHtml(t) {
    const due = dueLabel(t.due_date);
    const doneCount = t.items.filter((i) => i.done).length;
    const allChecked = t.items.length > 0 && doneCount === t.items.length;
    const meta = [
      '<span class="cat">' + esc(t.list) + "</span>",
      t.items.length ? "<span>" + doneCount + " sur " + t.items.length + "</span>" : "",
      due && !t.done ? '<span class="' + due.cls + '">' + esc(due.text) + "</span>" : "",
      t.source === "claude" ? "<span>ajoutée par Claude</span>" : "",
    ].join("");
    const items = t.done ? "" : t.items.map((i) =>
      '<li class="item" data-item="' + i.id + '">' +
        '<button class="item-btn" role="checkbox" aria-checked="' + i.done + '" data-act="item-toggle">' +
          '<span class="box" aria-hidden="true"></span><span class="label">' + esc(i.label) + "</span></button>" +
        '<button class="x" data-act="item-del" aria-label="Retirer ' + esc(i.label) + '">×</button>' +
      "</li>").join("");
    return '<article class="task' + (t.done ? " is-done" : "") + '" id="tache-' + t.id + '" data-task="' + t.id + '" style="--c:' + color(t.list) + '">' +
      '<div class="head">' +
        '<button class="box big" role="checkbox" aria-checked="' + t.done + '" data-act="task-toggle" aria-label="' +
          (t.done ? "Rouvrir " : "Terminer ") + esc(t.title) + '"></button>' +
        '<div class="main"><h2 class="title">' + esc(t.title) + '</h2><div class="meta">' + meta + "</div></div>" +
        '<details class="menu"><summary aria-label="Options de la tâche">⋯</summary><div class="menu-pop">' +
          (t.items.length || t.done ? "" : '<button data-act="show-add">Ajouter des éléments à cocher</button>') +
          '<button data-act="rename">Renommer</button>' +
          '<label>Échéance <input type="date" data-act="due" value="' + esc(t.due_date || "") + '"></label>' +
          '<button data-act="delete" class="danger">Supprimer la tâche</button>' +
        "</div></details>" +
      "</div>" +
      (t.notes && !t.done ? '<p class="notes">' + esc(t.notes) + "</p>" : "") +
      (items ? '<ul class="items">' + items + "</ul>" : "") +
      (allChecked && !t.done ? '<button class="finish" data-act="task-done">Tout est coché. Terminer la tâche</button>' : "") +
      (t.done || (!t.items.length && state.addingTo !== t.id) ? "" : '<form class="add-item" data-act="add-item"><input class="field slim" name="label" autocomplete="off" placeholder="Ajouter un élément" aria-label="Ajouter un élément à ' + esc(t.title) + '"></form>') +
      "</article>";
  }

  function render(refocusTask) {
    const tasks = visible(state.tasks);
    const n = tasks.length;
    summaryEl.textContent = n === 0 ? "Rien à faire" + (state.filter ? " dans " + state.filter : "") + "."
      : n + (n > 1 ? " tâches" : " tâche") + " à faire" + (state.filter ? " dans " + state.filter : "") + ".";
    listEl.innerHTML = n ? tasks.map(taskHtml).join("") :
      '<div class="empty"><strong>Tout est fait.</strong>Ajoute une tâche ci-dessus, ou demande à Claude, par exemple « ajoute les ingrédients des lasagnes à mes courses ».</div>';
    renderChips();
    if (state.showDone) {
      const done = visible(state.done);
      doneEl.innerHTML = done.length ? done.map(taskHtml).join("") : '<p class="empty">Aucune tâche terminée.</p>';
    }
    if (refocusTask) {
      const input = document.querySelector("#tache-" + refocusTask + " .add-item input");
      if (input) input.focus();
    }
  }

  // Notifications
  let toastTimer;
  function toast(msg, action) {
    const el = $("#toast");
    el.innerHTML = "<span>" + esc(msg) + "</span>" + (action ? '<button type="button">' + esc(action.label) + "</button>" : "");
    if (action) el.querySelector("button").onclick = () => { el.classList.remove("show"); action.run(); };
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), action ? 6000 : 3500);
  }

  async function call(method, url, body) {
    const res = await fetch(url, {
      method, credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { location.href = "/login"; throw new Error("Session expirée"); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Erreur " + res.status);
    return data;
  }

  function findTask(id) {
    return state.tasks.find((t) => t.id === id) || state.done.find((t) => t.id === id);
  }
  function putTask(task) {
    state.tasks = state.tasks.filter((t) => t.id !== task.id);
    state.done = state.done.filter((t) => t.id !== task.id);
    if (task.done) state.done.unshift(task); else state.tasks.push(task);
    sortOpen();
  }
  function sortOpen() {
    state.tasks.sort((a, b) =>
      (a.due_date === null) - (b.due_date === null) ||
      (a.due_date || "").localeCompare(b.due_date || "") ||
      b.created_at.localeCompare(a.created_at));
  }
  function bumpCategory(list, delta) {
    const c = state.categories.find((c) => c.list.toLowerCase() === list.toLowerCase());
    if (c) c.open = Math.max(0, c.open + delta); else if (delta > 0) state.categories.push({ list, open: delta });
  }

  async function setTaskDone(id, done) {
    const t = findTask(id); if (!t) return;
    try {
      const { task } = await call("PATCH", "/api/tasks/" + id, { done });
      bumpCategory(task.list, done ? -1 : 1);
      putTask(task); render();
      if (done) toast("Tâche terminée.", { label: "Annuler", run: () => setTaskDone(id, false) });
    } catch (e) { toast(e.message); render(); }
  }

  // ---------- Événements ----------
  chipsEl.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip"); if (!chip) return;
    state.filter = chip.dataset.cat || null; render();
  });

  function onListClick(e) {
    const btn = e.target.closest("[data-act]"); if (!btn || btn.tagName === "FORM" || btn.tagName === "INPUT") return;
    const art = btn.closest(".task"); if (!art) return;
    const id = Number(art.dataset.task); const t = findTask(id); if (!t) return;
    const act = btn.dataset.act;

    if (act === "task-toggle" || act === "task-done") {
      const done = act === "task-done" ? true : !t.done;
      btn.setAttribute("aria-checked", String(done));
      setTimeout(() => setTaskDone(id, done), done ? 350 : 0);
    }
    if (act === "item-toggle") {
      const itemId = Number(btn.closest(".item").dataset.item);
      const item = t.items.find((i) => i.id === itemId); if (!item) return;
      item.done = !item.done;
      btn.setAttribute("aria-checked", String(item.done));
      // On laisse l'animation du trait se jouer, puis on met à jour le compteur
      setTimeout(() => render(), 260);
      call("PATCH", "/api/items/" + itemId, { done: item.done }).catch((err) => { item.done = !item.done; render(); toast(err.message); });
    }
    if (act === "item-del") {
      const itemId = Number(btn.closest(".item").dataset.item);
      const before = t.items.slice();
      t.items = t.items.filter((i) => i.id !== itemId); render();
      call("DELETE", "/api/items/" + itemId).catch((err) => { t.items = before; render(); toast(err.message); });
    }
    if (act === "show-add") {
      state.addingTo = id; render(id);
    }
    if (act === "rename") {
      const title = prompt("Nouveau titre", t.title);
      if (title && title.trim() && title.trim() !== t.title) {
        call("PATCH", "/api/tasks/" + id, { title }).then(({ task }) => { putTask(task); render(); }).catch((err) => toast(err.message));
      }
    }
    if (act === "delete") {
      if (!confirm("Supprimer « " + t.title + " » ?")) return;
      call("DELETE", "/api/tasks/" + id).then(() => {
        if (!t.done) bumpCategory(t.list, -1);
        state.tasks = state.tasks.filter((x) => x.id !== id); state.done = state.done.filter((x) => x.id !== id);
        render(); toast("Tâche supprimée.");
      }).catch((err) => toast(err.message));
    }
  }
  listEl.addEventListener("click", onListClick);
  doneEl.addEventListener("click", onListClick);

  function onListChange(e) {
    if (e.target.dataset.act !== "due") return;
    const id = Number(e.target.closest(".task").dataset.task);
    call("PATCH", "/api/tasks/" + id, { due_date: e.target.value || null })
      .then(({ task }) => { putTask(task); render(); }).catch((err) => toast(err.message));
  }
  listEl.addEventListener("change", onListChange);

  listEl.addEventListener("submit", async (e) => {
    const form = e.target.closest(".add-item"); if (!form) return;
    e.preventDefault();
    const input = form.elements.label; const label = input.value.trim(); if (!label) return;
    const id = Number(form.closest(".task").dataset.task);
    input.disabled = true;
    try {
      const { task } = await call("POST", "/api/tasks/" + id + "/items", { label });
      putTask(task); render(id);
    } catch (err) { toast(err.message); input.disabled = false; }
  });

  // Ferme les menus ouverts quand on clique ailleurs
  document.addEventListener("click", (e) => {
    document.querySelectorAll("details.menu[open]").forEach((d) => { if (!d.contains(e.target)) d.removeAttribute("open"); });
  });

  // Formulaire d'ajout
  const addForm = $("#add"); const more = $("#more");
  const openMore = () => { more.hidden = false; if (state.filter && !addForm.elements.list.value) addForm.elements.list.value = state.filter; };
  addForm.elements.title.addEventListener("focus", openMore);
  $("#cancel").addEventListener("click", () => { addForm.reset(); more.hidden = true; });
  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = addForm.elements; const btn = $("#add-btn");
    btn.disabled = true;
    try {
      const { task } = await call("POST", "/api/tasks", {
        title: f.title.value, list: f.list.value || null, due_date: f.due_date.value || null, items: f.items.value,
      });
      bumpCategory(task.list, 1); putTask(task); addForm.reset(); more.hidden = true; render();
      toast("Tâche ajoutée.");
    } catch (err) { toast(err.message); }
    finally { btn.disabled = false; }
  });

  // Terminées
  $("#toggle-done").addEventListener("click", async (e) => {
    state.showDone = !state.showDone;
    e.currentTarget.textContent = state.showDone ? "Masquer les tâches terminées" : "Voir les tâches terminées";
    doneEl.hidden = !state.showDone;
    if (state.showDone) {
      try { const { tasks } = await call("GET", "/api/tasks?status=done"); state.done = tasks; render(); }
      catch (err) { toast(err.message); }
    }
  });

  // Rafraîchissement : pour voir arriver ce que Claude ajoute
  let lastSnapshot = JSON.stringify(state.tasks);
  async function refresh() {
    if (document.hidden) return;
    const active = document.activeElement;
    const busy = (active && active.closest && active.closest("#list, #done-list") && active.tagName === "INPUT") ||
      document.querySelector("details.menu[open]");
    if (busy) return;
    try {
      const data = await call("GET", "/api/tasks?status=open");
      const snap = JSON.stringify(data.tasks);
      if (snap !== lastSnapshot) {
        const known = new Set(state.tasks.map((t) => t.id));
        state.tasks = data.tasks; state.categories = data.categories; lastSnapshot = snap; render();
        const fresh = data.tasks.find((t) => !known.has(t.id));
        if (fresh) highlight(fresh.id);
      }
    } catch (_) { /* hors ligne : on réessaiera */ }
  }
  setInterval(refresh, 20000);
  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("focus", refresh);

  function highlight(id) {
    const el = document.getElementById("tache-" + id); if (!el) return;
    el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  }
  function fromHash() { const m = location.hash.match(/^#tache-(\\d+)$/); if (m) highlight(Number(m[1])); }
  window.addEventListener("hashchange", fromHash);

  header(); render(); fromHash();
})();
`;

export function appPage(data: { tasks: Task[]; categories: { list: string; open: number }[] }): {
  html: string;
  scriptNonce: string;
} {
  const scriptNonce = nonce();
  // JSON embarqué sans risque d'injection (< échappé)
  const initial = JSON.stringify(data).replace(/</g, "\\u003c");
  const body = `<main class="app">
  <header class="top">
    <h1 class="today"><span class="wd" id="wd"></span><span class="dm" id="dm"></span></h1>
    <form method="post" action="/logout"><button class="link" type="submit">Se déconnecter</button></form>
  </header>
  <p class="summary" id="summary" aria-live="polite"></p>
  <nav class="chips" id="chips" aria-label="Catégories"></nav>

  <form class="composer" id="add" autocomplete="off">
    <input class="field big" id="new-title" name="title" placeholder="Ajouter une tâche" aria-label="Nouvelle tâche" required maxlength="200">
    <div class="more" id="more" hidden>
      <div class="grid2">
        <label>Catégorie <input class="field" name="list" list="cats" placeholder="Perso" maxlength="40"></label>
        <label>Échéance <input class="field" name="due_date" type="date"></label>
      </div>
      <label>Éléments à cocher <span class="hint">un par ligne, facultatif</span>
        <textarea class="field" name="items" rows="3" placeholder="500 g de bœuf haché&#10;1 oignon"></textarea>
      </label>
      <div class="row">
        <button class="btn" id="add-btn" type="submit">Ajouter la tâche</button>
        <button class="btn quiet" id="cancel" type="button">Annuler</button>
      </div>
    </div>
    <datalist id="cats"></datalist>
  </form>

  <section id="list" aria-label="Tâches à faire"></section>

  <div class="done-zone">
    <button class="link" id="toggle-done" type="button">Voir les tâches terminées</button>
    <section id="done-list" hidden aria-label="Tâches terminées"></section>
  </div>
</main>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script type="application/json" id="initial">${initial}</script>`;

  return {
    html: page({ title: "Mes tâches", body, css: CSS, script: SCRIPT, scriptNonce }),
    scriptNonce,
  };
}

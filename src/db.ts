// Couche d'accès aux données, partagée par l'interface web et le serveur MCP.

export type TaskStatus = "open" | "done" | "all";
export type Source = "web" | "claude";

export interface Item {
  id: number;
  task_id: number;
  label: string;
  done: boolean;
  position: number;
}

export interface Task {
  id: number;
  title: string;
  notes: string | null;
  list: string;
  due_date: string | null;
  done: boolean;
  source: Source;
  created_at: string;
  completed_at: string | null;
  items: Item[];
}

export interface NewTask {
  title: string;
  notes?: string | null;
  list?: string | null;
  due_date?: string | null;
  items?: string[];
  source?: Source;
}

export interface TaskPatch {
  title?: string;
  notes?: string | null;
  list?: string;
  due_date?: string | null;
  done?: boolean;
}

export const DEFAULT_LIST = "Perso";
const MAX_TITLE = 200;
const MAX_LABEL = 300;
const MAX_NOTES = 4000;
const MAX_ITEMS = 100;

export class ValidationError extends Error {}

interface TaskRow {
  id: number;
  title: string;
  notes: string | null;
  list: string;
  due_date: string | null;
  done: number;
  source: Source;
  created_at: string;
  completed_at: string | null;
}

interface ItemRow {
  id: number;
  task_id: number;
  label: string;
  done: number;
  position: number;
}

// ---------- Normalisation / validation ----------

function cleanText(value: unknown, max: number, field: string): string {
  if (typeof value !== "string") throw new ValidationError(`${field} doit être un texte`);
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) throw new ValidationError(`${field} ne peut pas être vide`);
  if (text.length > max) throw new ValidationError(`${field} dépasse ${max} caractères`);
  return text;
}

function cleanNotes(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ValidationError("notes doit être un texte");
  const text = value.trim();
  if (text.length > MAX_NOTES) throw new ValidationError(`notes dépasse ${MAX_NOTES} caractères`);
  return text || null;
}

function cleanList(value: unknown): string {
  if (value === undefined || value === null || value === "") return DEFAULT_LIST;
  const text = cleanText(value, 40, "categorie");
  // Première lettre en majuscule pour éviter « courses » et « Courses » en double
  return text.charAt(0).toLocaleUpperCase("fr-FR") + text.slice(1);
}

function cleanDate(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError("La date doit être au format AAAA-MM-JJ");
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw new ValidationError("Date invalide");
  }
  return value;
}

function cleanLabels(values: unknown): string[] {
  if (values === undefined || values === null) return [];
  if (!Array.isArray(values)) throw new ValidationError("elements doit être une liste");
  const labels = values
    .filter((v) => typeof v === "string" && v.trim())
    .map((v) => cleanText(v, MAX_LABEL, "élément"));
  if (labels.length > MAX_ITEMS) throw new ValidationError(`Maximum ${MAX_ITEMS} éléments`);
  return labels;
}

function now(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ---------- Lecture ----------

function hydrate(rows: TaskRow[], items: ItemRow[]): Task[] {
  const byTask = new Map<number, Item[]>();
  for (const it of items) {
    const list = byTask.get(it.task_id) ?? [];
    list.push({ ...it, done: it.done === 1 });
    byTask.set(it.task_id, list);
  }
  return rows.map((r) => ({ ...r, done: r.done === 1, items: byTask.get(r.id) ?? [] }));
}

export async function listTasks(
  db: D1Database,
  opts: { status?: TaskStatus; list?: string | null; search?: string | null; limit?: number } = {},
): Promise<Task[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const status = opts.status ?? "open";
  if (status === "open") where.push("done = 0");
  if (status === "done") where.push("done = 1");
  if (opts.list) {
    where.push("list = ? COLLATE NOCASE");
    params.push(opts.list);
  }
  if (opts.search) {
    const like = `%${opts.search.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    where.push(
      "(title LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\' OR id IN (SELECT task_id FROM items WHERE label LIKE ? ESCAPE '\\'))",
    );
    params.push(like, like, like);
  }
  let sql = "SELECT * FROM tasks";
  if (where.length) sql += " WHERE " + where.join(" AND ");
  // À faire : échéance la plus proche d'abord, puis les plus récentes.
  // Terminées : les plus récemment terminées d'abord.
  sql +=
    status === "done"
      ? " ORDER BY completed_at DESC"
      : " ORDER BY done ASC, due_date IS NULL, due_date ASC, created_at DESC";
  sql += " LIMIT " + Math.min(Math.max(Math.trunc(opts.limit ?? 200), 1), 500);

  const { results: rows } = await db.prepare(sql).bind(...params).all<TaskRow>();
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const { results: items } = await db
    .prepare(
      `SELECT * FROM items WHERE task_id IN (SELECT value FROM json_each(?)) ORDER BY task_id, position, id`,
    )
    .bind(JSON.stringify(ids))
    .all<ItemRow>();
  return hydrate(rows, items);
}

export async function getTask(db: D1Database, id: number): Promise<Task | null> {
  const row = await db.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<TaskRow>();
  if (!row) return null;
  const { results: items } = await db
    .prepare("SELECT * FROM items WHERE task_id = ? ORDER BY position, id")
    .bind(id)
    .all<ItemRow>();
  return hydrate([row], items)[0];
}

export async function listCategories(db: D1Database): Promise<{ list: string; open: number }[]> {
  const { results } = await db
    .prepare(
      "SELECT list, SUM(CASE WHEN done = 0 THEN 1 ELSE 0 END) AS open FROM tasks GROUP BY list ORDER BY open DESC, list",
    )
    .all<{ list: string; open: number }>();
  return results;
}

// ---------- Écriture ----------

export async function createTask(db: D1Database, input: NewTask): Promise<Task> {
  const title = cleanText(input.title, MAX_TITLE, "titre");
  const notes = cleanNotes(input.notes);
  const list = cleanList(input.list);
  const due = cleanDate(input.due_date);
  const labels = cleanLabels(input.items);
  const source: Source = input.source === "claude" ? "claude" : "web";

  const row = await db
    .prepare(
      "INSERT INTO tasks (title, notes, list, due_date, source, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(title, notes, list, due, source, now())
    .first<{ id: number }>();
  if (!row) throw new Error("Insertion impossible");

  if (labels.length) {
    await db.batch(
      labels.map((label, i) =>
        db.prepare("INSERT INTO items (task_id, label, position) VALUES (?, ?, ?)").bind(row.id, label, i),
      ),
    );
  }
  return (await getTask(db, row.id))!;
}

export async function updateTask(db: D1Database, id: number, patch: TaskPatch): Promise<Task | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.title !== undefined) {
    sets.push("title = ?");
    params.push(cleanText(patch.title, MAX_TITLE, "titre"));
  }
  if (patch.notes !== undefined) {
    sets.push("notes = ?");
    params.push(cleanNotes(patch.notes));
  }
  if (patch.list !== undefined) {
    sets.push("list = ?");
    params.push(cleanList(patch.list));
  }
  if (patch.due_date !== undefined) {
    sets.push("due_date = ?");
    params.push(cleanDate(patch.due_date));
  }
  if (patch.done !== undefined) {
    sets.push("done = ?", "completed_at = ?");
    params.push(patch.done ? 1 : 0, patch.done ? now() : null);
  }
  if (!sets.length) return getTask(db, id);
  params.push(id);
  const res = await db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).bind(...params).run();
  if (!res.meta.changes) return null;
  return getTask(db, id);
}

export async function deleteTask(db: D1Database, id: number): Promise<boolean> {
  const [, res] = await db.batch([
    db.prepare("DELETE FROM items WHERE task_id = ?").bind(id),
    db.prepare("DELETE FROM tasks WHERE id = ?").bind(id),
  ]);
  return (res.meta.changes ?? 0) > 0;
}

export async function addItems(db: D1Database, taskId: number, values: unknown): Promise<Task | null> {
  const labels = cleanLabels(values);
  if (!labels.length) throw new ValidationError("Aucun élément à ajouter");
  const exists = await db.prepare("SELECT id FROM tasks WHERE id = ?").bind(taskId).first();
  if (!exists) return null;
  const max = await db
    .prepare("SELECT COALESCE(MAX(position), -1) AS p FROM items WHERE task_id = ?")
    .bind(taskId)
    .first<{ p: number }>();
  const start = (max?.p ?? -1) + 1;
  const count = await db
    .prepare("SELECT COUNT(*) AS n FROM items WHERE task_id = ?")
    .bind(taskId)
    .first<{ n: number }>();
  if ((count?.n ?? 0) + labels.length > MAX_ITEMS) {
    throw new ValidationError(`Maximum ${MAX_ITEMS} éléments par tâche`);
  }
  await db.batch([
    ...labels.map((label, i) =>
      db.prepare("INSERT INTO items (task_id, label, position) VALUES (?, ?, ?)").bind(taskId, label, start + i),
    ),
    // Ajouter un élément à une tâche terminée la rouvre
    db.prepare("UPDATE tasks SET done = 0, completed_at = NULL WHERE id = ?").bind(taskId),
  ]);
  return getTask(db, taskId);
}

export async function updateItem(
  db: D1Database,
  itemId: number,
  patch: { done?: boolean; label?: string },
): Promise<Item | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.done !== undefined) {
    sets.push("done = ?");
    params.push(patch.done ? 1 : 0);
  }
  if (patch.label !== undefined) {
    sets.push("label = ?");
    params.push(cleanText(patch.label, MAX_LABEL, "élément"));
  }
  if (!sets.length) throw new ValidationError("Rien à modifier");
  params.push(itemId);
  const row = await db
    .prepare(`UPDATE items SET ${sets.join(", ")} WHERE id = ? RETURNING *`)
    .bind(...params)
    .first<ItemRow>();
  return row ? { ...row, done: row.done === 1 } : null;
}

export async function setItemsDone(
  db: D1Database,
  taskId: number,
  itemIds: number[] | "all",
  done: boolean,
): Promise<Task | null> {
  const exists = await db.prepare("SELECT id FROM tasks WHERE id = ?").bind(taskId).first();
  if (!exists) return null;
  if (itemIds === "all") {
    await db.prepare("UPDATE items SET done = ? WHERE task_id = ?").bind(done ? 1 : 0, taskId).run();
  } else if (itemIds.length) {
    await db
      .prepare("UPDATE items SET done = ? WHERE task_id = ? AND id IN (SELECT value FROM json_each(?))")
      .bind(done ? 1 : 0, taskId, JSON.stringify(itemIds))
      .run();
  }
  return getTask(db, taskId);
}

export async function deleteItem(db: D1Database, itemId: number): Promise<boolean> {
  const res = await db.prepare("DELETE FROM items WHERE id = ?").bind(itemId).run();
  return (res.meta.changes ?? 0) > 0;
}

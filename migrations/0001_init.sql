-- Tâches : une tâche peut avoir une liste d'éléments à cocher (ex. ingrédients)
CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  notes        TEXT,
  list         TEXT    NOT NULL DEFAULT 'Perso',   -- catégorie : Courses, Maison, Perso…
  due_date     TEXT,                               -- AAAA-MM-JJ
  done         INTEGER NOT NULL DEFAULT 0,
  source       TEXT    NOT NULL DEFAULT 'web',     -- 'web' ou 'claude'
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS items (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id  INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label    TEXT    NOT NULL,
  done     INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_items_task ON items (task_id, position);
CREATE INDEX IF NOT EXISTS idx_tasks_done ON tasks (done, due_date);

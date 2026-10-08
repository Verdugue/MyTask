// Serveur MCP : les outils que Claude appelle quand tu lui demandes de créer ou gérer une tâche.
// Mode « stateless » : chaque requête HTTP crée un serveur éphémère, pas de session à garder.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import { z } from "zod";
import {
  addItems,
  createTask,
  deleteTask,
  getTask,
  listCategories,
  listTasks,
  setItemsDone,
  updateTask,
  ValidationError,
  type Task,
} from "./db";

const INSTRUCTIONS = `Application de tâches personnelle de l'utilisateur (liste de choses à faire et listes de courses).
- Quand l'utilisateur dit qu'il a besoin de faire, acheter, préparer ou penser à quelque chose, crée une tâche avec creer_tache.
- Pour une liste de courses ou les ingrédients d'une recette, mets UN ingrédient par élément avec sa quantité (ex. « 500 g de bœuf haché »), dans la catégorie « Courses ».
- Avant de créer une liste de courses, vérifie avec lister_taches (categorie « Courses ») s'il en existe déjà une ouverte : propose d'y ajouter les éléments plutôt que d'en créer une deuxième.
- Réutilise les catégories existantes (lister_categories) plutôt que d'en inventer de nouvelles.
- Les échéances sont au format AAAA-MM-JJ.`;

function formatTask(t: Task, origin: string): string {
  const head = [
    `#${t.id} « ${t.title} »`,
    `[${t.list}]`,
    t.done ? "terminée" : "à faire",
    t.due_date ? `échéance ${t.due_date}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const lines = [head];
  if (t.notes) lines.push(`  Notes : ${t.notes}`);
  if (t.items.length) {
    const doneCount = t.items.filter((i) => i.done).length;
    lines.push(`  Éléments (${doneCount}/${t.items.length} cochés) :`);
    for (const i of t.items) lines.push(`    ${i.done ? "[x]" : "[ ]"} (id ${i.id}) ${i.label}`);
  }
  lines.push(`  Lien : ${origin}/#tache-${t.id}`);
  return lines.join("\n");
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }] });
const fail = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });

async function guard(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ValidationError) return fail(e.message);
    console.error("Erreur outil MCP", e);
    return fail("Erreur interne de l'application de tâches.");
  }
}

const notFound = (id: number) => fail(`Aucune tâche avec l'id ${id}. Utilise lister_taches pour retrouver les ids.`);

function buildServer(env: Env, origin: string): McpServer {
  const server = new McpServer(
    { name: "mes-taches", title: "Mes tâches", version: "1.0.0" },
    { instructions: INSTRUCTIONS, jsonSchemaValidator: new CfWorkerJsonSchemaValidator() },
  );
  const db = env.DB;

  server.registerTool(
    "creer_tache",
    {
      title: "Créer une tâche",
      description:
        "Crée une tâche dans l'application de tâches de l'utilisateur, avec éventuellement une liste d'éléments à cocher (ingrédients, étapes, objets à prendre…).",
      inputSchema: {
        titre: z.string().min(1).max(200).describe("Titre court, ex. « Courses pour les lasagnes »"),
        elements: z
          .array(z.string().min(1).max(300))
          .max(100)
          .optional()
          .describe("Éléments à cocher, un par entrée, avec quantités pour des courses"),
        categorie: z
          .string()
          .max(40)
          .optional()
          .describe("Catégorie : Courses, Maison, Perso, Travail… (défaut : Perso)"),
        echeance: z.string().optional().describe("Date limite au format AAAA-MM-JJ"),
        notes: z.string().max(4000).optional().describe("Précisions libres"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ titre, elements, categorie, echeance, notes }) =>
      guard(async () => {
        const t = await createTask(db, {
          title: titre,
          items: elements,
          list: categorie,
          due_date: echeance,
          notes,
          source: "claude",
        });
        return ok(`Tâche créée :\n${formatTask(t, origin)}`);
      }),
  );

  server.registerTool(
    "lister_taches",
    {
      title: "Lister les tâches",
      description: "Liste les tâches avec leurs éléments et leurs ids. Par défaut, seulement celles à faire.",
      inputSchema: {
        statut: z.enum(["a_faire", "terminees", "toutes"]).optional().describe("Défaut : a_faire"),
        categorie: z.string().max(40).optional().describe("Filtrer sur une catégorie, ex. Courses"),
        recherche: z.string().max(100).optional().describe("Texte cherché dans les titres, notes et éléments"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ statut, categorie, recherche }) =>
      guard(async () => {
        const status = statut === "terminees" ? "done" : statut === "toutes" ? "all" : "open";
        const tasks = await listTasks(db, { status, list: categorie, search: recherche, limit: 50 });
        if (!tasks.length) return ok("Aucune tâche ne correspond.");
        return ok(`${tasks.length} tâche(s) :\n\n${tasks.map((t) => formatTask(t, origin)).join("\n\n")}`);
      }),
  );

  server.registerTool(
    "lister_categories",
    {
      title: "Lister les catégories",
      description: "Liste les catégories existantes avec le nombre de tâches à faire dans chacune.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      guard(async () => {
        const cats = await listCategories(db);
        if (!cats.length) return ok("Aucune catégorie pour l'instant (défaut : Perso).");
        return ok(cats.map((c) => `- ${c.list} : ${c.open} à faire`).join("\n"));
      }),
  );

  server.registerTool(
    "ajouter_elements",
    {
      title: "Ajouter des éléments",
      description: "Ajoute des éléments à cocher à une tâche existante (ex. compléter une liste de courses).",
      inputSchema: {
        tache_id: z.number().int().positive(),
        elements: z.array(z.string().min(1).max(300)).min(1).max(100),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ tache_id, elements }) =>
      guard(async () => {
        const t = await addItems(db, tache_id, elements);
        return t ? ok(`Éléments ajoutés :\n${formatTask(t, origin)}`) : notFound(tache_id);
      }),
  );

  server.registerTool(
    "cocher_elements",
    {
      title: "Cocher des éléments",
      description: "Coche (ou décoche) des éléments d'une tâche, par leurs ids ou tous d'un coup.",
      inputSchema: {
        tache_id: z.number().int().positive(),
        element_ids: z.array(z.number().int().positive()).optional().describe("Ids des éléments à modifier"),
        tous: z.boolean().optional().describe("true pour appliquer à tous les éléments de la tâche"),
        coche: z.boolean().optional().describe("true = coché (défaut), false = décoché"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ tache_id, element_ids, tous, coche }) =>
      guard(async () => {
        if (!tous && !element_ids?.length) return fail("Donne element_ids ou tous=true.");
        const t = await setItemsDone(db, tache_id, tous ? "all" : element_ids!, coche ?? true);
        return t ? ok(formatTask(t, origin)) : notFound(tache_id);
      }),
  );

  server.registerTool(
    "modifier_tache",
    {
      title: "Modifier une tâche",
      description:
        "Modifie une tâche : titre, notes, catégorie, échéance, ou la marque comme terminée / à refaire.",
      inputSchema: {
        tache_id: z.number().int().positive(),
        titre: z.string().min(1).max(200).optional(),
        notes: z.string().max(4000).nullable().optional().describe("null pour effacer"),
        categorie: z.string().max(40).optional(),
        echeance: z.string().nullable().optional().describe("AAAA-MM-JJ, ou null pour retirer l'échéance"),
        terminee: z.boolean().optional().describe("true pour marquer comme terminée"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ tache_id, titre, notes, categorie, echeance, terminee }) =>
      guard(async () => {
        const t = await updateTask(db, tache_id, {
          title: titre,
          notes,
          list: categorie,
          due_date: echeance,
          done: terminee,
        });
        return t ? ok(`Tâche mise à jour :\n${formatTask(t, origin)}`) : notFound(tache_id);
      }),
  );

  server.registerTool(
    "supprimer_tache",
    {
      title: "Supprimer une tâche",
      description: "Supprime définitivement une tâche et ses éléments. Préfère modifier_tache(terminee=true) pour une tâche simplement finie.",
      inputSchema: { tache_id: z.number().int().positive() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ tache_id }) =>
      guard(async () => {
        const t = await getTask(db, tache_id);
        if (!t) return notFound(tache_id);
        await deleteTask(db, tache_id);
        return ok(`Tâche #${tache_id} « ${t.title} » supprimée.`);
      }),
  );

  return server;
}

/** Gestionnaire protégé par OAuth, monté sur /mcp. */
export const mcpHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Sans session, pas de flux SSE en GET ni de DELETE : seul POST est servi
    if (request.method !== "POST") {
      return new Response(null, { status: 405, headers: { Allow: "POST" } });
    }
    const server = buildServer(env, new URL(request.url).origin);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(request);
    } finally {
      // Réponse JSON complète déjà produite : on peut fermer le serveur éphémère
      await server.close().catch(() => {});
    }
  },
};

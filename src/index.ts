// Point d'entrée du Worker.
//  - /mcp            -> serveur MCP (protégé par OAuth, c'est là que Claude se connecte)
//  - /authorize      -> page où tu autorises Claude (après connexion par mot de passe)
//  - /oauth/token, /oauth/register, /.well-known/* -> gérés par la librairie OAuth
//  - tout le reste   -> interface web et son API

import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { mcpHandler } from "./mcp";
import { SCOPE, webHandler } from "./web";

const DAY = 86400;

// L'adresse publique (workers.dev ou ton domaine) est déduite de la requête :
// rien à configurer, et chaque domaine a ses propres jetons.
const providers = new Map<string, OAuthProvider<Env>>();

function providerFor(origin: string): OAuthProvider<Env> {
  let provider = providers.get(origin);
  if (!provider) {
    provider = new OAuthProvider<Env>({
      apiRoute: "/mcp",
      apiHandler: mcpHandler,
      defaultHandler: webHandler,
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/oauth/token",
      clientRegistrationEndpoint: "/oauth/register",
      // Claude peut s'identifier par un document publié sur son domaine (CIMD) :
      // la page d'autorisation affiche alors son domaine vérifié.
      clientIdMetadataDocumentEnabled: true,
      scopesSupported: [SCOPE],
      requiredScopes: [SCOPE],
      resourceMetadata: {
        resource: `${origin}/mcp`,
        authorization_servers: [origin],
        resource_name: "Mes tâches",
      },
      accessTokenTTL: 3600,
      // Claude renouvelle son accès tout seul ; tant qu'il s'en sert au moins
      // une fois tous les 90 jours, tu n'as pas à te reconnecter.
      refreshTokenTTL: 90 * DAY,
      refreshTokenIdleTTL: 90 * DAY,
      // L'enregistrement de Claude comme client n'expire pas
      clientRegistrationTTL: undefined,
    });
    providers.set(origin, provider);
  }
  return provider;
}

export default {
  fetch(request, env, ctx) {
    return providerFor(new URL(request.url).origin).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;

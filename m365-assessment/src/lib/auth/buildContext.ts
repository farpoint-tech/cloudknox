import { IPublicClientApplication, AccountInfo } from "@azure/msal-browser";
import { GraphClient } from "../graph/graphClient";
import { getPlatform } from "../platform/runtime";
import { AssessmentContext } from "../assessment/context";
import { GRAPH_SCOPES, RESOURCE_SCOPES } from "./msalConfig";
import { makeTokenGetter } from "./tokenProvider";

/**
 * Assemble the assessment context for the signed-in account: a Graph client, the
 * runtime platform, and (for the desktop build) a Defender for Endpoint token
 * getter. On desktop, Graph also uses the native fetch so it never hits CORS.
 */
export async function buildAssessmentContext(
  instance: IPublicClientApplication,
  account: AccountInfo,
): Promise<AssessmentContext> {
  const platform = await getPlatform();

  const graph = new GraphClient({
    getToken: makeTokenGetter(instance, account, GRAPH_SCOPES),
    fetchFn: platform.nativeFetch, // undefined in browser → GraphClient uses window.fetch
  });

  return {
    graph,
    platform,
    getDefenderEndpointToken: makeTokenGetter(
      instance,
      account,
      RESOURCE_SCOPES.defenderEndpoint,
    ),
  };
}

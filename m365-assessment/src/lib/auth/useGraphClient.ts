"use client";

import { useMsal } from "@azure/msal-react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { useMemo } from "react";
import { GraphClient } from "../graph/graphClient";
import { GRAPH_SCOPES } from "./msalConfig";

/**
 * Returns a GraphClient bound to the signed-in account, or null when no user is
 * signed in. Tokens are acquired silently and fall back to an interactive popup
 * only when the user must re-consent / re-authenticate.
 */
export function useGraphClient(): GraphClient | null {
  const { instance, accounts } = useMsal();

  return useMemo(() => {
    const account = accounts[0];
    if (!account) return null;

    const getToken = async (): Promise<string> => {
      try {
        const result = await instance.acquireTokenSilent({
          account,
          scopes: GRAPH_SCOPES,
        });
        return result.accessToken;
      } catch (error) {
        if (error instanceof InteractionRequiredAuthError) {
          const result = await instance.acquireTokenPopup({
            account,
            scopes: GRAPH_SCOPES,
          });
          return result.accessToken;
        }
        throw error;
      }
    };

    return new GraphClient({ getToken });
  }, [instance, accounts]);
}

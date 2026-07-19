import { IPublicClientApplication, AccountInfo, InteractionRequiredAuthError } from "@azure/msal-browser";

/**
 * Build a token getter for a specific set of scopes (one resource). Acquires
 * silently and falls back to an interactive popup only when re-consent / re-auth
 * is required.
 */
export function makeTokenGetter(
  instance: IPublicClientApplication,
  account: AccountInfo,
  scopes: string[],
): () => Promise<string> {
  return async () => {
    try {
      const result = await instance.acquireTokenSilent({ account, scopes });
      return result.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        const result = await instance.acquireTokenPopup({ account, scopes });
        return result.accessToken;
      }
      throw error;
    }
  };
}

import { Configuration, LogLevel } from "@azure/msal-browser";

/**
 * Delegated, READ-ONLY Graph scopes required for the IAM assessment.
 * All are admin-consent scopes; an admin consents once. No write scopes are
 * ever requested — this tool only reads tenant configuration.
 */
export const GRAPH_SCOPES = [
  "User.Read",
  "Directory.Read.All",
  "Policy.Read.All",
  "AuditLog.Read.All",
  "RoleManagement.Read.Directory",
  "Organization.Read.All",
  // Intune (device compliance) — read-only.
  "DeviceManagementConfiguration.Read.All",
  "DeviceManagementManagedDevices.Read.All",
  // Defender / Microsoft Secure Score — read-only.
  "SecurityEvents.Read.All",
];

/**
 * Per-resource scope sets. The Defender for Endpoint API is a SEPARATE resource
 * from Microsoft Graph (the WindowsDefenderATP API), so it needs its own token
 * with a different audience. Used only by the desktop build.
 */
export const RESOURCE_SCOPES = {
  graph: GRAPH_SCOPES,
  defenderEndpoint: ["https://api.security.microsoft.com/.default"],
};

const clientId = process.env.NEXT_PUBLIC_AAD_CLIENT_ID ?? "";
// "organizations" = any work/school tenant; override with a specific tenant id.
const tenant = process.env.NEXT_PUBLIC_AAD_TENANT_ID ?? "organizations";

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenant}`,
    redirectUri:
      typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
  },
  cache: {
    // Tenant data and tokens stay in the browser session only.
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Warning,
      piiLoggingEnabled: false,
      loggerCallback: () => {
        /* no-op: never log tokens or PII */
      },
    },
  },
};

/** The app cannot run without a configured client id (app registration). */
export function isMsalConfigured(): boolean {
  return Boolean(clientId);
}

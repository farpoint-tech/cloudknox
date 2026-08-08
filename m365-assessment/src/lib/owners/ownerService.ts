/**
 * Enterprise App owner management — browser equivalent of the
 * scripts/enterprise-apps-owner-assignment PowerShell workflow.
 *
 * Mirrors the hardening decisions made there:
 *   - only real Enterprise Apps (servicePrincipalType eq 'Application',
 *     Microsoft first-party apps excluded via well-known tenant ids)
 *   - OData single quotes escaped in user-supplied filter values
 *   - GUIDs validated before they are placed into a request path
 *   - existing owners are never removed; assignment only adds
 */

import { GraphClient, GraphError } from "../graph/graphClient";

/** Well-known Microsoft tenant ids whose first-party SPs are excluded. */
export const MICROSOFT_TENANT_IDS = [
  "f8cdef31-a31e-4b4a-93e4-5f571e91255a",
  "72f988bf-86f1-41af-91ab-2d7cd011db47",
];

export const NO_TAG_CATEGORY = "(no tag)";

export interface OwnerRef {
  id: string;
  displayName?: string;
  userPrincipalName?: string;
  odataType?: string;
}

export interface EnterpriseApp {
  id: string;
  appId: string;
  displayName: string;
  tags: string[];
  appOwnerOrganizationId?: string;
  owners: OwnerRef[];
}

export interface GraphUser {
  id: string;
  displayName: string;
  userPrincipalName: string;
}

export interface AssignmentResult {
  app: EnterpriseApp;
  status: "assigned" | "skipped-has-owner" | "error";
  message?: string;
}

const GUID_RE = /^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$/;

export function isGuid(value: string): boolean {
  return GUID_RE.test(value);
}

/** Escape single quotes for use inside an OData string literal. */
export function escapeODataValue(value: string): string {
  return value.replace(/'/g, "''");
}

/** First tag as category, matching the PowerShell scripts' grouping. */
export function categoryOf(app: Pick<EnterpriseApp, "tags">): string {
  return app.tags.length > 0 ? app.tags[0] : NO_TAG_CATEGORY;
}

export function isMicrosoftOwned(app: Pick<EnterpriseApp, "appOwnerOrganizationId">): boolean {
  const org = (app.appOwnerOrganizationId ?? "").toLowerCase();
  return MICROSOFT_TENANT_IDS.includes(org);
}

interface RawServicePrincipal {
  id: string;
  appId: string;
  displayName?: string;
  tags?: string[];
  appOwnerOrganizationId?: string;
  owners?: Array<{
    id: string;
    displayName?: string;
    userPrincipalName?: string;
    "@odata.type"?: string;
  }>;
}

/**
 * List all Enterprise Apps with their owners, fully paginated.
 * Owners are expanded server-side so large tenants need one call chain,
 * not one owner request per app.
 */
export async function listEnterpriseApps(graph: GraphClient): Promise<EnterpriseApp[]> {
  const raw = await graph.getAll<RawServicePrincipal>("/servicePrincipals", {
    query:
      "$filter=servicePrincipalType eq 'Application'" +
      "&$select=id,appId,displayName,tags,appOwnerOrganizationId" +
      "&$expand=owners",
  });

  return raw
    .map((sp) => ({
      id: sp.id,
      appId: sp.appId,
      displayName: sp.displayName ?? "",
      tags: sp.tags ?? [],
      appOwnerOrganizationId: sp.appOwnerOrganizationId,
      owners: (sp.owners ?? []).map((o) => ({
        id: o.id,
        displayName: o.displayName,
        userPrincipalName: o.userPrincipalName,
        odataType: o["@odata.type"],
      })),
    }))
    .filter((app) => !isMicrosoftOwned(app));
}

/** Resolve a user by UPN; returns null when not found. */
export async function resolveUserByUpn(
  graph: GraphClient,
  upn: string,
): Promise<GraphUser | null> {
  const safe = escapeODataValue(upn.trim());
  const users = await graph.getAll<GraphUser>("/users", {
    query: `$filter=userPrincipalName eq '${safe}'&$select=id,displayName,userPrincipalName`,
  });
  return users[0] ?? null;
}

/**
 * Assign one owner to each selected app. Apps that already have at least one
 * owner are skipped (assignment only ever adds a missing owner — identical to
 * the PowerShell scripts). Ids are validated as GUIDs before any request.
 */
export async function assignOwner(
  graph: GraphClient,
  apps: EnterpriseApp[],
  ownerUserId: string,
): Promise<AssignmentResult[]> {
  if (!isGuid(ownerUserId)) {
    throw new Error(`Invalid owner user id: ${ownerUserId}`);
  }

  const results: AssignmentResult[] = [];
  for (const app of apps) {
    if (!isGuid(app.id)) {
      results.push({ app, status: "error", message: "Invalid service principal id" });
      continue;
    }
    if (app.owners.length > 0) {
      results.push({ app, status: "skipped-has-owner" });
      continue;
    }
    try {
      await graph.post(`/servicePrincipals/${app.id}/owners/$ref`, {
        "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${ownerUserId}`,
      });
      results.push({ app, status: "assigned" });
    } catch (e) {
      const message = e instanceof GraphError ? e.message : String(e);
      results.push({ app, status: "error", message });
    }
  }
  return results;
}

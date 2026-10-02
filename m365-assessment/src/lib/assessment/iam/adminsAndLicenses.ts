import { Finding } from "../../engine/types";
import { GraphClient, GraphError } from "../../graph/graphClient";
import { AAD_PREMIUM_P2_PLAN, DOCS, PRIVILEGED_ROLE_IDS } from "./entraRoles";
import { SubscribedSku } from "./graphTypes";

export interface AdminLicenseInput {
  /** Tenant has an Entra ID P2 service plan provisioned. */
  hasP2: boolean;
  /** Number of PIM eligible role-assignment instances. 0 = PIM not in use. */
  pimEligibleCount: number;
  /** Number of standing (permanent) privileged role assignments. */
  activeAdminAssignments: number;
  /** Distinct users holding a privileged role. */
  distinctAdmins: number;
  /** UPNs of admins without a P2 license (only meaningful when PIM is used). */
  adminsMissingP2: string[];
  /** True if PIM eligibility could not be read (e.g. no P2 / missing perm). */
  pimUnavailable: boolean;
}

export function analyzeAdminsAndLicenses(input: AdminLicenseInput): Finding[] {
  const findings: Finding[] = [];

  // 1) Entra ID P2 availability.
  findings.push(
    input.hasP2
      ? mk("iam.license.p2", "Entra ID P2 licensing", "pass", "info",
          "Entra ID P2 is available in the tenant (enables PIM, risk policies, access reviews).")
      : mk("iam.license.p2", "Entra ID P2 licensing", "warning", "medium",
          "No Entra ID P2 plan detected — PIM, risk-based policies and access reviews are unavailable.",
          "Consider Entra ID P2 for privileged accounts to enable just-in-time access via PIM.",
          undefined, DOCS.pim),
  );

  // 2) PIM usage.
  if (input.hasP2) {
    if (input.pimUnavailable) {
      findings.push(mk("iam.pim.usage", "Privileged Identity Management", "error", "medium",
        "PIM eligibility could not be read (permission or API error).",
        "Grant RoleManagement.Read.Directory and re-run.", undefined, DOCS.pim));
    } else if (input.pimEligibleCount === 0) {
      findings.push(mk("iam.pim.usage", "Privileged Identity Management", "fail", "high",
        "P2 is available but PIM is not in use — no eligible role assignments exist.",
        "Convert standing admin assignments to PIM eligible (just-in-time) assignments.",
        undefined, DOCS.pim));
    } else {
      findings.push(mk("iam.pim.usage", "Privileged Identity Management", "pass", "info",
        `PIM is in use — ${input.pimEligibleCount} eligible role assignment(s).`,
        undefined, undefined, DOCS.pim));
    }
  }

  // 3) Standing privileged access.
  if (input.activeAdminAssignments > 0 && input.hasP2 && input.pimEligibleCount > 0) {
    findings.push(mk("iam.pim.standing-access", "Standing privileged access", "warning", "medium",
      `${input.activeAdminAssignments} standing (always-on) privileged assignment(s) remain across ${input.distinctAdmins} admin(s).`,
      "Move remaining standing assignments to PIM eligible to minimise always-on privilege.",
      undefined, DOCS.pim));
  }

  // 4) Admin P2 license coverage (eligible admins must be P2-licensed).
  if (input.hasP2 && input.pimEligibleCount > 0 && input.adminsMissingP2.length > 0) {
    findings.push(mk("iam.license.admin-p2", "Admin P2 license coverage", "fail", "high",
      `${input.adminsMissingP2.length} admin(s) using PIM lack an assigned Entra ID P2 license.`,
      "Assign an Entra ID P2 license to every admin that uses PIM eligible assignments.",
      input.adminsMissingP2.slice(0, 25), DOCS.pim));
  }

  return findings;
}

function mk(
  id: string,
  title: string,
  status: Finding["status"],
  severity: Finding["severity"],
  summary: string,
  recommendation?: string,
  evidence?: unknown,
  docsUrl: string = DOCS.pim,
): Finding {
  return { id, domain: "iam", title, status, severity, summary, recommendation, evidence, docsUrl };
}

interface RoleAssignment {
  roleDefinitionId?: string;
  principalId?: string;
  principal?: { "@odata.type"?: string; id?: string; userPrincipalName?: string };
}

interface EligibilityInstance {
  roleDefinitionId?: string;
  principalId?: string;
}

interface LicenseDetail {
  servicePlans?: { servicePlanName?: string }[];
}

export async function runAdminsAndLicenses(graph: GraphClient): Promise<Finding[]> {
  // Tenant P2 availability.
  const skus = await graph.getAll<SubscribedSku>("/subscribedSkus");
  const hasP2 = skus.some((s) =>
    (s.servicePlans ?? []).some((p) => p.servicePlanName === AAD_PREMIUM_P2_PLAN),
  );

  // Standing privileged assignments (expand principals to get UPNs).
  const assignments = await graph.getAll<RoleAssignment>(
    "/roleManagement/directory/roleAssignments",
    { query: "$expand=principal" },
  );
  const adminAssignments = assignments.filter(
    (a) => a.roleDefinitionId && PRIVILEGED_ROLE_IDS.has(a.roleDefinitionId),
  );
  const adminUsers = new Map<string, string>(); // id -> upn
  for (const a of adminAssignments) {
    const p = a.principal;
    if (p && p["@odata.type"]?.includes("user") && p.id) {
      adminUsers.set(p.id, p.userPrincipalName ?? p.id);
    }
  }

  // PIM eligibility (needs P2; tolerate failure).
  let pimEligibleCount = 0;
  let pimUnavailable = false;
  try {
    const eligible = await graph.getAll<EligibilityInstance>(
      "/roleManagement/directory/roleEligibilityScheduleInstances",
    );
    pimEligibleCount = eligible.filter(
      (e) => e.roleDefinitionId && PRIVILEGED_ROLE_IDS.has(e.roleDefinitionId),
    ).length;
  } catch (e) {
    // 403 / 404 is expected on tenants without P2 — PIM simply isn't in use.
    // Any other error means we genuinely couldn't determine PIM state.
    const expected = e instanceof GraphError && (e.status === 403 || e.status === 404);
    pimUnavailable = !expected;
  }

  // P2 license coverage per admin (only worth checking when PIM is used).
  const adminsMissingP2: string[] = [];
  if (hasP2 && pimEligibleCount > 0) {
    for (const [id, upn] of Array.from(adminUsers.entries())) {
      try {
        const details = await graph.getAll<LicenseDetail>(`/users/${id}/licenseDetails`);
        const hasUserP2 = details.some((d) =>
          (d.servicePlans ?? []).some((p) => p.servicePlanName === AAD_PREMIUM_P2_PLAN),
        );
        if (!hasUserP2) adminsMissingP2.push(upn);
      } catch {
        // Skip admins whose license details cannot be read.
      }
    }
  }

  return analyzeAdminsAndLicenses({
    hasP2,
    pimEligibleCount,
    activeAdminAssignments: adminAssignments.length,
    distinctAdmins: adminUsers.size,
    adminsMissingP2,
    pimUnavailable,
  });
}

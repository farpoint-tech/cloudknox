/**
 * Well-known Entra ID role template IDs and authentication-strength IDs used by
 * the IAM checks. These GUIDs are global (identical in every tenant).
 */

/** Highly privileged directory roles that MUST be protected by strong MFA. */
export const PRIVILEGED_ROLE_TEMPLATE_IDS: Record<string, string> = {
  "62e90394-69f5-4237-9190-012177145e10": "Global Administrator",
  "e8611ab8-c189-46e8-94e1-60213ab1f814": "Privileged Role Administrator",
  "194ae4cb-b126-40b2-bd5b-6091b380977d": "Security Administrator",
  "f28a1f50-f6e7-4571-818b-6a12f2af6b6c": "SharePoint Administrator",
  "29232cdf-9323-42fd-ade2-1d097af3e4de": "Exchange Administrator",
  "b1be1c3e-b65d-4f19-8427-f6fa0d97feb9": "Conditional Access Administrator",
  "729827e3-9c14-49f7-bb1b-9608f156bbb8": "Helpdesk Administrator",
  "b0f54661-2d74-4c50-afa3-1ec803f12efe": "Billing Administrator",
  "fe930be7-5e62-47db-91af-98c3a49a38b1": "User Administrator",
  "c4e39bd9-1100-46d3-8c65-fb160da0071f": "Authentication Administrator",
  "9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3": "Application Administrator",
  "158c047a-c907-4556-b7ef-446551a6b5f7": "Cloud Application Administrator",
  "966707d0-3269-4727-9be2-8c3a10f19b9d": "Password Administrator",
  "7be44c8a-adaf-4e2a-84d6-ab2649e08a13": "Privileged Authentication Administrator",
};

export const PRIVILEGED_ROLE_IDS = new Set(Object.keys(PRIVILEGED_ROLE_TEMPLATE_IDS));

/** Built-in Conditional Access authentication strengths. */
export const AUTH_STRENGTH = {
  multifactor: "00000000-0000-0000-0000-000000000002",
  passwordless: "00000000-0000-0000-0000-000000000003",
  phishingResistant: "00000000-0000-0000-0000-000000000004",
} as const;

/** Service plan name that indicates Entra ID P2 (required for PIM). */
export const AAD_PREMIUM_P2_PLAN = "AAD_PREMIUM_P2";

export const DOCS = {
  securityDefaults:
    "https://learn.microsoft.com/entra/fundamentals/security-defaults",
  conditionalAccess:
    "https://learn.microsoft.com/entra/identity/conditional-access/overview",
  mfaAdmins:
    "https://learn.microsoft.com/entra/identity/conditional-access/policy-all-users-mfa-strength",
  phishingResistant:
    "https://learn.microsoft.com/entra/identity/authentication/concept-authentication-strengths",
  authMethods:
    "https://learn.microsoft.com/entra/identity/authentication/concept-authentication-methods",
  pim: "https://learn.microsoft.com/entra/id-governance/privileged-identity-management/pim-configure",
  sspr: "https://learn.microsoft.com/entra/identity/authentication/concept-sspr-howitworks",
  authorizationPolicy:
    "https://learn.microsoft.com/graph/api/resources/authorizationpolicy",
} as const;

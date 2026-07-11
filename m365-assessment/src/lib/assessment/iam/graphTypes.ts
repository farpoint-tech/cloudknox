/** Raw Microsoft Graph shapes consumed by the IAM checks (only fields used). */

export interface SecurityDefaultsPolicy {
  isEnabled: boolean;
}

export interface CaGrantControls {
  builtInControls?: string[];
  operator?: string;
  authenticationStrength?: { id?: string; displayName?: string };
}

export interface CaConditions {
  users?: {
    includeUsers?: string[];
    excludeUsers?: string[];
    includeRoles?: string[];
    excludeRoles?: string[];
    includeGroups?: string[];
    excludeGroups?: string[];
  };
  applications?: {
    includeApplications?: string[];
    excludeApplications?: string[];
  };
  clientAppTypes?: string[];
}

export interface ConditionalAccessPolicy {
  id?: string;
  displayName?: string;
  /** "enabled" | "disabled" | "enabledForReportingButNotEnforced" */
  state?: string;
  conditions?: CaConditions;
  grantControls?: CaGrantControls;
}

/** /reports/authenticationMethods/userRegistrationDetails item. */
export interface UserRegistrationDetail {
  id?: string;
  userPrincipalName?: string;
  userDisplayName?: string;
  isAdmin?: boolean;
  isMfaCapable?: boolean;
  isMfaRegistered?: boolean;
  isSsprEnabled?: boolean;
  isSsprRegistered?: boolean;
  isPasswordlessCapable?: boolean;
  methodsRegistered?: string[];
}

export interface DirectoryRole {
  id?: string;
  displayName?: string;
  roleTemplateId?: string;
}

export interface ServicePlanInfo {
  servicePlanName?: string;
  provisioningStatus?: string;
}

export interface SubscribedSku {
  skuPartNumber?: string;
  servicePlans?: ServicePlanInfo[];
}

export interface AuthorizationPolicy {
  allowInvitesFrom?: string;
  allowedToUseSSPR?: boolean;
  defaultUserRolePermissions?: {
    allowedToCreateApps?: boolean;
    allowedToCreateSecurityGroups?: boolean;
    allowedToReadOtherUsers?: boolean;
  };
}

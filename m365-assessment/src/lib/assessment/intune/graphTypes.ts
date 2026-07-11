/** Raw Microsoft Graph shapes consumed by the Intune checks (only fields used). */

export interface DeviceManagementSettings {
  /** True = devices with no compliance policy are treated as NOT compliant. */
  secureByDefault?: boolean;
  /** Compliance status validity period in days (default 30, range 1-120). */
  deviceComplianceCheckinThresholdDays?: number;
  isScheduledActionEnabled?: boolean;
}

export interface DeviceManagement {
  settings?: DeviceManagementSettings;
}

export interface CompliancePolicy {
  id?: string;
  displayName?: string;
  "@odata.type"?: string;
}

export interface ManagedDevice {
  id?: string;
  deviceName?: string;
  operatingSystem?: string;
  /** compliant | noncompliant | conflict | error | inGracePeriod | unknown | configManager */
  complianceState?: string;
}

export const DOCS = {
  complianceOverview:
    "https://learn.microsoft.com/intune/device-security/compliance/overview#compliance-policy-settings",
  createPolicy:
    "https://learn.microsoft.com/intune/device-security/compliance/create-policy",
  conditionalAccess:
    "https://learn.microsoft.com/intune/device-security/conditional-access-integration/scenarios",
} as const;

/** Map a compliance policy @odata.type to a friendly platform name. */
export function platformFromODataType(odataType: string | undefined): string {
  const t = (odataType ?? "").toLowerCase();
  if (t.includes("macos")) return "macOS";
  if (t.includes("ios")) return "iOS";
  if (t.includes("android")) return "Android";
  if (t.includes("windows")) return "Windows";
  if (t.includes("linux")) return "Linux";
  return "Other";
}

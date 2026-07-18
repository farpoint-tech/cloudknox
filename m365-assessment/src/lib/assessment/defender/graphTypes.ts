/** Raw Microsoft Graph security shapes (Secure Score) consumed by Defender checks. */

export interface ControlScore {
  controlCategory?: string;
  controlName?: string;
  description?: string;
  score?: number;
}

export interface AverageComparativeScore {
  basis?: string; // AllTenants | TotalSeats | IndustryTypes
  averageScore?: number;
}

export interface SecureScore {
  id?: string;
  currentScore?: number;
  maxScore?: number;
  createdDateTime?: string;
  enabledServices?: string[];
  controlScores?: ControlScore[];
  averageComparativeScores?: AverageComparativeScore[];
}

export interface SecureScoreControlProfile {
  id?: string;
  title?: string;
  controlCategory?: string;
  /** v1.0 returns this as a number, but tolerate string. */
  maxScore?: number | string;
  rank?: number;
  remediation?: string;
  remediationImpact?: string;
  actionType?: string;
  actionUrl?: string;
  implementationCost?: string;
  userImpact?: string;
  service?: string;
  deprecated?: boolean;
}

export const DOCS = {
  secureScore: "https://learn.microsoft.com/defender-xdr/microsoft-secure-score",
} as const;

export function toNumber(v: number | string | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

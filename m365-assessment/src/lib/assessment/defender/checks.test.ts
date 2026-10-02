import { describe, expect, it } from "vitest";
import { analyzeSecureScore } from "./secureScore";
import { analyzeImprovementActions, pickLatest } from "./improvementActions";
import { ControlScore, SecureScore, SecureScoreControlProfile } from "./graphTypes";

describe("analyzeSecureScore", () => {
  it("passes when at or above the all-tenants average", () => {
    const score: SecureScore = {
      currentScore: 60,
      maxScore: 100,
      averageComparativeScores: [{ basis: "AllTenants", averageScore: 45 }],
    };
    const f = analyzeSecureScore(score);
    expect(f.status).toBe("pass");
    expect(f.summary).toContain("60%");
    expect(f.summary).toContain("45%");
  });

  it("fails when far below the all-tenants average", () => {
    const score: SecureScore = {
      currentScore: 20,
      maxScore: 100,
      averageComparativeScores: [{ basis: "AllTenants", averageScore: 45 }],
    };
    expect(analyzeSecureScore(score).status).toBe("fail");
  });

  it("is manual when the score is unavailable", () => {
    expect(analyzeSecureScore(undefined).status).toBe("manual");
  });
});

describe("analyzeImprovementActions", () => {
  const profiles: SecureScoreControlProfile[] = [
    { id: "MFARegistrationV2", title: "Ensure all users can complete MFA", maxScore: 10, remediation: "Register MFA", actionUrl: "https://portal/mfa" },
    { id: "AntiPhishPolicyV2", title: "Enable anti-phishing", maxScore: 8, remediation: "Enable anti-phish" },
    { id: "OldControl", title: "Deprecated", maxScore: 5, deprecated: true },
  ];

  it("ranks the biggest gaps first and flags not-implemented as fail", () => {
    const controlScores: ControlScore[] = [
      { controlName: "MFARegistrationV2", controlCategory: "Identity", score: 0 }, // gap 10, not implemented
      { controlName: "AntiPhishPolicyV2", controlCategory: "Apps", score: 4 }, // gap 4, partial
    ];
    const findings = analyzeImprovementActions(controlScores, profiles);
    expect(findings[0].title).toContain("Ensure all users can complete MFA");
    expect(findings[0].status).toBe("fail"); // score 0
    expect(findings[1].title).toContain("Enable anti-phishing");
    expect(findings[1].status).toBe("warning"); // partial
  });

  it("ignores controls with no gap", () => {
    const controlScores: ControlScore[] = [
      { controlName: "MFARegistrationV2", score: 10 }, // fully implemented
    ];
    expect(analyzeImprovementActions(controlScores, profiles)).toHaveLength(0);
  });
});

describe("pickLatest", () => {
  it("selects the most recent score by createdDateTime", () => {
    const scores: SecureScore[] = [
      { currentScore: 1, createdDateTime: "2026-01-01T00:00:00Z" },
      { currentScore: 2, createdDateTime: "2026-07-01T00:00:00Z" },
    ];
    expect(pickLatest(scores)?.currentScore).toBe(2);
  });
});

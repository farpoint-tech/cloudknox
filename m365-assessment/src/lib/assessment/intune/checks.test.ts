import { describe, expect, it } from "vitest";
import { analyzeComplianceSettings } from "./complianceSettings";
import { analyzeCompliancePolicies } from "./compliancePolicies";
import { analyzeDeviceCompliance } from "./deviceCompliance";
import { CompliancePolicy, ManagedDevice } from "./graphTypes";
import { Finding } from "../../engine/types";

function byId(findings: Finding[], id: string): Finding {
  const f = findings.find((x) => x.id === id);
  if (!f) throw new Error(`finding ${id} not found`);
  return f;
}

describe("analyzeComplianceSettings", () => {
  it("fails when secureByDefault is off", () => {
    const f = byId(
      analyzeComplianceSettings({ secureByDefault: false, deviceComplianceCheckinThresholdDays: 30 }),
      "intune.settings.secure-by-default",
    );
    expect(f.status).toBe("fail");
    expect(f.severity).toBe("high");
  });

  it("passes when secureByDefault is on", () => {
    const f = byId(
      analyzeComplianceSettings({ secureByDefault: true, deviceComplianceCheckinThresholdDays: 30 }),
      "intune.settings.secure-by-default",
    );
    expect(f.status).toBe("pass");
  });

  it("flags an overly long validity period", () => {
    const f = byId(
      analyzeComplianceSettings({ secureByDefault: true, deviceComplianceCheckinThresholdDays: 90 }),
      "intune.settings.validity-period",
    );
    expect(f.status).toBe("fail");
  });

  it("returns manual when settings are missing", () => {
    const f = byId(analyzeComplianceSettings(undefined), "intune.settings.secure-by-default");
    expect(f.status).toBe("manual");
  });
});

describe("analyzeCompliancePolicies", () => {
  it("fails when no policies exist", () => {
    expect(analyzeCompliancePolicies([])[0].status).toBe("fail");
  });

  it("passes and lists platforms when policies exist", () => {
    const policies: CompliancePolicy[] = [
      { displayName: "Win", "@odata.type": "#microsoft.graph.windows10CompliancePolicy" },
      { displayName: "iOS", "@odata.type": "#microsoft.graph.iosCompliancePolicy" },
    ];
    const f = analyzeCompliancePolicies(policies)[0];
    expect(f.status).toBe("pass");
    expect(f.summary).toContain("Windows");
    expect(f.summary).toContain("iOS");
  });
});

describe("analyzeDeviceCompliance", () => {
  it("is not-applicable with no devices", () => {
    expect(analyzeDeviceCompliance([])[0].status).toBe("not-applicable");
  });

  it("computes a compliance percentage and fails when low", () => {
    const devices: ManagedDevice[] = [
      { complianceState: "compliant" },
      { complianceState: "noncompliant" },
      { complianceState: "noncompliant" },
      { complianceState: "inGracePeriod" },
    ];
    const f = analyzeDeviceCompliance(devices)[0];
    expect(f.status).toBe("fail"); // 25% compliant
    expect(f.summary).toContain("25%");
  });
});

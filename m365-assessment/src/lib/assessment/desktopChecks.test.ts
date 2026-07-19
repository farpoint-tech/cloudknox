import { describe, expect, it } from "vitest";
import { analyzeMachines } from "./defenderEndpoint/machines";
import { analyzeAntiPhish } from "./exchange/antiPhish";
import { analyzeDlp } from "./dlp/policies";
import { parsePowerShellJson } from "./desktop";
import { Finding } from "../engine/types";

function byId(findings: Finding[], id: string): Finding {
  const f = findings.find((x) => x.id === id);
  if (!f) throw new Error(`finding ${id} not found`);
  return f;
}

describe("analyzeMachines (Defender for Endpoint)", () => {
  it("flags inactive sensors and high-risk devices", () => {
    const f = analyzeMachines([
      { computerDnsName: "pc1", healthStatus: "Active", riskScore: "Low", exposureLevel: "Low" },
      { computerDnsName: "pc2", healthStatus: "Inactive", riskScore: "High", exposureLevel: "High" },
    ]);
    expect(byId(f, "defenderEndpoint.sensor-health").status).toBe("warning");
    expect(byId(f, "defenderEndpoint.high-risk").status).toBe("fail");
    expect(byId(f, "defenderEndpoint.high-exposure").status).toBe("warning");
  });

  it("passes a healthy fleet", () => {
    const f = analyzeMachines([
      { computerDnsName: "pc1", healthStatus: "Active", riskScore: "None", exposureLevel: "Low" },
    ]);
    expect(byId(f, "defenderEndpoint.sensor-health").status).toBe("pass");
    expect(byId(f, "defenderEndpoint.high-risk").status).toBe("pass");
  });
});

describe("analyzeAntiPhish (Exchange)", () => {
  it("fails when spoof intelligence is off on the default policy", () => {
    const f = analyzeAntiPhish([
      { Name: "Default", IsDefault: true, Enabled: true, EnableSpoofIntelligence: false, PhishThresholdLevel: 1 },
    ]);
    expect(byId(f, "exchange.antiphish.spoof-intelligence").status).toBe("fail");
    expect(byId(f, "exchange.antiphish.threshold").status).toBe("warning");
  });

  it("passes a well-configured default policy", () => {
    const f = analyzeAntiPhish([
      {
        Name: "Default", IsDefault: true, Enabled: true,
        EnableSpoofIntelligence: true, EnableMailboxIntelligence: true,
        EnableMailboxIntelligenceProtection: true, PhishThresholdLevel: 3,
      },
    ]);
    expect(byId(f, "exchange.antiphish.spoof-intelligence").status).toBe("pass");
    expect(byId(f, "exchange.antiphish.mailbox-intelligence").status).toBe("pass");
    expect(byId(f, "exchange.antiphish.threshold").status).toBe("pass");
  });
});

describe("analyzeDlp (Purview)", () => {
  it("fails when no DLP policies exist", () => {
    expect(analyzeDlp([])[0].status).toBe("fail");
  });

  it("warns when policies are test-mode only", () => {
    const f = analyzeDlp([{ Name: "PII", Mode: "TestWithNotifications" }]);
    expect(byId(f, "dlp.enforced").status).toBe("warning");
  });

  it("passes when at least one policy is enforced", () => {
    const f = analyzeDlp([{ Name: "PII", Mode: "Enable", Workload: "Exchange, Teams" }]);
    expect(byId(f, "dlp.enforced").status).toBe("pass");
  });
});

describe("parsePowerShellJson", () => {
  it("wraps a single object into an array", () => {
    expect(parsePowerShellJson<{ a: number }>('{"a":1}')).toEqual([{ a: 1 }]);
  });
  it("returns an array as-is", () => {
    expect(parsePowerShellJson<number>("[1,2,3]")).toEqual([1, 2, 3]);
  });
  it("returns empty for empty output", () => {
    expect(parsePowerShellJson("   ")).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { toJson, toMarkdown, ReportInput } from "./report";
import { Finding } from "./types";

const findings: Finding[] = [
  {
    id: "iam.ca.mfa-admins",
    domain: "iam",
    title: "CA: MFA for admins",
    status: "fail",
    severity: "critical",
    summary: "No enabled policy requires MFA for admins.",
    recommendation: "Create a CA policy for admin roles.",
    docsUrl: "https://example/docs",
  },
  {
    id: "intune.settings.secure-by-default",
    domain: "intune",
    title: "Devices with no compliance policy",
    status: "pass",
    severity: "info",
    summary: "Secure default is on.",
  },
];

const input: ReportInput = {
  meta: {
    generatedAt: "2026-07-18T09:41:07.000Z",
    tenantName: "Contoso",
    tenantId: "11111111-1111-1111-1111-111111111111",
    account: "admin@contoso.com",
  },
  findings,
  errors: ["auth-methods: Insufficient privileges (HTTP 403)"],
};

describe("toMarkdown", () => {
  it("includes header metadata and groups by domain", () => {
    const md = toMarkdown(input);
    expect(md).toContain("# M365 Tenant Assessment");
    expect(md).toContain("Contoso");
    expect(md).toContain("admin@contoso.com");
    expect(md).toContain("## Identity & Access (IAM)");
    expect(md).toContain("## Intune — Device Compliance");
    expect(md).toContain("[FAIL · critical] CA: MFA for admins");
    expect(md).toContain("**Recommendation:** Create a CA policy for admin roles.");
    expect(md).toContain("## Checks that could not run");
  });
});

describe("toJson", () => {
  it("produces valid JSON with meta, summary, findings and errors", () => {
    const parsed = JSON.parse(toJson(input));
    expect(parsed.report).toBe("m365-tenant-assessment");
    expect(parsed.meta.tenantName).toBe("Contoso");
    expect(parsed.summary.fail).toBe(1);
    expect(parsed.summary.pass).toBe(1);
    expect(parsed.findings).toHaveLength(2);
    expect(parsed.errors).toHaveLength(1);
  });
});

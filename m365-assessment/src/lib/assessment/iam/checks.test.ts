import { describe, expect, it } from "vitest";
import { analyzeConditionalAccess } from "./conditionalAccess";
import { analyzeAuthMethods } from "./authMethods";
import { analyzeSecurityDefaults } from "./securityDefaults";
import { AUTH_STRENGTH } from "./entraRoles";
import { ConditionalAccessPolicy, UserRegistrationDetail } from "./graphTypes";
import { Finding } from "../../engine/types";

const GLOBAL_ADMIN = "62e90394-69f5-4237-9190-012177145e10";

function byId(findings: Finding[], id: string): Finding {
  const f = findings.find((x) => x.id === id);
  if (!f) throw new Error(`finding ${id} not found`);
  return f;
}

describe("analyzeConditionalAccess", () => {
  it("fails every baseline when there are no policies", () => {
    const f = analyzeConditionalAccess([]);
    expect(byId(f, "iam.ca.mfa-all-users").status).toBe("fail");
    expect(byId(f, "iam.ca.mfa-admins").status).toBe("fail");
    expect(byId(f, "iam.ca.phishing-resistant-admins").status).toBe("fail");
    expect(byId(f, "iam.ca.block-legacy-auth").status).toBe("fail");
  });

  it("passes MFA-for-all when an enabled policy covers all users and apps", () => {
    const policy: ConditionalAccessPolicy = {
      displayName: "MFA all",
      state: "enabled",
      conditions: {
        users: { includeUsers: ["All"] },
        applications: { includeApplications: ["All"] },
      },
      grantControls: { builtInControls: ["mfa"] },
    };
    expect(byId(analyzeConditionalAccess([policy]), "iam.ca.mfa-all-users").status).toBe("pass");
  });

  it("warns when the matching MFA policy is report-only", () => {
    const policy: ConditionalAccessPolicy = {
      displayName: "MFA all (report only)",
      state: "enabledForReportingButNotEnforced",
      conditions: {
        users: { includeUsers: ["All"] },
        applications: { includeApplications: ["All"] },
      },
      grantControls: { builtInControls: ["mfa"] },
    };
    expect(byId(analyzeConditionalAccess([policy]), "iam.ca.mfa-all-users").status).toBe("warning");
  });

  it("passes phishing-resistant admins with the built-in strength", () => {
    const policy: ConditionalAccessPolicy = {
      displayName: "Admins phishing-resistant",
      state: "enabled",
      conditions: { users: { includeRoles: [GLOBAL_ADMIN] } },
      grantControls: { authenticationStrength: { id: AUTH_STRENGTH.phishingResistant } },
    };
    const f = analyzeConditionalAccess([policy]);
    expect(byId(f, "iam.ca.mfa-admins").status).toBe("pass");
    expect(byId(f, "iam.ca.phishing-resistant-admins").status).toBe("pass");
  });
});

describe("analyzeAuthMethods", () => {
  it("flags admins without MFA as a critical failure", () => {
    const details: UserRegistrationDetail[] = [
      { userPrincipalName: "admin@x", isAdmin: true, isMfaCapable: false, isSsprEnabled: true },
      { userPrincipalName: "user@x", isAdmin: false, isMfaCapable: true },
    ];
    const f = analyzeAuthMethods(details);
    const admin = byId(f, "iam.authmethods.admin-mfa");
    expect(admin.status).toBe("fail");
    expect(admin.severity).toBe("critical");
  });

  it("passes admin MFA when all admins are capable", () => {
    const details: UserRegistrationDetail[] = [
      { userPrincipalName: "admin@x", isAdmin: true, isMfaCapable: true, isSsprEnabled: true },
    ];
    expect(byId(analyzeAuthMethods(details), "iam.authmethods.admin-mfa").status).toBe("pass");
  });
});

describe("analyzeSecurityDefaults", () => {
  it("is critical when disabled with no enabled CA policy", () => {
    const f = analyzeSecurityDefaults({ isEnabled: false }, []);
    expect(f.status).toBe("fail");
    expect(f.severity).toBe("critical");
  });

  it("passes when security defaults are enabled", () => {
    expect(analyzeSecurityDefaults({ isEnabled: true }, []).status).toBe("pass");
  });

  it("passes when disabled but an enabled CA policy exists", () => {
    const f = analyzeSecurityDefaults({ isEnabled: false }, [{ state: "enabled" }]);
    expect(f.status).toBe("pass");
  });
});

import { Finding } from "../../engine/types";

export interface Machine {
  id?: string;
  computerDnsName?: string;
  osPlatform?: string;
  /** Active | Inactive | ImpairedCommunication | NoSensorData */
  healthStatus?: string;
  /** Onboarded | CanBeOnboarded | Unsupported | InsufficientInfo */
  onboardingStatus?: string;
  /** None | Informational | Low | Medium | High */
  riskScore?: string;
  /** None | Low | Medium | High */
  exposureLevel?: string;
  lastSeen?: string;
}

const DOCS = "https://learn.microsoft.com/defender-endpoint/machines-view-overview";

/** Summarise Defender for Endpoint device health, risk and exposure. */
export function analyzeMachines(machines: Machine[]): Finding[] {
  const total = machines.length;
  if (total === 0) {
    return [
      mk("defenderEndpoint.devices.none", "Onboarded devices", "not-applicable", "info",
        "No devices were returned from Defender for Endpoint."),
    ];
  }

  const findings: Finding[] = [];

  // 1) Sensor health — devices not actively reporting are blind spots.
  const unhealthy = machines.filter(
    (m) => m.healthStatus && m.healthStatus !== "Active",
  );
  findings.push(
    unhealthy.length === 0
      ? mk("defenderEndpoint.sensor-health", "Sensor health", "pass", "info",
          `All ${total} devices are actively reporting.`)
      : mk("defenderEndpoint.sensor-health", "Sensor health", "warning", "medium",
          `${unhealthy.length}/${total} devices are not actively reporting (inactive / impaired).`,
          "Investigate devices with inactive or impaired sensors — they are protection blind spots.",
          unhealthy.slice(0, 25).map((m) => m.computerDnsName ?? m.id ?? "(unknown)")),
  );

  // 2) High-risk devices.
  const highRisk = machines.filter((m) => m.riskScore === "High");
  if (highRisk.length > 0) {
    findings.push(mk("defenderEndpoint.high-risk", "High-risk devices", "fail", "high",
      `${highRisk.length}/${total} devices have a High risk score.`,
      "Triage and remediate high-risk devices in the Defender portal.",
      highRisk.slice(0, 25).map((m) => m.computerDnsName ?? m.id ?? "(unknown)")));
  } else {
    findings.push(mk("defenderEndpoint.high-risk", "High-risk devices", "pass", "info",
      "No devices are currently High risk."));
  }

  // 3) High-exposure devices (unpatched vulnerabilities).
  const highExposure = machines.filter((m) => m.exposureLevel === "High");
  if (highExposure.length > 0) {
    findings.push(mk("defenderEndpoint.high-exposure", "High-exposure devices", "warning", "medium",
      `${highExposure.length}/${total} devices have High exposure (unmitigated vulnerabilities).`,
      "Apply the top security recommendations to reduce exposure.",
      highExposure.slice(0, 25).map((m) => m.computerDnsName ?? m.id ?? "(unknown)")));
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
): Finding {
  return { id, domain: "defenderEndpoint", title, status, severity, summary, recommendation, evidence, docsUrl: DOCS };
}

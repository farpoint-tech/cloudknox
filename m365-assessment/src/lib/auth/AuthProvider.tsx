"use client";

import { MsalProvider } from "@azure/msal-react";
import { PublicClientApplication } from "@azure/msal-browser";
import { ReactNode, useState } from "react";
import { msalConfig } from "./msalConfig";

/**
 * Wraps the app in an MsalProvider. The PublicClientApplication is created once
 * per session; MsalProvider handles initialize() internally (msal-react v2).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [instance] = useState(() => new PublicClientApplication(msalConfig));
  return <MsalProvider instance={instance}>{children}</MsalProvider>;
}

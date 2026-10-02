# Admin MFA Audit

Enumerates every user assigned to a privileged directory role in Microsoft Entra ID,
checks their registered authentication methods via the **Microsoft Graph Beta endpoint**,
and produces a formatted text report classified by MFA strength.

---

## How It Works

```
Connect-MgGraph
       │
       ▼
Get all activated directory roles (matching "Admin|Administrator|Global Reader")
       │
       ▼
For each role → iterate members (users only)
       │
       ▼
Per user: query 6 auth-method endpoints in parallel (FIDO2, Authenticator,
          WHfB, Platform Passkeys, Software TOTP, Phone/SMS, Email)
       │
       ▼
Classify → Phishing-Resistant | Standard (Push/TOTP) | Weak (SMS/Phone) | No MFA
       │
       ▼
Write C:\Temp\AdminMfaAudit.txt  +  open in Notepad
```

### MFA Classification Logic

| Classification | Triggers |
|---|---|
| **Phishing-Resistant** | FIDO2 key, Windows Hello for Business, Authenticator Passkey, Platform Passkey |
| **Standard (Push/TOTP)** | Microsoft Authenticator push, Software TOTP token |
| **Weak (SMS/Phone)** | Phone call or SMS (no stronger method registered) |
| **No MFA** | No second factor registered at all |

> A user is promoted to the highest applicable tier. For example, a user with
> both SMS and a FIDO2 key is classified as **Phishing-Resistant**.

---

## Prerequisites

### PowerShell Version

PowerShell 5.1 or PowerShell 7+ (both supported).

### Required Module

```powershell
Install-Module Microsoft.Graph -Scope CurrentUser -Force
```

The script imports three sub-modules automatically:
- `Microsoft.Graph.Authentication`
- `Microsoft.Graph.Identity.DirectoryManagement`
- `Microsoft.Graph.Users`

### Required Permissions (Delegated)

| Permission | Purpose |
|---|---|
| `RoleManagement.Read.All` | Read directory role assignments |
| `UserAuthenticationMethod.Read.All` | Read registered auth methods for each user |
| `User.Read.All` | Read user display name and account status |

> The permissions are delegated (sign-in required). The signed-in account must
> hold at least **Global Reader** or a combination of the three roles above.

---

## Usage

```powershell
# Run directly
.\AdminMfaAudit.ps1
```

The script will:
1. Open an interactive Microsoft sign-in window (browser or device-code).
2. Print progress to the console as it processes each admin user.
3. Save the report to `C:\Temp\AdminMfaAudit.txt` and open it in Notepad.
4. Disconnect from Graph automatically on exit.

### Console Output Legend

```
[PHISH-RES]  → Phishing-resistant method registered
[STANDARD]   → Push notification or TOTP only
[SCHWACH]    → SMS / phone call only
[KEIN MFA]   → No MFA method at all
```

---

## Report Structure

The output file (`AdminMfaAudit.txt`) contains three sections:

### 1 – Summary Table

Fixed-width table with one row per admin user:

```
User                           | UPN                                          | Aktiv | Rollen                                                       | MFA | MFA Typ               | Details
-------------------------------+--------------...
Jane Smith                     | jane.smith@contoso.com                       | Ja    | Global Administrator                                         | JA  | Phishing-Resistant    | FIDO2: YubiKey 5
...
==============================...
Gesamt: 12 | Phishing-Resistant: 5 | Standard: 4 | Schwach: 2 | Kein MFA: 1
```

### 2 – Full Role List per User

All roles a user holds, untruncated:

```
Jane Smith: Global Administrator, Privileged Role Administrator
```

### 3 – Full MFA Details per User

Classification and all registered methods:

```
Jane Smith: [Phishing-Resistant] FIDO2: YubiKey 5; Windows Hello: LAPTOP-001
```

---

## Output File Location

```
C:\Temp\AdminMfaAudit.txt
```

The directory is created automatically if it does not exist.

---

## Limitations

- Only **user** role members are evaluated. Service principals and groups that
  hold a role are listed by role enumeration but skipped during MFA analysis.
- The script uses the **Beta** Microsoft Graph endpoint for authentication
  methods. Beta endpoints can change without notice.
- Passkey detection inside the Authenticator app relies on `deviceTag` matching
  `passkey|SupportPasskeyForSignIn`. Devices registered before Microsoft added
  the tag may not be detected correctly.
- The script must run **interactively** – no app-only / certificate-based auth
  is supported in the current version.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `Insufficient privileges` on connect | Account lacks one of the three required permissions | Consent to all three scopes or use a Global Admin account for the first run |
| User shows `KEIN MFA` but has Authenticator | Authenticator registered under a different tenant | Verify the user's home tenant |
| `Fehler bei <userId>` warning in console | API throttling or the user account was deleted mid-run | Re-run; transient errors are skipped with a warning |
| Notepad does not open | Running on Windows Server Core / headless | Comment out `notepad $outFile`; the file is still saved |

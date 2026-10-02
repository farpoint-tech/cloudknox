# Privileged Role Group Audit

Enumerates all activated directory roles in Microsoft Entra ID, checks which
**groups** (Security, Microsoft 365, or role-assignable) are assigned to those
roles, and flags any group that holds a known highly-privileged role.

Outputs a color-coded console table and exports a timestamped CSV file.

---

## Why This Matters

Assigning a group to a privileged Entra ID role means **every member of that
group inherits that privilege**. Group membership changes (e.g., via dynamic
rules, nested groups, or bulk imports) can silently grant admin access. This
script gives you a full picture of which groups carry that blast radius.

---

## How It Works

```
Connect-MgGraph
       │
       ▼
Get all activated directory roles
       │
       ▼
For each role → iterate members → filter to groups only
       │
       ▼
Check RoleTemplateId against known highly-privileged template list
       │
       ▼
Console output (color-coded)  +  CSV export
```

### Highly Privileged vs. Other Roles

The script ships with a curated list of 34 well-known privileged role template
IDs (Global Administrator, Security Administrator, Exchange Administrator,
etc.). Roles whose template ID is in that list are marked **IsHighlyPrivileged
= True** and shown in the red section of the console output. All other active
roles with group members appear in the yellow section.

You can extend the list by adding entries to `$PrivilegedRoleTemplates` at the
top of the script.

---

## Prerequisites

### PowerShell Version

PowerShell 5.1 or PowerShell 7+ (both supported; PS 7 recommended).

### Required Module

```powershell
Install-Module Microsoft.Graph -Scope CurrentUser -Force
```

The script imports two sub-modules:
- `Microsoft.Graph.Authentication`
- `Microsoft.Graph.Identity.DirectoryManagement`

### Required Permissions (Delegated)

| Permission | Purpose |
|---|---|
| `Directory.Read.All` | Read all directory objects including role members |
| `RoleManagement.Read.Directory` | Minimal alternative if `Directory.Read.All` is too broad |

> Both permissions are delegated. The signed-in account needs at least
> **Global Reader** to satisfy either scope.

---

## Usage

```powershell
.\PrivilegedRoleGroupAudit.ps1
```

The script:
1. Reuses an existing Graph session if one is already active; otherwise opens
   an interactive sign-in prompt.
2. Prints a color-coded summary to the console.
3. Exports a CSV file named `PrivilegedRoleGroups_<timestamp>.csv` to the
   **same directory as the script**.

### Re-using an Existing Session

If you run `AdminMfaAudit.ps1` first, its Graph session is automatically
reused — no second sign-in required.

---

## Console Output

```
=================================================================
  GROUPS IN HIGHLY PRIVILEGED ROLES (3 assignments)
=================================================================

RoleName                      GroupName                GroupId
--------                      ---------                -------
Global Administrator          SG-GlobalAdmins          xxxxxxxx-...
Privileged Role Administrator SG-PAM-Team              xxxxxxxx-...
Security Administrator        SG-SecOps                xxxxxxxx-...

-----------------------------------------------------------------
  GROUPS IN OTHER DIRECTORY ROLES (1 assignments)
-----------------------------------------------------------------

RoleName                      GroupName                GroupId
--------                      ---------                -------
Reports Reader                SG-Reporting             xxxxxxxx-...

Report exported to: C:\scripts\...\PrivilegedRoleGroups_20260502_143012.csv

-- Summary --
   Total group-role assignments : 4
   Highly privileged            : 3
   Other roles                  : 1
   Unique groups involved       : 4
```

---

## CSV Output

The exported CSV contains the following columns:

| Column | Description |
|---|---|
| `RoleName` | Display name of the directory role |
| `RoleTemplateId` | GUID identifying the role template |
| `GroupName` | Display name of the assigned group |
| `GroupId` | Object ID of the assigned group |
| `IsHighlyPrivileged` | `True` if the role is in the curated privilege list |

The file is sorted by `IsHighlyPrivileged` (descending) then `RoleName`, so
the most sensitive entries appear first.

---

## Extending the Privileged Role List

To add a role to the flagged set, find its template ID in the Entra portal
(`Roles and administrators` → select role → `Properties` → `Template ID`)
and add an entry to `$PrivilegedRoleTemplates`:

```powershell
$PrivilegedRoleTemplates = @{
    # existing entries ...
    'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' = 'My Custom Role'
}
```

---

## Limitations

- Only **activated** roles are checked. A role that has never been assigned to
  anyone does not appear in `Get-MgDirectoryRole` and is therefore skipped.
- The script evaluates **direct** group membership in a role, not transitive
  membership (i.e., a group nested inside another group that holds a role is
  not reported here).
- The script does not evaluate **Privileged Identity Management (PIM)**
  eligible assignments — only permanent active assignments.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `Connect-MgGraph` hangs | No browser / device-code available | Add `-UseDeviceAuthentication` to the `Connect-MgGraph` call |
| CSV file not created | `$PSScriptRoot` is empty (dot-sourced or pasted into terminal) | Set `$PSScriptRoot` manually before running, e.g. `$PSScriptRoot = 'C:\Scripts'` |
| Role missing from output | Role has never been assigned; not yet activated | Roles appear in `Get-MgDirectoryRole` only after at least one assignment |
| `Insufficient privileges` | Account lacks `Directory.Read.All` | Re-connect with a Global Reader or Global Admin account |

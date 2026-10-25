#!/usr/bin/env bash
# Legt die Entra-App für "M365 Copilot, Weg B (Enterprise-App)" an und legt das Secret in den Schlüsselbund.
# Im eigenen Terminal ausführen, nach `az login --tenant <tenantId>` mit einem Konto, das Apps anlegen und
# Admin-Consent erteilen darf (z. B. Cloud Application Administrator + Privileged Role Administrator, oder Global Admin).
#
#   bash tools/m365-register-app.sh --tenant <tenant-guid> [--upn name@contoso.com] [--dry-run]
#
# Jeder Schritt wird vor der Ausführung angezeigt; jede Schreiboperation fragt einzeln nach (y/N).
# --dry-run zeigt nur, was passieren würde: Lesezugriffe (Tenant-Prüfung, Rechte-IDs) laufen, keine Schreibzugriffe.
# Das Secret wird nie ausgegeben; es geht direkt in den Schlüsselbund (Dienst m365-copilot-app, Konto $USER).
set -euo pipefail

APP_NAME="Nexus.365 AI Usage Deck"
GRAPH_APP_ID="00000003-0000-0000-c000-000000000000"
KEYCHAIN_SERVICE="m365-copilot-app"
PERMISSIONS=("Reports.Read.All" "Organization.Read.All" "User.Read.All")
GUID_RE='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
UPN_RE='^[A-Za-z0-9_][A-Za-z0-9._+-]{0,63}@[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$'

TENANT=""
UPN=""
DRY_RUN=0
CREATED=()

usage() {
	sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--tenant)
			[[ $# -ge 2 ]] || { echo "Fehler: --tenant braucht einen Wert" >&2; exit 2; }
			TENANT="$2"; shift 2 ;;
		--upn)
			[[ $# -ge 2 ]] || { echo "Fehler: --upn braucht einen Wert" >&2; exit 2; }
			UPN="$2"; shift 2 ;;
		--dry-run) DRY_RUN=1; shift ;;
		-h|--help) usage; exit 0 ;;
		*) echo "Fehler: unbekanntes Argument: $1" >&2; usage >&2; exit 2 ;;
	esac
done

if [[ -z "$TENANT" ]]; then
	echo "Fehler: --tenant <tenant-guid> fehlt (erwarteter Ziel-Tenant, wird gegen az account show geprüft)." >&2
	exit 2
fi
if [[ ! "$TENANT" =~ $GUID_RE ]]; then
	echo "Fehler: --tenant muss eine Tenant-GUID sein (keine Domain), erhalten: $TENANT" >&2
	exit 2
fi
TENANT="$(printf '%s' "$TENANT" | tr 'A-F' 'a-f')"
if [[ -n "$UPN" && ! "$UPN" =~ $UPN_RE ]]; then
	echo "Fehler: --upn muss die Form name@domain haben, erhalten: $UPN" >&2
	exit 2
fi

step() { printf '\n== %s\n' "$*"; }
show() { printf '   $ %s\n' "$*"; }

# Bricht ab und sagt, was bis hierhin angelegt wurde.
abort() {
	echo "" >&2
	echo "ABBRUCH: $1" >&2
	if [[ ${#CREATED[@]} -gt 0 ]]; then
		echo "Bereits angelegt (bleibt bestehen, ggf. im Entra-Portal prüfen/entfernen):" >&2
		printf '  - %s\n' "${CREATED[@]}" >&2
	else
		echo "Im Tenant wurde nichts geändert." >&2
	fi
	exit "${2:-1}"
}

# Fragt vor jeder Schreiboperation. Im Dry-Run: nur anzeigen, Rückgabe 1 (nicht ausführen).
confirm_write() {
	if [[ $DRY_RUN -eq 1 ]]; then
		echo "   [dry-run] würde ausführen (Schreibzugriff), nichts geändert"
		return 1
	fi
	local answer=""
	read -r -p "   Ausführen? [y/N] " answer </dev/tty || answer=""
	if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
		abort "Schritt abgelehnt, dieser Aufruf ging nicht raus. $1" 1
	fi
	return 0
}

# ---------------------------------------------------------------------------------------------------------------
step "1/8 Ziel-Tenant prüfen (lesen)"
show "az account show --query tenantId -o tsv"
if ! command -v az >/dev/null 2>&1; then
	abort "az CLI nicht gefunden (brew install azure-cli, dann az login --tenant $TENANT). Kein Aufruf ging raus." 3
fi
CURRENT_TENANT="$(az account show --query tenantId -o tsv 2>/dev/null || true)"
if [[ -z "$CURRENT_TENANT" ]]; then
	abort "az ist nicht angemeldet. Erst: az login --tenant $TENANT" 3
fi
CURRENT_TENANT="$(printf '%s' "$CURRENT_TENANT" | tr 'A-F' 'a-f')"
if [[ "$CURRENT_TENANT" != "$TENANT" ]]; then
	abort "az ist im Tenant $CURRENT_TENANT angemeldet, erwartet $TENANT. Erst: az login --tenant $TENANT" 3
fi
echo "   ok: $CURRENT_TENANT"
if [[ -z "$UPN" ]]; then
	UPN="$(az account show --query user.name -o tsv 2>/dev/null || true)"
	[[ "$UPN" =~ $UPN_RE ]] || UPN="<name@domain>"
fi

# ---------------------------------------------------------------------------------------------------------------
step "2/8 Gibt es die App schon? (lesen)"
show "az ad app list --display-name \"$APP_NAME\" --query \"[].appId\" -o tsv"
EXISTING="$(az ad app list --display-name "$APP_NAME" --query "[].appId" -o tsv 2>/dev/null || true)"
if [[ -n "$EXISTING" ]]; then
	echo "   Es gibt bereits App(s) mit dem Namen \"$APP_NAME\":"
	printf '     %s\n' $EXISTING
	abort "Kein Duplikat angelegt. Entscheiden: vorhandene App weiterverwenden (Schritte in tools/m365-app-setup.md ab 'API-Berechtigungen') oder alte App im Portal entfernen und neu starten." 4
fi
echo "   keine vorhanden"

# ---------------------------------------------------------------------------------------------------------------
step "3/8 Rechte-IDs der Microsoft-Graph-Anwendungsberechtigungen nachschlagen (lesen)"
ROLE_ARGS=()
for p in "${PERMISSIONS[@]}"; do
	show "az ad sp show --id $GRAPH_APP_ID --query \"appRoles[?value=='$p'].id\" -o tsv"
	rid="$(az ad sp show --id "$GRAPH_APP_ID" --query "appRoles[?value=='$p'].id" -o tsv 2>/dev/null || true)"
	if [[ ! "$rid" =~ $GUID_RE ]]; then
		abort "Rechte-ID für $p nicht gefunden (Antwort: '${rid:-leer}'). Kein Schreibzugriff erfolgt." 5
	fi
	echo "   $p = $rid"
	ROLE_ARGS+=("$rid=Role")
done

# ---------------------------------------------------------------------------------------------------------------
APP_ID="<appId>"
step "4/8 App-Registrierung anlegen (SCHREIBEN)"
show "az ad app create --display-name \"$APP_NAME\" --sign-in-audience AzureADMyOrg --query appId -o tsv"
if confirm_write "Nichts angelegt."; then
	APP_ID="$(az ad app create --display-name "$APP_NAME" --sign-in-audience AzureADMyOrg --query appId -o tsv)" \
		|| abort "az ad app create fehlgeschlagen. Ergebnis unbekannt: mit 'az ad app list --display-name \"$APP_NAME\"' prüfen." 6
	[[ "$APP_ID" =~ $GUID_RE ]] || abort "az ad app create lieferte keine appId. Ergebnis unbekannt: im Portal prüfen." 6
	CREATED+=("App-Registrierung \"$APP_NAME\" ($APP_ID)")
	echo "   angelegt: appId $APP_ID"
fi

# ---------------------------------------------------------------------------------------------------------------
step "5/8 Enterprise-App (Service Principal) anlegen (SCHREIBEN)"
show "az ad sp create --id $APP_ID"
if confirm_write "App-Registrierung existiert, Service Principal nicht."; then
	az ad sp create --id "$APP_ID" --query id -o tsv >/dev/null \
		|| abort "az ad sp create fehlgeschlagen. Ergebnis unbekannt: 'az ad sp show --id $APP_ID' prüfen." 6
	CREATED+=("Service Principal für $APP_ID")
	echo "   angelegt"
fi

# ---------------------------------------------------------------------------------------------------------------
step "6/8 Graph-Anwendungsberechtigungen eintragen: ${PERMISSIONS[*]} (SCHREIBEN)"
show "az ad app permission add --id $APP_ID --api $GRAPH_APP_ID --api-permissions ${ROLE_ARGS[*]}"
if confirm_write "Berechtigungen nicht eingetragen."; then
	az ad app permission add --id "$APP_ID" --api "$GRAPH_APP_ID" --api-permissions "${ROLE_ARGS[@]}" >/dev/null 2>&1 \
		|| abort "az ad app permission add fehlgeschlagen. Ergebnis unbekannt: 'az ad app permission list --id $APP_ID' prüfen." 6
	CREATED+=("API-Berechtigungen (noch ohne Consent)")
	echo "   eingetragen"
fi

# ---------------------------------------------------------------------------------------------------------------
step "7/8 Admin-Consent erteilen (SCHREIBEN)"
show "az ad app permission admin-consent --id $APP_ID"
if confirm_write "Berechtigungen eingetragen, aber ohne Consent (Graph antwortet 403)."; then
	if ! az ad app permission admin-consent --id "$APP_ID" >/dev/null 2>&1; then
		abort "Admin-Consent fehlgeschlagen (oft Replikation: 1–2 min warten). Ergebnis unbekannt. Erneut nur diesen Schritt: az ad app permission admin-consent --id $APP_ID – oder im Portal 'Administratorzustimmung erteilen'." 6
	fi
	CREATED+=("Admin-Consent für ${PERMISSIONS[*]}")
	echo "   erteilt"
fi

# ---------------------------------------------------------------------------------------------------------------
step "8/8 Client-Secret (12 Monate) erzeugen und direkt in den Schlüsselbund legen (SCHREIBEN, Tenant + lokal)"
show "az ad app credential reset --id $APP_ID --display-name ai-usage-deck --years 1 --append --query password -o tsv"
show "security add-generic-password -s $KEYCHAIN_SERVICE -a \"\$USER\" -w <secret, nicht angezeigt> -U"
if confirm_write "Kein Secret erzeugt."; then
	SECRET="$(az ad app credential reset --id "$APP_ID" --display-name ai-usage-deck --years 1 --append --query password -o tsv 2>/dev/null)" \
		|| abort "Secret-Erzeugung fehlgeschlagen. Ergebnis unbekannt: im Portal unter 'Zertifikate & Geheimnisse' prüfen." 6
	if [[ -z "$SECRET" ]]; then
		abort "az lieferte kein Secret. Im Portal unter 'Zertifikate & Geheimnisse' prüfen und ggf. löschen." 6
	fi
	CREATED+=("Client-Secret 'ai-usage-deck' (12 Monate)")
	if ! security add-generic-password -s "$KEYCHAIN_SERVICE" -a "$USER" -w "$SECRET" -U; then
		unset SECRET
		abort "Secret erzeugt, aber nicht im Schlüsselbund gespeichert. Secret im Portal löschen und Schritt 8 wiederholen." 7
	fi
	unset SECRET
	CREATED+=("Schlüsselbund-Eintrag $KEYCHAIN_SERVICE (Konto $USER)")
	echo "   Secret erzeugt und im Schlüsselbund gespeichert (nicht angezeigt)"
fi

# ---------------------------------------------------------------------------------------------------------------
echo ""
if [[ $DRY_RUN -eq 1 ]]; then
	echo "Dry-Run beendet: keine Schreibzugriffe ausgeführt."
fi
echo "tenantId: $TENANT"
echo "clientId: $APP_ID"
echo ""
echo "In die M365-Copilot-Taste (Property Inspector) eintragen:"
echo "  M365 Anmeldung  = Enterprise-App (Weg B)   (Setting m365Auth=app)"
echo "  M365 Tenant     = $TENANT"
echo "  Client-ID       = $APP_ID"
echo "  Benutzer (UPN)  = $UPN"
echo ""
echo "Prüfen: AI_USAGE_DECK_M365_AUTH=app AI_USAGE_DECK_M365_TENANT=$TENANT AI_USAGE_DECK_M365_CLIENT_ID=$APP_ID AI_USAGE_DECK_M365_UPN=$UPN node bin/cli.js doctor"
echo "Secret läuft in 12 Monaten ab: dann nur Schritt 8 wiederholen (az ad app credential reset … | security … -U)."

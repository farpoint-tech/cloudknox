import streamDeck, {
	action,
	SingletonAction,
	type DialDownEvent,
	type DialRotateEvent,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type KeyUpEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { Hub } from "../hub.js";
import type { ProviderId } from "../providers/types.js";
import { dataUrl, metricsFor, normalizeProviderSettings, svgTile, tileFor, type ProviderSettings } from "../render.js";
import type { Scheduler } from "../scheduler.js";

export type { ProviderSettings };

const LONG_PRESS_MS = 600;

const normalize = normalizeProviderSettings;

@action({ UUID: "tech.farpoint.ai-usage.provider" })
export class ProviderKey extends SingletonAction<ProviderSettings> {
	private settings = new Map<string, Required<ProviderSettings>>();
	/**
	 * showApiCost per key seen in this plugin session. Not cleared on disappear (page switch), so the weekly
	 * reconcile keeps the API cost of keys on other pages; only a settings change switches a key off.
	 */
	private apiByAction = new Map<string, ProviderId | undefined>();
	private downAt = new Map<string, number>();

	constructor(
		private hub: Hub,
		private sched: Scheduler,
	) {
		super();
		hub.onChange(() => void this.renderAll());
	}

	override async onWillAppear(ev: WillAppearEvent<ProviderSettings>): Promise<void> {
		this.settings.set(ev.action.id, normalize(ev.payload.settings));
		this.sched.keyAppeared();
		await this.render(ev.action.id);
		await this.syncApi(ev.action.id);
		await this.syncM365(ev.action.id);
	}

	override onWillDisappear(ev: WillDisappearEvent<ProviderSettings>): void {
		this.settings.delete(ev.action.id);
		this.sched.keyDisappeared();
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ProviderSettings>): Promise<void> {
		this.settings.set(ev.action.id, normalize(ev.payload.settings));
		await this.render(ev.action.id);
		await this.syncApi(ev.action.id);
		await this.syncM365(ev.action.id);
	}

	/** M365 Copilot keys hand tenantId, auth mode, client ID and UPN to the hub (persisted in state.json for CLI and reconcile). */
	private async syncM365(id: string): Promise<void> {
		const s = this.settings.get(id);
		if (s?.provider !== "m365copilot") return;
		await this.hub
			.setM365Config({ tenantId: s.tenantId, auth: s.m365Auth, clientId: s.clientId, upn: s.upn })
			.catch((e: unknown) => streamDeck.logger.warn(`m365 config: ${String(e)}`));
	}

	/** Hands the providers of all keys with showApiCost to the hub (persisted for the weekly reconcile). */
	private async syncApi(id: string): Promise<void> {
		const s = this.settings.get(id);
		if (!s) return;
		this.apiByAction.set(id, s.showApiCost ? s.provider : undefined);
		const ids = [...this.apiByAction.values()].filter((p): p is ProviderId => !!p);
		await this.hub.setApiProviders(ids, { persist: true }).catch((e: unknown) => streamDeck.logger.warn(`api: ${String(e)}`));
	}

	override onKeyDown(ev: KeyDownEvent<ProviderSettings>): void {
		this.downAt.set(ev.action.id, Date.now());
	}

	override async onKeyUp(ev: KeyUpEvent<ProviderSettings>): Promise<void> {
		const held = Date.now() - (this.downAt.get(ev.action.id) ?? Date.now());
		this.downAt.delete(ev.action.id);
		if (held >= LONG_PRESS_MS) await this.cycle(ev.action.id, 1);
		else await this.refresh(ev.action.id);
	}

	override async onDialRotate(ev: DialRotateEvent<ProviderSettings>): Promise<void> {
		await this.cycle(ev.action.id, ev.payload.ticks > 0 ? 1 : -1);
	}

	override async onDialDown(ev: DialDownEvent<ProviderSettings>): Promise<void> {
		await this.refresh(ev.action.id);
	}

	private async cycle(id: string, dir: 1 | -1): Promise<void> {
		const cur = this.settings.get(id) ?? normalize({});
		const metrics = metricsFor(cur.showApiCost);
		const i = metrics.indexOf(cur.metric);
		const next = { ...cur, metric: metrics[(i + dir + metrics.length) % metrics.length] };
		this.settings.set(id, next);
		const a = this.actions.find((x) => x.id === id);
		await a?.setSettings(next);
		await this.render(id);
	}

	private async refresh(id: string): Promise<void> {
		const p = (this.settings.get(id) ?? normalize({})).provider;
		await Promise.all([this.hub.refreshSub([p], { force: true }), this.hub.refreshTokens([p]), this.hub.refreshApi([p])]);
		const a = this.actions.find((x) => x.id === id);
		if (a?.isKey()) await a.showOk().catch(() => undefined);
	}

	private async renderAll(): Promise<void> {
		for (const a of this.actions) await this.render(a.id);
	}

	private async render(id: string): Promise<void> {
		const a = this.actions.find((x) => x.id === id);
		const s = this.settings.get(id);
		if (!a || !s) return;
		const tile = tileFor(s.provider, this.hub.views.get(s.provider) ?? {}, s.metric);
		try {
			if (a.isDial()) {
				await a.setFeedback({ title: tile.title, value: tile.big, indicator: { value: tile.barPct ?? 0 } });
			} else if (a.isKey()) {
				await a.setImage(dataUrl(svgTile(tile)));
			}
		} catch (e) {
			streamDeck.logger.warn(`render ${id}: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
}

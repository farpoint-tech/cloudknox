import streamDeck, { action, SingletonAction, type KeyUpEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import type { Hub } from "../hub.js";
import { dataUrl, svgOverview } from "../render.js";
import type { Scheduler } from "../scheduler.js";

@action({ UUID: "tech.farpoint.ai-usage.overview" })
export class OverviewKey extends SingletonAction {
	constructor(
		private hub: Hub,
		private sched: Scheduler,
	) {
		super();
		hub.onChange(() => void this.renderAll());
	}

	override async onWillAppear(_ev: WillAppearEvent): Promise<void> {
		this.sched.keyAppeared();
		await this.renderAll();
	}

	override onWillDisappear(_ev: WillDisappearEvent): void {
		this.sched.keyDisappeared();
	}

	override async onKeyUp(ev: KeyUpEvent): Promise<void> {
		await Promise.all([this.hub.refreshSub(undefined, { force: true }), this.hub.refreshTokens(), this.hub.refreshApi()]);
		await ev.action.showOk().catch(() => undefined);
	}

	private async renderAll(): Promise<void> {
		const img = dataUrl(svgOverview(this.hub.views));
		for (const a of this.actions) {
			if (!a.isKey()) continue;
			await a.setImage(img).catch((e: unknown) => streamDeck.logger.warn(`overview: ${String(e)}`));
		}
	}
}

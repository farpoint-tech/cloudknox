import streamDeck, {
	action,
	SingletonAction,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type KeyUpEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { Hub } from "../hub.js";
import { dataUrl, svgResets } from "../render.js";
import { blinkInfo, normalizeBlinkHours, topResets } from "../resets.js";
import type { Scheduler } from "../scheduler.js";

export type ResetsSettings = {
	/** Hours ahead counted for the blink rule (property inspector sends a string). */
	blinkWindowHours?: number | string;
};

const LONG_PRESS_MS = 600;
const TICK_MS = 1000;
export const MUTE_MS = 3600_000;

interface Instance {
	hours: number;
	timer?: NodeJS.Timeout;
	/** Current blink phase; true = amber frame. */
	alt: boolean;
	/** Last image sent, so the 1 s tick only calls setImage when something changed. */
	lastImage?: string;
}

/**
 * "Nächste Resets": the two soonest subscription resets of all providers.
 * Blinks (normal ↔ amber every second) while more than two resets fall within blinkWindowHours.
 */
@action({ UUID: "tech.farpoint.ai-usage.resets" })
export class ResetsKey extends SingletonAction<ResetsSettings> {
	private inst = new Map<string, Instance>();
	private downAt = new Map<string, number>();
	/** Epoch ms until which blinking is muted (long press), per key; survives page switches, not a plugin restart. */
	private mutedUntil = new Map<string, number>();

	constructor(
		private hub: Hub,
		private sched: Scheduler,
	) {
		super();
		hub.onChange(() => {
			for (const id of this.inst.keys()) void this.render(id);
		});
	}

	override async onWillAppear(ev: WillAppearEvent<ResetsSettings>): Promise<void> {
		const id = ev.action.id;
		this.stopTimer(id);
		const inst: Instance = { hours: normalizeBlinkHours(ev.payload.settings.blinkWindowHours), alt: false };
		inst.timer = setInterval(() => void this.tick(id), TICK_MS);
		this.inst.set(id, inst);
		this.sched.keyAppeared();
		await this.render(id);
	}

	override onWillDisappear(ev: WillDisappearEvent<ResetsSettings>): void {
		this.stopTimer(ev.action.id);
		this.inst.delete(ev.action.id);
		this.downAt.delete(ev.action.id);
		this.sched.keyDisappeared();
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ResetsSettings>): Promise<void> {
		const inst = this.inst.get(ev.action.id);
		if (!inst) return;
		inst.hours = normalizeBlinkHours(ev.payload.settings.blinkWindowHours);
		await this.render(ev.action.id);
	}

	override onKeyDown(ev: KeyDownEvent<ResetsSettings>): void {
		this.downAt.set(ev.action.id, Date.now());
	}

	override async onKeyUp(ev: KeyUpEvent<ResetsSettings>): Promise<void> {
		const id = ev.action.id;
		const held = Date.now() - (this.downAt.get(id) ?? Date.now());
		this.downAt.delete(id);
		const inst = this.inst.get(id);
		if (held >= LONG_PRESS_MS && inst) {
			// Long press: toggle blink mute for one hour.
			this.mutedUntil.set(id, this.muted(id, Date.now()) ? 0 : Date.now() + MUTE_MS);
			inst.alt = false;
			await this.render(id);
			return;
		}
		await this.hub.refreshSub(undefined, { force: true });
		await ev.action.showOk().catch(() => undefined);
	}

	private muted(id: string, now: number): boolean {
		return (this.mutedUntil.get(id) ?? 0) > now;
	}

	private stopTimer(id: string): void {
		const t = this.inst.get(id)?.timer;
		if (t) clearInterval(t);
	}

	/** 1 s tick: flips the blink phase while the blink condition holds, otherwise returns to the normal frame. */
	private async tick(id: string): Promise<void> {
		const inst = this.inst.get(id);
		if (!inst) return;
		const now = Date.now();
		const blink = blinkInfo(this.hub.allResets(now), now, inst.hours).blink && !this.muted(id, now);
		inst.alt = blink ? !inst.alt : false;
		await this.render(id, now);
	}

	private async render(id: string, now = Date.now()): Promise<void> {
		const inst = this.inst.get(id);
		const a = this.actions.find((x) => x.id === id);
		if (!inst || !a?.isKey()) return;
		const { shown, hidden } = topResets(this.hub.allResets(now), now);
		const img = dataUrl(svgResets({ shown, hidden, alt: inst.alt, muted: this.muted(id, now) }, now));
		if (img === inst.lastImage) return;
		inst.lastImage = img;
		await a.setImage(img).catch((e: unknown) => streamDeck.logger.warn(`resets ${id}: ${String(e)}`));
	}
}

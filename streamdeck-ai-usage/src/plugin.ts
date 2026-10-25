import streamDeck from "@elgato/streamdeck";
import { OverviewKey } from "./actions/overview-key.js";
import { ProviderKey } from "./actions/provider-key.js";
import { ResetsKey } from "./actions/resets-key.js";
import { Hub } from "./hub.js";
import { Scheduler } from "./scheduler.js";

streamDeck.logger.setLevel("info");

const hub = new Hub();
const sched = new Scheduler(hub, (level, msg) => streamDeck.logger[level](msg));

streamDeck.actions.registerAction(new ProviderKey(hub, sched));
streamDeck.actions.registerAction(new OverviewKey(hub, sched));
streamDeck.actions.registerAction(new ResetsKey(hub, sched));

await streamDeck.connect();
await sched.start();

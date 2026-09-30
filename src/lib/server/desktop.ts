import "server-only";
import { getCache } from "@vercel/functions";

/**
 * Rendezvous for the TuneDeck desktop app (desktop/). The PC polls to say it is online and
 * to pick up WebRTC offers; phones then connect to it directly over the local network.
 * Only a few KB of SDP pass through here, kept in the Runtime Cache so Postgres can sleep.
 */

export interface DesktopInfo {
  id: string;
  name: string;
  at: number;
}

export interface Offer {
  sid: string;
  sdp: string;
  device: string;
  at: number;
}

const cache = () => getCache({ namespace: "desktop" });
/** The PC polls every few seconds; after this long without a poll it is considered closed. */
export const ONLINE_MS = 30_000;

export async function markOnline(info: DesktopInfo) {
  await cache().set("pc", info, { ttl: 60 });
}

export async function desktopStatus(): Promise<DesktopInfo | null> {
  const pc = (await cache().get("pc")) as DesktopInfo | undefined;
  return pc && Date.now() - pc.at < ONLINE_MS ? pc : null;
}

export async function pushOffer(offer: Offer) {
  const inbox = ((await cache().get("inbox")) as Offer[] | undefined) ?? [];
  const fresh = inbox.filter((o) => Date.now() - o.at < 60_000 && o.sid !== offer.sid);
  await cache().set("inbox", [...fresh, offer], { ttl: 120 });
}

export async function takeOffers(): Promise<Offer[]> {
  const inbox = ((await cache().get("inbox")) as Offer[] | undefined) ?? [];
  if (!inbox.length) return [];
  await cache().delete("inbox");
  return inbox.filter((o) => Date.now() - o.at < 60_000);
}

export async function setAnswer(sid: string, sdp: string) {
  await cache().set(`answer:${sid}`, sdp, { ttl: 120 });
}

export async function getAnswer(sid: string): Promise<string | null> {
  return ((await cache().get(`answer:${sid}`)) as string | undefined) ?? null;
}

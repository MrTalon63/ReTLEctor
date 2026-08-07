import kv from "./kv";
import log from "./logger";

export const LOCKOUT_KEY = "celestrak_lockout_until";
export const LOCKOUT_DURATION_MS = 24 * 60 * 60 * 1000;

export async function isCelestrakLockedOut(): Promise<{ locked: boolean; untilIso?: string; untilMs?: number }> {
	const lockoutUntil = (await kv.get(LOCKOUT_KEY)) as number | null;
	if (!lockoutUntil) return { locked: false };

	const now = Date.now();
	if (now < lockoutUntil) {
		return {
			locked: true,
			untilIso: new Date(lockoutUntil).toISOString(),
			untilMs: lockoutUntil,
		};
	}

	await kv.delete(LOCKOUT_KEY);
	return { locked: false };
}

export async function triggerCelestrakLockout(status: number, context: string): Promise<number> {
	const lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
	await kv.set(LOCKOUT_KEY, lockoutUntil);
	const isoStr = new Date(lockoutUntil).toISOString();
	log.error(
		`Celestrak returned HTTP ${status} during ${context}. Initiating 24-hour lockout until ${isoStr}. No further requests will be sent to Celestrak during this period.`,
	);
	return lockoutUntil;
}

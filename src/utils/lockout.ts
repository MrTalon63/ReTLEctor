import kv from "./kv";
import log from "./logger";
import config from "./config";

export const LOCKOUT_KEY = "celestrak_lockout_until";

export function formatLockoutDuration(ms: number = config.celestrakLockDuration): string {
	const totalMinutes = Math.round(ms / (60 * 1000));
	if (totalMinutes < 60) {
		return `${totalMinutes}m`;
	}
	const hours = ms / (60 * 60 * 1000);
	if (Number.isInteger(hours)) {
		return `${hours}h`;
	}
	return `${hours.toFixed(1)}h`;
}

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

export async function triggerCelestrakLockout(status: number, context: string): Promise<number | null> {
	if (status === 404) {
		log.debug(`Celestrak returned HTTP 404 during ${context}. Skipping lockout.`);
		return null;
	}
	const lockoutUntil = Date.now() + config.celestrakLockDuration;
	await kv.set(LOCKOUT_KEY, lockoutUntil);
	const isoStr = new Date(lockoutUntil).toISOString();
	log.error(
		`Celestrak returned HTTP ${status} during ${context}. Initiating ${formatLockoutDuration()} lockout until ${isoStr}. No further requests will be sent to Celestrak during this period.`,
	);
	return lockoutUntil;
}

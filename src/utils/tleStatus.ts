import config from "./config";

export type TleFreshnessStatus = "fresh" | "stale" | "expired" | "never";

export interface TleStatusInfo {
	status: TleFreshnessStatus;
	label: string;
	isoDate: string;
}

export function formatRelativeTime(msAge: number): string {
	const seconds = Math.floor(msAge / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export function getTleFreshnessStatus(
	timestampVal: string | number | null | undefined,
	groupName: string,
	now: number = Date.now(),
): TleStatusInfo {
	if (!timestampVal) {
		return {
			status: "never",
			label: "Never",
			isoDate: "Never",
		};
	}

	const date = new Date(timestampVal);
	const timestampMs = date.getTime();
	if (isNaN(timestampMs)) {
		return {
			status: "never",
			label: "Never",
			isoDate: "Never",
		};
	}

	const ageMs = Math.max(0, now - timestampMs);
	const isoDate = date.toISOString();
	const label = formatRelativeTime(ageMs);

	const expectedDuration = groupName === "active" ? config.cacheActiveDuration : config.cacheDuration;

	if (ageMs <= expectedDuration) {
		return { status: "fresh", label, isoDate };
	} else if (ageMs <= expectedDuration * 2) {
		return { status: "stale", label, isoDate };
	} else {
		return { status: "expired", label, isoDate };
	}
}

const CODE_0 = 48; // '0'
const CODE_9 = 57; // '9'
const CODE_A = 65; // 'A'
const CODE_I = 73; // 'I' — reserved
const CODE_O = 79; // 'O' — reserved
const CODE_Z = 90; // 'Z'

const MAX_NORAD = 339999;

export function decode(s: string): number {
	if (typeof s !== "string" || s.length === 0) {
		throw new Error(`Invalid NORAD designator: ${String(s)}`);
	}

	const c = s.charCodeAt(0);

	if (c >= CODE_0 && c <= CODE_9) {
		if (!/^\d+$/.test(s)) {
			throw new Error(`Invalid NORAD designator: ${s}`);
		}
		const n = parseInt(s, 10);

		if (n > MAX_NORAD) {
			throw new Error(`NORAD ID ${n} exceeds Alpha-5 range (max ${MAX_NORAD})`);
		}
		return n;
	}

	if (c < CODE_A || c > CODE_Z || c === CODE_I || c === CODE_O) {
		throw new Error(`Invalid NORAD designator: ${s}`);
	}

	const tail = s.slice(1);
	if (!/^\d{4}$/.test(tail)) {
		throw new Error(`Invalid NORAD designator: ${s}`);
	}

	const skip = c > CODE_O ? 2 : c > CODE_I ? 1 : 0;
	const letterIdx = c - CODE_A - skip + 10;

	return letterIdx * 10000 + parseInt(tail, 10);
}

export function encode(n: number): string {
	if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
		throw new Error(`Invalid NORAD ID: ${String(n)}`);
	}

	if (n < 100000) {
		return String(n).padStart(5, "0");
	}

	if (n > MAX_NORAD) {
		throw new Error(`NORAD ID ${n} exceeds Alpha-5 range (max ${MAX_NORAD})`);
	}

	const high = Math.floor(n / 10000);
	const low = n % 10000;

	let charIdx = high - 10;
	if (charIdx >= 8) charIdx++; // skip I
	if (charIdx >= 14) charIdx++; // skip O

	return String.fromCharCode(CODE_A + charIdx) + String(low).padStart(4, "0");
}

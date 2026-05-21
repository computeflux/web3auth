/**
 * Transaction password — local password for authorizing transactions.
 *
 * Stored as SHA-256 hash in localStorage. Never sent to backend.
 */

const STORAGE_KEY = "web3auth:tx_password_hash";

/** Hash a password with SHA-256 */
export async function hashPassword(password: string): Promise<string> {
    // crypto.subtle requires HTTPS; fallback to pure JS SHA-256
    if (crypto.subtle) {
        const data = new TextEncoder().encode(password);
        const hash = await crypto.subtle.digest("SHA-256", data);
        return Array.from(new Uint8Array(hash))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    }
    return jsSHA256(password);
}

/** Pure JS SHA-256 for non-HTTPS environments */
function jsSHA256(input: string): string {
    function rotr(x: number, n: number) {
        return (x >>> n) | (x << (32 - n));
    }
    const K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
        0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
        0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
        0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
        0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
        0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
        0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
        0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];

    const bytes: number[] = [];
    for (let i = 0; i < input.length; i++) {
        bytes.push(input.charCodeAt(i) & 0xff);
    }
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while ((bytes.length + 8) % 64 !== 0) bytes.push(0);
    for (let i = 0; i < 8; i++) {
        bytes.push((bitLen >>> (56 - i * 8)) & 0xff);
    }

    let H = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
        0x1f83d9ab, 0x5be0cd19,
    ];

    for (let i = 0; i < bytes.length; i += 64) {
        const W = new Array(64);
        for (let t = 0; t < 16; t++) {
            W[t] =
                (bytes[i + t * 4] << 24) |
                (bytes[i + t * 4 + 1] << 16) |
                (bytes[i + t * 4 + 2] << 8) |
                bytes[i + t * 4 + 3];
        }
        for (let t = 16; t < 64; t++) {
            const s0 =
                rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
            const s1 =
                rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
            W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
        }

        let [a, b, c, d, e, f, g, h] = H;
        for (let t = 0; t < 64; t++) {
            const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const T1 = (h + S1 + ch + K[t] + W[t]) | 0;
            const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const T2 = (S0 + maj) | 0;
            h = g;
            g = f;
            f = e;
            e = (d + T1) | 0;
            d = c;
            c = b;
            b = a;
            a = (T1 + T2) | 0;
        }
        H[0] = (H[0] + a) | 0;
        H[1] = (H[1] + b) | 0;
        H[2] = (H[2] + c) | 0;
        H[3] = (H[3] + d) | 0;
        H[4] = (H[4] + e) | 0;
        H[5] = (H[5] + f) | 0;
        H[6] = (H[6] + g) | 0;
        H[7] = (H[7] + h) | 0;
    }

    return H.map((n) => n.toString(16).padStart(8, "0")).join("");
}

/** Check if a transaction password has been set */
export function hasTxPassword(): boolean {
    return !!localStorage.getItem(STORAGE_KEY);
}

/** Set the transaction password (stores hash) */
export async function setTxPassword(password: string): Promise<void> {
    if (password.length < 6)
        throw new Error("Password must be at least 6 characters");
    const hash = await hashPassword(password);
    localStorage.setItem(STORAGE_KEY, hash);
}

/** Verify a password against the stored hash */
export async function verifyTxPassword(password: string): Promise<boolean> {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return true; // no password set → allow
    const hash = await hashPassword(password);
    return hash === stored;
}

/** Remove the transaction password */
export function clearTxPassword(): void {
    localStorage.removeItem(STORAGE_KEY);
}

/**
 * Transaction password — local password for authorizing transactions.
 *
 * Uses PBKDF2 + HMAC challenge-response. Derived key is cached in memory only.
 * Never persists sensitive data to localStorage.
 */

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 32;

// 内存缓存（刷新丢失）
let _cachedDK: Uint8Array | null = null;
let _cachedSalt: string | null = null;

// ── subtle 可用性检测 ──

const _subtleAvailable =
    typeof crypto !== "undefined" &&
    typeof crypto.subtle === "object" &&
    crypto.subtle !== null;

// ── helpers ──

function bufToHex(b: Uint8Array): string {
    return Array.from(b)
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
}

function hexToBuf(h: string): Uint8Array {
    return new Uint8Array(h.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
}

// ── 纯 JS SHA256 fallback ──

function rotr(n: number, x: number): number {
    return (x >>> n) | (x << (32 - n));
}
function ch(x: number, y: number, z: number): number {
    return (x & y) ^ (~x & z);
}
function maj(x: number, y: number, z: number): number {
    return (x & y) ^ (x & z) ^ (y & z);
}
function ep0(x: number): number {
    return rotr(2, x) ^ rotr(13, x) ^ rotr(22, x);
}
function ep1(x: number): number {
    return rotr(6, x) ^ rotr(11, x) ^ rotr(25, x);
}
function sig0(x: number): number {
    return rotr(7, x) ^ rotr(18, x) ^ (x >>> 3);
}
function sig1(x: number): number {
    return rotr(17, x) ^ rotr(19, x) ^ (x >>> 10);
}

function jsSha256(msg: Uint8Array): Uint8Array {
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

    let h0 = 0x6a09e667,
        h1 = 0xbb67ae85,
        h2 = 0x3c6ef372,
        h3 = 0xa54ff53a;
    let h4 = 0x510e527f,
        h5 = 0x9b05688c,
        h6 = 0x1f83d9ab,
        h7 = 0x5be0cd19;

    const bitLen = msg.length * 8;
    const padLen = Math.ceil((msg.length + 9) / 64) * 64;
    const padded = new Uint8Array(padLen);
    padded.set(msg);
    padded[msg.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padLen - 4, bitLen, false);

    for (let i = 0; i < padLen; i += 64) {
        const w = new Uint32Array(64);
        for (let t = 0; t < 16; t++) {
            w[t] = view.getUint32(i + t * 4, false);
        }
        for (let t = 16; t < 64; t++) {
            w[t] =
                (sig1(w[t - 2]) + w[t - 7] + sig0(w[t - 15]) + w[t - 16]) >>> 0;
        }

        let a = h0,
            b = h1,
            c = h2,
            d = h3,
            e = h4,
            f = h5,
            g = h6,
            h = h7;
        for (let t = 0; t < 64; t++) {
            const t1 = (h + ep1(e) + ch(e, f, g) + K[t] + w[t]) >>> 0;
            const t2 = (ep0(a) + maj(a, b, c)) >>> 0;
            h = g;
            g = f;
            f = e;
            e = (d + t1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) >>> 0;
        }
        h0 = (h0 + a) >>> 0;
        h1 = (h1 + b) >>> 0;
        h2 = (h2 + c) >>> 0;
        h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0;
        h5 = (h5 + f) >>> 0;
        h6 = (h6 + g) >>> 0;
        h7 = (h7 + h) >>> 0;
    }

    const out = new Uint8Array(32);
    const outView = new DataView(out.buffer);
    outView.setUint32(0, h0, false);
    outView.setUint32(4, h1, false);
    outView.setUint32(8, h2, false);
    outView.setUint32(12, h3, false);
    outView.setUint32(16, h4, false);
    outView.setUint32(20, h5, false);
    outView.setUint32(24, h6, false);
    outView.setUint32(28, h7, false);
    return out;
}

function jsHmacSha256(key: Uint8Array, msg: Uint8Array): Uint8Array {
    const blockSize = 64;
    let k = key;
    if (k.length > blockSize) k = jsSha256(k);
    const ipad = new Uint8Array(blockSize);
    const opad = new Uint8Array(blockSize);
    for (let i = 0; i < blockSize; i++) {
        const b = i < k.length ? k[i] : 0;
        ipad[i] = b ^ 0x36;
        opad[i] = b ^ 0x5c;
    }
    const inner = new Uint8Array(blockSize + msg.length);
    inner.set(ipad);
    inner.set(msg, blockSize);
    const innerHash = jsSha256(inner);
    const outer = new Uint8Array(blockSize + 32);
    outer.set(opad);
    outer.set(innerHash, blockSize);
    return jsSha256(outer);
}

function jsPbkdf2(
    password: Uint8Array,
    salt: Uint8Array,
    iterations: number,
    keylen: number,
): Uint8Array {
    const blockCount = Math.ceil(keylen / 32);
    const out = new Uint8Array(blockCount * 32);

    for (let i = 1; i <= blockCount; i++) {
        const block = new Uint8Array(salt.length + 4);
        block.set(salt);
        const view = new DataView(block.buffer);
        view.setUint32(salt.length, i, false);

        let u = jsHmacSha256(password, block);
        const f = new Uint8Array(u);
        for (let j = 1; j < iterations; j++) {
            u = jsHmacSha256(password, u);
            for (let k = 0; k < 32; k++) f[k] ^= u[k];
        }
        out.set(f, (i - 1) * 32);
    }

    return out.slice(0, keylen);
}

// ── 统一的 crypto API（优先 subtle，fallback 纯 JS） ──

async function subtleDigest(
    alg: string,
    data: ArrayBuffer,
): Promise<ArrayBuffer> {
    if (_subtleAvailable) return crypto.subtle.digest(alg, data);
    if (alg === "SHA-256") {
        const hash = jsSha256(new Uint8Array(data));
        return hash.buffer as ArrayBuffer;
    }
    throw new Error(
        "Unsupported digest algorithm without crypto.subtle: " + alg,
    );
}

async function subtlePbkdf2(
    password: string,
    salt: Uint8Array,
): Promise<Uint8Array> {
    if (_subtleAvailable) {
        const enc = new TextEncoder();
        const keyMat = await crypto.subtle.importKey(
            "raw",
            enc.encode(password),
            "PBKDF2",
            false,
            ["deriveBits"],
        );
        const bits = await crypto.subtle.deriveBits(
            {
                name: "PBKDF2",
                salt: salt.buffer as ArrayBuffer,
                iterations: PBKDF2_ITERATIONS,
                hash: "SHA-256",
            },
            keyMat,
            PBKDF2_KEYLEN * 8,
        );
        return new Uint8Array(bits);
    }
    // fallback 纯 JS
    const enc = new TextEncoder();
    return jsPbkdf2(
        enc.encode(password),
        salt,
        PBKDF2_ITERATIONS,
        PBKDF2_KEYLEN,
    );
}

async function subtleHmacSha256(
    key: Uint8Array,
    msg: Uint8Array,
): Promise<Uint8Array> {
    if (_subtleAvailable) {
        const k = await crypto.subtle.importKey(
            "raw",
            key.buffer as ArrayBuffer,
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
        );
        return new Uint8Array(
            await crypto.subtle.sign("HMAC", k, msg.buffer as ArrayBuffer),
        );
    }
    // fallback 纯 JS
    return jsHmacSha256(key, msg);
}

// ── public API ──

/** 检测 Web Crypto subtle API 是否可用 */
export function isSubtleAvailable(): boolean {
    return _subtleAvailable;
}

/** Validate password complexity (≥8 chars, includes letter + digit) */
export function validatePassword(pwd: string): { ok: boolean; msg?: string } {
    if (pwd.length < 8) return { ok: false, msg: "密码至少 8 位" };
    if (!/[a-zA-Z]/.test(pwd)) return { ok: false, msg: "需包含字母" };
    if (!/[0-9]/.test(pwd)) return { ok: false, msg: "需包含数字" };
    return { ok: true };
}

/** 计算 passwordHash = SHA256(password) */
export async function computePasswordHash(
    password: string,
): Promise<string> {
    const enc = new TextEncoder();
    const hash = await subtleDigest("SHA-256", enc.encode(password).buffer as ArrayBuffer);
    return bufToHex(new Uint8Array(hash));
}

/** Generate salt + dkHash for initial password setup.
 *  Returns { salt, dkHash, passwordHash }
 *  salt: random 16 bytes (hex)
 *  dkHash: PBKDF2(password, salt) — used for challenge-response
 *  passwordHash: SHA256(password) — still sent to backend for encrypting private key
 */
export async function setupPassword(
    password: string,
): Promise<{ salt: string; dkHash: string; passwordHash: string }> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const dk = await subtlePbkdf2(password, salt);

    // passwordHash = SHA256(password) for backend private-key encryption
    const enc = new TextEncoder();
    const ph = await subtleDigest("SHA-256", enc.encode(password).buffer as ArrayBuffer);

    return {
        salt: bufToHex(salt),
        dkHash: bufToHex(dk),
        passwordHash: bufToHex(new Uint8Array(ph)),
    };
}

/** Compute challenge response using password.
 *  Internally caches the derived key for subsequent calls.
 */
export async function computeResponse(
    password: string,
    saltHex: string,
    challengeHex: string,
): Promise<string> {
    const salt = hexToBuf(saltHex);
    const challenge = hexToBuf(challengeHex);
    const dk = await subtlePbkdf2(password, salt);

    _cachedDK = dk;
    _cachedSalt = saltHex;

    const resp = await subtleHmacSha256(dk, challenge);
    return bufToHex(resp);
}

/** Compute response using cached derived key (no password re-entry). */
export async function computeResponseCached(
    challengeHex: string,
): Promise<string | null> {
    if (!_cachedDK) return null;
    const resp = await subtleHmacSha256(_cachedDK, hexToBuf(challengeHex));
    return bufToHex(resp);
}

/** Whether a derived key is currently cached in memory. */
export function hasCachedKey(): boolean {
    return !!_cachedDK;
}

/** Clear in-memory derived key. Call on disconnect / logout. */
export function clearCachedKey(): void {
    _cachedDK = null;
    _cachedSalt = null;
}

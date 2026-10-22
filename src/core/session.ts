/**
 * Session validation via backend checkSession GraphQL API.
 * checkSession(token: String!): AuthResponse!
 *   AuthResponse { success: Boolean! userInfo: UserInfo token: String address: String error: String }
 */

import { getStoredSession, setStoredSession } from "./tokenManager";

export interface CheckSessionResult {
    valid: boolean;
    error?: string;
}

export async function checkSession(
    backendUrl: string,
    token: string,
): Promise<CheckSessionResult> {
    const query = `query($token:String!){checkSession(token:$token){success error}}`;
    const res = await fetch(`${backendUrl}/gql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { token } }),
    });
    const json = (await res.json()) as {
        data?: { checkSession?: { success?: boolean; error?: string } };
        errors?: Array<{ message: string }>;
    };

    if (json.errors?.length) {
        return { valid: false, error: json.errors[0].message };
    }
    const data = json.data?.checkSession;
    if (!data) {
        return { valid: false, error: "Invalid response" };
    }
    return { valid: data.success === true, error: data.error };
}

/** 解析 JWT exp（秒）；解析失败返回 null（交给服务端校验） */
function parseExp(token: string): number | null {
    try {
        const payload = token.split(".")[1];
        if (!payload) return null;
        const b64 =
            payload.replace(/-/g, "+").replace(/_/g, "/") +
            "=".repeat((4 - (payload.length % 4)) % 4);
        const json = JSON.parse(decodeURIComponent(escape(atob(b64)))) as {
            exp?: number;
        };
        return typeof json.exp === "number" ? json.exp : null;
    } catch {
        return null;
    }
}

/**
 * 读取本地 token 并验证；access token 本地已过期时用 refresh token 轮换一次
 *（标准 OAuth2 行为：只有 refresh token 也失效/被吊销才判 invalid）。
 * 仅枢纽（唯一集成 SDK 且唯一合法轮换者）会走到轮换路径，
 * 不触发 auth 的跨 origin 重放检测。
 */
export async function verifySession(
    backendUrl: string,
): Promise<CheckSessionResult> {
    const session = getStoredSession();
    if (!session?.token) {
        return { valid: false, error: "No session token" };
    }
    const exp = parseExp(session.token);
    if (exp === null || exp * 1000 > Date.now()) {
        // 未本地过期：正常校验（可捕获吊销）
        return checkSession(backendUrl, session.token);
    }
    // 已过期：轮换前先重读——若应用层 401 静默续期已先轮换，
    // 直接校验新 token，避免同一 refresh token 双轮换触发重放检测→吊销全部会话
    const fresh = getStoredSession();
    if (fresh && fresh.token !== session.token) {
        const r = await checkSession(backendUrl, fresh.token);
        if (r.valid) return r;
    }
    return refreshSession(backendUrl);
}

/** access token 失效 → 用 refresh token 轮换一次并写回本地会话 */
export async function refreshSession(
    backendUrl: string,
): Promise<CheckSessionResult> {
    const session = getStoredSession();
    if (!session?.refreshToken) {
        return { valid: false, error: "No refresh token" };
    }
    try {
        const res = await fetch(`${backendUrl}/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: session.refreshToken }),
        });
        if (!res.ok) {
            return { valid: false, error: `refresh: HTTP ${res.status}` };
        }
        const json = (await res.json()) as {
            access_token?: string;
            refresh_token?: string;
        };
        if (!json.access_token) {
            return { valid: false, error: "refresh: no access_token" };
        }
        setStoredSession({
            ...session,
            token: json.access_token,
            refreshToken: json.refresh_token ?? session.refreshToken,
        });
        return { valid: true };
    } catch {
        return { valid: false, error: "refresh: network" };
    }
}

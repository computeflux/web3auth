/**
 * Session validation via backend checkSession GraphQL API.
 * checkSession(token: String!): AuthResponse!
 *   AuthResponse { success: Boolean! userInfo: UserInfo token: String address: String error: String }
 */

export interface CheckSessionResult {
    valid: boolean;
    error?: string;
}

function getSessionToken(): string | null {
    try {
        const raw = localStorage.getItem("web3auth:session");
        if (!raw) return null;
        const session = JSON.parse(raw);
        return session?.token ?? null;
    } catch {
        return null;
    }
}

export async function checkSession(
    backendUrl: string,
    token: string
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

/** 读取本地 token 并验证；若过期返回 valid=false */
export async function verifySession(
    backendUrl: string
): Promise<CheckSessionResult> {
    const token = getSessionToken();
    if (!token) {
        return { valid: false, error: "No session token" };
    }
    return checkSession(backendUrl, token);
}

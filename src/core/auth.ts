/**
 * Authentication service.
 *
 * Handles email-based passwordless login (OTP via email) and social/OAuth login.
 *
 * In production, this communicates with a backend service that:
 * 1. Sends OTP emails
 * 2. Verifies OTP codes
 * 3. Issues API Keys for authenticated requests
 *
 * For local development, a mock implementation is provided that simulates
 * the flow without a real backend.
 */

import type { Web3AuthUserInfo } from "./types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface AuthConfig {
    /** Backend URL for authentication API */
    backendUrl?: string;
    /** Web3Auth client ID (used when talking to Web3Auth's hosted backend) */
    clientId?: string;
    /** Network name */
    network?: string;
    /** Google OAuth Client ID (from Google Cloud Console) */
    googleClientId?: string;
    /** Google OAuth redirect URI (default: /oauth/callback.html) */
    googleRedirectUri?: string;
}

// ---------------------------------------------------------------------------
// API request/response types
// ---------------------------------------------------------------------------

export interface RequestOtpParams {
    email: string;
    clientId: string;
}

export interface VerifyOtpParams {
    email: string;
    otp: string;
    clientId: string;
}

export interface AuthResponse {
    success: boolean;
    userInfo?: Web3AuthUserInfo;
    /** API Key for authenticated API calls */
    token?: string;
    /** Wallet address (derived by backend, returned on login) */
    address?: string;
    error?: string;
}

// ---------------------------------------------------------------------------
// Mock backend (for development without a real auth server)
// ---------------------------------------------------------------------------

const MOCK_OTP_MAP = new Map<string, { otp: string; expiresAt: number }>();

function generateMockOtp(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
}

// Mock address for development (no real key — signing is simulated)
const MOCK_ADDRESS = "0x0000000000000000000000000000000000000000";

// ---------------------------------------------------------------------------
// Auth client
// ---------------------------------------------------------------------------

export class AuthClient {
    private config: AuthConfig;

    /**
     * Google OAuth 配置（从环境变量或构造函数传入）
     */
    private googleClientId?: string;
    private googleRedirectUri?: string;

    constructor(config: AuthConfig = {}) {
        this.config = config;
        this.googleClientId = config.googleClientId;
        this.googleRedirectUri = config.googleRedirectUri;
    }

    /**
     * Request an OTP code to be sent to the given email address.
     */
    async requestOtp(email: string): Promise<AuthResponse> {
        if (this.config.backendUrl) {
            const query = `mutation($email:String!,$clientId:String!){requestOTP(email:$email,clientId:$clientId){success error}}`;
            const res = await fetch(`${this.config.backendUrl}/gql`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query,
                    variables: { email, clientId: this.config.clientId ?? "" },
                }),
            });
            const json = await res.json();
            return (
                json?.data?.requestOTP ?? {
                    success: false,
                    error: "no response",
                }
            );
        }

        // Mock flow for development
        const otp = generateMockOtp();
        MOCK_OTP_MAP.set(email.toLowerCase(), {
            otp,
            expiresAt: Date.now() + 5 * 60 * 1000, // 5 min expiry
        });

        console.log(
            `[web3auth:mock] OTP for ${email}: ${otp} (valid for 5 minutes)`,
        );

        return { success: true };
    }

    /**
     * Verify an OTP code and authenticate.
     */
    async verifyOtp(email: string, otp: string): Promise<AuthResponse> {
        if (this.config.backendUrl) {
            const query = `mutation($email:String!,$otp:String!,$clientId:String!){verifyOTP(email:$email,otp:$otp,clientId:$clientId){success token address error userInfo{email name profileImage typeOfLogin}}}`;
            const res = await fetch(`${this.config.backendUrl}/gql`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query,
                    variables: {
                        email,
                        otp,
                        clientId: this.config.clientId ?? "",
                    },
                }),
            });
            const json = await res.json();
            const data = json?.data?.verifyOTP;
            if (data?.success) {
                return data;
            }
            return {
                success: false,
                error: data?.error ?? "verification failed",
            };
        }

        // Mock flow
        const entry = MOCK_OTP_MAP.get(email.toLowerCase());
        if (!entry) {
            return { success: false, error: "No OTP requested for this email" };
        }
        if (Date.now() > entry.expiresAt) {
            MOCK_OTP_MAP.delete(email.toLowerCase());
            return { success: false, error: "OTP expired" };
        }
        if (entry.otp !== otp) {
            return { success: false, error: "Invalid OTP" };
        }

        MOCK_OTP_MAP.delete(email.toLowerCase());

        const userInfo: Web3AuthUserInfo = {
            email,
            name: email.split("@")[0],
            typeOfLogin: "email_passwordless",
            authConnection: "email_passwordless",
            verifier: "torus",
            verifierId: email,
        };

        return {
            success: true,
            userInfo,
            token: `tee_${Date.now().toString(16).padStart(64, "0")}`,
            address: MOCK_ADDRESS,
        };
    }

    /**
     * Google OAuth 2.0 登录
     *
     * 流程：
     * 1. 弹窗打开 Google 授权页面
     * 2. 用户授权后 Google 回调到 redirect_uri
     * 3. 如果配置了 backendUrl，后端交换 code → token → 返回用户信息
     * 4. 如果没配后端，使用 popup + postMessage 模式：
     *    Google 回调到一个中间页面，该页面用 code 换 id_token，
     *    解析后通过 postMessage 传回前端。
     */
    async socialLogin(provider: string): Promise<AuthResponse> {
        if (provider !== "google") {
            // GitHub / Twitter 等其他 provider 暂未实现
            return {
                success: false,
                error: `Provider "${provider}" not yet implemented`,
            };
        }

        if (!this.googleClientId) {
            return {
                success: false,
                error: "Google Client ID not configured. Set VITE_GOOGLE_CLIENT_ID in .env",
            };
        }

        // 始终走前端弹窗模式，code 发后端 exchange
        return this.socialLoginViaPopup();
    }

    /**
     * 纯前端 Google OAuth：弹出 Google 授权窗口，获取 code 后发到后端。
     * 后端验证 code 并安全派生钱包地址。
     */
    private async socialLoginViaPopup(): Promise<AuthResponse> {
        // 如果有后端，用 code 流（安全）；否则用 token 流（仅开发环境）
        const useCodeFlow = Boolean(this.config.backendUrl);
        const responseType = useCodeFlow ? "code" : "token id_token";
        const redirectUri =
            this.googleRedirectUri ??
            `${window.location.origin}/oauth/callback.html`;

        // 生成随机 state 防 CSRF
        const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        sessionStorage.setItem("oauth_state", state);

        const params = new URLSearchParams({
            client_id: this.googleClientId!,
            redirect_uri: redirectUri,
            response_type: responseType,
            scope: "openid email profile",
            state,
            nonce: state,
        });

        // 如果用 code 模式，增加 access_type=offline 以获取 refresh_token
        if (responseType === "code") {
            params.set("access_type", "offline");
            params.set("prompt", "consent");
        }

        const popup = window.open(
            `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
            "google_oauth",
            "width=500,height=700",
        );

        if (!popup) {
            return {
                success: false,
                error: "Popup blocked. Please allow popups.",
            };
        }

        return new Promise((resolve) => {
            const timer = setInterval(() => {
                if (popup.closed) {
                    clearInterval(timer);
                    window.removeEventListener("message", handler);
                    resolve({
                        success: false,
                        error: "User closed the window",
                    });
                }
            }, 500);

            const handler = (e: MessageEvent) => {
                // 只接受来自同源（callback 页面）的消息
                if (e.origin !== window.location.origin) return;
                if (e.data?.type !== "google_oauth_callback") return;

                clearInterval(timer);
                window.removeEventListener("message", handler);
                popup.close();

                if (e.data.error) {
                    resolve({ success: false, error: e.data.error });
                    return;
                }

                // code 流：有 authorization code，发到后端交换 token 并获取种子
                if (e.data.code && this.config.backendUrl) {
                    this.exchangeCodeForSeed(e.data.code)
                        .then(resolve)
                        .catch((err) =>
                            resolve({
                                success: false,
                                error: err.message || String(err),
                            }),
                        );
                    return;
                }

                // token 流：直接返回用户信息
                const info = e.data.userInfo as Web3AuthUserInfo;
                resolve({
                    success: true,
                    userInfo: info,
                    token: e.data.id_token ?? `token_${Date.now()}`,
                    address: (e.data.address as string) ?? MOCK_ADDRESS,
                });
            };
            window.addEventListener("message", handler);
        });
    }

    /**
     * 用 Google authorization code 向后端交换用户信息和钱包地址。
     */
    private async exchangeCodeForSeed(code: string): Promise<AuthResponse> {
        const query = `mutation($provider:String!,$code:String){socialLogin(provider:$provider,code:$code){success token address error userInfo{email name profileImage typeOfLogin}}}`;
        const res = await fetch(`${this.config.backendUrl}/gql`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query,
                variables: { provider: "google", code },
            }),
        });
        const json = await res.json();
        const data = json?.data?.socialLogin;
        if (!data?.success) {
            return { success: false, error: data?.error ?? `Login failed` };
        }
        return data;
    }

    /**
     * Logout — clear any stored session.
     */
    async logout(): Promise<void> {
        // Clear locally stored auth data
        localStorage.removeItem("web3auth:session");
        localStorage.removeItem("web3auth:user");
    }

    /**
     * Restore session from local storage.
     */
    restoreSession(): {
        userInfo: Web3AuthUserInfo;
        token: string;
        address: string;
    } | null {
        try {
            const raw = localStorage.getItem("web3auth:session");
            if (!raw) return null;
            const session = JSON.parse(raw);
            if (!session?.userInfo || !session?.token || !session?.address)
                return null;
            return session;
        } catch {
            return null;
        }
    }

    /**
     * Persist session to local storage.
     */
    persistSession(
        userInfo: Web3AuthUserInfo,
        token: string,
        address: string,
    ): void {
        localStorage.setItem(
            "web3auth:session",
            JSON.stringify({ userInfo, token, address }),
        );
    }
}

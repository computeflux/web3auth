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
    /** GitHub OAuth Client ID */
    githubClientId?: string;
    /** GitHub OAuth redirect URI (default: /oauth/callback.html) */
    githubRedirectUri?: string;
    /** Twitter/X OAuth Client ID */
    twitterClientId?: string;
    /** Twitter/X OAuth redirect URI (default: /oauth/callback.html) */
    twitterRedirectUri?: string;
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
    /** GitHub OAuth 配置 */
    private githubClientId?: string;
    private githubRedirectUri?: string;
    /** Twitter/X OAuth 配置 */
    private twitterClientId?: string;
    private twitterRedirectUri?: string;

    constructor(config: AuthConfig = {}) {
        this.config = config;
        this.googleClientId = config.googleClientId;
        this.googleRedirectUri = config.googleRedirectUri;
        this.githubClientId = config.githubClientId;
        this.githubRedirectUri = config.githubRedirectUri;
        this.twitterClientId = config.twitterClientId;
        this.twitterRedirectUri = config.twitterRedirectUri;
    }

    /**
     * Request an OTP code to be sent to the given email address.
     */
    async requestOtp(rawEmail: string): Promise<AuthResponse> {
        const email = rawEmail.trim().toLowerCase();
        if (this.config.backendUrl) {
            try {
                const variables = {
                    email,
                    clientId: this.config.clientId ?? "",
                };
                console.log("[web3auth] requestOTP variables:", variables);
                const query = `mutation($email:String!,$clientId:String!){requestOTP(email:$email,clientId:$clientId){success error}}`;
                const res = await fetch(`${this.config.backendUrl}/gql`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        query,
                        variables,
                    }),
                });
                if (!res.ok) {
                    return {
                        success: false,
                        error: `Backend returned HTTP ${res.status}`,
                    };
                }
                const json = await res.json();
                if (json.errors) {
                    return {
                        success: false,
                        error:
                            json.errors[0]?.message ??
                            "GraphQL error from backend",
                    };
                }
                console.log("[web3auth] requestOTP response:", json?.data?.requestOTP);
                return (
                    json?.data?.requestOTP ?? {
                        success: false,
                        error: "no response",
                    }
                );
            } catch (err) {
                return {
                    success: false,
                    error: `Network error: ${(err as Error).message}`,
                };
            }
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
    async verifyOtp(rawEmail: string, otp: string): Promise<AuthResponse> {
        const email = rawEmail.trim().toLowerCase();
        if (this.config.backendUrl) {
            try {
                const variables = {
                    email,
                    otp,
                    clientId: this.config.clientId ?? "",
                };
                console.log("[web3auth] verifyOTP variables:", variables);
                const query = `mutation($email:String!,$otp:String!,$clientId:String!){verifyOTP(email:$email,otp:$otp,clientId:$clientId){success token address error userInfo{email name profileImage typeOfLogin}}}`;
                const res = await fetch(`${this.config.backendUrl}/gql`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        query,
                        variables,
                    }),
                });
                if (!res.ok) {
                    return {
                        success: false,
                        error: `Backend returned HTTP ${res.status}`,
                    };
                }
                const json = await res.json();
                if (json.errors) {
                    return {
                        success: false,
                        error:
                            json.errors[0]?.message ??
                            "GraphQL error from backend",
                    };
                }
                const data = json?.data?.verifyOTP;
                console.log("[web3auth] verifyOTP response:", data);
                if (data?.success) {
                    return data;
                }
                return {
                    success: false,
                    error: data?.error ?? "verification failed",
                };
            } catch (err) {
                return {
                    success: false,
                    error: `Network error: ${(err as Error).message}`,
                };
            }
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
            token: `auth_tee_${Date.now().toString(16).padStart(64, "0")}`,
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
    async socialLogin(rawProvider: string): Promise<AuthResponse> {
        const provider = rawProvider.trim().toLowerCase();
        if (provider === "google") {
            if (!this.googleClientId) {
                return {
                    success: false,
                    error: "Google Client ID not configured. Set VITE_GOOGLE_CLIENT_ID in .env",
                };
            }
            return this.socialLoginViaPopup("google");
        }

        if (provider === "github") {
            if (!this.githubClientId) {
                return {
                    success: false,
                    error: "GitHub Client ID not configured. Set VITE_GITHUB_CLIENT_ID in .env",
                };
            }
            return this.socialLoginViaPopup("github");
        }

        if (provider === "twitter") {
            if (!this.twitterClientId) {
                return {
                    success: false,
                    error: "Twitter Client ID not configured. Set VITE_TWITTER_CLIENT_ID in .env",
                };
            }
            return this.socialLoginViaPopup("twitter");
        }

        return {
            success: false,
            error: `Provider "${provider}" not yet implemented`,
        };
    }

    /**
     * 弹出 OAuth 授权窗口，获取 code 后发到后端。
     * 支持 Google 和 GitHub。
     */
    private async socialLoginViaPopup(
        provider: "google" | "github" | "twitter",
    ): Promise<AuthResponse> {
        const useCodeFlow = Boolean(this.config.backendUrl);
        let state: string;
        try {
            state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
            sessionStorage.setItem("oauth_state", state);
        } catch (e) {
            return {
                success: false,
                error: `Failed to generate OAuth state: ${(e as Error).message}`,
            };
        }

        let authUrl: string;
        let popupName: string;
        let expectedType = "google_oauth_callback";

        if (provider === "google") {
            const redirectUri =
                this.googleRedirectUri ??
                `${window.location.origin}/oauth/callback.html`;
            const responseType = useCodeFlow ? "code" : "token id_token";
            const params = new URLSearchParams({
                client_id: this.googleClientId!,
                redirect_uri: redirectUri,
                response_type: responseType,
                scope: "openid email profile",
                state,
                nonce: state,
            });
            if (responseType === "code") {
                params.set("access_type", "offline");
                params.set("prompt", "consent");
            }
            authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
            popupName = "google_oauth";
        } else if (provider === "github") {
            // GitHub 只支持 code 流，必须有后端
            if (!useCodeFlow) {
                return {
                    success: false,
                    error: "GitHub OAuth requires a backend (VITE_AUTH_BACKEND_URL)",
                };
            }
            const redirectUri =
                this.githubRedirectUri ??
                `${window.location.origin}/oauth/callback.html`;
            const params = new URLSearchParams({
                client_id: this.githubClientId!,
                redirect_uri: redirectUri,
                scope: "read:user user:email",
                state,
            });
            authUrl = `https://github.com/login/oauth/authorize?${params}`;
            popupName = "github_oauth";
        } else {
            // Twitter/X OAuth 2.0 强制 PKCE，必须有后端
            if (!useCodeFlow) {
                return {
                    success: false,
                    error: "Twitter OAuth requires a backend (VITE_AUTH_BACKEND_URL)",
                };
            }
            if (typeof crypto === "undefined" || !crypto.subtle) {
                return {
                    success: false,
                    error: "Twitter OAuth requires a secure context (HTTPS or localhost). crypto.subtle is unavailable.",
                };
            }
            let pkce: { verifier: string; challenge: string };
            try {
                pkce = await generatePKCE();
            } catch (e) {
                return {
                    success: false,
                    error: `Failed to generate PKCE challenge: ${(e as Error).message}`,
                };
            }
            try {
                sessionStorage.setItem("oauth_code_verifier", pkce.verifier);
            } catch (e) {
                return {
                    success: false,
                    error: `Failed to store PKCE verifier: ${(e as Error).message}`,
                };
            }
            const redirectUri =
                this.twitterRedirectUri ??
                `${window.location.origin}/oauth/callback.html`;
            const params = new URLSearchParams({
                client_id: this.twitterClientId!,
                redirect_uri: redirectUri,
                response_type: "code",
                scope: "tweet.read users.read",
                state,
                code_challenge: pkce.challenge,
                code_challenge_method: "S256",
            });
            authUrl = `https://x.com/i/oauth2/authorize?${params}`;
            popupName = "twitter_oauth";
            expectedType = "twitter_oauth_callback";
        }

        console.log(authUrl)
        const popup = window.open(authUrl, popupName, "width=500,height=700");

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
                if (
                    e.data?.type !== "google_oauth_callback" &&
                    e.data?.type !== "twitter_oauth_callback"
                )
                    return;

                clearInterval(timer);
                window.removeEventListener("message", handler);
                popup.close();

                if (e.data.error) {
                    resolve({ success: false, error: e.data.error });
                    return;
                }

                // Twitter 需要 PKCE code_verifier
                if (provider === "twitter" && this.config.backendUrl) {
                    let verifier: string | null;
                    try {
                        verifier = sessionStorage.getItem("oauth_code_verifier");
                        sessionStorage.removeItem("oauth_code_verifier");
                    } catch {
                        verifier = null;
                    }
                    if (!verifier) {
                        resolve({
                            success: false,
                            error: "PKCE verifier missing",
                        });
                        return;
                    }
                    this.exchangeCodeForSeed(provider, e.data.code, verifier)
                        .then(resolve)
                        .catch((err) =>
                            resolve({
                                success: false,
                                error: err.message || String(err),
                            }),
                        );
                    return;
                }

                // code 流：有 authorization code，发到后端交换 token 并获取种子（Google/GitHub）
                if (e.data.code && this.config.backendUrl) {
                    this.exchangeCodeForSeed(provider, e.data.code)
                        .then(resolve)
                        .catch((err) =>
                            resolve({
                                success: false,
                                error: err.message || String(err),
                            }),
                        );
                    return;
                }

                // token 流仅适用于 Google 开发环境
                if (provider === "google" && !this.config.backendUrl) {
                    const info = e.data.userInfo as Web3AuthUserInfo;
                    resolve({
                        success: true,
                        userInfo: info,
                        token: e.data.id_token ?? `token_${Date.now()}`,
                        address: (e.data.address as string) ?? MOCK_ADDRESS,
                    });
                    return;
                }

                resolve({
                    success: false,
                    error: "OAuth callback missing code",
                });
            };
            window.addEventListener("message", handler);
        });
    }

    /**
     * 用 authorization code 向后端交换用户信息和钱包地址。
     */
    private async exchangeCodeForSeed(
        provider: string,
        code: string,
        codeVerifier?: string,
    ): Promise<AuthResponse> {
        try {
            const query = `mutation($provider:String!,$code:String,$codeVerifier:String){socialLogin(provider:$provider,code:$code,codeVerifier:$codeVerifier){success token address error userInfo{email name profileImage typeOfLogin}}}`;
            const res = await fetch(`${this.config.backendUrl}/gql`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query,
                    variables: { provider, code, codeVerifier },
                }),
            });
            if (!res.ok) {
                return {
                    success: false,
                    error: `Backend returned HTTP ${res.status}`,
                };
            }
            const json = await res.json();
            if (json.errors) {
                return {
                    success: false,
                    error:
                        json.errors[0]?.message ??
                        "GraphQL error from backend",
                };
            }
            const data = json?.data?.socialLogin;
            if (!data?.success) {
                return {
                    success: false,
                    error: data?.error ?? `Login failed`,
                };
            }
            return data;
        } catch (err) {
            return {
                success: false,
                error: `Network error: ${(err as Error).message}`,
            };
        }
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

// ---------------------------------------------------------------------------
// PKCE helpers for OAuth 2.0 (Twitter/X requires PKCE)
// ---------------------------------------------------------------------------

async function generatePKCE(): Promise<{
    verifier: string;
    challenge: string;
}> {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const verifier = base64UrlEncode(array);
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier),
    );
    const challenge = base64UrlEncode(new Uint8Array(digest));
    return { verifier, challenge };
}

function base64UrlEncode(buffer: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < buffer.byteLength; i++) {
        binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

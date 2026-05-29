// ---------------------------------------------------------------------------
// Public types — mirrors @web3auth/modal type surface so the dapp import paths
// can be swapped without changing usage.
// ---------------------------------------------------------------------------

// 注意：这里不要直接依赖 `viem` 的 `Chain` 类型，否则当宿主项目也依赖 `viem` 时，
// TypeScript 会把两份不同 node_modules 的类型视为“不同的类型”，引发大量不兼容报错。
// 因此我们用一个最小的结构类型，满足 `fromViemChain` 的字段访问即可。
export type ViemLikeChain = {
    id: number;
    name: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    rpcUrls: { default: { http: readonly string[] } };
    blockExplorers?: { default?: { url: string } };
};

// ---- Chain configuration (mirrors @web3auth/modal CustomChainConfig) ----

export interface CustomChainConfig {
    chainId: string; // hex string, e.g. "0x1"
    displayName: string;
    chainNamespace: "evm";
    rpcTarget: string;
    blockExplorerUrl?: string;
    ticker: string;
    tickerName: string;
    logo?: string;
    decimals?: number;
}

// ---- Web3Auth network enum ----

export const WEB3AUTH_NETWORK = {
    SAPPHIRE_MAINNET: "sapphire_mainnet",
    SAPPHIRE_DEVNET: "sapphire_devnet",
    AQUA: "aqua",
    CELESTE: "celeste",
    CYAN: "cyan",
} as const;

export type Web3AuthNetwork =
    (typeof WEB3AUTH_NETWORK)[keyof typeof WEB3AUTH_NETWORK];

// ---- Options ----

export interface Web3AuthNoModalOptions {
    clientId?: string;
    web3AuthNetwork?: Web3AuthNetwork;
    chains: CustomChainConfig[];
    defaultChainId?: string;
    uiConfig?: {
        mode?: "light" | "dark";
        appName?: string;
        logoLight?: string;
        logoDark?: string;
        defaultLanguage?: string;
        primaryColor?: string;
        primaryText?: string;
    };
    walletServicesConfig?: {
        loginMode?: "embed" | "modal";
        confirmationStrategy?: "modal" | "auto";
    };
    /** Optional: custom authentication backend URL (for self-hosted setups) */
    authBackendUrl?: string;
    /** Google OAuth Client ID */
    googleClientId?: string;
    /** Google OAuth redirect URI */
    googleRedirectUri?: string;
    /** GitHub OAuth Client ID */
    githubClientId?: string;
    /** GitHub OAuth redirect URI */
    githubRedirectUri?: string;
    /** Twitter/X OAuth Client ID */
    twitterClientId?: string;
    /** Twitter/X OAuth redirect URI */
    twitterRedirectUri?: string;
    /** Blockchain explorer URL (for tx detail links) */
    explorerUrl?: string;
    /** Optional: fiat on-ramp (MoonPay / Transak / Onramper) */
    onramp?: {
        provider?: "moonpay" | "transak" | "ramp";
        moonpayApiKey?: string;
        transakApiKey?: string;
        rampApiKey?: string;
        defaultFiat?: string;
        defaultAmount?: number;
    };

    /** Optional: WalletConnect v2 (for mainstream EVM wallets, mobile, etc.) */
    walletConnect?: {
        /** WalletConnect Cloud Project ID */
        projectId: string;
        /** Optional: show the built-in QR modal */
        showQrModal?: boolean;
        /** Optional: override metadata shown in wallet */
        metadata?: {
            name: string;
            description?: string;
            url: string;
            icons: string[];
        };
    };

    /**
     * Optional: wallet UI token list (per chain).
     * Used by `showWalletUI()` modal to display ERC20 balances.
     */
    walletUI?: {
        tokensByChainId?: Record<
            string,
            Array<{
                address: `0x${string}`;
                name: string;
                symbol: string;
                decimals: number;
                logo?: string;
            }>
        >;
    };
}

// ---- User info ----

export interface Web3AuthUserInfo {
    email?: string;
    name?: string;
    profileImage?: string;
    verifier?: string;
    verifierId?: string;
    typeOfLogin?: string;
    aggregateVerifier?: string;
    /** The underlying auth connection identifier (e.g. "google", "email_passwordless") */
    authConnection?: string;
    authConnectionId?: string;
    groupedAuthConnectionId?: string;
    idToken?: string;
}

// ---- React context config ----

export interface Web3AuthContextConfig {
    web3AuthOptions: Web3AuthNoModalOptions;
}

// ---- EIP-1193 Provider (minimal interface) ----

export interface IEIP1193Provider {
    request(args: { method: string; params?: unknown[] }): Promise<unknown>;
    on?(event: string, listener: (...args: unknown[]) => void): void;
    removeListener?(
        event: string,
        listener: (...args: unknown[]) => void,
    ): void;
}

// ---- Auth state ----

export interface AuthState {
    isConnected: boolean;
    isConnecting: boolean;
    provider: IEIP1193Provider | null;
    userInfo: Web3AuthUserInfo | null;
    chainId: string | null;
    address: string | null;
    connectorName: string | null;
    connectError: Error | null;
    isDisconnecting: boolean;
}

// ---- Helpers ----

/**
 * Convert a viem Chain into a Web3Auth-compatible CustomChainConfig.
 * Mirrors the behaviour of @web3auth/modal's `fromViemChain`.
 */
export function fromViemChain(chain: ViemLikeChain): CustomChainConfig {
    const rpc = chain.rpcUrls.default.http?.[0] ?? "";
    const explorer = chain.blockExplorers?.default?.url;
    return {
        chainId: `0x${chain.id.toString(16)}`,
        displayName: chain.name,
        chainNamespace: "evm",
        rpcTarget: rpc,
        blockExplorerUrl: explorer,
        ticker: chain.nativeCurrency.symbol,
        tickerName: chain.nativeCurrency.name,
        decimals: chain.nativeCurrency.decimals,
    };
}

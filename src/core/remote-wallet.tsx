import {
    createContext,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { RemoteWalletEngine, type EIP1193Provider } from "./wallet";
import { clearStoredSession, readStoredSession } from "./sso";

/**
 * 无 modal 的钱包 provider（RemoteWalletProvider）：
 * 供 dApp（dapp / minishop / c2c 等）做"远程钱包签名"（充值 / 提现 / 认领 / 链上直调），
 * 同时不弹任何 web3auth modal（统一登录设计：登录框只在枢纽 :5181 /login 页弹）。
 *
 *  - 会话读自 localStorage "web3auth:session"（枢纽登录 / SSO 回跳写入）
 *  - 不挂 LoginModal / WalletUIModal / TopUpModal / ConfirmTx / ConfirmSign：
 *    不传 onBeforeSend / onBeforeSign → 签名操作自动确认（TEE 远程钱包，私钥在后端）
 *  - SSR 安全（服务端返回未连接默认值）
 */
export interface RemoteWalletConfig {
    /** auth 服务地址（签名 API，缺省则只有地址、无 provider） */
    backendUrl?: string;
    /** chainId(hex) → 公开 RPC */
    rpcTargets: Record<string, string>;
    /** 默认链 id（hex） */
    defaultChainId: string;
    explorerUrl?: string;
    theme?: "light" | "dark";
}

export interface RemoteWalletValue {
    provider: EIP1193Provider | null;
    address: `0x${string}` | null;
    /** 当前链 id（hex） */
    chainId: string | null;
    isConnected: boolean;
    userInfo: { verifierId?: string; email?: string; name?: string } | null;
    /** 本地登出：清本地会话（不调后端） */
    logout: () => void;
    /** 切换链（wallet_switchEthereumChain） */
    switchChain: (opts: { chainId: string }) => Promise<unknown>;
}

const Ctx = createContext<RemoteWalletValue | null>(null);

export function RemoteWalletProvider({
    config,
    children,
}: {
    config: RemoteWalletConfig;
    children: ReactNode;
}) {
    // 会话在渲染前已由 consumeSsoOnBoot() 写入；登出时本地清除
    const [session, setSession] = useState(() =>
        typeof window !== "undefined" ? readStoredSession() : null,
    );

    const engine = useMemo(() => {
        if (typeof window === "undefined") return null;
        if (!session?.token || !session.address || !config.backendUrl) return null;
        return new RemoteWalletEngine({
            backendUrl: config.backendUrl,
            token: session.token,
            address: session.address as `0x${string}`,
            rpcTargets: config.rpcTargets,
            defaultChainId: config.defaultChainId,
            explorerUrl: config.explorerUrl,
            theme: config.theme,
        });
    }, [session, config]);

    const value = useMemo<RemoteWalletValue>(() => {
        const connected = Boolean(session?.token && session.address);
        return {
            provider: engine?.provider ?? null,
            address: connected ? (session as { address: `0x${string}` }).address : null,
            chainId: connected ? config.defaultChainId : null,
            isConnected: connected,
            userInfo: (session?.userInfo ?? null) as RemoteWalletValue["userInfo"],
            logout: () => {
                clearStoredSession();
                setSession(null);
            },
            switchChain: async (opts) => {
                if (!engine) return;
                return engine.provider.request({
                    method: "wallet_switchEthereumChain",
                    params: [{ chainId: opts.chainId }],
                });
            },
        };
    }, [session, engine, config]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRemoteWallet(): RemoteWalletValue {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error("useRemoteWallet must be used within <RemoteWalletProvider>");
    return ctx;
}

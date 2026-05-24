/**
 * React context for the self-built Web3Auth replacement.
 *
 * Provides identical hook API surface as @web3auth/modal/react:
 * - useWeb3Auth()
 * - useWeb3AuthConnect()
 * - useWeb3AuthDisconnect()
 * - useWeb3AuthUser()
 * - useFunding()
 * - useWalletUI()
 * - useWalletServicesPlugin()
 */

import {
    computeResponse,
    computeResponseCached,
    clearCachedKey,
} from "./txPassword";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import EthereumProvider from "@walletconnect/ethereum-provider";
import { AuthClient } from "./auth";
import { RemoteWalletEngine } from "./wallet";
import { LoginModal } from "../components/LoginModal";
import WalletUIModal from "../components/WalletUIModal";
import TopUpModal from "../components/TopUpModal";
import ConfirmTxModal from "../components/ConfirmTxModal";
import ConfirmSignModal from "../components/ConfirmSignModal";
import { Web3AuthI18nProvider } from "./i18n";
import type {
    CustomChainConfig,
    IEIP1193Provider,
    Web3AuthContextConfig,
    Web3AuthUserInfo,
} from "./types";

type InjectedProviderLike = IEIP1193Provider & {
    isMetaMask?: boolean;
    isCoinbaseWallet?: boolean;
    isRabby?: boolean;
    isOkxWallet?: boolean;
    isOKExWallet?: boolean;
    isBitkeep?: boolean;
    isBitKeep?: boolean;
    isTokenPocket?: boolean;
    isTrust?: boolean;
    isImToken?: boolean;
    isMathWallet?: boolean;
    isSafe?: boolean;
    providerMap?: Record<string, boolean>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [k: string]: any;
    providers?: InjectedProviderLike[];
};

type WalletKey =
    | "metamask"
    | "coinbase"
    | "rabby"
    | "okx"
    | "bitget"
    | "tokenpocket"
    | "trust"
    | "safe"
    | "ledger"
    | "imtoken"
    | "mathwallet"
    | "walletconnect";

function getInjectedCandidates(): InjectedProviderLike[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eth = (globalThis as any)?.ethereum as
        | InjectedProviderLike
        | undefined;
    if (!eth) return [];
    return Array.isArray(eth.providers) ? eth.providers : [eth];
}

function detectInjectedWallets(): Partial<Record<WalletKey, boolean>> {
    const candidates = getInjectedCandidates();
    const anyInjected = candidates.length > 0;
    if (!anyInjected) return {};

    const has = (pred: (p: InjectedProviderLike) => boolean) =>
        candidates.some((p) => {
            try {
                return Boolean(pred(p));
            } catch {
                return false;
            }
        });

    // 注：各钱包 injected 标记并不完全统一，这里覆盖常见情况，未知则返回 false
    return {
        metamask: has((p) => p?.isMetaMask === true),
        coinbase: has((p) => p?.isCoinbaseWallet === true),
        rabby: has((p) => p?.isRabby === true),
        okx: has((p) => p?.isOkxWallet === true || p?.isOKExWallet === true),
        bitget: has((p) => p?.isBitkeep === true || p?.isBitKeep === true),
        tokenpocket: has((p) => p?.isTokenPocket === true),
        trust: has((p) => p?.isTrust === true),
        imtoken: has((p) => p?.isImToken === true),
        mathwallet: has((p) => p?.isMathWallet === true),
        safe: has((p) => p?.isSafe === true),
    };
}

// ---------------------------------------------------------------------------
// Context value shape
// ---------------------------------------------------------------------------

export interface Web3AuthContextValue {
    // --- Auth state ---
    isConnected: boolean;
    isConnecting: boolean;
    provider: IEIP1193Provider | null;
    userInfo: Web3AuthUserInfo | null;
    chainId: string | null;
    address: string | null;
    connectorName: string | null;
    connectError: Error | null;
    isDisconnecting: boolean;

    // --- Actions ---
    /** Open the login modal / start email OTP flow */
    connect: () => Promise<void>;
    /** Disconnect and clear all state */
    disconnect: () => Promise<void>;
    /** Switch to a different chain */
    switchChain: (params: { chainId: string }) => Promise<void>;

    // --- Funding / Wallet UI (stubs matching @web3auth API) ---
    /** Open the "add funds" / funding UI */
    showFunding: () => Promise<void>;
    /** Open the embedded wallet UI */
    showWalletUI: () => Promise<void>;
    /** Whether wallet services plugin is ready */
    walletServicesReady: boolean;

    // --- Internals (exposed for backwards compat) ---
    web3Auth: {
        connectedConnectorName?: string | null;
        switchChain?: (params: { chainId: string }) => Promise<void>;
    } | null;
}

const Web3AuthContext = createContext<Web3AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------------------

export interface Web3AuthProviderProps {
    config: Web3AuthContextConfig;
    children: ReactNode;
    locale?: "en" | "zh";
}

export function Web3AuthProvider({
    config,
    children,
    locale,
}: Web3AuthProviderProps) {
    const {
        clientId,
        web3AuthNetwork,
        chains,
        defaultChainId,
        authBackendUrl,
        uiConfig,
    } = config.web3AuthOptions;

    // -- Auth state --
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [provider, setProvider] = useState<IEIP1193Provider | null>(null);
    const [userInfo, setUserInfo] = useState<Web3AuthUserInfo | null>(null);
    const [chainId, setChainId] = useState<string | null>(null);
    const [address, setAddress] = useState<string | null>(null);
    const [connectorName, setConnectorName] = useState<string | null>(null);
    const [connectError, setConnectError] = useState<Error | null>(null);
    const [isDisconnecting, setIsDisconnecting] = useState(false);

    // -- Persistent services (refs to survive re-renders) --
    const authRef = useRef<AuthClient | null>(null);
    const walletRef = useRef<RemoteWalletEngine | null>(null);
    const providerRef = useRef<IEIP1193Provider | null>(null);
    const wcProviderRef = useRef<IEIP1193Provider | null>(null);

    // Keep refs in sync with config
    const configRef = useRef(config);
    configRef.current = config;

    // Initialise auth client once
    if (!authRef.current) {
        authRef.current = new AuthClient({
            backendUrl: authBackendUrl,
            clientId,
            network: web3AuthNetwork,
            googleClientId: config.web3AuthOptions.googleClientId,
            googleRedirectUri: config.web3AuthOptions.googleRedirectUri,
        });
    }

    // Build RPC target map from chain configs
    const rpcTargets = useMemo(() => {
        const map: Record<string, string> = {};
        for (const c of chains) {
            map[c.chainId] = c.rpcTarget;
        }
        return map;
    }, [chains]);

    const wcChainIdsDec = useMemo(() => {
        const ids = chains
            .map((c) => {
                const v = c.chainId?.toLowerCase()?.startsWith("0x")
                    ? parseInt(c.chainId, 16)
                    : Number.NaN;
                return Number.isFinite(v) ? v : null;
            })
            .filter((x): x is number => typeof x === "number");
        return Array.from(new Set(ids));
    }, [chains]);

    const wcRpcMap = useMemo(() => {
        const map: Record<number, string> = {};
        for (const c of chains) {
            const id = c.chainId?.toLowerCase()?.startsWith("0x")
                ? parseInt(c.chainId, 16)
                : Number.NaN;
            if (!Number.isFinite(id)) continue;
            if (c.rpcTarget) map[id] = c.rpcTarget;
        }
        return map;
    }, [chains]);

    const _defaultChainId = defaultChainId ?? chains[0]?.chainId ?? "0x1";

    // -- Session restoration on mount --
    useEffect(() => {
        const session = authRef.current?.restoreSession();
        if (session && authBackendUrl) {
            setUserInfo(session.userInfo);
            // Re-initialise remote wallet from session
            const wallet = new RemoteWalletEngine({
                backendUrl: authBackendUrl,
                token: session.token,
                address: session.address as `0x${string}`,
                rpcTargets,
                defaultChainId: _defaultChainId,
                explorerUrl: configRef.current.web3AuthOptions.explorerUrl,
                theme: uiConfig?.mode,
                primaryColor: uiConfig?.primaryColor,
                onBeforeSend,
                onBeforeSign,
            });
            walletRef.current = wallet;
            setProvider(wallet.provider);
            setAddress(wallet.addr);
            setChainId(wallet.chain);
            setIsConnected(true);
            setConnectorName("auth");
            return;
        }
        if (session) {
            // Mock mode: restore user info without a wallet engine
            setUserInfo(session.userInfo);
            setAddress(session.address);
            setChainId(_defaultChainId);
            setIsConnected(true);
            setConnectorName("auth");
            return;
        }

        // Restore injected wallet / WalletConnect session
        try {
            const raw = localStorage.getItem("web3auth:wallet_session");
            if (!raw) return;
            const ws = JSON.parse(raw) as {
                connectorName: string;
                address: string;
                chainId: string;
            };
            if (!ws?.connectorName || !ws?.address) return;

            if (ws.connectorName === "walletconnect") {
                // WalletConnect: async re-init
                void (async () => {
                    const cfg = configRef.current.web3AuthOptions.walletConnect;
                    if (!cfg?.projectId) return;
                    if (wcChainIdsDec.length === 0) return;
                    try {
                        const wc = await EthereumProvider.init({
                            projectId: cfg.projectId,
                            chains: wcChainIdsDec,
                            optionalChains: wcChainIdsDec as unknown as [
                                number,
                                ...number[],
                            ],
                            rpcMap: wcRpcMap,
                            showQrModal: false,
                            metadata: cfg.metadata
                                ? {
                                      name: cfg.metadata.name,
                                      description:
                                          cfg.metadata.description ?? "",
                                      url: cfg.metadata.url,
                                      icons: cfg.metadata.icons,
                                  }
                                : undefined,
                        });
                        await (wc as any).enable?.();
                        const chain = (await (wc as any).request({
                            method: "eth_chainId",
                        })) as string;
                        const accounts = (await (wc as any).request({
                            method: "eth_accounts",
                        })) as string[];
                        const a = accounts?.[0];
                        if (!a) return;
                        wcProviderRef.current =
                            wc as unknown as IEIP1193Provider;
                        providerRef.current = wc as unknown as IEIP1193Provider;
                        setProvider(wc as unknown as IEIP1193Provider);
                        setAddress(a);
                        setChainId(chain);
                        setIsConnected(true);
                        setConnectorName("walletconnect");
                        setConnectError(null);
                        // Update persisted session with fresh chain/address
                        localStorage.setItem(
                            "web3auth:wallet_session",
                            JSON.stringify({
                                connectorName: "walletconnect",
                                address: a,
                                chainId: chain,
                            }),
                        );
                    } catch {
                        localStorage.removeItem("web3auth:wallet_session");
                    }
                })();
                return;
            }

            // Injected wallet: re-attach provider if still available
            const eth = (globalThis as any)?.ethereum as
                | InjectedProviderLike
                | undefined;
            if (!eth) {
                localStorage.removeItem("web3auth:wallet_session");
                return;
            }
            const candidates = Array.isArray(eth.providers)
                ? eth.providers
                : [eth];
            let picked: InjectedProviderLike | undefined;
            if (ws.connectorName === "metamask") {
                picked = candidates.find((p) => p?.isMetaMask);
            } else if (ws.connectorName === "coinbase") {
                picked = candidates.find((p) => p?.isCoinbaseWallet);
            } else if (ws.connectorName === "rabby") {
                picked = candidates.find((p) => p?.isRabby);
            } else if (ws.connectorName === "okx") {
                picked = candidates.find(
                    (p) => p?.isOkxWallet || p?.isOKExWallet,
                );
            } else if (ws.connectorName === "bitget") {
                picked = candidates.find((p) => p?.isBitkeep || p?.isBitKeep);
            } else if (ws.connectorName === "tokenpocket") {
                picked = candidates.find((p) => p?.isTokenPocket);
            } else if (ws.connectorName === "trust") {
                picked = candidates.find((p) => p?.isTrust);
            } else if (ws.connectorName === "imtoken") {
                picked = candidates.find((p) => p?.isImToken);
            } else if (ws.connectorName === "mathwallet") {
                picked = candidates.find((p) => p?.isMathWallet);
            } else if (ws.connectorName === "safe") {
                picked = candidates.find((p) => p?.isSafe);
            } else {
                picked = candidates[0];
            }
            if (!picked) {
                localStorage.removeItem("web3auth:wallet_session");
                return;
            }
            providerRef.current = picked;
            setProvider(picked);
            setAddress(ws.address);
            setChainId(ws.chainId);
            setIsConnected(true);
            setConnectorName(ws.connectorName);
            setConnectError(null);
        } catch {
            localStorage.removeItem("web3auth:wallet_session");
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // -- Login modal state --
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [showWalletUIModal, setShowWalletUIModal] = useState(false);
    const [showTopUpModal, setShowTopUpModal] = useState(false);
    const [showTxConfirm, setShowTxConfirm] = useState(false);
    const [confirmTx, setConfirmTx] = useState<Record<string, unknown> | null>(
        null,
    );
    const txConfirmResolve = useRef<((ok: boolean) => void) | null>(null);
    const passwordHashRef = useRef<string>("");
    const signTokenRef = useRef<string>("");
    const signTokenExpRef = useRef<number>(0);
    const [chainMeta, setChainMeta] = useState<{
        name: string;
        symbol: string;
    } | null>(null);
    const [estimatedFee, setEstimatedFee] = useState<string>("");
    const [walletInstalled, setWalletInstalled] = useState<
        Partial<Record<WalletKey, boolean>>
    >({});

    // 签名确认状态
    const [showSignConfirm, setShowSignConfirm] = useState(false);
    const [signMessage, setSignMessage] = useState<string>("");
    const signConfirmResolve = useRef<((ok: boolean) => void) | null>(null);

    // 获取 signToken（challenge-response 验证）
    const acquireSignToken = useCallback(
        async (reason: "tx" | "sign"): Promise<string | null> => {
            // 检查缓存是否有效（提前 10s 刷新）
            const now = Date.now();
            if (signTokenRef.current && now < signTokenExpRef.current - 10000) {
                return signTokenRef.current;
            }

            if (!authBackendUrl || !walletRef.current) return null;

            try {
                // 1. 获取 challenge
                const chalQuery = `query($token:String!){getChallenge(token:$token){status challenge salt expiresAt error}}`;
                const chalRes = await fetch(`${authBackendUrl}/gql`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        query: chalQuery,
                        variables: { token: walletRef.current.token },
                    }),
                });
                const chalJson = await chalRes.json();
                const challengeResult = chalJson.data?.getChallenge;
                if (
                    chalJson.errors ||
                    !challengeResult ||
                    challengeResult.status !== "success"
                ) {
                    const errMsg =
                        challengeResult?.error ||
                        chalJson.errors?.[0]?.message ||
                        "unknown";
                    // 密码未设置也由弹窗自己检测处理
                    console.error("[web3auth] getChallenge failed:", chalJson);
                    return null;
                }
                const { challenge, salt } = challengeResult;

                // 2. 计算 response
                let response: string;
                const cached = await computeResponseCached(challenge);
                if (cached) {
                    response = cached;
                } else {
                    // 弹窗让用户输入密码
                    if (reason === "tx") {
                        txConfirmResolve.current = (ok: boolean) => {
                            if (!ok) {
                                txConfirmResolve.current = null;
                            }
                        };
                    } else {
                        signConfirmResolve.current = (ok: boolean) => {
                            if (!ok) {
                                signConfirmResolve.current = null;
                            }
                        };
                    }
                    // 等待用户输入密码并计算 response
                    // 实际上这里需要更复杂的异步流程
                    // 简化：直接返回 null，由弹窗回调处理
                    return null;
                }

                // 3. 验证 response
                const verifyQuery = `mutation($token:String!,$challenge:String!,$response:String!){verifyResponse(token:$token,challenge:$challenge,response:$response){status signToken expiresAt error}}`;
                const verifyRes = await fetch(`${authBackendUrl}/gql`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        query: verifyQuery,
                        variables: {
                            token: walletRef.current.token,
                            challenge,
                            response,
                        },
                    }),
                });
                const verifyJson = await verifyRes.json();
                if (
                    verifyJson.errors ||
                    verifyJson.data?.verifyResponse?.status !== "ok"
                ) {
                    console.error(
                        "[web3auth] verifyResponse failed:",
                        verifyJson,
                    );
                    return null;
                }

                const { signToken, expiresAt } = verifyJson.data.verifyResponse;
                signTokenRef.current = signToken;
                signTokenExpRef.current = new Date(expiresAt).getTime();
                return signToken;
            } catch (err) {
                console.error("[web3auth] acquireSignToken error:", err);
                return null;
            }
        },
        [authBackendUrl],
    );

    // 交易确认回调
    const onBeforeSend = useCallback(
        (tx: Record<string, unknown>) =>
            new Promise<boolean>(async (resolve) => {
                // 预获取网络信息
                try {
                    const chains =
                        configRef.current.web3AuthOptions.chains ?? [];
                    const chain = chains.find((c) => c.chainId === chainId);
                    const ticker = chain?.ticker || "";
                    if (chain) {
                        setChainMeta({
                            name: chain.displayName || "Unknown",
                            symbol: ticker,
                        });
                    }
                    if (walletRef.current) {
                        const gp = (tx.gasPrice as bigint)
                            ? BigInt(tx.gasPrice as string)
                            : BigInt(
                                  (await walletRef.current.provider.request({
                                      method: "eth_gasPrice",
                                      params: [],
                                  })) as string,
                              );
                        const gas =
                            (tx.gas as bigint) || (tx.data ? 100000n : 21000n);
                        const feeWei = gp * gas;
                        const fee = Number(feeWei) / 1e18;
                        setEstimatedFee(`${fee.toFixed(6)} ${ticker}`);
                    }
                } catch {
                    setChainMeta(null);
                    setEstimatedFee("");
                }

                // 获取 signToken（弹窗自己完成 challenge-response）
                const st = await acquireSignToken("tx");
                txConfirmResolve.current = (ok: boolean) => {
                    resolve(ok);
                };

                // 计算发送金额
                try {
                    const v = BigInt((tx.value as string) || "0");
                    if (v > 0n) {
                        const chain =
                            configRef.current.web3AuthOptions.chains?.find(
                                (c) => c.chainId === chainId,
                            );
                        const decimals = chain?.decimals ?? 18;
                        const amount = Number(v) / 10 ** decimals;
                        (tx as any).amount = `${amount.toFixed(6)}`;
                    }
                } catch {
                    /* ignore */
                }
                setConfirmTx(tx);
                setShowTxConfirm(true);
            }),
        [chainId, acquireSignToken],
    );

    const handleTxConfirm = useCallback((signToken: string) => {
        signTokenRef.current = signToken;
        if (walletRef.current) {
            walletRef.current.signToken = signToken;
        }
        txConfirmResolve.current?.(true);
        setShowTxConfirm(false);
        setConfirmTx(null);
    }, []);

    const handleTxCancel = useCallback(() => {
        txConfirmResolve.current?.(false);
        setShowTxConfirm(false);
        setConfirmTx(null);
    }, []);

    // 签名确认回调
    const onBeforeSign = useCallback(
        (msg: { message: string; from: string }) =>
            new Promise<boolean>(async (resolve) => {
                const st = await acquireSignToken("sign");
                if (!st) {
                    signConfirmResolve.current = (ok: boolean) => {
                        if (ok) {
                            // signToken 已由弹窗流程获取
                        }
                        resolve(ok);
                    };
                } else {
                    if (walletRef.current) {
                        walletRef.current.signToken = st;
                    }
                    signConfirmResolve.current = (ok: boolean) => {
                        resolve(ok);
                    };
                }
                setSignMessage(msg.message);
                setShowSignConfirm(true);
            }),
        [acquireSignToken],
    );

    const handleSignConfirm = useCallback((signToken: string) => {
        signTokenRef.current = signToken;
        if (walletRef.current) {
            walletRef.current.signToken = signToken;
        }
        signConfirmResolve.current?.(true);
        setShowSignConfirm(false);
        setSignMessage("");
    }, []);

    const handleSignCancel = useCallback(() => {
        signConfirmResolve.current?.(false);
        setShowSignConfirm(false);
        setSignMessage("");
    }, []);

    // -- Connect (login) — opens the LoginModal --
    const connect = useCallback(async () => {
        setConnectError(null);
        setWalletInstalled(detectInjectedWallets());
        setShowLoginModal(true);
    }, []);

    // -- Handlers for the LoginModal --
    const handleRequestOtp = useCallback(async (email: string) => {
        const auth = authRef.current!;
        const result = await auth.requestOtp(email);
        return result;
    }, []);

    const handleVerifyOtp = useCallback(
        async (email: string, otp: string) => {
            const auth = authRef.current!;
            const result = await auth.verifyOtp(email, otp);
            if (
                result.success &&
                result.userInfo &&
                result.address &&
                result.token
            ) {
                auth.persistSession(
                    result.userInfo,
                    result.token,
                    result.address,
                );

                const wallet = new RemoteWalletEngine({
                    backendUrl: authBackendUrl!,
                    token: result.token,
                    address: result.address as `0x${string}`,
                    rpcTargets,
                    defaultChainId: _defaultChainId,
                    explorerUrl: configRef.current.web3AuthOptions.explorerUrl,
                    theme: uiConfig?.mode,
                    primaryColor: uiConfig?.primaryColor,
                    onBeforeSend,
                    onBeforeSign,
                });
                walletRef.current = wallet;
                providerRef.current = wallet.provider;

                setUserInfo(result.userInfo);
                setProvider(wallet.provider);
                setAddress(result.address as `0x${string}`);
                setChainId(_defaultChainId);
                setIsConnected(true);
                setConnectorName("auth");
                setConnectError(null);
                setShowLoginModal(false);
                setIsConnecting(false);
            }
            return { success: result.success, error: result.error };
        },
        [rpcTargets, _defaultChainId, authBackendUrl],
    );

    const handleSocialLogin = useCallback(
        async (provider: string) => {
            const auth = authRef.current!;
            const result = await auth.socialLogin(provider);
            if (
                result.success &&
                result.userInfo &&
                result.address &&
                result.token
            ) {
                auth.persistSession(
                    result.userInfo,
                    result.token,
                    result.address,
                );

                const wallet = new RemoteWalletEngine({
                    backendUrl: authBackendUrl!,
                    token: result.token,
                    address: result.address as `0x${string}`,
                    rpcTargets,
                    defaultChainId: _defaultChainId,
                    explorerUrl: configRef.current.web3AuthOptions.explorerUrl,
                    theme: uiConfig?.mode,
                    primaryColor: uiConfig?.primaryColor,
                    onBeforeSend,
                    onBeforeSign,
                });
                walletRef.current = wallet;
                providerRef.current = wallet.provider;

                setUserInfo(result.userInfo);
                setProvider(wallet.provider);
                setAddress(wallet.addr);
                setChainId(wallet.chain);
                setIsConnected(true);
                setConnectorName(provider);
                setConnectError(null);
                setShowLoginModal(false);
                setIsConnecting(false);
            }
            return { success: result.success, error: result.error };
        },
        [rpcTargets, _defaultChainId],
    );

    const connectInjectedWallet = useCallback(
        async (
            wallet:
                | "metamask"
                | "coinbase"
                | "rabby"
                | "okx"
                | "bitget"
                | "tokenpocket"
                | "trust"
                | "imtoken"
                | "mathwallet"
                | "safe"
                | "injected",
        ) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const eth = (globalThis as any)?.ethereum as
                | InjectedProviderLike
                | undefined;
            if (!eth)
                return { success: false, error: "No injected wallet found" };

            const candidates = Array.isArray(eth.providers)
                ? eth.providers
                : [eth];

            let picked: InjectedProviderLike | undefined;
            if (wallet === "metamask") {
                picked = candidates.find((p) => p?.isMetaMask);
            } else if (wallet === "coinbase") {
                picked = candidates.find((p) => p?.isCoinbaseWallet);
            } else if (wallet === "rabby") {
                picked = candidates.find((p) => p?.isRabby);
            } else if (wallet === "okx") {
                picked = candidates.find(
                    (p) => p?.isOkxWallet || p?.isOKExWallet,
                );
            } else if (wallet === "bitget") {
                // Bitget Wallet historically injected as BitKeep
                picked = candidates.find((p) => p?.isBitkeep || p?.isBitKeep);
            } else if (wallet === "tokenpocket") {
                picked = candidates.find((p) => p?.isTokenPocket);
            } else if (wallet === "trust") {
                picked = candidates.find((p) => p?.isTrust);
            } else if (wallet === "imtoken") {
                picked = candidates.find((p) => p?.isImToken);
            } else if (wallet === "mathwallet") {
                picked = candidates.find((p) => p?.isMathWallet);
            } else if (wallet === "safe") {
                picked = candidates.find((p) => p?.isSafe);
            } else {
                picked = candidates[0];
            }

            if (!picked)
                return {
                    success: false,
                    error: "Requested wallet not available",
                };

            try {
                const chain = (await picked.request({
                    method: "eth_chainId",
                })) as string;
                const accounts = (await picked.request({
                    method: "eth_requestAccounts",
                })) as string[];
                const a = accounts?.[0];
                if (!a)
                    return { success: false, error: "No accounts returned" };

                providerRef.current = picked;
                setProvider(picked);
                setAddress(a);
                setChainId(chain);
                setIsConnected(true);
                setConnectorName(wallet === "injected" ? "injected" : wallet);
                setConnectError(null);
                setShowLoginModal(false);
                setIsConnecting(false);
                localStorage.setItem(
                    "web3auth:wallet_session",
                    JSON.stringify({
                        connectorName:
                            wallet === "injected" ? "injected" : wallet,
                        address: a,
                        chainId: chain,
                    }),
                );
                return { success: true };
            } catch (e) {
                const msg =
                    (e as { message?: string })?.message ??
                    "Wallet connect failed";
                return { success: false, error: msg };
            }
        },
        [],
    );

    const connectWalletConnect = useCallback(async () => {
        const cfg = configRef.current.web3AuthOptions.walletConnect;
        if (!cfg?.projectId) {
            return {
                success: false,
                error: "WalletConnect is not configured (missing projectId)",
            };
        }
        if (wcChainIdsDec.length === 0) {
            return {
                success: false,
                error: "No chains configured for WalletConnect",
            };
        }

        try {
            const wc = await EthereumProvider.init({
                projectId: cfg.projectId,
                chains: wcChainIdsDec,
                // @walletconnect/ethereum-provider typing expects a tuple with at least one item.
                // Runtime accepts plain arrays; we keep strict TS happy via cast.
                optionalChains: wcChainIdsDec as unknown as [
                    number,
                    ...number[],
                ],
                rpcMap: wcRpcMap,
                showQrModal: cfg.showQrModal !== false,
                metadata: cfg.metadata
                    ? {
                          name: cfg.metadata.name,
                          description: cfg.metadata.description ?? "",
                          url: cfg.metadata.url,
                          icons: cfg.metadata.icons,
                      }
                    : undefined,
            });

            // WalletConnect provider has connect/enable methods
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (wc as any).connect?.();
            const chain = (await (wc as any).request({
                method: "eth_chainId",
            })) as string;
            const accounts = (await (wc as any).request({
                method: "eth_accounts",
            })) as string[];
            const a = accounts?.[0];
            if (!a) return { success: false, error: "No accounts returned" };

            wcProviderRef.current = wc as unknown as IEIP1193Provider;
            providerRef.current = wc as unknown as IEIP1193Provider;
            setProvider(wc as unknown as IEIP1193Provider);
            setAddress(a);
            setChainId(chain);
            setIsConnected(true);
            setConnectorName("walletconnect");
            setConnectError(null);
            setShowLoginModal(false);
            setIsConnecting(false);
            localStorage.setItem(
                "web3auth:wallet_session",
                JSON.stringify({
                    connectorName: "walletconnect",
                    address: a,
                    chainId: chain,
                }),
            );
            return { success: true };
        } catch (e) {
            const msg =
                (e as { message?: string })?.message ??
                "WalletConnect connect failed";
            return { success: false, error: msg };
        }
    }, [wcChainIdsDec, wcRpcMap]);

    const handleCloseLoginModal = useCallback(() => {
        setShowLoginModal(false);
        setIsConnecting(false);
        if (!isConnected) {
            setConnectError(new Error("user closed the modal"));
        }
    }, [isConnected]);

    // -- Disconnect --
    const disconnect = useCallback(async () => {
        setIsDisconnecting(true);
        try {
            await authRef.current?.logout();
            walletRef.current?.destroy();
            walletRef.current = null;
            clearCachedKey();
            signTokenRef.current = "";
            signTokenExpRef.current = 0;
            // WalletConnect: best-effort disconnect
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (wcProviderRef.current as any)?.disconnect?.();
            } catch {
                // ignore
            }
            providerRef.current = null;
            wcProviderRef.current = null;
            localStorage.removeItem("web3auth:wallet_session");
            setProvider(null);
            setUserInfo(null);
            setAddress(null);
            setChainId(null);
            setConnectorName(null);
            setIsConnected(false);
            setConnectError(null);
        } finally {
            setIsDisconnecting(false);
        }
    }, []);

    // -- Switch chain --
    const switchChain = useCallback(async (params: { chainId: string }) => {
        if (walletRef.current) {
            await walletRef.current.switchChain(params.chainId);
            setChainId(params.chainId);
            return;
        }
        // injected wallet / walletConnect: use provider directly
        const p = providerRef.current ?? wcProviderRef.current;
        if (!p) {
            throw new Error("Wallet not initialized");
        }
        await p.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: params.chainId }],
        });
        setChainId(params.chainId);
    }, []);

    // -- Funding: show TopUpModal with 3 options --
    const showFunding = useCallback(async () => {
        setShowTopUpModal(true);
    }, []);

    // -- Buy crypto: open onramp provider in new tab --
    const handleBuyCrypto = useCallback(() => {
        const addr = address ?? walletRef.current?.addr;
        if (!addr) {
            console.warn("[web3auth] buyCrypto: no wallet address");
            return;
        }
        const opts = configRef.current.web3AuthOptions.onramp;
        const provider = String(opts?.provider ?? "moonpay");
        const fiat = String(opts?.defaultFiat ?? "usd");
        const amount = Number(opts?.defaultAmount ?? 100);

        let url = "";
        if (provider === "transak") {
            const key = String(opts?.transakApiKey ?? "");
            url =
                "https://global.transak.com?apiKey=" +
                encodeURIComponent(key) +
                "&walletAddress=" +
                encodeURIComponent(addr) +
                "&defaultFiatAmount=" +
                amount +
                "&defaultFiatCurrency=" +
                fiat.toUpperCase() +
                "&themeColor=2563eb";
        } else if (provider === "ramp") {
            const key = String(opts?.rampApiKey ?? "");
            url =
                "https://buy.ramp.network?hostApiKey=" +
                encodeURIComponent(key) +
                "&userAddress=" +
                encodeURIComponent(addr) +
                "&swapAsset=ETH" +
                "&fiatValue=" +
                amount +
                "&fiatCurrency=" +
                fiat.toUpperCase();
        } else {
            const key = String(opts?.moonpayApiKey ?? "");
            url =
                "https://buy.moonpay.com?apiKey=" +
                encodeURIComponent(key) +
                "&walletAddress=" +
                encodeURIComponent(addr) +
                "&baseCurrencyAmount=" +
                amount +
                "&baseCurrencyCode=" +
                fiat.toLowerCase() +
                "&currencyCode=eth" +
                "&lockAmount=true" +
                "&theme=dark";
        }

        window.open(url, "_blank", "noopener,noreferrer");
    }, [address]);

    const showWalletUI = useCallback(async () => {
        setShowWalletUIModal(true);
    }, []);

    // Wallet services plugin is always "ready" in this implementation
    const walletServicesReady = true;

    // -- Build the web3Auth object (for backwards compat) --
    const web3Auth = useMemo(
        () => ({
            connectedConnectorName: connectorName,
            switchChain,
        }),
        [connectorName, switchChain],
    );

    const value: Web3AuthContextValue = useMemo(
        () => ({
            isConnected,
            isConnecting,
            provider,
            userInfo,
            chainId,
            address,
            connectorName,
            connectError,
            isDisconnecting,
            connect,
            disconnect,
            switchChain,
            showFunding,
            showWalletUI,
            walletServicesReady,
            web3Auth,
        }),
        [
            isConnected,
            isConnecting,
            provider,
            userInfo,
            chainId,
            address,
            connectorName,
            connectError,
            isDisconnecting,
            connect,
            disconnect,
            switchChain,
            showFunding,
            showWalletUI,
            walletServicesReady,
            web3Auth,
        ],
    );

    return (
        <Web3AuthI18nProvider locale={locale}>
            <Web3AuthContext.Provider value={value}>
                {children}
                {showLoginModal && (
                    <LoginModal
                        appName={uiConfig?.appName ?? "DTOKEN"}
                        theme={uiConfig?.mode ?? "dark"}
                        primaryColor={uiConfig?.primaryColor}
                        primaryText={uiConfig?.primaryText}
                        walletInstalled={walletInstalled}
                        walletConnectEnabled={Boolean(
                            configRef.current.web3AuthOptions.walletConnect
                                ?.projectId,
                        )}
                        onRequestOtp={handleRequestOtp}
                        onVerifyOtp={handleVerifyOtp}
                        onSocialLogin={handleSocialLogin}
                        onWalletLogin={async (wallet) => {
                            const w = String(wallet ?? "").toLowerCase();
                            if (w.includes("metamask"))
                                return await connectInjectedWallet("metamask");
                            if (w.includes("coinbase"))
                                return await connectInjectedWallet("coinbase");
                            if (w.includes("rabby"))
                                return await connectInjectedWallet("rabby");
                            if (w.includes("okx"))
                                return await connectInjectedWallet("okx");
                            if (w.includes("bitget"))
                                return await connectInjectedWallet("bitget");
                            if (w.includes("tokenpocket"))
                                return await connectInjectedWallet(
                                    "tokenpocket",
                                );
                            if (w.includes("trust"))
                                return await connectInjectedWallet("trust");
                            if (w.includes("imtoken"))
                                return await connectInjectedWallet("imtoken");
                            if (w.includes("mathwallet") || w.includes("math"))
                                return await connectInjectedWallet(
                                    "mathwallet",
                                );
                            if (w.includes("safe")) {
                                const injected =
                                    await connectInjectedWallet("safe");
                                if (injected.success) return injected;
                                return await connectWalletConnect();
                            }
                            if (w.includes("ledger"))
                                return await connectWalletConnect();
                            if (w.includes("walletconnect") || w.includes("wc"))
                                return await connectWalletConnect();
                            return await connectInjectedWallet("injected");
                        }}
                        onClose={handleCloseLoginModal}
                        loading={false}
                        error={connectError?.message ?? null}
                        socialProviders={["google", "github", "twitter"]}
                    />
                )}
                <WalletUIModal
                    open={showWalletUIModal}
                    onClose={() => setShowWalletUIModal(false)}
                    theme={uiConfig?.mode ?? "dark"}
                    primaryColor={uiConfig?.primaryColor}
                    primaryText={uiConfig?.primaryText}
                    address={address ?? walletRef.current?.addr ?? null}
                    provider={provider}
                    userInfo={userInfo}
                    connectorName={connectorName}
                    chains={
                        (configRef.current.web3AuthOptions.chains ??
                            []) as CustomChainConfig[]
                    }
                    tokensByChainId={
                        configRef.current.web3AuthOptions.walletUI
                            ?.tokensByChainId ?? {}
                    }
                    onAddFunds={() => setShowTopUpModal(true)}
                />
                <TopUpModal
                    open={showTopUpModal}
                    onClose={() => setShowTopUpModal(false)}
                    theme={uiConfig?.mode ?? "dark"}
                    address={address ?? walletRef.current?.addr ?? null}
                    onBuyCrypto={handleBuyCrypto}
                    chainId={chainId}
                    tokensByChainId={
                        configRef.current.web3AuthOptions.walletUI
                            ?.tokensByChainId ?? {}
                    }
                    nativeSymbol={
                        configRef.current.web3AuthOptions.chains?.find(
                            (c) => c.chainId === chainId,
                        )?.ticker || "ETH"
                    }
                    nativeName={
                        configRef.current.web3AuthOptions.chains?.find(
                            (c) => c.chainId === chainId,
                        )?.tickerName || "Ether"
                    }
                />
                <ConfirmTxModal
                    open={showTxConfirm}
                    onConfirm={handleTxConfirm}
                    onCancel={handleTxCancel}
                    theme={uiConfig?.mode ?? "dark"}
                    tx={confirmTx ?? undefined}
                    backendUrl={authBackendUrl}
                    token={walletRef.current?.token}
                    nativeSymbol={
                        configRef.current.web3AuthOptions.chains?.find(
                            (c) => c.chainId === chainId,
                        )?.ticker ||
                        chainMeta?.symbol ||
                        ""
                    }
                    estimatedFee={estimatedFee}
                />
                <ConfirmSignModal
                    open={showSignConfirm}
                    onConfirm={handleSignConfirm}
                    onCancel={handleSignCancel}
                    theme={uiConfig?.mode ?? "dark"}
                    message={signMessage}
                    backendUrl={authBackendUrl}
                    token={walletRef.current?.token}
                />
            </Web3AuthContext.Provider>
        </Web3AuthI18nProvider>
    );
}

// ---------------------------------------------------------------------------
// Hooks — mirror @web3auth/modal/react
// ---------------------------------------------------------------------------

function useWeb3AuthContext(): Web3AuthContextValue {
    const ctx = useContext(Web3AuthContext);
    if (!ctx) {
        throw new Error(
            "useWeb3Auth* hooks must be used within a <Web3AuthProvider>",
        );
    }
    return ctx;
}

export function useWeb3Auth() {
    const ctx = useWeb3AuthContext();
    return {
        web3Auth: ctx.web3Auth,
        isConnected: ctx.isConnected,
        provider: ctx.provider,
        address: ctx.address,
        chainId: ctx.chainId,
        switchChain: ctx.switchChain,
    };
}

export function useWeb3AuthConnect() {
    const ctx = useWeb3AuthContext();
    return {
        connect: ctx.connect,
        loading: ctx.isConnecting,
        error: ctx.connectError,
        connectorName: ctx.connectorName,
    };
}

export function useWeb3AuthDisconnect() {
    const ctx = useWeb3AuthContext();
    return {
        disconnect: ctx.disconnect,
        loading: ctx.isDisconnecting,
    };
}

export function useWeb3AuthUser() {
    const ctx = useWeb3AuthContext();
    return { userInfo: ctx.userInfo };
}

export function useFunding() {
    const ctx = useWeb3AuthContext();
    return {
        showFunding: ctx.showFunding,
        loading: false,
        error: null,
    };
}

export function useWalletUI() {
    const ctx = useWeb3AuthContext();
    return {
        showWalletUI: ctx.showWalletUI,
        loading: false,
        error: null,
    };
}

export function useWalletServicesPlugin() {
    return { ready: true };
}

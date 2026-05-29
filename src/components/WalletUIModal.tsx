import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { formatUnits, isAddress, parseUnits, toHex } from "viem";
import type { Web3AuthUserInfo } from "../core/types";
import { copyText } from "../core/clipboard";
import { useTranslation } from "../core/i18n";

type ChainConfigLike = {
    chainId: string;
    displayName: string;
    ticker: string;
    tickerName: string;
    decimals?: number;
    logo?: string;
};

type ThemeColors = {
    overlay: string;
    cardBg: string;
    cardShadow: string;
    text: string;
    subtext: string;
    btn: string;
    btnHover: string;
    btnDisabled: string;
        btnText: "#ffffff",
    softBorder: string;
    panelBg: string;
    tagBg: string;
    addressBg: string;
    boxShadowInset: string;
    /** 开关滑块：需与透明轨道 / 绿色轨道都有对比度，勿直接用 cardBg */
    toggleKnobBg: string;
    toggleKnobBorder: string;
};

const LIGHT: ThemeColors = {
    overlay: "rgba(0,0,0,0.55)",
    cardBg: "#fafafa",
    cardShadow: "0 24px 80px rgba(0,0,0,0.28), 0 2px 10px rgba(0,0,0,0.18)",
    text: "#1f1f1f",
    subtext: "#6b7280",
    btn: "#1f1f1f",
    btnHover: "#000000",
    btnDisabled: "#1f1f1f",
        btnText: "#ffffff",
    softBorder: "rgba(0,0,0,0.08)",
    panelBg: "rgba(250,250,250,0.85)",
    tagBg: "rgba(0,0,0,0.05)",
    addressBg: "rgba(240,240,240,0.85)",
    boxShadowInset: "inset 0 -1px 0 rgba(0,0,0,0.05)",
    toggleKnobBg: "#f3f4f6",
    toggleKnobBorder: "rgba(0,0,0,0.12)",
};

const DARK: ThemeColors = {
    overlay: "rgba(0,0,0,0.75)",
    cardBg: "#121214",
    cardShadow: "0 24px 80px rgba(0,0,0,0.55), 0 2px 10px rgba(0,0,0,0.35)",
    text: "#e4e4e7",
    subtext: "#a1a1aa",
    btn: "#e4e4e7",
    btnHover: "#ffffff",
    btnDisabled: "#3f3f46",
        btnText: "#121214",
    softBorder: "rgba(255,255,255,0.10)",
    panelBg: "rgba(18,18,20,0.72)",
    tagBg: "rgba(255,255,255,0.08)",
    addressBg: "rgba(0,0,0,0.22)",
    boxShadowInset: "inset 0 -1px 0 rgba(255,255,255,0.05)",
    toggleKnobBg: "#e4e4e7",
    toggleKnobBorder: "rgba(0,0,0,0.35)",
};

function formatUnitsFromHex(hexValue: string, decimals: number): string {
    try {
        const v = BigInt(hexValue);
        const d = BigInt(Math.max(0, Math.min(36, decimals)));
        const base = 10n ** d;
        const whole = v / base;
        const frac = v % base;
        const fracStr = frac
            .toString()
            .padStart(Number(d), "0")
            .slice(0, 6)
            .replace(/0+$/, "");
        return fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
    } catch {
        return "0";
    }
}

function chainMetaFromId(
    chains: ChainConfigLike[] | undefined,
    chainId: string,
) {
    const cid = String(chainId || "").toLowerCase();
    const hit = (chains ?? []).find(
        (c) => String(c.chainId).toLowerCase() === cid,
    );
    if (hit) {
        return {
            name: hit.displayName,
            ticker: hit.ticker || "ETH",
            tickerName: hit.tickerName || hit.ticker || "Ether",
            decimals: hit.decimals ?? 18,
            logo: hit.logo,
        };
    }
    return {
        name: chainId || "0x0",
        ticker: "ETH",
        tickerName: "Ether",
        decimals: 18,
        logo: undefined,
    };
}

/** 与 dapp Header 的展示习惯对齐：把 authConnection / connector 等映射成可读渠道名 */
function humanizeLoginChannel(raw: string): string {
    const v = raw.trim().toLowerCase();
    if (!v) return raw.trim();
    if (v.includes("google")) return "Google";
    if (v.includes("github")) return "GitHub";
    if (v.includes("twitter") || v === "x") return "X";
    if (v.includes("facebook")) return "Facebook";
    if (v.includes("discord")) return "Discord";
    if (v.includes("email") || v.includes("passwordless")) return "Email";
    if (v.includes("metamask")) return "MetaMask";
    if (v.includes("coinbase")) return "Coinbase";
    if (v.includes("wallet-connect") || v.includes("walletconnect"))
        return "WalletConnect";
    if (v.includes("rabby")) return "Rabby";
    if (v.includes("okx")) return "OKX";
    if (v.includes("bitget")) return "Bitget";
    if (v.includes("tokenpocket")) return "TokenPocket";
    if (v.includes("trust")) return "Trust";
    if (v.includes("imtoken")) return "imToken";
    if (v.includes("mathwallet") || v.includes("math")) return "MathWallet";
    if (v.includes("safe")) return "Safe";
    if (v.includes("ledger")) return "Ledger";
    if (v === "auth") return "Email";
    return raw.trim();
}

function resolveLoginChannelLabel(
    userInfo: Web3AuthUserInfo | null | undefined,
    connectorName: string | null | undefined,
): string | null {
    const fromUi =
        userInfo?.authConnection ??
        userInfo?.typeOfLogin ??
        userInfo?.verifier ??
        "";
    const s = String(fromUi).trim();
    if (s) return humanizeLoginChannel(s);
    const c = String(connectorName ?? "").trim();
    if (!c) return null;
    return humanizeLoginChannel(c);
}

function encodeBalanceOfData(addr: string): string {
    // balanceOf(address): 0x70a08231 + 32-bytes left padded address
    const sig = "70a08231";
    const a = addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
    return `0x${sig}${a}`;
}

/** 顶栏左侧：按渠道展示小图标（与 humanize 后的英文标签对应） */
function LoginChannelIcon(props: { label: string; theme?: "light" | "dark" }) {
    const m = props.label.toLowerCase();
    const dim = {
        width: 20,
        height: 20,
        display: "block" as const,
        flexShrink: 0,
    };
    const gh = props.theme === "dark" ? "#e4e4e7" : "#24292e";

    if (m.includes("google"))
        return (
            <svg viewBox="0 0 24 24" aria-hidden style={dim}>
                <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
            </svg>
        );
    if (m.includes("github"))
        return (
            <svg viewBox="0 0 24 24" aria-hidden style={dim}>
                <path
                    fill={gh}
                    d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.605-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z"
                />
            </svg>
        );
    if (m === "x" || m.includes("twitter"))
        return (
            <svg viewBox="0 0 24 24" aria-hidden style={dim}>
                <path
                    fill={props.theme === "dark" ? "#e4e4e7" : "#0f1419"}
                    d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
                />
            </svg>
        );
    if (m.includes("email"))
        return (
            <svg viewBox="0 0 24 24" aria-hidden style={dim}>
                <path
                    fill="none"
                    stroke={props.theme === "dark" ? "#a1a1aa" : "#6b7280"}
                    strokeWidth="1.75"
                    d="M4 6h16v12H4z"
                />
                <path
                    fill="none"
                    stroke={props.theme === "dark" ? "#a1a1aa" : "#6b7280"}
                    strokeWidth="1.75"
                    d="M4 7l8 6 8-6"
                />
            </svg>
        );
    if (m.includes("metamask"))
        return (
            <svg viewBox="0 0 35 33" aria-hidden style={dim}>
                <path fill="#E17726" d="m32.958 1-13.134 9.718 2.442-5.727z" />
                <path
                    fill="#E27625"
                    d="m2.663 1 13.017 9.809-2.325-5.818zm25.567 22.534-3.495 5.339 7.483 2.06 2.144-7.282zM1.273 23.65l2.13 7.282 7.47-2.06-3.481-5.339z"
                />
                <path
                    fill="#F5841F"
                    d="m19.824 17.988.442-7.593 2-5.403H13.35l2 5.403.442 7.593.169 2.384h3.664z"
                />
            </svg>
        );
    if (m.includes("coinbase"))
        return (
            <svg viewBox="0 0 24 24" aria-hidden style={dim}>
                <circle cx="12" cy="12" r="10" fill="#0052FF" />
                <text
                    x="12"
                    y="16"
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="800"
                    fill="#ffffff"
                >
                    C
                </text>
            </svg>
        );
    if (m.includes("walletconnect"))
        return (
            <svg viewBox="0 0 24 24" aria-hidden style={dim}>
                <path
                    fill="#3B99FC"
                    d="M6.77 8.16 12 12.93l5.23-4.77a1 1 0 0 1 1.35 1.48l-5.9 5.4a1 1 0 0 1-1.36 0l-5.9-5.4a1 1 0 1 1 1.35-1.48z"
                />
            </svg>
        );
    if (m.includes("rabby"))
        return (
            <svg viewBox="0 0 24 24" aria-hidden style={dim}>
                <circle cx="12" cy="12" r="10" fill="#fe6f7b" />
                <text
                    x="12"
                    y="15"
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="800"
                    fill="#fff"
                >
                    R
                </text>
            </svg>
        );
    if (m.includes("okx")) {
        const fill = props.theme === "dark" ? "#e4e4e7" : "#111827";
        return (
            <svg viewBox="0 0 24 24" aria-hidden style={dim}>
                <path
                    fill={fill}
                    d="M8 8h3v3H8zm5 0h3v3h-3zm-5 5h3v3H8zm5 0h3v3h-3zm5-5h3v3h-3zm0 5h3v3h-3z"
                />
            </svg>
        );
    }
    if (m.includes("ledger") || m.includes("safe") || m.includes("trust"))
        return (
            <svg viewBox="0 0 24 24" aria-hidden style={dim}>
                <path
                    fill={props.theme === "dark" ? "#a1a1aa" : "#4b5563"}
                    d="M12 2C8 6 6 9 6 12a6 6 0 1 0 12 0c0-3-2-6-6-10z"
                />
            </svg>
        );
    return (
        <svg viewBox="0 0 24 24" aria-hidden style={dim}>
            <path
                fill="none"
                stroke={props.theme === "dark" ? "#a1a1aa" : "#6b7280"}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 9a7 7 0 0 1 14 0v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9zm7 11v2"
            />
        </svg>
    );
}

export type WalletUIModalProps = {
    open: boolean;
    onClose: () => void;
    theme?: "light" | "dark";
    address?: string | null;
    provider?: {
        request: (args: {
            method: string;
            params?: unknown[];
        }) => Promise<unknown>;
    } | null;
    chains?: ChainConfigLike[];
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
    /** 登录渠道（社交 / 邮箱 / 外部钱包等） */
    userInfo?: Web3AuthUserInfo | null;
    connectorName?: string | null;
    /** 充值回调 */
    onAddFunds?: () => void;
};

function isLightColor(hex: string): boolean {
    const c = hex.startsWith("rgb")
        ? hex.replace(/rgb\(|\s|\)/g, "")
        : hex.replace("#", "");
    const parts = c
        .split(",")
        .map((v) => parseInt(v.trim(), c.includes(",") ? 10 : 16));
    const r = parts[0] ?? 0,
        g = parts[1] ?? 0,
        b = parts[2] ?? 0;
    return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

function resolveTheme(isDark: boolean): ThemeColors {
    return isDark ? DARK : LIGHT;
}

export default function WalletUIModal(props: WalletUIModalProps) {
    const theme = useMemo(
        () => resolveTheme(props.theme !== "light"),
        [props.theme],
    );
    const { t } = useTranslation();
    const [balanceEth, setBalanceEth] = useState<string>("0");
    const [balanceWeiHex, setBalanceWeiHex] = useState<string>("0x0");
    const [chainId, setChainId] = useState<string>("0x0");
    const [showAllTokens, setShowAllTokens] = useState(false);
    const addr = (props.address ?? "").trim();
    const [erc20Balances, setErc20Balances] = useState<Record<string, string>>(
        {},
    );
    const [sendOpen, setSendOpen] = useState(false);
    const [sendTo, setSendTo] = useState("");
    const [sendAmount, setSendAmount] = useState("");
    const [sendBusy, setSendBusy] = useState(false);
    const [sendErr, setSendErr] = useState<string | null>(null);
    const [gasMultiplier, setGasMultiplier] = useState(1.0);
    const [fetchedGasPrice, setFetchedGasPrice] = useState<bigint | null>(null);
    const [estimatedGas, setEstimatedGas] = useState<bigint>(21000n);

    const canCopy = Boolean(addr);
    const canUseProvider = Boolean(props.provider?.request);

    const overlayStyle: CSSProperties = useMemo(
        () => ({
            position: "fixed",
            inset: 0,
            background: theme.overlay,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 99999,
            pointerEvents: "all",
        }),
        [theme.overlay],
    );

    const cardStyle: CSSProperties = useMemo(
        () => ({
            width: 420,
            maxWidth: "100%",
            borderRadius: 18,
            overflow: "hidden",
            background: theme.cardBg,
            boxShadow: theme.cardShadow,
            color: theme.text,
        }),
        [theme.cardBg, theme.cardShadow, theme.text],
    );

    const refresh = useCallback(async () => {
        if (!props.open) return;
        if (!canUseProvider) return;
        if (!addr) return;
        try {
            const [cid, bal] = await Promise.all([
                props.provider!.request({
                    method: "eth_chainId",
                }) as Promise<string>,
                props.provider!.request({
                    method: "eth_getBalance",
                    params: [addr, "latest"],
                }) as Promise<string>,
            ]);
            const balHex = String(bal || "0x0");
            const cidStr = String(cid || "0x0");
            const meta = chainMetaFromId(props.chains, cidStr);
            setChainId(cidStr);
            setBalanceWeiHex(balHex);
            setBalanceEth(formatUnitsFromHex(balHex, meta.decimals));
        } catch {
            // ignore
        }
    }, [addr, canUseProvider, props.chains, props.open, props.provider]);

    const chainMeta = useMemo(
        () => chainMetaFromId(props.chains, chainId),
        [props.chains, chainId],
    );

    const erc20ListForChain = useMemo(() => {
        const map = props.tokensByChainId ?? {};
        const hit =
            map[String(chainId).toLowerCase()] ?? map[String(chainId)] ?? [];
        return Array.isArray(hit) ? hit : [];
    }, [props.tokensByChainId, chainId]);

    const loginChannelLabel = useMemo(
        () => resolveLoginChannelLabel(props.userInfo, props.connectorName),
        [props.userInfo, props.connectorName],
    );

    const canSendNative = Boolean(addr && canUseProvider);

    const fillMaxSend = useCallback(async () => {
        setSendErr(null);
        try {
            const bal = BigInt(balanceWeiHex || "0");
            const gp = fetchedGasPrice ?? 0n;
            const fee =
                (gp * estimatedGas * BigInt(Math.round(gasMultiplier * 100))) /
                100n;
            const max = bal > fee ? bal - fee : 0n;
            if (max === 0n) {
                setSendAmount("");
                return;
            }
            const raw = formatUnits(max, chainMeta.decimals);
            setSendAmount(raw.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""));
        } catch {
            setSendErr(t("wallet.error_max_estimate"));
        }
    }, [
        balanceWeiHex,
        chainMeta.decimals,
        fetchedGasPrice,
        estimatedGas,
        gasMultiplier,
    ]);

    const submitSendNative = useCallback(async () => {
        setSendErr(null);
        if (!addr || !props.provider?.request) return;
        const to = sendTo.trim() as `0x${string}`;
        if (!isAddress(to)) {
            setSendErr(t("wallet.error_invalid_address"));
            return;
        }
        let valueWei: bigint;
        try {
            valueWei = parseUnits(
                (sendAmount || "0").trim(),
                chainMeta.decimals,
            );
        } catch {
            setSendErr(t("wallet.error_invalid_amount"));
            return;
        }
        if (valueWei <= 0n) {
            setSendErr(t("wallet.error_amount_zero"));
            return;
        }
        const bal = BigInt(balanceWeiHex || "0");
        if (valueWei > bal) {
            setSendErr(t("wallet.error_insufficient_balance"));
            return;
        }
        setSendBusy(true);
        try {
            const nonce = await props.provider.request({
                method: "eth_getTransactionCount",
                params: [addr, "pending"],
            });
            const txParams: Record<string, unknown> = {
                from: addr,
                to,
                value: toHex(valueWei),
                nonce,
            };
            if (fetchedGasPrice) {
                txParams.gasPrice = toHex(
                    (fetchedGasPrice *
                        BigInt(Math.round(gasMultiplier * 100))) /
                        100n,
                );
            }
            txParams.gas = toHex(estimatedGas);
            await props.provider.request({
                method: "eth_sendTransaction",
                params: [txParams],
            });
            await refresh();
            setSendOpen(false);
            setSendTo("");
            setSendAmount("");
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setSendErr(msg);
        } finally {
            setSendBusy(false);
        }
    }, [
        addr,
        balanceWeiHex,
        chainMeta.decimals,
        props.provider,
        refresh,
        sendAmount,
        sendTo,
        fetchedGasPrice,
        gasMultiplier,
        estimatedGas,
    ]);

    const refreshErc20 = useCallback(async () => {
        if (!props.open) return;
        if (!canUseProvider) return;
        if (!addr) return;
        const list = erc20ListForChain;
        if (!list.length) {
            setErc20Balances({});
            return;
        }
        try {
            const calls = await Promise.all(
                list.map(async (tk) => {
                    const data = encodeBalanceOfData(addr);
                    const hex = (await props.provider!.request({
                        method: "eth_call",
                        params: [{ to: tk.address, data }, "latest"],
                    })) as string;
                    return [
                        tk.address.toLowerCase(),
                        String(hex || "0x0"),
                    ] as const;
                }),
            );
            const next: Record<string, string> = {};
            for (const [k, v] of calls) next[k] = v;
            setErc20Balances(next);
        } catch {
            // ignore
        }
    }, [addr, canUseProvider, erc20ListForChain, props]);

    useEffect(() => {
        if (!props.open) return;
        void refresh();
        void refreshErc20();
    }, [props.open, refresh, refreshErc20]);

    const estimatedSendFee = useMemo(() => {
        if (!fetchedGasPrice) return null;
        const fee =
            (fetchedGasPrice *
                estimatedGas *
                BigInt(Math.round(gasMultiplier * 10))) /
            10n;
        return Number(fee) / 1e18;
    }, [fetchedGasPrice, estimatedGas, gasMultiplier]);

    useEffect(() => {
        if (!sendOpen || !props.provider?.request) return;
        props.provider
            .request({ method: "eth_gasPrice", params: [] })
            .then((gp) => setFetchedGasPrice(BigInt(gp as string)))
            .catch(() => setFetchedGasPrice(null));
        // 估算转账 gas（Paseo 只需要 ~826）
        if (addr) {
            props.provider
                .request({
                    method: "eth_estimateGas",
                    params: [{ from: addr, to: addr, value: "0x0" }],
                })
                .then((g) => setEstimatedGas(BigInt(g as string)))
                .catch(() => {});
        }
    }, [sendOpen, props.provider, addr]);

    useEffect(() => {
        if (!props.open) {
            setSendOpen(false);
            setSendTo("");
            setSendAmount("");
            setSendErr(null);
            setSendBusy(false);
            setGasMultiplier(1.0);
            setFetchedGasPrice(null);
            setEstimatedGas(21000n);
        }
    }, [props.open]);

    useEffect(() => {
        if (!props.open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            if (sendOpen) {
                setSendOpen(false);
                setSendErr(null);
            } else {
                props.onClose();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [props.onClose, props.open, sendOpen]);

    if (!props.open) return null;

    return createPortal(
        <div
            style={overlayStyle}
            role="dialog"
            aria-modal="true"
            aria-label={`当前网络 ${chainMeta.name}`}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) props.onClose();
            }}
        >
            <div style={cardStyle} onMouseDown={(e) => e.stopPropagation()}>
                {/* 顶栏：当前网络（链图标 + 文案）与登录方式；关闭 */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 14,
                        padding: "12px 16px",
                        borderBottom: `1px solid ${theme.softBorder}`,
                        background: theme.cardBg,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            minWidth: 0,
                            flex: "1 1 auto",
                        }}
                    >
                        <div
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: 10,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 800,
                                overflow: "hidden",
                                flexShrink: 0,
                            }}
                            aria-hidden="true"
                        >
                            {chainMeta.logo ? (
                                <img
                                    src={chainMeta.logo}
                                    alt=""
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "cover",
                                        display: "block",
                                    }}
                                    referrerPolicy="no-referrer"
                                />
                            ) : (
                                <span style={{ fontSize: 16 }}>
                                    {chainMeta.name.slice(0, 1).toUpperCase()}
                                </span>
                            )}
                        </div>
                        <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                            <div
                                style={{
                                    fontSize: 11,
                                    color: theme.subtext,
                                    fontWeight: 600,
                                    letterSpacing: 0.02,
                                }}
                            >
                                当前网络
                            </div>
                            <div
                                style={{
                                    marginTop: 2,
                                    fontSize: 15,
                                    fontWeight: 800,
                                    color: theme.text,
                                    lineHeight: 1.25,
                                    wordBreak: "break-word",
                                    overflow: "hidden",
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical" as const,
                                }}
                                title={chainMeta.name}
                            >
                                {chainMeta.name}
                            </div>
                        </div>
                        {loginChannelLabel ? (
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    flexShrink: 0,
                                    maxWidth: 220,
                                    minWidth: 0,
                                }}
                                title={`login with ${loginChannelLabel}`}
                            >
                                <span
                                    style={{
                                        fontSize: 11,
                                        fontWeight: 600,
                                        color: theme.subtext,
                                        whiteSpace: "nowrap",
                                        flexShrink: 0,
                                    }}
                                >
                                    Login with
                                </span>
                                <LoginChannelIcon
                                    label={loginChannelLabel}
                                    theme={props.theme}
                                />
                                <span
                                    style={{
                                        fontSize: 12,
                                        fontWeight: 700,
                                        color: theme.subtext,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        minWidth: 0,
                                    }}
                                >
                                    {loginChannelLabel}
                                </span>
                            </div>
                        ) : null}
                    </div>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexShrink: 0,
                        }}
                    >
                        <button
                            type="button"
                            onClick={props.onClose}
                            style={{
                                width: 34,
                                height: 34,
                                borderRadius: 999,
                                border: `1px solid ${theme.softBorder}`,
                                background: theme.panelBg,
                                color: theme.text,
                                cursor: "pointer",
                                fontSize: 18,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: 0,
                            }}
                            aria-label="关闭"
                            title="关闭"
                        >
                            ×
                        </button>
                    </div>
                </div>

                {/* 主信息区：地址 → 余额 → 操作 */}
                <div
                    style={{
                        padding: "20px 20px 22px",
                        background: (() => {
                            const c = "228,228,231";
                            const rgb = c.startsWith("rgb")
                                ? c
                                      .replace(/rgb\(|\s|\)/g, "")
                                      .replace(/,/g, ",")
                                : c.replace("#", "");
                            const toRgba = (r: string, a: number) => {
                                if (r.includes(",")) return `rgba(${r},${a})`;
                                const rr = parseInt(r.slice(0, 2), 16);
                                const gg = parseInt(r.slice(2, 4), 16);
                                const bb = parseInt(r.slice(4, 6), 16);
                                return `rgba(${rr},${gg},${bb},${a})`;
                            };
                            return (
                                `radial-gradient(900px 280px at 90% -10%, ${toRgba(rgb, 0.38)}, transparent 58%), ` +
                                `linear-gradient(180deg, ${toRgba(rgb, 0.12)}, transparent 72%)`
                            );
                        })(),
                        boxShadow: theme.boxShadowInset,
                    }}
                >
                    <div
                        style={{
                            marginTop: 0,
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            padding: "10px 10px 10px 14px",
                            borderRadius: 12,
                            background: theme.addressBg,
                        }}
                        title={addr || undefined}
                    >
                        <div
                            style={{
                                flex: "1 1 auto",
                                minWidth: 0,
                                fontSize: 12,
                                fontWeight: 600,
                                color: theme.text,
                                fontFamily:
                                    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                                wordBreak: "break-all",
                                lineHeight: 1.5,
                                userSelect: "text",
                            }}
                        >
                            {addr || "—"}
                        </div>
                        <button
                            type="button"
                            disabled={!canCopy}
                            onClick={async () => {
                                if (!addr) return;
                                await copyText(addr);
                            }}
                            style={{
                                flexShrink: 0,
                                height: 30,
                                padding: "0 12px",
                                borderRadius: 8,
                                background: theme.tagBg,
                                color: theme.text,
                                cursor: canCopy ? "pointer" : "default",
                                opacity: canCopy ? 1 : 0.55,
                                fontSize: 12,
                                fontWeight: 800,
                            }}
                            aria-label={t("wallet.copy_address")}
                            title={t("wallet.copy_address")}
                        >
                            {t("wallet.copy")}
                        </button>
                    </div>

                    {/* Send 弹窗 — 独立层 */}
                    {sendOpen ? (
                        <div
                            style={{
                                position: "fixed",
                                inset: 0,
                                zIndex: 100000,
                                background: "rgba(0,0,0,0.7)",
                                backdropFilter: "blur(6px)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                            onClick={() => {
                                setSendOpen(false);
                                setSendErr(null);
                            }}
                        >
                            <div
                                style={{
                                    width: 380,
                                    maxWidth: "calc(100% - 32px)",
                                    padding: "20px",
                                    borderRadius: 16,
                                    background: theme.cardBg,
                                    boxShadow: theme.cardShadow,
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div
                                    style={{
                                        fontSize: 16,
                                        fontWeight: 800,
                                        color: theme.text,
                                        marginBottom: 6,
                                    }}
                                >
                                    {t("wallet.send_title", {
                                        ticker: chainMeta.ticker,
                                    })}
                                </div>
                                <div
                                    style={{
                                        fontSize: 12,
                                        color: theme.subtext,
                                        marginBottom: 16,
                                    }}
                                >
                                    网络 {chainMeta.name}
                                    {estimatedSendFee != null && (
                                        <span>
                                            {" "}
                                            · 网络费 ≈ {estimatedSendFee}{" "}
                                            {chainMeta.ticker}
                                        </span>
                                    )}
                                </div>
                                <input
                                    type="text"
                                    value={sendTo}
                                    onChange={(e) => setSendTo(e.target.value)}
                                    placeholder={t(
                                        "wallet.send_to_placeholder",
                                    )}
                                    autoComplete="off"
                                    spellCheck={false}
                                    disabled={sendBusy}
                                    style={{
                                        width: "100%",
                                        boxSizing: "border-box",
                                        padding: "10px 12px",
                                        borderRadius: 10,
                                        border: `1px solid ${theme.softBorder}`,
                                        background: theme.cardBg,
                                        color: theme.text,
                                        fontSize: 13,
                                        fontWeight: 600,
                                        outline: "none",
                                    }}
                                />
                                <div style={{ marginTop: 10 }}>
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                        }}
                                    >
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={sendAmount}
                                            onChange={(e) =>
                                                setSendAmount(e.target.value)
                                            }
                                            placeholder={t(
                                                "wallet.send_amount_placeholder",
                                            )}
                                            disabled={sendBusy}
                                            style={{
                                                flex: "1 1 auto",
                                                minWidth: 0,
                                                boxSizing: "border-box",
                                                padding: "10px 12px",
                                                borderRadius: 10,
                                                border: `1px solid ${theme.softBorder}`,
                                                background: theme.cardBg,
                                                color: theme.text,
                                                fontSize: 13,
                                                fontWeight: 600,
                                                outline: "none",
                                            }}
                                        />
                                        <button
                                            type="button"
                                            disabled={
                                                sendBusy || !canSendNative
                                            }
                                            onClick={() => void fillMaxSend()}
                                            style={{
                                                flexShrink: 0,
                                                height: 40,
                                                padding: "0 14px",
                                                borderRadius: 10,
                                                border: `1px solid ${theme.softBorder}`,
                                                background: theme.tagBg,
                                                color: theme.text,
                                                fontSize: 12,
                                                fontWeight: 800,
                                                cursor:
                                                    sendBusy || !canSendNative
                                                        ? "default"
                                                        : "pointer",
                                                opacity:
                                                    sendBusy || !canSendNative
                                                        ? 0.55
                                                        : 1,
                                            }}
                                        >
                                            {t("wallet.send_max")}
                                        </button>
                                    </div>
                                </div>
                                <div style={{ marginTop: 10 }}>
                                    <div
                                        style={{
                                            fontSize: 11,
                                            color: theme.subtext,
                                            marginBottom: 8,
                                        }}
                                    >
                                        预估 Gas 费:{" "}
                                        {estimatedSendFee != null
                                            ? `~${estimatedSendFee.toFixed(6)} ${chainMeta.ticker}`
                                            : "计算中…"}
                                    </div>
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontSize: 11,
                                                color: theme.subtext,
                                            }}
                                        >
                                            倍率
                                        </span>
                                        <input
                                            type="range"
                                            min="0.1"
                                            max="3"
                                            step="0.1"
                                            value={gasMultiplier}
                                            onChange={(e) =>
                                                setGasMultiplier(
                                                    Number(e.target.value),
                                                )
                                            }
                                            disabled={sendBusy}
                                            style={{ flex: 1 }}
                                        />
                                        <span
                                            style={{
                                                fontSize: 13,
                                                fontWeight: 700,
                                                color: theme.text,
                                                minWidth: 36,
                                                textAlign: "right",
                                            }}
                                        >
                                            {gasMultiplier.toFixed(1)}x
                                        </span>
                                    </div>
                                </div>
                                {sendErr ? (
                                    <div
                                        style={{
                                            marginTop: 8,
                                            fontSize: 12,
                                            fontWeight: 600,
                                            color: "#ef4444",
                                            lineHeight: 1.35,
                                        }}
                                    >
                                        {sendErr}
                                    </div>
                                ) : null}
                                <div
                                    style={{
                                        marginTop: 16,
                                        display: "flex",
                                        gap: 10,
                                    }}
                                >
                                    <button
                                        type="button"
                                        disabled={sendBusy}
                                        onClick={() => {
                                            setSendOpen(false);
                                            setSendErr(null);
                                        }}
                                        style={{
                                            flex: "1 1 0",
                                            height: 44,
                                            borderRadius: 999,
                                            border: `1px solid ${theme.softBorder}`,
                                            background: theme.btn,
                                            color: theme.btnText,
                                            fontSize: 14,
                                            fontWeight: 700,
                                            cursor: sendBusy
                                                ? "default"
                                                : "pointer",
                                        }}
                                    >
                                        {t("wallet.cancel")}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={sendBusy || !canSendNative}
                                        onClick={() => void submitSendNative()}
                                        style={{
                                            flex: "2 2 0",
                                            height: 44,
                                            borderRadius: 999,
                                            border: "none",
                                            background:
                                                sendBusy || !canSendNative
                                                    ? theme.btnDisabled
                                                    : theme.btn,
                                            color: theme.btnText,
                                            fontSize: 14,
                                            fontWeight: 700,
                                            cursor:
                                                sendBusy || !canSendNative
                                                    ? "default"
                                                    : "pointer",
                                        }}
                                    >
                                        {sendBusy
                                            ? t("wallet.sending")
                                            : t("wallet.confirm_send")}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {/* 其余主页内容 */}

                    <div
                        style={{
                            marginTop: sendOpen ? 14 : 20,
                            textAlign: "center",
                        }}
                    >
                        <div
                            style={{
                                fontSize: 11,
                                color: theme.subtext,
                                fontWeight: 700,
                                marginBottom: 4,
                            }}
                        >
                            {t("wallet.estimated_balance")}
                        </div>
                        <div
                            style={{
                                fontSize: 48,
                                fontWeight: 800,
                                letterSpacing: -1.5,
                            }}
                        >
                            0{" "}
                            <span
                                style={{
                                    fontSize: 17,
                                    fontWeight: 800,
                                    color: theme.subtext,
                                }}
                            >
                                USD
                            </span>
                        </div>
                    </div>

                    <div
                        style={{
                            marginTop: 16,
                            display: "flex",
                            gap: 10,
                        }}
                    >
                        <button
                            type="button"
                            disabled={!canSendNative || sendOpen || sendBusy}
                            onClick={() => {
                                setSendOpen(true);
                                setSendErr(null);
                            }}
                            style={{
                                flex: "1 1 0",
                                height: 44,
                                borderRadius: 999,
                                border: "none",
                                background:
                                    !canSendNative || sendOpen || sendBusy
                                        ? theme.btnDisabled
                                        : theme.btn,
                                color: theme.btnText,
                                fontSize: 13,
                                fontWeight: 800,
                                cursor:
                                    !canSendNative || sendOpen || sendBusy
                                        ? "default"
                                        : "pointer",
                            }}
                            onMouseEnter={(e) => {
                                if (!canSendNative || sendOpen || sendBusy)
                                    return;
                                (
                                    e.currentTarget as HTMLButtonElement
                                ).style.background = theme.btnHover;
                            }}
                            onMouseLeave={(e) => {
                                if (!canSendNative || sendOpen || sendBusy)
                                    return;
                                (
                                    e.currentTarget as HTMLButtonElement
                                ).style.background = theme.btn;
                            }}
                        >
                            {t("wallet.send")}
                        </button>
                        <button
                            type="button"
                            disabled={!addr || !props.onAddFunds}
                            onClick={() => props.onAddFunds?.()}
                            style={{
                                flex: "1 1 0",
                                height: 44,
                                borderRadius: 999,
                                border: "none",
                                background:
                                    !addr || !props.onAddFunds
                                        ? theme.btnDisabled
                                        : theme.btn,
                                color: theme.btnText,
                                fontSize: 13,
                                fontWeight: 800,
                                cursor:
                                    !addr || !props.onAddFunds
                                        ? "default"
                                        : "pointer",
                            }}
                            onMouseEnter={(e) => {
                                if (!addr || !props.onAddFunds) return;
                                (
                                    e.currentTarget as HTMLButtonElement
                                ).style.background = theme.btnHover;
                            }}
                            onMouseLeave={(e) => {
                                if (!addr || !props.onAddFunds) return;
                                (
                                    e.currentTarget as HTMLButtonElement
                                ).style.background = theme.btn;
                            }}
                        >
                            {t("wallet.top_up")}
                        </button>
                    </div>
                </div>

                <div style={{ padding: "18px 20px 22px" }}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            color: theme.subtext,
                            fontSize: 13,
                            fontWeight: 800,
                            marginBottom: 12,
                        }}
                    >
                        <span>{t("wallet.tokens")}</span>
                        <label
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                cursor: "pointer",
                                userSelect: "none",
                            }}
                        >
                            <span>{t("wallet.show_all")}</span>
                            <button
                                type="button"
                                onClick={() => setShowAllTokens((v) => !v)}
                                aria-pressed={showAllTokens}
                                style={{
                                    width: 44,
                                    height: 24,
                                    borderRadius: 999,
                                    border: `1px solid ${theme.softBorder}`,
                                    background: showAllTokens
                                        ? "rgba(16,185,129,0.75)"
                                        : "transparent",
                                    position: "relative",
                                    padding: 0,
                                    cursor: "pointer",
                                }}
                            >
                                <span
                                    style={{
                                        position: "absolute",
                                        top: 3,
                                        left: showAllTokens ? 22 : 3,
                                        width: 18,
                                        height: 18,
                                        borderRadius: 999,
                                        background: theme.toggleKnobBg,
                                        border: `1px solid ${theme.toggleKnobBorder}`,
                                        boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                                        transition: "left 180ms ease",
                                    }}
                                />
                            </button>
                        </label>
                    </div>

                    {[
                        {
                            key: "native",
                            name: chainMeta.tickerName,
                            symbol: chainMeta.ticker,
                            amount: `${balanceEth} ${chainMeta.ticker}`,
                        },
                        ...(showAllTokens
                            ? erc20ListForChain
                            : erc20ListForChain.slice(0, 3)
                        ).map((tk) => {
                            const raw =
                                erc20Balances[tk.address.toLowerCase()] ??
                                "0x0";
                            const amt = formatUnitsFromHex(raw, tk.decimals);
                            return {
                                key: tk.address,
                                name: tk.name,
                                symbol: tk.symbol,
                                amount: `${amt} ${tk.symbol}`,
                            };
                        }),
                    ].map((row, idx) => (
                        <div
                            key={row.key}
                            style={{
                                borderRadius: 14,
                                border: `1px solid ${theme.softBorder}`,
                                background: theme.panelBg,
                                padding: 14,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 14,
                                marginTop: idx === 0 ? 0 : 10,
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 12,
                                    minWidth: 0,
                                }}
                            >
                                <div
                                    style={{
                                        width: 40,
                                        height: 40,
                                        borderRadius: 999,
                                        background: theme.cardBg,
                                        border: `1px solid ${theme.softBorder}`,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontWeight: 900,
                                    }}
                                    aria-hidden="true"
                                >
                                    {row.symbol.slice(0, 1).toUpperCase()}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <div
                                        style={{
                                            fontSize: 14,
                                            fontWeight: 900,
                                        }}
                                    >
                                        {row.name}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 12,
                                            color: theme.subtext,
                                            fontWeight: 800,
                                        }}
                                    >
                                        {row.symbol}
                                    </div>
                                </div>
                            </div>

                            <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 14, fontWeight: 900 }}>
                                    {row.amount}
                                </div>
                                <div
                                    style={{
                                        fontSize: 12,
                                        color: theme.subtext,
                                        fontWeight: 800,
                                    }}
                                >
                                    = 0 USD
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>,
        document.body,
    );
}

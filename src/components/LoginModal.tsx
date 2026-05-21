import {
    useState,
    useCallback,
    useMemo,
    type CSSProperties,
    type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "../core/i18n";

export interface LoginModalProps {
    onRequestOtp: (
        email: string,
    ) => Promise<{ success: boolean; error?: string }>;
    onVerifyOtp: (
        email: string,
        otp: string,
    ) => Promise<{ success: boolean; error?: string }>;
    onSocialLogin?: (
        provider: string,
    ) => Promise<{ success: boolean; error?: string }>;
    onWalletLogin?: (
        wallet: string,
    ) => Promise<{ success: boolean; error?: string }>;
    walletInstalled?: Partial<Record<string, boolean>>;
    walletConnectEnabled?: boolean;
    onClose: () => void;
    appName?: string;
    onShowFunding?: () => void;
    theme?: "light" | "dark";
    primaryColor?: string;
    primaryText?: string;
    socialProviders?: string[];
    loading?: boolean;
    error?: string | null;
}

type ThemeColors = {
    overlay: string;
    cardBg: string;
    cardShadow: string;
    text: string;
    subtext: string;
    inputBg: string;
    inputBorder: string;
    inputText: string;
    inputPlaceholder: string;
    btnPrimary: string;
    btnPrimaryHover: string;
    btnPrimaryDisabled: string;
    btnPrimaryText: string;
    btnSecondaryBg: string;
    btnSecondaryBorder: string;
    btnSecondaryText: string;
    divider: string;
    closeColor: string;
    errorBg: string;
    errorBorder: string;
    errorText: string;
};

const LIGHT: ThemeColors = {
    overlay: "rgba(0,0,0,0.55)",
    cardBg: "#ffffff",
    cardShadow: "0 24px 80px rgba(0,0,0,0.28), 0 2px 10px rgba(0,0,0,0.18)",
    text: "#1f1f1f",
    subtext: "#888888",
    inputBg: "#ffffff",
    inputBorder: "#dadce0",
    inputText: "#1f1f1f",
    inputPlaceholder: "#999999",
    btnPrimary: "#2563eb",
    btnPrimaryHover: "#1d4ed8",
    btnPrimaryDisabled: "#a0c4ff",
    btnPrimaryText: "#ffffff",
    btnSecondaryBg: "#ffffff",
    btnSecondaryBorder: "#dadce0",
    btnSecondaryText: "#1f1f1f",
    divider: "rgba(128,128,128,0.25)",
    closeColor: "#999999",
    errorBg: "rgba(239,68,68,0.1)",
    errorBorder: "rgba(239,68,68,0.3)",
    errorText: "#ef4444",
};

const DARK: ThemeColors = {
    overlay: "rgba(0,0,0,0.75)",
    cardBg: "#121214",
    cardShadow: "0 24px 80px rgba(0,0,0,0.55), 0 2px 10px rgba(0,0,0,0.35)",
    text: "#e4e4e7",
    subtext: "#71717a",
    inputBg: "#1a1a1e",
    inputBorder: "#2e2e35",
    inputText: "#e4e4e7",
    inputPlaceholder: "#52525b",
    btnPrimary: "#2563eb",
    btnPrimaryHover: "#3b82f6",
    btnPrimaryDisabled: "#1e3a5f",
    btnPrimaryText: "#ffffff",
    btnSecondaryBg: "#1a1a1e",
    btnSecondaryBorder: "#2e2e35",
    btnSecondaryText: "#e4e4e7",
    divider: "rgba(255,255,255,0.08)",
    closeColor: "#71717a",
    errorBg: "rgba(239,68,68,0.12)",
    errorBorder: "rgba(239,68,68,0.25)",
    errorText: "#f87171",
};

const SOCIAL_ICONS: Record<string, { light: string; dark: string }> = {
    google: {
        light: `<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.07 1.53 7.46 2.81l5.1-5.1C33.65 4.56 29.36 2.5 24 2.5 14.62 2.5 6.55 7.88 2.7 15.7l6.13 4.76C10.63 14.2 16.82 9.5 24 9.5z"/><path fill="#34A853" d="M46.15 24.5c0-1.56-.14-3.06-.4-4.5H24v8.52h12.4c-.54 2.84-2.18 5.24-4.64 6.86l7.12 5.52c4.16-3.84 7.27-9.5 7.27-16.4z"/><path fill="#4A90E2" d="M8.83 28.46a14.9 14.9 0 0 1-.78-4.46c0-1.54.27-3.03.78-4.46L2.7 14.78A22.03 22.03 0 0 0 1 24c0 3.54.84 6.88 2.33 9.86l5.5-5.4z"/><path fill="#FBBC05" d="M24 45.5c5.36 0 9.86-1.77 13.15-4.8l-7.12-5.52c-1.97 1.33-4.5 2.1-6.03 2.1-7.18 0-13.37-4.7-15.17-11.02l-6.13 4.76C6.55 40.12 14.62 45.5 24 45.5z"/></svg>`,
        dark: `<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.07 1.53 7.46 2.81l5.1-5.1C33.65 4.56 29.36 2.5 24 2.5 14.62 2.5 6.55 7.88 2.7 15.7l6.13 4.76C10.63 14.2 16.82 9.5 24 9.5z"/><path fill="#34A853" d="M46.15 24.5c0-1.56-.14-3.06-.4-4.5H24v8.52h12.4c-.54 2.84-2.18 5.24-4.64 6.86l7.12 5.52c4.16-3.84 7.27-9.5 7.27-16.4z"/><path fill="#4A90E2" d="M8.83 28.46a14.9 14.9 0 0 1-.78-4.46c0-1.54.27-3.03.78-4.46L2.7 14.78A22.03 22.03 0 0 0 1 24c0 3.54.84 6.88 2.33 9.86l5.5-5.4z"/><path fill="#FBBC05" d="M24 45.5c5.36 0 9.86-1.77 13.15-4.8l-7.12-5.52c-1.97 1.33-4.5 2.1-6.03 2.1-7.18 0-13.37-4.7-15.17-11.02l-6.13 4.76C6.55 40.12 14.62 45.5 24 45.5z"/></svg>`,
    },
    github: {
        light: `<svg width="20" height="20" viewBox="0 0 24 24"><path fill="#24292e" d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.605-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z"/></svg>`,
        dark: `<svg width="20" height="20" viewBox="0 0 24 24"><path fill="#e4e4e7" d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.605-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z"/></svg>`,
    },
    twitter: {
        light: `<svg width="20" height="20" viewBox="0 0 24 24"><path fill="#1d9bf0" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
        dark: `<svg width="20" height="20" viewBox="0 0 24 24"><path fill="#e4e4e7" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    },
};

function svgToDataUri(svg: string): string {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const LOCAL_ICON = {
    metamask: new URL(
        "../assets/wallet-icons/login-metamask.webp",
        import.meta.url,
    ).toString(),
    rabby: new URL(
        "../assets/wallet-icons/login-rabby.webp",
        import.meta.url,
    ).toString(),
    okx: new URL(
        "../assets/wallet-icons/login-okx.webp",
        import.meta.url,
    ).toString(),
    bitget: new URL(
        "../assets/wallet-icons/login-bitget.webp",
        import.meta.url,
    ).toString(),
    tokenpocket: new URL(
        "../assets/wallet-icons/login-tokenpocket.webp",
        import.meta.url,
    ).toString(),
    safe: new URL(
        "../assets/wallet-icons/login-safe.webp",
        import.meta.url,
    ).toString(),
    imtoken: new URL(
        "../assets/wallet-icons/login-imtoken.webp",
        import.meta.url,
    ).toString(),
    mathwallet: new URL(
        "../assets/wallet-icons/login-mathwallet.webp",
        import.meta.url,
    ).toString(),
    coinbase: new URL(
        "../assets/wallet-icons/login-coinbase.webp",
        import.meta.url,
    ).toString(),
} as const;

const WALLET_ICON_URI: Record<string, string> = {
    metamask: LOCAL_ICON.metamask,
    rabby: LOCAL_ICON.rabby,
    okx: LOCAL_ICON.okx,
    bitget: LOCAL_ICON.bitget,
    tokenpocket: LOCAL_ICON.tokenpocket,
    safe: LOCAL_ICON.safe,
    imtoken: LOCAL_ICON.imtoken,
    mathwallet: LOCAL_ICON.mathwallet,
    coinbase: LOCAL_ICON.coinbase,

    // 以下 3 个 URL 在当前环境下会返回 403，先用本地 SVG 占位，后续你如果能拉到 webp 再替换即可
    trust: svgToDataUri(
        `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#2563eb"/><path d="M12 6.5l6 2.2v4.8c0 3.4-2.2 6.4-6 8-3.8-1.6-6-4.6-6-8V8.7l6-2.2z" fill="#fff" opacity="0.95"/></svg>`,
    ),
    ledger: svgToDataUri(
        `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#0b0f19"/><path d="M7.5 8.2h3.1V6.8H6v4.6h1.5V8.2zm9 0h-3.1V6.8H18v4.6h-1.5V8.2zM7.5 15.8H6v4.6h4.6V19h-3.1v-3.2zm10.5 0H18v4.6h-4.6V19h3.1v-3.2z" fill="#fff"/></svg>`,
    ),
    walletconnect: svgToDataUri(
        `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#3b99fc"/><path d="M9.2 10.2a4 4 0 0 1 5.6 0l.3.3 1.1-1.1-.3-.3a5.6 5.6 0 0 0-7.8 0l-.3.3 1.1 1.1.3-.3zm-.8 2.4 1.1-1.1 2.5 2.5 2.5-2.5 1.1 1.1-3.6 3.6-3.6-3.6z" fill="#fff"/></svg>`,
    ),
};

export function LoginModal({
    onRequestOtp,
    onVerifyOtp,
    onSocialLogin,
    onWalletLogin,
    walletInstalled,
    walletConnectEnabled = true,
    onClose,
    appName,
    onShowFunding,
    theme: themeOverride,
    primaryColor,
    primaryText,
    socialProviders = ["google", "github", "twitter"],
    loading = false,
    error: externalError,
}: LoginModalProps) {
    const [step, setStep] = useState<"main" | "email" | "otp" | "all_wallets">(
        "main",
    );
    const [email, setEmail] = useState("");
    const [otp, setOtp] = useState("");
    const [internalError, setInternalError] = useState<string | null>(null);
    const [internalLoading, setInternalLoading] = useState(false);
    const [hoveredSocial, setHoveredSocial] = useState<string | null>(null);
    const [walletSearch, setWalletSearch] = useState("");

    const error = externalError ?? internalError;
    const isLoading = loading || internalLoading;

    // Detect dark mode: override > html.dark class > system preference
    const isDark = useMemo(() => {
        if (themeOverride === "dark") return true;
        if (themeOverride === "light") return false;
        if (typeof document !== "undefined") {
            const html = document.documentElement;
            if (html.classList.contains("dark")) return true;
            if (html.classList.contains("light")) return false;
            if (window.matchMedia?.("(prefers-color-scheme: dark)").matches)
                return true;
        }
        return false;
    }, [themeOverride]);

    const theme = useMemo(() => {
        const base = isDark ? DARK : LIGHT;
        return primaryColor
            ? {
                  ...base,
                  btnPrimary: primaryColor,
                  btnPrimaryText: primaryText ?? base.btnPrimaryText,
              }
            : base;
    }, [isDark, primaryColor]);
    const { t } = useTranslation();
    const icons = isDark ? "dark" : "light";

    // --- Handlers ---
    const handleRequestOtp = useCallback(
        async (e: FormEvent) => {
            e.preventDefault();
            if (!email.trim() || !email.includes("@")) {
                setInternalError("Please enter a valid email address");
                return;
            }
            setInternalError(null);
            setInternalLoading(true);
            try {
                const result = await onRequestOtp(email.trim().toLowerCase());
                if (result.success) setStep("otp");
                else
                    setInternalError(
                        result.error ?? t("login.error_otp_send_failed"),
                    );
            } catch {
                setInternalError(t("login.error_network"));
            } finally {
                setInternalLoading(false);
            }
        },
        [email, onRequestOtp],
    );

    const handleVerifyOtp = useCallback(
        async (e: FormEvent) => {
            e.preventDefault();
            if (!otp.trim()) {
                setInternalError("Please enter the code");
                return;
            }
            setInternalError(null);
            setInternalLoading(true);
            try {
                const result = await onVerifyOtp(
                    email.trim().toLowerCase(),
                    otp.trim(),
                );
                if (!result.success)
                    setInternalError(
                        result.error ?? t("login.error_otp_verify_failed"),
                    );
            } catch {
                setInternalError(t("login.error_network"));
            } finally {
                setInternalLoading(false);
            }
        },
        [email, otp, onVerifyOtp],
    );

    const handleSocial = useCallback(
        async (provider: string) => {
            if (!onSocialLogin) return;
            setInternalError(null);
            setInternalLoading(true);
            try {
                const result = await onSocialLogin(provider);
                if (!result.success)
                    setInternalError(
                        result.error ?? t("login.error_social_failed"),
                    );
            } catch {
                setInternalError(t("login.error_network"));
            } finally {
                setInternalLoading(false);
            }
        },
        [onSocialLogin],
    );

    const handleWallet = useCallback(
        async (wallet: string) => {
            if (!onWalletLogin) return;
            setInternalError(null);
            setInternalLoading(true);
            try {
                const result = await onWalletLogin(wallet);
                if (!result.success)
                    setInternalError(
                        result.error ?? t("login.error_wallet_failed"),
                    );
            } catch {
                setInternalError(t("login.error_network"));
            } finally {
                setInternalLoading(false);
            }
        },
        [onWalletLogin],
    );

    const isInstalled = useCallback(
        (key: string) => Boolean(walletInstalled?.[key]),
        [walletInstalled],
    );

    const canClickInjected = useCallback(
        (key: string) => Boolean(onWalletLogin) && isInstalled(key),
        [isInstalled, onWalletLogin],
    );

    const canClickWalletConnect = useCallback(
        () => Boolean(onWalletLogin) && Boolean(walletConnectEnabled),
        [onWalletLogin, walletConnectEnabled],
    );

    type WalletItem = {
        key: string;
        label: string;
        iconKey: keyof typeof WALLET_ICON_URI;
        kind: "injected" | "walletconnect" | "hybrid";
    };

    const allWalletItems: WalletItem[] = useMemo(
        () => [
            {
                key: "metamask",
                label: "MetaMask",
                iconKey: "metamask",
                kind: "injected",
            },
            {
                key: "coinbase",
                label: "Coinbase",
                iconKey: "coinbase",
                kind: "injected",
            },
            {
                key: "walletconnect",
                label: "WalletConnect",
                iconKey: "walletconnect",
                kind: "walletconnect",
            },
            {
                key: "rabby",
                label: "Rabby",
                iconKey: "rabby",
                kind: "injected",
            },
            {
                key: "okx",
                label: "OKX Wallet",
                iconKey: "okx",
                kind: "injected",
            },
            {
                key: "bitget",
                label: "Bitget Wallet",
                iconKey: "bitget",
                kind: "injected",
            },
            {
                key: "tokenpocket",
                label: "TokenPocket",
                iconKey: "tokenpocket",
                kind: "injected",
            },
            {
                key: "trust",
                label: "Trust Wallet",
                iconKey: "trust",
                kind: "injected",
            },
            { key: "safe", label: "Safe", iconKey: "safe", kind: "hybrid" },
            {
                key: "ledger",
                label: "Ledger",
                iconKey: "ledger",
                kind: "walletconnect",
            },
            {
                key: "imtoken",
                label: "imToken",
                iconKey: "imtoken",
                kind: "injected",
            },
            {
                key: "mathwallet",
                label: "MathWallet",
                iconKey: "mathwallet",
                kind: "injected",
            },
        ],
        [],
    );

    const featuredWalletKeys = [
        "metamask",
        "coinbase",
        "walletconnect",
        "trust",
    ];
    const allWalletsCount = allWalletItems.length;

    const renderWalletRow = (item: WalletItem) => {
        const disabled =
            isLoading ||
            (item.kind === "walletconnect"
                ? !canClickWalletConnect()
                : item.kind === "hybrid"
                  ? !onWalletLogin
                  : !canClickInjected(item.key));

        const badge =
            item.kind === "walletconnect"
                ? walletConnectEnabled
                    ? "Connect"
                    : "Configure WC"
                : item.kind === "hybrid"
                  ? isInstalled(item.key)
                      ? t("login.installed")
                      : "WalletConnect"
                  : isInstalled(item.key)
                    ? t("login.installed")
                    : t("login.not_installed");

        return (
            <button
                key={item.key}
                type="button"
                disabled={disabled}
                onClick={() => {
                    if (disabled) return;
                    if (item.kind === "walletconnect") {
                        void handleWallet("walletconnect");
                        return;
                    }
                    if (item.kind === "hybrid") {
                        void handleWallet(item.key);
                        return;
                    }
                    void handleWallet(item.key);
                }}
                style={{
                    width: "100%",
                    height: 48,
                    borderRadius: 999,
                    border: `1px solid ${theme.btnSecondaryBorder}`,
                    background: "transparent",
                    color: theme.text,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: disabled ? "default" : "pointer",
                    opacity: disabled ? 0.6 : 1,
                    padding: "0 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                }}
            >
                <span
                    style={{
                        display: "inline-flex",
                        gap: 10,
                        alignItems: "center",
                        minWidth: 0,
                    }}
                >
                    <img
                        src={WALLET_ICON_URI[item.iconKey]}
                        alt=""
                        aria-hidden="true"
                        width={22}
                        height={22}
                        style={{ display: "block" }}
                    />
                    <span
                        style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                        }}
                    >
                        {item.label}
                    </span>
                </span>
                <span
                    style={{
                        fontSize: 12,
                        color: theme.subtext,
                        fontWeight: 600,
                        border: `1px solid ${theme.btnSecondaryBorder}`,
                        padding: "4px 10px",
                        borderRadius: 999,
                    }}
                >
                    {badge}
                </span>
            </button>
        );
    };

    // --- Shared styles ---
    const inputStyle = (extra?: CSSProperties): CSSProperties => ({
        width: "100%",
        height: 48,
        borderRadius: 8,
        border: `1px solid ${theme.inputBorder}`,
        padding: "0 14px",
        fontSize: extra?.textAlign === "center" ? 18 : 14,
        color: theme.inputText,
        background: theme.inputBg,
        outline: "none",
        boxSizing: "border-box",
        ...(extra ?? {}),
    });

    const primaryBtn = (disabled: boolean): CSSProperties => ({
        width: "100%",
        height: 48,
        borderRadius: 8,
        border: "none",
        background: disabled ? theme.btnPrimaryDisabled : theme.btnPrimary,
        color: theme.btnPrimaryText,
        fontSize: 14,
        fontWeight: 500,
        cursor: disabled ? "default" : "pointer",
        marginTop: 14,
        transition: "background 0.15s",
    });

    const ghostBtn: CSSProperties = {
        width: "100%",
        height: 40,
        borderRadius: 8,
        border: "none",
        background: "transparent",
        color: theme.subtext,
        fontSize: 13,
        cursor: "pointer",
        marginTop: 8,
    };

    // --- Render ---
    return createPortal(
        <div
            className="w3a-parent-container"
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 99999,
                background: theme.overlay,
                backdropFilter: "blur(10px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily:
                    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                pointerEvents: "all",
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                style={{
                    width: "100%",
                    maxWidth: 400,
                    borderRadius: 16,
                    padding: "32px 28px 24px",
                    background: theme.cardBg,
                    color: theme.text,
                    boxShadow: theme.cardShadow,
                    position: "relative",
                }}
            >
                {/* Close */}
                <button
                    type="button"
                    onClick={onClose}
                    disabled={isLoading}
                    style={{
                        position: "absolute",
                        top: 16,
                        right: 16,
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        border: "none",
                        background: "transparent",
                        color: theme.closeColor,
                        fontSize: 20,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: isLoading ? 0.4 : 1,
                    }}
                >
                    ×
                </button>

                {/* Header */}
                <div style={{ textAlign: "center", marginBottom: 28 }}>
                    <div
                        style={{
                            fontSize: 20,
                            fontWeight: 600,
                            color: theme.text,
                        }}
                    >
                        {t("login.title")}
                    </div>
                    <div
                        style={{
                            fontSize: 13,
                            color: theme.subtext,
                            marginTop: 4,
                        }}
                    >
                        {step === "main"
                            ? t("login.subtitle")
                            : step === "email"
                              ? t("login.email_subtitle")
                              : t("login.otp_subtitle_email", { email })}
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div
                        style={{
                            background: theme.errorBg,
                            border: `1px solid ${theme.errorBorder}`,
                            borderRadius: 8,
                            padding: "10px 14px",
                            marginBottom: 16,
                            fontSize: 13,
                            color: theme.errorText,
                            lineHeight: 1.4,
                        }}
                    >
                        {error}
                    </div>
                )}

                {/* ---- Main ---- */}
                {step === "main" && (
                    <>
                        {/* Social icon row (compact, like Web3Auth modal) */}
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "center",
                                gap: 10,
                                marginBottom: 12,
                            }}
                        >
                            {socialProviders.map((provider) => {
                                const icon =
                                    SOCIAL_ICONS[provider]?.[icons] ?? "";
                                const isHovered =
                                    hoveredSocial === provider && !isLoading;
                                return (
                                    <button
                                        key={provider}
                                        type="button"
                                        disabled={isLoading}
                                        onClick={() => handleSocial(provider)}
                                        onMouseEnter={() =>
                                            setHoveredSocial(provider)
                                        }
                                        onMouseLeave={() =>
                                            setHoveredSocial(null)
                                        }
                                        aria-label={t("login.continue_with", {
                                            provider,
                                        })}
                                        title={t("login.continue_with", {
                                            provider,
                                        })}
                                        style={{
                                            height: 44,
                                            minWidth: 58,
                                            padding: "0 14px",
                                            borderRadius: 999,
                                            border: `1px solid ${theme.btnSecondaryBorder}`,
                                            background: isHovered
                                                ? theme.inputBg
                                                : "transparent",
                                            color: theme.text,
                                            cursor: isLoading
                                                ? "default"
                                                : "pointer",
                                            opacity: isLoading ? 0.6 : 1,
                                            display: "inline-flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            transition:
                                                "background 0.15s, border-color 0.15s",
                                        }}
                                    >
                                        <span
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                            }}
                                            dangerouslySetInnerHTML={{
                                                __html: icon,
                                            }}
                                        />
                                    </button>
                                );
                            })}
                        </div>

                        {/* Email/Phone primary action */}
                        <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => setStep("email")}
                            style={{
                                width: "100%",
                                height: 50,
                                borderRadius: 999,
                                border: `1px solid ${theme.btnSecondaryBorder}`,
                                background: "transparent",
                                color: theme.btnSecondaryText,
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: "pointer",
                                opacity: isLoading ? 0.6 : 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 10,
                            }}
                        >
                            <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke={theme.subtext}
                                strokeWidth="1.5"
                            >
                                <rect
                                    x="2"
                                    y="4"
                                    width="20"
                                    height="16"
                                    rx="2"
                                />
                                <path d="M2 7l10 7 10-7" />
                            </svg>
                            Continue with Email/Phone
                        </button>

                        {/* OR divider */}
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 12,
                                margin: "18px 0 14px",
                            }}
                        >
                            <div
                                style={{
                                    flex: 1,
                                    height: 1,
                                    background: theme.divider,
                                }}
                            />
                            <span
                                style={{
                                    fontSize: 12,
                                    color: theme.subtext,
                                    fontWeight: 600,
                                    letterSpacing: "0.06em",
                                }}
                            >
                                {t("login.or_continue_with")}
                            </span>
                            <div
                                style={{
                                    flex: 1,
                                    height: 1,
                                    background: theme.divider,
                                }}
                            />
                        </div>

                        {/* Wallets (featured) */}
                        <div
                            style={{ display: "flex", flexDirection: "column" }}
                        >
                            {allWalletItems
                                .filter((w) =>
                                    featuredWalletKeys.includes(w.key),
                                )
                                .map((w) => renderWalletRow(w))}

                            <button
                                type="button"
                                disabled={isLoading}
                                onClick={() => {
                                    setWalletSearch("");
                                    setStep("all_wallets");
                                }}
                                style={{
                                    width: "100%",
                                    height: 48,
                                    borderRadius: 999,
                                    border: `1px solid ${theme.btnSecondaryBorder}`,
                                    background: "transparent",
                                    color: theme.subtext,
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: isLoading ? "default" : "pointer",
                                    opacity: isLoading ? 0.7 : 1,
                                    padding: "0 16px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                }}
                            >
                                <span>{t("login.all_wallets")}</span>
                                <span
                                    style={{
                                        fontSize: 12,
                                        color: theme.subtext,
                                        fontWeight: 700,
                                        border: `1px solid ${theme.btnSecondaryBorder}`,
                                        padding: "4px 10px",
                                        borderRadius: 999,
                                    }}
                                >
                                    {allWalletsCount}
                                </span>
                            </button>
                        </div>
                    </>
                )}

                {/* ---- All Wallets ---- */}
                {step === "all_wallets" && (
                    <div>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                marginBottom: 14,
                            }}
                        >
                            <button
                                type="button"
                                disabled={isLoading}
                                onClick={() => setStep("main")}
                                aria-label="Back"
                                title="Back"
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 999,
                                    border: `1px solid ${theme.btnSecondaryBorder}`,
                                    background: "transparent",
                                    color: theme.text,
                                    cursor: isLoading ? "default" : "pointer",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    opacity: isLoading ? 0.6 : 1,
                                }}
                            >
                                ←
                            </button>
                            <div style={{ fontSize: 16, fontWeight: 700 }}>
                                Connect your wallet
                            </div>
                        </div>

                        <input
                            value={walletSearch}
                            onChange={(e) => setWalletSearch(e.target.value)}
                            placeholder={t("login.search_wallets")}
                            disabled={isLoading}
                            style={inputStyle({
                                height: 44,
                                borderRadius: 999,
                            })}
                        />

                        <div
                            style={{
                                marginTop: 14,
                                maxHeight: 420,
                                overflowY: "auto",
                                paddingRight: 2,
                            }}
                        >
                            {allWalletItems
                                .filter((w) => {
                                    const q = walletSearch.trim().toLowerCase();
                                    if (!q) return true;
                                    return w.label.toLowerCase().includes(q);
                                })
                                .map((w) => renderWalletRow(w))}
                        </div>
                    </div>
                )}

                {/* ---- Email ---- */}
                {step === "email" && (
                    <form onSubmit={handleRequestOtp}>
                        <label
                            style={{
                                display: "block",
                                fontSize: 13,
                                fontWeight: 500,
                                color: theme.subtext,
                                marginBottom: 6,
                            }}
                        >
                            Email address
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            disabled={isLoading}
                            autoFocus
                            style={inputStyle()}
                        />
                        <button
                            type="submit"
                            disabled={isLoading}
                            style={primaryBtn(isLoading)}
                        >
                            {isLoading
                                ? t("login.sending")
                                : t("login.send_code")}
                        </button>
                        <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => {
                                setStep("main");
                                setInternalError(null);
                            }}
                            style={ghostBtn}
                        >
                            {t("login.back")}
                        </button>
                    </form>
                )}

                {/* ---- OTP ---- */}
                {step === "otp" && (
                    <form onSubmit={handleVerifyOtp}>
                        <label
                            style={{
                                display: "block",
                                fontSize: 13,
                                fontWeight: 500,
                                color: theme.subtext,
                                marginBottom: 6,
                            }}
                        >
                            {t("login.verification_code")}
                        </label>
                        <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            value={otp}
                            onChange={(e) =>
                                setOtp(
                                    e.target.value
                                        .replace(/\D/g, "")
                                        .slice(0, 6),
                                )
                            }
                            placeholder={t("login.otp_placeholder")}
                            disabled={isLoading}
                            autoFocus
                            style={inputStyle({
                                textAlign: "center",
                                letterSpacing: "0.5em",
                            })}
                        />
                        <button
                            type="submit"
                            disabled={isLoading || otp.length < 6}
                            style={primaryBtn(isLoading || otp.length < 6)}
                        >
                            {isLoading
                                ? t("login.verifying")
                                : t("login.verify_code")}
                        </button>
                        <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => {
                                setStep("email");
                                setOtp("");
                                setInternalError(null);
                            }}
                            style={ghostBtn}
                        >
                            {t("login.back")}
                        </button>
                    </form>
                )}
            </div>
        </div>,
        document.body,
    );
}

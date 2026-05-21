import { useState, useCallback, useMemo, useEffect, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { copyText } from "../core/clipboard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TokenInfo = {
    address?: `0x${string}`;
    name: string;
    symbol: string;
    decimals: number;
    logo?: string;
};

export type TopUpModalProps = {
    open: boolean;
    onClose: () => void;
    theme?: "light" | "dark";
    address?: string | null;
    onBuyCrypto?: () => void;
    chainId?: string | null;
    tokensByChainId?: Record<string, TokenInfo[]>;
    nativeSymbol?: string;
    nativeName?: string;
};

type ThemeColors = {
    overlay: string;
    cardBg: string;
    cardShadow: string;
    text: string;
    subtext: string;
    optionBg: string;
    optionBorder: string;
    optionHoverBg: string;
    optionHoverBorder: string;
    iconBg: string;
    iconColor: string;
    btnPrimary: string;
    btnPrimaryHover: string;
    divider: string;
    closeColor: string;
    pillBg: string;
    pillColor: string;
};

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const LIGHT: ThemeColors = {
    overlay: "rgba(0,0,0,0.55)",
    cardBg: "#ffffff",
    cardShadow: "0 24px 80px rgba(0,0,0,0.28), 0 2px 10px rgba(0,0,0,0.18)",
    text: "#1f1f1f",
    subtext: "#888888",
    optionBg: "#f9fafb",
    optionBorder: "#e5e7eb",
    optionHoverBg: "#f3f4f6",
    optionHoverBorder: "#d1d5db",
    iconBg: "#eff6ff",
    iconColor: "#2563eb",
    btnPrimary: "#2563eb",
    btnPrimaryHover: "#1d4ed8",
    divider: "rgba(128,128,128,0.25)",
    closeColor: "#999999",
    pillBg: "#eff6ff",
    pillColor: "#2563eb",
};

const DARK: ThemeColors = {
    overlay: "rgba(0,0,0,0.75)",
    cardBg: "#121214",
    cardShadow: "0 24px 80px rgba(0,0,0,0.55), 0 2px 10px rgba(0,0,0,0.35)",
    text: "#e4e4e7",
    subtext: "#71717a",
    optionBg: "#1a1a1e",
    optionBorder: "#2e2e35",
    optionHoverBg: "#222228",
    optionHoverBorder: "#3e3e48",
    iconBg: "#1e293b",
    iconColor: "#60a5fa",
    btnPrimary: "#2563eb",
    btnPrimaryHover: "#3b82f6",
    divider: "rgba(255,255,255,0.08)",
    closeColor: "#71717a",
    pillBg: "#1e293b",
    pillColor: "#93c5fd",
};

// ---------------------------------------------------------------------------
// Icons (inline SVG)
// ---------------------------------------------------------------------------

function TokenMarketIcon({ color }: { color: string }) {
    return (
        <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="10" />
            <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
            <path d="M12 6v2" />
            <path d="M12 16v2" />
        </svg>
    );
}

function ReceiveIcon({ color }: { color: string }) {
    return (
        <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
    );
}

function TransferIcon({ color }: { color: string }) {
    return (
        <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M17 1l4 4-4 4" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <path d="M7 23l-4-4 4-4" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
    );
}

function CopyIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}

function QRCodeSVG({ data, size = 160 }: { data: string; size?: number }) {
    // Simplified QR-like rendering — shows a visual indicator that there's a wallet address
    // In production, use a proper QR library like qrcode
    const cells = 25;
    const cellSize = size / cells;
    const pad = 4; // padding

    // Generate a deterministic pattern from the address string
    const seed = Array.from(data).reduce((a, c) => a + c.charCodeAt(0), 0);

    const rects: { x: number; y: number }[] = [];
    for (let row = 0; row < cells; row++) {
        for (let col = 0; col < cells; col++) {
            // Simple pseudo-random based on position and seed
            const h = ((row * 31 + col * 17 + seed) * 2654435761) >>> 0;
            // Leave border padding empty
            if (
                row < pad ||
                row >= cells - pad ||
                col < pad ||
                col >= cells - pad
            )
                continue;
            // Finder patterns (top-left, top-right, bottom-left)
            if (row < 7 && col < 7) {
                if (row === 0 || row === 6 || col === 0 || col === 6) continue;
                if (row >= 2 && row <= 4 && col >= 2 && col <= 4) {
                    rects.push({ x: col, y: row });
                    continue;
                }
                continue;
            }
            if (row < 7 && col >= cells - 7) {
                if (
                    row === 0 ||
                    row === 6 ||
                    col === cells - 1 ||
                    col === cells - 7
                )
                    continue;
                if (
                    row >= 2 &&
                    row <= 4 &&
                    col >= cells - 5 &&
                    col <= cells - 3
                ) {
                    rects.push({ x: col, y: row });
                    continue;
                }
                continue;
            }
            if (row >= cells - 7 && col < 7) {
                if (
                    row === cells - 1 ||
                    row === cells - 7 ||
                    col === 0 ||
                    col === 6
                )
                    continue;
                if (
                    row >= cells - 5 &&
                    row <= cells - 3 &&
                    col >= 2 &&
                    col <= 4
                ) {
                    rects.push({ x: col, y: row });
                    continue;
                }
                continue;
            }
            if (h % 3 === 0) rects.push({ x: col, y: row });
        }
    }

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <rect width={size} height={size} fill="#ffffff" rx="8" />
            {rects.map((r, i) => (
                <rect
                    key={i}
                    x={r.x * cellSize}
                    y={r.y * cellSize}
                    width={cellSize}
                    height={cellSize}
                    fill="#000000"
                    rx={cellSize * 0.15}
                />
            ))}
        </svg>
    );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TopUpModal({
    open,
    onClose,
    theme = "dark",
    address,
    onBuyCrypto,
    chainId,
    tokensByChainId,
    nativeSymbol = "ETH",
    nativeName = "Ether",
}: TopUpModalProps) {
    const t = theme === "light" ? LIGHT : DARK;

    const [step, setStep] = useState<"main" | "receive" | "transfer">("main");
    const [copied, setCopied] = useState(false);
    const [hoveredOption, setHoveredOption] = useState<string | null>(null);
    const [selectedToken, setSelectedToken] = useState<TokenInfo & { isNative: boolean }>({
        name: nativeName,
        symbol: nativeSymbol,
        decimals: 18,
        isNative: true,
    });

    // Build token list for current chain
    const tokenList = useMemo(() => {
        const list: (TokenInfo & { isNative: boolean })[] = [
            { name: nativeName, symbol: nativeSymbol, decimals: 18, isNative: true },
        ];
        if (!chainId || !tokensByChainId) return list;
        const cid = String(chainId).toLowerCase();
        const tokens = tokensByChainId[cid] ?? tokensByChainId[String(chainId)] ?? [];
        for (const tk of tokens) {
            list.push({ ...tk, isNative: false });
        }
        return list;
    }, [chainId, tokensByChainId, nativeSymbol, nativeName]);

    // Reset selected token when chain changes
    useEffect(() => {
        setSelectedToken({
            name: nativeName,
            symbol: nativeSymbol,
            decimals: 18,
            isNative: true,
        });
    }, [chainId, nativeSymbol, nativeName]);

    // Reset step when modal opens/closes
    const handleClose = useCallback(() => {
        setStep("main");
        setCopied(false);
        onClose();
    }, [onClose]);

    const handleCopyAddress = useCallback(() => {
        if (!address) return;
        copyText(address).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [address]);

    const addr = address ?? "";
    const shortAddr = addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";

    // -- Styles --
    const overlayStyle: CSSProperties = {
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: t.overlay,
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        pointerEvents: "all",
    };

    const cardStyle: CSSProperties = {
        width: 420,
        maxWidth: "calc(100% - 32px)",
        borderRadius: 18,
        padding: "28px 24px 24px",
        background: t.cardBg,
        color: t.text,
        boxShadow: t.cardShadow,
        position: "relative",
    };

    const closeBtn: CSSProperties = {
        position: "absolute",
        top: 12,
        right: 12,
        width: 32,
        height: 32,
        borderRadius: "50%",
        border: "none",
        background: "transparent",
        color: t.closeColor,
        fontSize: 20,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: 0.8,
    };

    const optionCard = (key: string): CSSProperties => ({
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "16px",
        borderRadius: 12,
        border: `1px solid ${
            hoveredOption === key ? t.optionHoverBorder : t.optionBorder
        }`,
        background: hoveredOption === key ? t.optionHoverBg : t.optionBg,
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
        marginBottom: 10,
    });

    const iconCircle: CSSProperties = {
        width: 44,
        height: 44,
        borderRadius: "50%",
        background: t.iconBg,
        color: t.iconColor,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    };

    const primaryBtn: CSSProperties = {
        width: "100%",
        height: 48,
        borderRadius: 10,
        border: "none",
        background: t.btnPrimary,
        color: "#ffffff",
        fontSize: 15,
        fontWeight: 600,
        cursor: "pointer",
        marginTop: 16,
        transition: "background 0.15s",
    };

    const ghostBtn: CSSProperties = {
        width: "100%",
        height: 40,
        borderRadius: 8,
        border: "none",
        background: "transparent",
        color: t.subtext,
        fontSize: 13,
        cursor: "pointer",
        marginTop: 8,
    };

    const addressBox: CSSProperties = {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "12px 16px",
        borderRadius: 10,
        border: `1px solid ${t.optionBorder}`,
        background: t.optionBg,
        fontSize: 13,
        fontFamily: "monospace",
        wordBreak: "break-all",
        color: t.text,
        marginTop: 12,
    };

    const pill: CSSProperties = {
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 10px",
        borderRadius: 999,
        background: t.pillBg,
        color: t.pillColor,
        fontSize: 12,
        fontWeight: 600,
    };

    if (!open) return null;

    // ---- Receive view ----
    if (step === "receive") {
        return (
            <div
                style={overlayStyle}
                onClick={(e) => {
                    if (e.target === e.currentTarget) handleClose();
                }}
            >
                <div style={cardStyle}>
                    <button
                        style={closeBtn}
                        onClick={handleClose}
                        aria-label="Close"
                    >
                        ×
                    </button>

                    <div style={{ textAlign: "center", marginBottom: 20 }}>
                        <div
                            style={{
                                fontSize: 20,
                                fontWeight: 600,
                                color: t.text,
                            }}
                        >
                            Receive Crypto
                        </div>
                        <div
                            style={{
                                fontSize: 13,
                                color: t.subtext,
                                marginTop: 4,
                            }}
                        >
                            Share your wallet address to receive funds
                        </div>
                        {selectedToken && (
                            <div
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    marginTop: 10,
                                    padding: "5px 12px",
                                    borderRadius: 999,
                                    background: t.pillBg,
                                    color: t.pillColor,
                                    fontSize: 12,
                                    fontWeight: 600,
                                }}
                            >
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M12 6v6l4 2" />
                                </svg>
                                Receiving {selectedToken.symbol}
                            </div>
                        )}
                    </div>

                    {/* QR Code */}
                    {addr && (
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "center",
                                marginBottom: 16,
                            }}
                        >
                            <QRCodeSVG data={addr} size={180} />
                        </div>
                    )}

                    {/* Separator */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            marginBottom: 12,
                            fontSize: 12,
                            color: t.subtext,
                        }}
                    >
                        <span
                            style={{
                                flex: 1,
                                height: 1,
                                background: t.divider,
                            }}
                        />
                        <span>or copy address</span>
                        <span
                            style={{
                                flex: 1,
                                height: 1,
                                background: t.divider,
                            }}
                        />
                    </div>

                    {/* Address */}
                    <div style={addressBox}>
                        <span
                            style={{
                                flex: 1,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {shortAddr || "No wallet connected"}
                        </span>
                        <button
                            onClick={handleCopyAddress}
                            disabled={!addr}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "6px 10px",
                                borderRadius: 6,
                                border: `1px solid ${t.optionBorder}`,
                                background: copied ? "#16a34a" : t.optionBg,
                                color: copied ? "#ffffff" : t.text,
                                fontSize: 12,
                                fontWeight: 500,
                                cursor: addr ? "pointer" : "default",
                                flexShrink: 0,
                            }}
                        >
                            {copied ? <CheckIcon /> : <CopyIcon />}
                            {copied ? "Copied!" : "Copy"}
                        </button>
                    </div>

                    <button style={ghostBtn} onClick={() => setStep("main")}>
                        ← Back
                    </button>
                </div>
            </div>
        );
    }

    // ---- Transfer view ----
    if (step === "transfer") {
        return (
            <div
                style={overlayStyle}
                onClick={(e) => {
                    if (e.target === e.currentTarget) handleClose();
                }}
            >
                <div style={cardStyle}>
                    <button
                        style={closeBtn}
                        onClick={handleClose}
                        aria-label="Close"
                    >
                        ×
                    </button>

                    <div style={{ textAlign: "center", marginBottom: 20 }}>
                        <div
                            style={{
                                fontSize: 20,
                                fontWeight: 600,
                                color: t.text,
                            }}
                        >
                            Transfer Crypto
                        </div>
                        <div
                            style={{
                                fontSize: 13,
                                color: t.subtext,
                                marginTop: 4,
                            }}
                        >
                            Link your exchange account to transfer funds for
                            free
                        </div>
                    </div>

                    {/* Coinbase option */}
                    <div
                        style={optionCard("coinbase")}
                        onMouseEnter={() => setHoveredOption("coinbase")}
                        onMouseLeave={() => setHoveredOption(null)}
                        onClick={() =>
                            window.open("https://coinbase.com/", "_blank")
                        }
                    >
                        <div style={iconCircle}>
                            <svg
                                width="22"
                                height="22"
                                viewBox="0 0 24 24"
                                fill="none"
                            >
                                <circle cx="12" cy="12" r="11" fill="#0052FF" />
                                <path
                                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15.93c-3.95-.49-7-3.85-7-7.93 0-.86.13-1.7.39-2.5.12-.37.55-.52.87-.33l2.34 1.41c.22.13.36.37.36.63V9.5c0-.27-.14-.51-.37-.65L5.83 7.64c-.3-.17-.42-.55-.23-.85C6.5 4.92 9 3.78 11.76 4.01c.1.01.2.02.3.04v2.85c0 .22.1.43.27.56l1.84 1.46c.18.14.43.15.62.02l2.29-1.57c.24-.16.57-.08.73.18.17.27.14.63-.07.86l-3.12 3.43c-.18.2-.26.46-.23.73l.49 3.78c.04.26-.14.5-.4.45-1.93-.31-3.62-1.49-4.65-3.14-.14-.22-.04-.5.2-.57l2.14-.78c.2-.07.35-.24.39-.44l.31-1.58c.05-.24-.13-.47-.37-.47H9.05c-.28 0-.51.23-.46.5.28 1.53 1.1 2.88 2.28 3.86.26.22.67.22.93 0 .62-.52 1.1-1.16 1.41-1.89.09-.22-.05-.47-.29-.47h-1.92c-.28 0-.5.24-.44.52z"
                                    fill="white"
                                />
                            </svg>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div
                                style={{
                                    fontSize: 15,
                                    fontWeight: 600,
                                    color: t.text,
                                }}
                            >
                                Coinbase
                            </div>
                            <div
                                style={{
                                    fontSize: 12,
                                    color: t.subtext,
                                    marginTop: 2,
                                }}
                            >
                                Link your Coinbase account to transfer funds
                            </div>
                        </div>
                        <div style={{ color: t.subtext }}>
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                        </div>
                    </div>

                    {/* Binance option */}
                    <div
                        style={optionCard("binance")}
                        onMouseEnter={() => setHoveredOption("binance")}
                        onMouseLeave={() => setHoveredOption(null)}
                        onClick={() =>
                            window.open("https://binance.com/", "_blank")
                        }
                    >
                        <div style={iconCircle}>
                            <svg
                                width="22"
                                height="22"
                                viewBox="0 0 24 24"
                                fill="none"
                            >
                                <circle cx="12" cy="12" r="11" fill="#F0B90B" />
                                <path
                                    d="M9.4 10.5l2.6-2.6 2.6 2.6 1.5-1.5L12 4.9 7.9 9l1.5 1.5zM4.9 12l1.5-1.5L7.9 12l-1.5 1.5L4.9 12zm4.5 1.5l2.6 2.6 2.6-2.6 1.5 1.5-4.1 4.1-4.1-4.1 1.5-1.5zm5.7-1.5l1.5-1.5 1.5 1.5-1.5 1.5-1.5-1.5z"
                                    fill="white"
                                />
                            </svg>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div
                                style={{
                                    fontSize: 15,
                                    fontWeight: 600,
                                    color: t.text,
                                }}
                            >
                                Binance
                            </div>
                            <div
                                style={{
                                    fontSize: 12,
                                    color: t.subtext,
                                    marginTop: 2,
                                }}
                            >
                                Link your Binance account to transfer funds
                            </div>
                        </div>
                        <div style={{ color: t.subtext }}>
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                        </div>
                    </div>

                    <div
                        style={{
                            textAlign: "center",
                            fontSize: 12,
                            color: t.subtext,
                            marginTop: 12,
                        }}
                    >
                        Transferring from exchanges is often free or very low
                        cost. You'll need to log in to your exchange account.
                    </div>

                    <button style={ghostBtn} onClick={() => setStep("main")}>
                        ← Back
                    </button>
                </div>
            </div>
        );
    }

    // ---- Main view ----
    return createPortal(
        <div
            style={overlayStyle}
            onClick={(e) => {
                if (e.target === e.currentTarget) handleClose();
            }}
        >
            <div style={cardStyle}>
                <button
                    style={closeBtn}
                    onClick={handleClose}
                    aria-label="Close"
                >
                    ×
                </button>

                {/* Header */}
                <div style={{ textAlign: "center", marginBottom: 20 }}>
                    <div
                        style={{ fontSize: 20, fontWeight: 600, color: t.text }}
                    >
                        Charge
                    </div>
                    <div
                        style={{ fontSize: 13, color: t.subtext, marginTop: 4 }}
                    >
                        Choose how to charge your wallet
                    </div>
                </div>

                {/* Currency selector */}
                <div style={{ marginBottom: 20 }}>
                    <label
                        style={{
                            display: "block",
                            fontSize: 12,
                            color: t.subtext,
                            marginBottom: 6,
                            fontWeight: 500,
                        }}
                    >
                        {tokenList.length > 1 ? "选择货币" : "当前货币"}
                    </label>
                    {tokenList.length > 1 ? (
                        <div style={{ position: "relative" }}>
                            <select
                                value={selectedToken.symbol}
                                onChange={(e) => {
                                    const tk = tokenList.find(
                                        (x) => x.symbol === e.target.value,
                                    );
                                    if (tk) setSelectedToken(tk);
                                }}
                                style={{
                                    width: "100%",
                                    height: 44,
                                    padding: "0 36px 0 14px",
                                    borderRadius: 10,
                                    border: `1px solid ${t.optionBorder}`,
                                    background: t.optionBg,
                                    color: t.text,
                                    fontSize: 14,
                                    fontWeight: 600,
                                    appearance: "none",
                                    cursor: "pointer",
                                    outline: "none",
                                }}
                            >
                                {tokenList.map((tk) => (
                                    <option key={tk.symbol} value={tk.symbol}>
                                        {tk.symbol} — {tk.name}
                                        {tk.isNative ? " (Native)" : ""}
                                    </option>
                                ))}
                            </select>
                            <div
                                style={{
                                    position: "absolute",
                                    right: 12,
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    pointerEvents: "none",
                                    color: t.subtext,
                                }}
                            >
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <polyline points="6 9 12 15 18 9" />
                                </svg>
                            </div>
                        </div>
                    ) : (
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                height: 44,
                                padding: "0 14px",
                                borderRadius: 10,
                                border: `1px solid ${t.optionBorder}`,
                                background: t.optionBg,
                                color: t.text,
                                fontSize: 14,
                                fontWeight: 600,
                            }}
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 6v6l4 2" />
                            </svg>
                            {selectedToken.symbol} — {selectedToken.name}
                            {selectedToken.isNative ? " (Native)" : ""}
                        </div>
                    )}
                </div>

                {/* Option 1: Token Market */}
                <div
                    style={optionCard("market")}
                    onMouseEnter={() => setHoveredOption("market")}
                    onMouseLeave={() => setHoveredOption(null)}
                    onClick={() => onBuyCrypto?.()}
                >
                    <div style={iconCircle}>
                        <TokenMarketIcon color={t.iconColor} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div
                            style={{
                                fontSize: 15,
                                fontWeight: 600,
                                color: t.text,
                            }}
                        >
                            Token Market
                        </div>
                        <div
                            style={{
                                fontSize: 12,
                                color: t.subtext,
                                marginTop: 2,
                            }}
                        >
                            Buy with debit or credit card
                        </div>
                    </div>
                    <div style={{ ...pill, fontSize: 11 }}>最快</div>
                    <div style={{ color: t.subtext, marginLeft: 4 }}>
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                    </div>
                </div>

                {/* Option 2: Receive Crypto */}
                <div
                    style={optionCard("receive")}
                    onMouseEnter={() => setHoveredOption("receive")}
                    onMouseLeave={() => setHoveredOption(null)}
                    onClick={() => setStep("receive")}
                >
                    <div style={iconCircle}>
                        <ReceiveIcon color={t.iconColor} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div
                            style={{
                                fontSize: 15,
                                fontWeight: 600,
                                color: t.text,
                            }}
                        >
                            Receive Crypto
                        </div>
                        <div
                            style={{
                                fontSize: 12,
                                color: t.subtext,
                                marginTop: 2,
                            }}
                        >
                            Deposit from another account using wallet address or
                            QR code
                        </div>
                    </div>
                    <div
                        style={{
                            ...pill,
                            fontSize: 11,
                            background: t.optionBg,
                            color: t.subtext,
                        }}
                    >
                        免手续费
                    </div>
                    <div style={{ color: t.subtext, marginLeft: 4 }}>
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                    </div>
                </div>

                {/* Option 3: Transfer Crypto */}
                <div
                    style={optionCard("transfer")}
                    onMouseEnter={() => setHoveredOption("transfer")}
                    onMouseLeave={() => setHoveredOption(null)}
                    onClick={() => setStep("transfer")}
                >
                    <div style={iconCircle}>
                        <TransferIcon color={t.iconColor} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div
                            style={{
                                fontSize: 15,
                                fontWeight: 600,
                                color: t.text,
                            }}
                        >
                            Transfer Crypto
                        </div>
                        <div
                            style={{
                                fontSize: 12,
                                color: t.subtext,
                                marginTop: 2,
                            }}
                        >
                            Link your Coinbase or Binance account to transfer
                            for free
                        </div>
                    </div>
                    <div
                        style={{
                            ...pill,
                            fontSize: 11,
                            background: t.optionBg,
                            color: t.subtext,
                        }}
                    >
                        免手续费
                    </div>
                    <div style={{ color: t.subtext, marginLeft: 4 }}>
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                    </div>
                </div>

                {/* Warning note */}
                <div
                    style={{
                        textAlign: "center",
                        fontSize: 11,
                        color: t.subtext,
                        marginTop: 16,
                        lineHeight: 1.5,
                    }}
                >
                    Only send {selectedToken.symbol} to this address.
                    {selectedToken.isNative
                        ? " Sending other assets may result in permanent loss."
                        : " Make sure the sender uses the correct token contract. Sending other assets may result in permanent loss."}
                </div>
            </div>
        </div>,
        document.body,
    );
}

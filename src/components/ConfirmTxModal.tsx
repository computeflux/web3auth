import { useState, useCallback, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
    hasTxPassword,
    setTxPassword,
    verifyTxPassword,
    hashPassword,
} from "../core/txPassword";

export type TxConfirmProps = {
    open: boolean;
    onConfirm: (passwordHash: string) => void;
    onCancel: () => void;
    theme?: "light" | "dark";
    backendUrl?: string;
    token?: string;
    tx?: {
        to?: string;
        value?: string;
        data?: string;
        amount?: string;
    };
    chainName?: string;
    nativeSymbol?: string;
    estimatedFee?: string;
};

const LIGHT = {
    overlay: "rgba(0,0,0,0.55)",
    cardBg: "#ffffff",
    cardShadow: "0 24px 80px rgba(0,0,0,0.28)",
    text: "#1f1f1f",
    subtext: "#888",
    inputBg: "#f9fafb",
    inputBorder: "#e5e7eb",
    btnPrimary: "#2563eb",
    btnPrimaryHover: "#1d4ed8",
    btnGhost: "transparent",
    errorText: "#ef4444",
    pinBox: "#f3f4f6",
    pinBorder: "#d1d5db",
    pinFocus: "#2563eb",
};

const DARK = {
    overlay: "rgba(0,0,0,0.75)",
    cardBg: "#121214",
    cardShadow: "0 24px 80px rgba(0,0,0,0.55)",
    text: "#e4e4e7",
    subtext: "#71717a",
    inputBg: "#1a1a1e",
    inputBorder: "#2e2e35",
    btnPrimary: "#2563eb",
    btnPrimaryHover: "#3b82f6",
    btnGhost: "transparent",
    errorText: "#f87171",
    pinBox: "#1a1a1e",
    pinBorder: "#2e2e35",
    pinFocus: "#2563eb",
};

export default function ConfirmTxModal({
    open,
    onConfirm,
    onCancel,
    theme = "dark",
    backendUrl,
    token,
    tx,
    chainName,
    nativeSymbol,
    estimatedFee,
}: TxConfirmProps) {
    const t = theme === "light" ? LIGHT : DARK;
    const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
    const [error, setError] = useState("");
    const [isNew, setIsNew] = useState(!hasTxPassword());
    const [confirmDigits, setConfirmDigits] = useState<string[]>([
        "",
        "",
        "",
        "",
        "",
        "",
    ]);
    const passwordRefs = useRef<(HTMLInputElement | null)[]>([]);
    const confirmRefs = useRef<(HTMLInputElement | null)[]>([]);

    const getPwd = (d: string[]) => d.join("");
    const clear = () => {
        setDigits(["", "", "", "", "", ""]);
        setConfirmDigits(["", "", "", "", "", ""]);
        setError("");
    };

    const handleInput = (
        idx: number,
        val: string,
        setter: typeof setDigits,
        refs: typeof passwordRefs,
    ) => {
        if (!/^\d?$/.test(val)) return;
        const nextDigits = [...(setter === setDigits ? digits : confirmDigits)];
        nextDigits[idx] = val;
        setter(nextDigits);
        if (val && idx < 5 && refs?.current) {
            refs.current[idx + 1]?.focus();
        }
    };

    const handleKeyDown = (
        idx: number,
        e: React.KeyboardEvent,
        setter: typeof setDigits,
        refs: typeof passwordRefs,
    ) => {
        const current = setter === setDigits ? digits : confirmDigits;
        if (e.key === "Backspace" && !current[idx] && idx > 0) {
            const next = [...current];
            next[idx - 1] = "";
            setter(next);
            refs.current[idx - 1]?.focus();
        }
    };

    const handleSubmit = useCallback(async () => {
        setError("");
        const pwd = getPwd(digits);
        if (pwd.length !== 6) {
            setError(isNew ? "请输入完整的 6 位密码" : "请输入完整的 6 位密码");
            return;
        }
        if (isNew) {
            const cpwd = getPwd(confirmDigits);
            if (cpwd.length !== 6) {
                setError("请确认密码");
                return;
            }
            if (pwd !== cpwd) {
                setError("两次密码不一致");
                return;
            }
            await setTxPassword(pwd);
            if (backendUrl && token) {
                const hash = await hashPassword(pwd);
                try {
                    const query = `mutation($token:String!,$hash:String!){setPassword(token:$token,passwordHash:$hash){status error}}`;
                    await fetch(`${backendUrl}/gql`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                            query,
                            variables: { token, hash },
                        }),
                    });
                } catch {
                    /* ignore */
                }
            }
            const hash = await hashPassword(pwd);
            onConfirm(hash);
            clear();
        } else {
            const ok = await verifyTxPassword(pwd);
            if (!ok) {
                setError("密码错误");
                clear();
                return;
            }
            const hash = await hashPassword(pwd);
            onConfirm(hash);
            clear();
        }
    }, [digits, confirmDigits, isNew, backendUrl, token, onConfirm]);

    if (!open) return null;

    const pinBoxStyle = (focused: boolean): CSSProperties => ({
        width: 44,
        height: 52,
        borderRadius: 10,
        border: `2px solid ${focused ? t.pinFocus : t.pinBorder}`,
        background: t.pinBox,
        color: t.text,
        fontSize: 22,
        fontWeight: 700,
        textAlign: "center",
        outline: "none",
        transition: "border-color 0.15s",
    });

    const pinRow = (
        vals: string[],
        setter: typeof setDigits,
        refs: typeof passwordRefs,
        autoFocus: boolean,
    ) => (
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            {vals.map((d, i) => (
                <input
                    key={i}
                    ref={(el) => {
                        refs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={1}
                    value={d ? "•" : ""}
                    data-value={d}
                    autoFocus={autoFocus && i === 0}
                    onChange={(e) =>
                        handleInput(i, e.target.value, setter, refs)
                    }
                    onKeyDown={(e) => handleKeyDown(i, e, setter, refs)}
                    onFocus={(e) => e.target.select()}
                    style={pinBoxStyle(false)}
                    onFocusCapture={(e) => {
                        (e.target as HTMLInputElement).style.borderColor =
                            t.pinFocus;
                    }}
                    onBlur={(e) => {
                        (e.target as HTMLInputElement).style.borderColor =
                            t.pinBorder;
                    }}
                />
            ))}
        </div>
    );

    return createPortal(
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 100001,
                background: t.overlay,
                backdropFilter: "blur(10px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily:
                    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                pointerEvents: "all",
            }}
            onClick={(e) => {
                e.stopPropagation();
                if (e.target === e.currentTarget) {
                    onCancel();
                    clear();
                }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div
                style={{
                    width: 360,
                    maxWidth: "calc(100% - 32px)",
                    borderRadius: 16,
                    padding: "28px 24px",
                    background: t.cardBg,
                    boxShadow: t.cardShadow,
                    color: t.text,
                }}
            >
                <div
                    style={{
                        fontSize: 18,
                        fontWeight: 700,
                        marginBottom: 6,
                        textAlign: "center",
                    }}
                >
                    {isNew ? "设置交易密码" : "输入交易密码"}
                </div>

                {tx && (
                    <div
                        style={{
                            marginBottom: 22,
                            padding: "14px 16px",
                            borderRadius: 12,
                            background: t.pinBox,
                            border: `1px solid ${t.pinBorder}`,
                        }}
                    >
                        {tx.amount && (
                            <div
                                style={{
                                    textAlign: "center",
                                    marginBottom:
                                        tx.to || (tx.data && tx.data !== "0x")
                                            ? 10
                                            : 0,
                                }}
                            >
                                <span
                                    style={{ fontSize: 11, color: t.subtext }}
                                >
                                    发送金额
                                </span>
                                <div
                                    style={{
                                        fontSize: 20,
                                        fontWeight: 800,
                                        color: t.text,
                                    }}
                                >
                                    {tx.amount}{" "}
                                    <span
                                        style={{
                                            fontSize: 14,
                                            fontWeight: 600,
                                            color: t.subtext,
                                        }}
                                    >
                                        {nativeSymbol ||
                                            estimatedFee?.split(" ")[1] ||
                                            ""}
                                    </span>
                                </div>
                            </div>
                        )}
                        {(tx.to || (tx.data && tx.data !== "0x")) && (
                            <div
                                style={{
                                    borderTop: `1px solid ${t.pinBorder}`,
                                    paddingTop: 8,
                                    fontSize: 12,
                                    color: t.subtext,
                                    lineHeight: 1.7,
                                    textAlign: "center",
                                }}
                            >
                                {tx.to && (
                                    <div>
                                        收款方 {tx.to.slice(0, 10)}...
                                        {tx.to.slice(-6)}
                                    </div>
                                )}
                                {tx.data && tx.data !== "0x" && (
                                    <div>类型 合约调用</div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {pinRow(digits, setDigits, passwordRefs, true)}

                {isNew && (
                    <>
                        <div
                            style={{
                                fontSize: 13,
                                color: t.subtext,
                                margin: "16px 0 8px",
                                textAlign: "center",
                            }}
                        >
                            确认密码
                        </div>
                        {pinRow(confirmDigits, setConfirmDigits, confirmRefs, false)}
                    </>
                )}

                {estimatedFee && (
                    <div
                        style={{
                            fontSize: 12,
                            color: t.subtext,
                            marginTop: 14,
                            textAlign: "center",
                        }}
                    >
                        网络费 {estimatedFee}
                        {nativeSymbol &&
                            !estimatedFee?.includes(nativeSymbol) &&
                            ` ${nativeSymbol}`}
                    </div>
                )}

                {error && (
                    <div
                        style={{
                            color: t.errorText,
                            fontSize: 12,
                            marginTop: 12,
                            textAlign: "center",
                        }}
                    >
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    onClick={handleSubmit}
                    style={{
                        width: "100%",
                        height: 44,
                        borderRadius: 10,
                        border: "none",
                        background: t.btnPrimary,
                        color: "#fff",
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: "pointer",
                        marginTop: 20,
                    }}
                >
                    {isNew ? "设置并确认" : "确认交易"}
                </button>
                <button
                    onClick={() => {
                        onCancel();
                        clear();
                    }}
                    style={{
                        width: "100%",
                        height: 40,
                        borderRadius: 8,
                        border: "none",
                        background: t.btnGhost,
                        color: t.subtext,
                        fontSize: 13,
                        cursor: "pointer",
                        marginTop: 8,
                    }}
                >
                    取消
                </button>
            </div>
        </div>,
        document.body,
    );
}

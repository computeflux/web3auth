import { useState, useCallback, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
    hasTxPassword,
    setTxPassword,
    verifyTxPassword,
    hashPassword,
} from "../core/txPassword";

export type SignConfirmProps = {
    open: boolean;
    onConfirm: (passwordHash: string) => void;
    onCancel: () => void;
    theme?: "light" | "dark";
    message?: string;
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

export default function ConfirmSignModal({
    open,
    onConfirm,
    onCancel,
    theme = "dark",
    message,
}: SignConfirmProps) {
    const t = theme === "light" ? LIGHT : DARK;
    const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
    const [error, setError] = useState("");
    const [isNew, setIsNew] = useState(!hasTxPassword());
    const [confirmDigits, setConfirmDigits] = useState<string[]>([
        "", "", "", "", "", "",
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
            refs.current?.[idx - 1]?.focus();
        }
    };

    const handleSubmit = useCallback(async () => {
        const pwd = getPwd(digits);
        if (pwd.length !== 6) {
            setError("请输入 6 位数字密码");
            return;
        }
        if (isNew) {
            const confirm = getPwd(confirmDigits);
            if (pwd !== confirm) {
                setError("两次密码不一致");
                return;
            }
            await setTxPassword(pwd);
            const h = await hashPassword(pwd);
            onConfirm(h);
            clear();
            setIsNew(false);
        } else {
            if (!(await verifyTxPassword(pwd))) {
                setError("密码错误");
                return;
            }
            const h = await hashPassword(pwd);
            onConfirm(h);
            clear();
        }
    }, [digits, confirmDigits, isNew, onConfirm]);

    if (!open) return null;

    const pinBoxStyle = (isActive: boolean): CSSProperties => ({
        width: 44,
        height: 52,
        borderRadius: 8,
        border: `1px solid ${isActive ? t.pinFocus : t.pinBorder}`,
        background: t.inputBg,
        color: t.text,
        fontSize: 20,
        fontWeight: 700,
        textAlign: "center",
        outline: "none",
        caretColor: t.pinFocus,
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
                    onKeyDown={(e) =>
                        handleKeyDown(i, e, setter, refs)
                    }
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

    return (
        <div
            data-web3auth-modal="true"
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
                    {isNew ? "设置签名密码" : "输入签名密码"}
                </div>

                <div
                    style={{
                        marginBottom: 22,
                        padding: "14px 16px",
                        borderRadius: 12,
                        background: t.pinBox,
                        border: `1px solid ${t.pinBorder}`,
                    }}
                >
                    <div style={{ textAlign: "center" }}>
                        <span style={{ fontSize: 11, color: t.subtext }}>
                            签名消息
                        </span>
                        <div
                            style={{
                                fontSize: 12,
                                fontWeight: 500,
                                color: t.text,
                                marginTop: 6,
                                wordBreak: "break-all",
                                fontFamily: "monospace",
                            }}
                        >
                            {typeof message === "string" && message.startsWith("0x")
                                ? message.slice(0, 42) + "..."
                                : String(message || "").slice(0, 50)}
                        </div>
                    </div>
                </div>

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
                    {isNew ? "设置并确认" : "确认签名"}
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
        </div>
    );
}

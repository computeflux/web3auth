import {
    useState,
    useCallback,
    useEffect,
    useRef,
    type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
    validatePassword,
    setupPassword,
    computeResponse,
    computeResponseCached,
} from "../core/txPassword";
import { useTranslation, tStatic } from "../core/i18n";

export type TxConfirmProps = {
    open: boolean;
    onConfirm: (signToken: string) => void;
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
    btnPrimary: "#1f1f1f",
    btnPrimaryHover: "#000000",
    btnText: "#e5e7eb",
    btnGhost: "transparent",
    errorText: "#ef4444",
    pinBox: "#f3f4f6",
    pinBorder: "#d1d5db",
    pinFocus: "#1f1f1f",
};

const DARK = {
    overlay: "rgba(0,0,0,0.75)",
    cardBg: "#121214",
    cardShadow: "0 24px 80px rgba(0,0,0,0.55)",
    text: "#e4e4e7",
    subtext: "#71717a",
    inputBg: "#1a1a1e",
    inputBorder: "#2e2e35",
    btnPrimary: "#e4e4e7",
    btnPrimaryHover: "#ffffff",
    btnText: "#1a1a1e",
    btnGhost: "transparent",
    errorText: "#f87171",
    pinBox: "#1a1a1e",
    pinBorder: "#2e2e35",
    pinFocus: "#e4e4e7",
};

/** 获取 challenge */
async function fetchChallenge(backendUrl: string, token: string) {
    const query = `query($token:String!){getChallenge(token:$token){status challenge salt expiresAt error}}`;
    const res = await fetch(`${backendUrl}/gql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { token } }),
    });
    const json = await res.json();
    const result = json.data?.getChallenge;
    if (json.errors || !result || result.status !== "success") {
        throw new Error(result?.error || tStatic("password.error_fetch_challenge"));
    }
    return {
        challenge: result.challenge as string,
        salt: result.salt as string,
    };
}

/** 用 response 换取 signToken */
async function fetchVerifyResponse(
    backendUrl: string,
    token: string,
    challenge: string,
    response: string,
) {
    const query = `mutation($token:String!,$challenge:String!,$response:String!){verifyResponse(token:$token,challenge:$challenge,response:$response){status signToken expiresAt error}}`;
    const res = await fetch(`${backendUrl}/gql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            query,
            variables: { token, challenge, response },
        }),
    });
    const json = await res.json();
    const result = json.data?.verifyResponse;
    if (json.errors || !result || result.status !== "ok") {
        throw new Error(result?.error || tStatic("password.error_verify_failed"));
    }
    return result.signToken as string;
}

/** 向后端保存密码 */
async function fetchSetPassword(
    backendUrl: string,
    token: string,
    passwordHash: string,
    salt: string,
    dkHash: string,
) {
    const query = `mutation($token:String!,$passwordHash:String!,$salt:String!,$dkHash:String!){setPassword(token:$token,passwordHash:$passwordHash,salt:$salt,dkHash:$dkHash){status error}}`;
    const res = await fetch(`${backendUrl}/gql`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            query,
            variables: { token, passwordHash, salt, dkHash },
        }),
    });
    const json = await res.json();
    const result = json.data?.setPassword;
    if (
        json.errors ||
        !result ||
        (result.status !== "success" && result.status !== "ok")
    ) {
        console.error("[web3auth] setPassword response:", json);
        throw new Error(result?.error || tStatic("password.error_set_failed"));
    }
}

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
    const colors = theme === "light" ? LIGHT : DARK;
    const { t } = useTranslation();
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [isNew, setIsNew] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [checking, setChecking] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);

    // 弹窗打开时自动检测是否已设置密码
    useEffect(() => {
        if (!open || !backendUrl || !token) return;
        setChecking(true);
        setError("");
        fetchChallenge(backendUrl, token)
            .then(() => setIsNew(false))
            .catch((err: any) => {
                if (err?.message === "password not set") {
                    setIsNew(true);
                } else {
                    setError(err?.message || t("password.error_check_failed"));
                }
            })
            .finally(() => setChecking(false));
    }, [open, backendUrl, token]);

    // 弹窗打开且检测完成后，自动聚焦到密码输入框
    useEffect(() => {
        if (open && !checking) {
            const timer = setTimeout(() => {
                inputRef.current?.focus();
            }, 150);
            return () => clearTimeout(timer);
        }
    }, [open, checking]);

    // 嵌套 modal 点击穿透防护：card / overlay 级别的 stopPropagation
    // 已足够阻止事件冒泡到下层 modal，不需要 document capture 阶段拦截

    const clear = () => {
        setPassword("");
        setConfirmPassword("");
        setError("");
    };

    const handleSubmit = useCallback(async () => {
        setError("");
        if (password.length < 8) {
            setError(t("password.error_min_length"));
            return;
        }
        if (!backendUrl || !token) {
            setError(t("password.error_missing_backend"));
            return;
        }

        try {
            let pwd = password;

            if (isNew) {
                // ── 设置密码 ──
                if (confirmPassword.length < 8) {
                    setError(t("password.error_confirm_required"));
                    return;
                }
                if (pwd !== confirmPassword) {
                    setError(t("password.error_mismatch"));
                    return;
                }
                const { ok, msg } = validatePassword(pwd);
                if (!ok) {
                    setError(msg ? t(msg) : t("password.error_invalid"));
                    return;
                }

                const { salt, dkHash, passwordHash } = await setupPassword(pwd);
                console.log("[web3auth] setupPassword:", {
                    saltLen: salt.length,
                    dkHashLen: dkHash.length,
                    passwordHashLen: passwordHash.length,
                });
                await fetchSetPassword(
                    backendUrl,
                    token,
                    passwordHash,
                    salt,
                    dkHash,
                );
                console.log("[web3auth] setPassword success");
            }

            // ── 获取 challenge ──
            let challengeData;
            try {
                challengeData = await fetchChallenge(backendUrl, token);
            } catch (err: any) {
                if (err?.message === "password not set" && !isNew) {
                    setIsNew(true);
                    setError(t("password.error_first_use_tx"));
                    return;
                }
                throw err;
            }
            console.log("[web3auth] fetchChallenge:", challengeData);

            // ── 计算 response + 换取 signToken ──
            // 注意：弹窗中必须根据当前输入的密码重新计算 response，
            // 不能复用全局缓存的 DK（可能来自之前的密码输入）。
            const { challenge, salt } = challengeData;
            const response = await computeResponse(pwd, salt, challenge);
            console.log("[web3auth] response:", response.slice(0, 16) + "...");
            const signToken = await fetchVerifyResponse(
                backendUrl,
                token,
                challenge,
                response,
            );
            console.log(
                "[web3auth] signToken:",
                signToken.slice(0, 16) + "...",
            );

            onConfirm(signToken);
            clear();
            setIsNew(false);
        } catch (err: any) {
            console.error("[web3auth] ConfirmTxModal handleSubmit error:", err);
            setError(err?.message || t("password.error_wrong"));
        }
    }, [password, confirmPassword, isNew, backendUrl, token, onConfirm]);

    if (!open) return null;

    return createPortal(
        <div
            ref={overlayRef}
            data-web3auth-modal="true"
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 100001,
                background: colors.overlay,
                backdropFilter: "blur(10px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily:
                    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                pointerEvents: "auto",
            }}
            onPointerDown={(e) => {
                e.stopPropagation();
                if (e.target === e.currentTarget) {
                    onCancel();
                    clear();
                }
            }}
            onClick={(e) => e.stopPropagation()}
        >
            <div
                ref={dialogRef}
                tabIndex={-1}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
                style={{
                    width: 360,
                    maxWidth: "calc(100% - 32px)",
                    borderRadius: 16,
                    padding: "28px 24px",
                    background: colors.cardBg,
                    boxShadow: colors.cardShadow,
                    color: colors.text,
                    outline: "none",
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
                    {isNew ? t("tx.title_set") : t("tx.title_enter")}
                </div>

                {tx && (
                    <div
                        style={{
                            marginBottom: 22,
                            padding: "14px 16px",
                            borderRadius: 12,
                            background: colors.pinBox,
                            border: `1px solid ${colors.pinBorder}`,
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
                                    style={{ fontSize: 11, color: colors.subtext }}
                                >
                                    {t("tx.amount_label")}
                                </span>
                                <div
                                    style={{
                                        fontSize: 20,
                                        fontWeight: 800,
                                        color: colors.text,
                                    }}
                                >
                                    {tx.amount}{" "}
                                    <span
                                        style={{
                                            fontSize: 14,
                                            fontWeight: 600,
                                            color: colors.subtext,
                                        }}
                                    >
                                        {nativeSymbol || ""}
                                    </span>
                                </div>
                            </div>
                        )}
                        {(tx.to || (tx.data && tx.data !== "0x")) && (
                            <div
                                style={{
                                    borderTop: `1px solid ${colors.pinBorder}`,
                                    paddingTop: 8,
                                    fontSize: 12,
                                    color: colors.subtext,
                                    lineHeight: 1.7,
                                    textAlign: "center",
                                }}
                            >
                                {tx.to && (
                                    <div>
                                        {t("tx.recipient_label")} {tx.to.slice(0, 10)}...
                                        {tx.to.slice(-6)}
                                    </div>
                                )}
                                {tx.data && tx.data !== "0x" && (
                                    <div>{t("tx.contract_call_label")}</div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleSubmit();
                    }}
                >
                    <div style={{ position: "relative", marginBottom: 12 }}>
                        <input
                            ref={inputRef}
                            type="text"
                            name="tx-password"
                            autoComplete={
                                isNew ? "new-password" : "current-password"
                            }
                            tabIndex={0}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={
                                isNew
                                    ? t("password.placeholder_set")
                                    : t("password.placeholder_enter")
                            }
                            style={
                                {
                                    width: "100%",
                                    height: 44,
                                    borderRadius: 10,
                                    border: `2px solid ${colors.pinBorder}`,
                                    background: colors.pinBox,
                                    color: colors.text,
                                    fontSize: 15,
                                    padding: "0 42px 0 14px",
                                    outline: "none",
                                    WebkitTextSecurity: showPassword
                                        ? "none"
                                        : "disc",
                                } as React.CSSProperties
                            }
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            style={{
                                position: "absolute",
                                right: 8,
                                top: "50%",
                                transform: "translateY(-50%)",
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: 4,
                                color: colors.subtext,
                                display: "flex",
                                alignItems: "center",
                            }}
                        >
                            {showPassword ? (
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                                    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                                    <line x1="2" x2="22" y1="2" y2="22" />
                                </svg>
                            ) : (
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                                    <circle cx="12" cy="12" r="3" />
                                </svg>
                            )}
                        </button>
                    </div>

                    {isNew && (
                        <div style={{ position: "relative", marginBottom: 12 }}>
                            <input
                                type="text"
                                name="tx-confirm-password"
                                autoComplete="new-password"
                                tabIndex={0}
                                value={confirmPassword}
                                onChange={(e) =>
                                    setConfirmPassword(e.target.value)
                                }
                                placeholder={t("password.confirm_placeholder")}
                                style={
                                    {
                                        width: "100%",
                                        height: 44,
                                        borderRadius: 10,
                                        border: `2px solid ${colors.pinBorder}`,
                                        background: colors.pinBox,
                                        color: colors.text,
                                        fontSize: 15,
                                        padding: "0 42px 0 14px",
                                        outline: "none",
                                        WebkitTextSecurity: showPassword
                                            ? "none"
                                            : "disc",
                                    } as React.CSSProperties
                                }
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                style={{
                                    position: "absolute",
                                    right: 8,
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    padding: 4,
                                    color: colors.subtext,
                                    display: "flex",
                                    alignItems: "center",
                                }}
                            >
                                {showPassword ? (
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="18"
                                        height="18"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                                        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                                        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                                        <line x1="2" x2="22" y1="2" y2="22" />
                                    </svg>
                                ) : (
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="18"
                                        height="18"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                                        <circle cx="12" cy="12" r="3" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    )}
                </form>

                {estimatedFee && (
                    <div
                        style={{
                            fontSize: 12,
                            color: colors.subtext,
                            marginTop: 14,
                            textAlign: "center",
                        }}
                    >
                        {t("tx.network_fee")} {estimatedFee}
                    </div>
                )}

                {error && (
                    <div
                        style={{
                            color: colors.errorText,
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
                        background: colors.btnPrimary,
                        color: colors.btnText,
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: "pointer",
                        marginTop: 8,
                    }}
                >
                    {isNew ? t("tx.submit_set") : t("tx.submit_enter")}
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
                        background: colors.btnGhost,
                        color: colors.subtext,
                        fontSize: 13,
                        cursor: "pointer",
                        marginTop: 8,
                    }}
                >
                    {t("tx.cancel")}
                </button>
            </div>
        </div>,
        document.body,
    );
}

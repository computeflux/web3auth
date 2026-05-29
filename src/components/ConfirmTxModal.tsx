import { useState, useCallback, useEffect, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
    validatePassword,
    setupPassword,
    computeResponse,
    computeResponseCached,
} from "../core/txPassword";

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
        throw new Error(result?.error || "获取验证信息失败");
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
        throw new Error(result?.error || "验证失败");
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
        throw new Error(result?.error || "设置密码失败");
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
    const t = theme === "light" ? LIGHT : DARK;
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [isNew, setIsNew] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [checking, setChecking] = useState(false);

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
                    setError(err?.message || "检测密码状态失败");
                }
            })
            .finally(() => setChecking(false));
    }, [open, backendUrl, token]);

    const clear = () => {
        setPassword("");
        setConfirmPassword("");
        setError("");
    };

    const handleSubmit = useCallback(async () => {
        setError("");
        if (password.length < 8) {
            setError("密码至少 8 位");
            return;
        }
        if (!backendUrl || !token) {
            setError("缺少后端配置");
            return;
        }

        try {
            let pwd = password;

            if (isNew) {
                // ── 设置密码 ──
                if (confirmPassword.length < 8) {
                    setError("请确认密码");
                    return;
                }
                if (pwd !== confirmPassword) {
                    setError("两次密码不一致");
                    return;
                }
                const { ok, msg } = validatePassword(pwd);
                if (!ok) {
                    setError(msg || "密码不符合要求");
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
                    setError("首次使用，请先设置交易密码");
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
            setError(err?.message || "密码错误");
        }
    }, [password, confirmPassword, isNew, backendUrl, token, onConfirm]);

    if (!open) return null;

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
                                        {nativeSymbol || ""}
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

                <div style={{ position: "relative", marginBottom: 12 }}>
                    <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={
                            isNew ? "设置密码（≥8位，含字母+数字）" : "输入密码"
                        }
                        style={{
                            width: "100%",
                            height: 44,
                            borderRadius: 10,
                            border: `2px solid ${t.pinBorder}`,
                            background: t.pinBox,
                            color: t.text,
                            fontSize: 15,
                            padding: "0 42px 0 14px",
                            outline: "none",
                        }}
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
                            color: t.subtext,
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
                            type={showPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="确认密码"
                            style={{
                                width: "100%",
                                height: 44,
                                borderRadius: 10,
                                border: `2px solid ${t.pinBorder}`,
                                background: t.pinBox,
                                color: t.text,
                                fontSize: 15,
                                padding: "0 42px 0 14px",
                                outline: "none",
                            }}
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
                                color: t.subtext,
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
                        color: t.btnText,
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: "pointer",
                        marginTop: 8,
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

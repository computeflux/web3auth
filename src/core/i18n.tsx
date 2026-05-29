/**
 * Lightweight i18n for @wetee/web3auth
 * No external dependency — just React context + dictionaries.
 */

import {
    createContext,
    useContext,
    useCallback,
    useSyncExternalStore,
    useMemo,
    type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Translation keys
// ---------------------------------------------------------------------------

export type Locale = "en" | "zh";

type Dict = Record<string, string>;

const en: Dict = {
    // -- LoginModal --
    "login.title": "Sign in",
    "login.subtitle": "Sign in to continue",
    "login.email_subtitle": "Enter your email",
    "login.otp_subtitle_email": "Enter code sent to {{email}}",
    "login.continue_with": "Continue with {{provider}}",
    "login.or_continue_with": "Or continue with",
    "login.continue_email": "Continue with Email",
    "login.send_code": "Send Verification Code",
    "login.sending": "Sending...",
    "login.verify_code": "Verify Code",
    "login.verifying": "Verifying...",
    "login.verification_code": "Verification code",
    "login.otp_placeholder": "000000",
    "login.email_address": "Email address",
    "login.email_placeholder": "you@example.com",
    "login.resend_code": "Resend code",
    "login.resend_in": "Resend in {{seconds}}s",
    "login.back": "← Back",
    "login.all_wallets": "All wallets",
    "login.search_wallets": "Search wallets…",
    "login.installed": "Installed",
    "login.not_installed": "Not installed",
    "login.error_network": "Network error. Please try again.",
    "login.error_otp_send_failed": "Failed to send verification code",
    "login.error_otp_verify_failed": "Verification failed",
    "login.error_invalid_email": "Please enter a valid email address",
    "login.error_empty_code": "Please enter the verification code",
    "login.error_code_length": "Verification code must be 6 digits",
    "login.error_social_failed": "Social login failed",
    "login.error_wallet_failed": "Wallet connection failed",

    // -- TopUpModal --
    "topup.title": "Charge",
    "topup.subtitle": "Choose how to charge your wallet",
    "topup.token_market": "Token Market",
    "topup.token_market_desc": "Buy with debit or credit card",
    "topup.receive_crypto": "Receive Crypto",
    "topup.receive_crypto_desc":
        "Deposit from another account using wallet address or QR code",
    "topup.transfer_crypto": "Transfer Crypto",
    "topup.transfer_crypto_desc":
        "Link your Coinbase or Binance account to transfer for free",
    "topup.badge_fast": "Fastest",
    "topup.badge_no_fee": "No fee",
    "topup.receive_title": "Receive Crypto",
    "topup.receive_subtitle": "Share your wallet address to receive funds",
    "topup.or_copy_address": "or copy address",
    "topup.copy": "Copy",
    "topup.copied": "Copied!",
    "topup.no_wallet": "No wallet connected",
    "topup.transfer_title": "Transfer Crypto",
    "topup.transfer_subtitle":
        "Link your exchange account to transfer funds for free",
    "topup.transfer_note":
        "Transferring from exchanges is often free or very low cost. You'll need to log in to your exchange account.",
    "topup.warning":
        "Only send ETH or ERC-20 tokens to this address. Sending other assets may result in permanent loss.",
    "topup.coinbase_desc": "Link your Coinbase account to transfer funds",
    "topup.binance_desc": "Link your Binance account to transfer funds",

    // -- WalletUIModal --
    "wallet.send": "Send",
    "wallet.top_up": "Charge",
    "wallet.copy": "Copy",
    "wallet.estimated_balance": "Estimated balance",
    "wallet.tokens": "Tokens",
    "wallet.show_all": "Show all",
    "wallet.cancel": "Cancel",
    "wallet.confirm_send": "Confirm",
    "wallet.sending": "Sending…",
    "wallet.send_title": "Send {{ticker}}",
    "wallet.send_to_placeholder": "Recipient 0x...",
    "wallet.send_amount_placeholder": "Amount",
    "wallet.send_max": "Max",
    "wallet.error_invalid_address": "Invalid recipient address",
    "wallet.error_invalid_amount": "Invalid amount format",
    "wallet.error_amount_zero": "Amount must be greater than 0",
    "wallet.error_insufficient_balance": "Insufficient balance",
    "wallet.error_max_estimate": "Unable to estimate max amount",
    "wallet.copy_address": "Copy address",
    "wallet.copied": "Copied!",
};

const zh: Dict = {
    // -- LoginModal --
    "login.title": "登录",
    "login.subtitle": "登录以继续",
    "login.email_subtitle": "输入您的邮箱",
    "login.otp_subtitle_email": "验证码已发送至 {{email}}",
    "login.continue_with": "使用 {{provider}} 登录",
    "login.or_continue_with": "或使用其他方式",
    "login.continue_email": "使用邮箱登录",
    "login.send_code": "发送验证码",
    "login.sending": "发送中…",
    "login.verify_code": "验证",
    "login.verifying": "验证中…",
    "login.verification_code": "验证码",
    "login.otp_placeholder": "000000",
    "login.email_address": "邮箱地址",
    "login.email_placeholder": "you@example.com",
    "login.resend_code": "重新发送验证码",
    "login.resend_in": "{{seconds}}秒后重新发送",
    "login.back": "← 返回",
    "login.all_wallets": "全部钱包",
    "login.search_wallets": "搜索钱包…",
    "login.installed": "已安装",
    "login.not_installed": "未安装",
    "login.error_network": "网络错误，请重试",
    "login.error_otp_send_failed": "验证码发送失败",
    "login.error_otp_verify_failed": "验证失败",
    "login.error_invalid_email": "请输入有效的邮箱地址",
    "login.error_empty_code": "请输入验证码",
    "login.error_code_length": "验证码必须为6位数字",
    "login.error_social_failed": "社交登录失败",
    "login.error_wallet_failed": "钱包连接失败",

    // -- TopUpModal --
    "topup.title": "充值",
    "topup.subtitle": "选择充值方式",
    "topup.token_market": "代币市场",
    "topup.token_market_desc": "使用借记卡或信用卡购买",
    "topup.receive_crypto": "接收加密货币",
    "topup.receive_crypto_desc": "使用钱包地址或二维码从另一账户存入加密货币",
    "topup.transfer_crypto": "转移加密货币",
    "topup.transfer_crypto_desc":
        "链接您的 Coinbase 或 Binance 账户，免费转移加密货币",
    "topup.badge_fast": "最快",
    "topup.badge_no_fee": "免手续费",
    "topup.receive_title": "接收加密货币",
    "topup.receive_subtitle": "分享您的钱包地址以接收资金",
    "topup.or_copy_address": "或复制地址",
    "topup.copy": "复制",
    "topup.copied": "已复制！",
    "topup.no_wallet": "未连接钱包",
    "topup.transfer_title": "转移加密货币",
    "topup.transfer_subtitle": "链接您的交易所账户，免费转移资金",
    "topup.transfer_note":
        "从交易所转账通常免费或费用很低。您需要登录交易所账户。",
    "topup.warning":
        "仅向此地址发送 ETH 或 ERC-20 代币。发送其他资产可能导致永久丢失。",
    "topup.coinbase_desc": "链接您的 Coinbase 账户转移资金",
    "topup.binance_desc": "链接您的 Binance 账户转移资金",

    // -- WalletUIModal --
    "wallet.send": "发送",
    "wallet.top_up": "充值",
    "wallet.copy": "复制",
    "wallet.estimated_balance": "预估余额",
    "wallet.tokens": "代币",
    "wallet.show_all": "显示全部",
    "wallet.cancel": "取消",
    "wallet.confirm_send": "确认发送",
    "wallet.sending": "发送中…",
    "wallet.send_title": "发送 {{ticker}}",
    "wallet.send_to_placeholder": "收款地址 0x...",
    "wallet.send_amount_placeholder": "数量",
    "wallet.send_max": "全部",
    "wallet.error_invalid_address": "无效的收款地址",
    "wallet.error_invalid_amount": "数量格式无效",
    "wallet.error_amount_zero": "数量须大于 0",
    "wallet.error_insufficient_balance": "余额不足",
    "wallet.error_max_estimate": "无法估算最多发送数量",
    "wallet.copy_address": "复制地址",
    "wallet.copied": "已复制！",
};

const dicts: Record<Locale, Dict> = { en, zh };

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type I18nContextValue = {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    t: (key: string, vars?: Record<string, string>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function detectLocale(): Locale {
    try {
        const saved = localStorage.getItem("web3auth_locale");
        if (saved === "en" || saved === "zh") return saved;
        // 兼容 dapp 语言，未手动切换过 web3auth 时沿用 dapp 设置
        const dappLang = localStorage.getItem("dapp_lang");
        if (dappLang === "en" || dappLang === "zh") return dappLang;
    } catch {
        /* ignore */
    }
    try {
        const nav = (navigator.language || "").toLowerCase();
        return nav.startsWith("zh") ? "zh" : "en";
    } catch {
        return "en";
    }
}

export function Web3AuthI18nProvider({
    children,
    locale: forcedLocale,
}: {
    children: ReactNode;
    locale?: Locale;
}) {
    // 用 useSyncExternalStore 订阅 localStorage + 自定义事件变化
    // 优先用 prop（初始值），后续变更从 localStorage 读取
    const locale = useSyncExternalStore(
        useCallback((cb: () => void) => {
            const onCustom = () => cb();
            const onStorage = (e: StorageEvent) => {
                if (e.key === "web3auth_locale") cb();
            };
            window.addEventListener("web3auth_locale_change", onCustom);
            window.addEventListener("storage", onStorage);
            return () => {
                window.removeEventListener("web3auth_locale_change", onCustom);
                window.removeEventListener("storage", onStorage);
            };
        }, []),
        useCallback(() => detectLocale(), []),
    );

    const setLocale = useCallback((next: Locale) => {
        try {
            localStorage.setItem("web3auth_locale", next);
            window.dispatchEvent(
                new CustomEvent("web3auth_locale_change", { detail: next }),
            );
        } catch {
            /* ignore */
        }
    }, []);

    const t = useCallback(
        (key: string, vars?: Record<string, string>) => {
            const dict = dicts[locale] ?? dicts.en;
            let value = dict[key];
            if (value === undefined) {
                value = dicts.en[key] ?? key;
            }
            if (vars) {
                for (const [k, v] of Object.entries(vars)) {
                    value = value.split(`{{${k}}}`).join(v);
                }
            }
            return value;
        },
        [locale],
    );

    const ctx = useMemo<I18nContextValue>(
        () => ({ locale, setLocale, t }),
        [locale, setLocale, t],
    );

    return <I18nContext.Provider value={ctx}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
    const ctx = useContext(I18nContext);
    if (!ctx) {
        const fallbackLocale = detectLocale();
        return {
            locale: fallbackLocale,
            setLocale: (next: Locale) => {
                try {
                    localStorage.setItem("web3auth_locale", next);
                    window.dispatchEvent(
                        new CustomEvent("web3auth_locale_change", {
                            detail: next,
                        }),
                    );
                } catch {
                    /* ignore */
                }
            },
            t: (key: string, vars?: Record<string, string>) => {
                const dict = dicts[fallbackLocale] ?? dicts.en;
                const value = dict[key] ?? dicts.en[key] ?? key;
                if (vars) {
                    let v = value;
                    for (const [k, val] of Object.entries(vars)) {
                        v = v.split(`{{${k}}}`).join(val);
                    }
                    return v;
                }
                return value;
            },
        };
    }
    return ctx;
}

export function tStatic(
    key: string,
    locale?: Locale,
    vars?: Record<string, string>,
): string {
    const dict = dicts[locale ?? "en"] ?? dicts.en;
    let value = dict[key];
    if (value === undefined) {
        value = dicts.en[key] ?? key;
    }
    if (vars) {
        for (const [k, v] of Object.entries(vars)) {
            value = value.split(`{{${k}}}`).join(v);
        }
    }
    return value;
}

/** 独立函数：可直接在非 React 代码中调用切换语言 */
export function setLocale(locale: Locale): void {
    try {
        localStorage.setItem("web3auth_locale", locale);
        window.dispatchEvent(
            new CustomEvent("web3auth_locale_change", { detail: locale }),
        );
    } catch {
        /* ignore */
    }
}

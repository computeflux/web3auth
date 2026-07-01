/**
 * Lightweight i18n for @wetee/web3auth
 * No external dependency — just React context + dictionaries.
 */

import {
    createContext,
    useContext,
    useCallback,
    useEffect,
    useState,
    useSyncExternalStore,
    useMemo,
    type ReactNode,
} from "react";
import { en, zh, ja, ko, de, ru } from "./i18n/dicts";
import type { Locale, Dict } from "./i18n/types";

export type { Locale } from "./i18n/types";

const dicts: Record<Locale, Dict> = { en, zh, ja, ko, de, ru };

const SUPPORTED_LOCALES: readonly Locale[] = ["en", "zh", "ja", "ko", "de", "ru"];

function isLocale(value: string | null | undefined): value is Locale {
    return SUPPORTED_LOCALES.includes(value as Locale);
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type I18nContextValue = {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    t: (key: string, vars?: Record<string, string>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function detectLocale(): Locale {
    try {
        const saved = localStorage.getItem("web3auth_locale");
        if (isLocale(saved)) return saved;
        // 兼容 dapp 语言，未手动切换过 web3auth 时沿用 dapp 设置
        const dappLang = localStorage.getItem("dapp_lang");
        if (isLocale(dappLang)) return dappLang;
    } catch {
        /* ignore */
    }
    try {
        const nav = (navigator.language || "").toLowerCase();
        if (nav.startsWith("zh")) return "zh";
        if (nav.startsWith("ja")) return "ja";
        if (nav.startsWith("ko")) return "ko";
        if (nav.startsWith("de")) return "de";
        if (nav.startsWith("ru")) return "ru";
        return "en";
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
    const storedLocale = useSyncExternalStore(
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

    // forcedLocale 仅作为初始值；后续 setLocale() 调用会更新 storedLocale，从而触发切换
    const [locale, setLocaleState] = useState<Locale>(() =>
        isLocale(forcedLocale) ? forcedLocale : storedLocale,
    );

    useEffect(() => {
        setLocaleState(storedLocale);
    }, [storedLocale]);

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

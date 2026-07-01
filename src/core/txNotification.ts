import { detectLocale, tStatic } from "./i18n";
import type { Locale } from "./i18n";

/** Transaction notification: slides up from the bottom; clickable when an explorer URL is provided. */
export function showTxNotification(
    hash: string,
    url?: string,
    status: "success" | "failure" | "pending" = "success",
    theme: "light" | "dark" = "dark",
    primaryColor?: string,
    locale?: Locale,
) {
    const currentLocale = locale ?? detectLocale();
    const t = (key: string) => tStatic(key, currentLocale);

    const shortHash = `${hash.slice(0, 8)}…${hash.slice(-6)}`;
    const displayHash = status === "success" ? hash : shortHash;
    const title =
        status === "success"
            ? t("txnotify.title.success")
            : status === "failure"
              ? t("txnotify.title.failure")
              : t("txnotify.title.pending");
    const subtext =
        status === "pending"
            ? t("txnotify.subtext.pending")
            : status === "failure"
              ? t("txnotify.subtext.failure")
              : displayHash;
    const iconGradient =
        status === "success"
            ? "linear-gradient(135deg,#22c55e,#16a34a)"
            : status === "failure"
              ? "linear-gradient(135deg,#ef4444,#dc2626)"
              : "linear-gradient(135deg,#f59e0b,#d97706)";

    const isDark = theme === "dark";
    const bg = isDark ? "rgba(0, 0, 0, 0.92)" : "rgba(255,255,255,0.92)";
    const borderColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
    const titleColor = isDark ? "#f1f5f9" : "#676767";
    const subtextColor = isDark ? "#94a3b8" : "#9c9d9d";

    // primaryColor supports rgb/rgba/hex values; defaults to green if omitted
    const pc = primaryColor || "rgb(40, 176, 85)";
    const hasUrl = Boolean(url);

    const buttonHtml = hasUrl
        ? `<button class="tx-view-btn" style="
                background:${pc.replace(")", ", 0.15)")};color:${pc.replace(")", ", 0.85)")};
                border-radius:10px;padding:9px 16px;
                font-size:13px;font-weight:600;
                cursor:pointer;white-space:nowrap;
                transition:background 0.2s;
                font-family:inherit;
            " onmouseover="this.style.background='${pc.replace(")", ", 0.28)")}'" onmouseout="this.style.background='${pc.replace(")", ", 0.15)")}'">
                ${t("txnotify.view")}
            </button>`
        : "";

    const el = document.createElement("div");
    el.innerHTML = `
        <div class="tx-notify" style="
            position:fixed;bottom:32px;left:50%;transform:translateX(-50%);
            z-index:99999;
            background:${bg};
            backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
            border:1px solid ${borderColor};
            border-radius:16px;
            padding:11px;
            display:flex;align-items:center;gap:16px;
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
            max-width:calc(100vw - 40px);
            opacity:0;transform:translateX(-50%) translateY(12px);
            transition:opacity 0.35s ease,transform 0.35s ease;
        ">
            <div style="
                width:40px;height:40px;border-radius:50%;
                background:${iconGradient};
                display:flex;align-items:center;justify-content:center;
                flex-shrink:0;
            ">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            </div>
            <div style="min-width:0;flex:1;">
                <div style="font-size:14px;font-weight:600;color:${titleColor};letter-spacing:0.01em;">
                    ${title}
                </div>
                <div style="font-size:12px;color:${subtextColor};font-family:'SF Mono',ui-monospace,monospace;margin-top:3px;">
                    ${subtext}
                </div>
            </div>
            ${buttonHtml}
        </div>
    `;
    document.body.appendChild(el);

    const card = el.querySelector(".tx-notify") as HTMLElement;
    requestAnimationFrame(() => {
        card.style.opacity = "1";
        card.style.transform = "translateX(-50%) translateY(0)";
    });

    if (hasUrl) {
        el.querySelector(".tx-view-btn")?.addEventListener("click", () => {
            window.open(url, "_blank", "noopener");
        });
    }

    setTimeout(() => {
        card.style.opacity = "0";
        card.style.transform = "translateX(-50%) translateY(12px)";
        setTimeout(() => el.remove(), 400);
    }, 10_000);
}

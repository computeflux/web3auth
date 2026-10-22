import { useEffect, useRef, useState, type ReactNode } from "react";
import {
    bumpSsoLoop,
    clearSsoLoop,
    isHubLoginPage,
    readStoredSession,
    redirectToLogin,
    type SsoSession,
} from "./sso";

/**
 * SsoGate：多服务登录跳转门（挂在各服务根 provider 树内，见 sso.ts 设计）：
 *  - 未登录（localStorage 无 "web3auth:session" 会话；任意服务，含枢纽自身）
 *    → 跳枢纽 /login（?sso_next=原地址）
 *  - 已在枢纽 /login 页 → 不跳（那页自己弹登录框）
 *  - 401（auth:required 事件，各服务 fetch 层派发，已节流）→ 同样跳 /login
 *  - 有会话 → 清零循环计数器；跨加载循环计数器 60s 内 >3 次 → 停止跳转（防死循环）
 *
 * 不依赖 web3auth SDK context（读 localStorage 会话即可），
 * 枢纽（挂 Web3AuthProvider）与非枢纽（挂 RemoteWalletProvider / 纯会话）通用。
 * （?sso_next= 登录成功后的回跳由 /login 页本身处理）
 */
export function SsoGate({ children }: { children: ReactNode }) {
    const [ready, setReady] = useState(false);
    const [session, setSession] = useState<SsoSession | null>(null);
    const redirected = useRef(false);

    // 客户端挂载后读一次会话（渲染前 consumeSsoOnBoot 已把 ?sso= 写入 localStorage）
    useEffect(() => {
        setSession(readStoredSession());
        setReady(true);
    }, []);

    useEffect(() => {
        if (!ready || redirected.current) return;
        if (session) {
            clearSsoLoop();
            return;
        }
        if (isHubLoginPage()) return;
        if (bumpSsoLoop()) return;
        redirected.current = true;
        redirectToLogin();
    }, [ready, session]);

    // 401（无 token / 静默续期失败）→ 去登录页获取凭证
    useEffect(() => {
        const handler = () => {
            if (isHubLoginPage()) return;
            redirectToLogin();
        };
        window.addEventListener("auth:required", handler);
        return () => window.removeEventListener("auth:required", handler);
    }, []);

    return <>{children}</>;
}

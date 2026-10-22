/**
 * @wetee/web3auth/remote — 无 modal 的「登录态 + 钱包」入口（供非枢纽 dApp 使用）。
 *
 * 统一登录设计：web3auth 登录框只在枢纽（board-ops :5181）/login 页弹，
 * 其他服务一律不能弹 modal。本子路径提供与 @wetee/web3auth/react 四个核心
 * hook API 兼容的替代实现（登录态读自 localStorage 会话）：
 *  - useWeb3Auth / useWeb3AuthUser：会话读自 "web3auth:session"（枢纽登录 / SSO 回跳写入）
 *  - useWeb3AuthConnect：connect() → 跳转枢纽 /login 获取凭证（不弹框）
 *  - useWeb3AuthDisconnect：logout() → 清本地会话
 *  - 无 useFunding / useWalletUI（那是 modal 入口，已移除）
 *
 * 需搭配 <RemoteWalletProvider>（提供 EIP-1193 远程钱包 provider）。
 */
import { useCallback } from "react";
import { redirectToLogin } from "./core/sso";
import { useRemoteWallet } from "./core/remote-wallet";

export { RemoteWalletProvider, useRemoteWallet } from "./core/remote-wallet";
// SSO 跳转门（无 modal 依赖；dApp 只从 /remote 引入，不打包登录框 context）
export { SsoGate } from "./core/sso-gate";
export type { RemoteWalletConfig, RemoteWalletValue } from "./core/remote-wallet";

export function useWeb3Auth() {
    const w = useRemoteWallet();
    return {
        provider: w.provider,
        address: w.address,
        chainId: w.chainId,
        isConnected: w.isConnected,
        switchChain: w.switchChain,
        /** 原 SDK 内部 client 对象 — 无 modal 模式下不再需要 */
        web3Auth: null,
    };
}

export function useWeb3AuthConnect() {
    const w = useRemoteWallet();
    const connect = useCallback(async () => {
        // 统一设计：登录框只在枢纽 /login 页弹；这里只跳转
        redirectToLogin();
    }, []);
    return {
        connect,
        loading: false,
        error: null,
        connectorName: w.isConnected ? ("auth" as const) : null,
    };
}

export function useWeb3AuthDisconnect() {
    const w = useRemoteWallet();
    return { disconnect: w.logout, loading: false };
}

export function useWeb3AuthUser() {
    const w = useRemoteWallet();
    return { userInfo: w.userInfo };
}

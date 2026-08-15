// @ts-nocheck
/**
 * Remote Wallet Engine — 远程签名架构
 *
 * 原则：
 * 1. 私钥仅存在于后端，前端永远拿不到 seed/私钥
 * 2. 所有签名操作通过后端 API 完成
 * 3. 读操作（查余额、预估 gas 等）走公开 RPC
 * 4. 写操作（签名交易、签名消息）走后端 authenticated API
 *
 * 安全模型：
 * - Google OAuth → 后端验证 → 后端派生/存储私钥
 * - 前端拿到 API Key，用于鉴权调用签名接口
 * - 即使前端被 XSS 攻击，攻击者只能请求签名单笔交易（无法导出私钥）
 * - 交易密码通过 challenge-response 验证，passwordHash 不再在网络传输
 */

import { createPublicClient, http, type PublicClient } from "viem";
import { showTxNotification } from "./txNotification";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RemoteWalletOptions {
    /** 后端 API 地址 */
    backendUrl: string;
    /** 用户的 API Key（登录后获取） */
    token: string;
    /** 用户的钱包地址（登录后后端返回） */
    address: `0x${string}`;
    /** Chain ID → RPC URL 映射（前端直接连公开 RPC） */
    rpcTargets: Record<string, string>;
    /** 默认链 ID */
    defaultChainId: string;
    /** 区块链浏览器 URL（用于跳转交易详情，不含 /tx/ 后缀） */
    explorerUrl?: string;
    /** 主题模式 */
    theme?: "light" | "dark";
    /** 主题主色 */
    primaryColor?: string;
    /** 交易前回调 — 返回 false 则取消交易 */
    onBeforeSend?: (tx: Record<string, unknown>) => Promise<boolean>;
    /** 消息签名前回调 — 返回 false 则取消签名 */
    onBeforeSign?: (msg: { message: string; from: string }) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// EIP-1193 Provider (thin proxy)
// ---------------------------------------------------------------------------

type EIP1193Provider = {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    on: (event: string, listener: (...args: unknown[]) => void) => void;
    removeListener: (
        event: string,
        listener: (...args: unknown[]) => void,
    ) => void;
};

export class RemoteWalletEngine {
    private backendUrl: string;
    token: string;
    private address: `0x${string}`;
    private rpcTargets: Record<string, string>;
    private chainId: string;
    private publicClient: PublicClient;
    private listeners: Map<string, Set<(...args: unknown[]) => void>>;
    private opts: RemoteWalletOptions;
    /** 短期签名 token（由 challenge-response 验证后获取） */
    signToken: string = "";
    /** 本地追踪的 pending nonce，解决连续交易 nonce 重复问题 */
    private pendingNonce: number | null = null;

    constructor(opts: RemoteWalletOptions) {
        this.opts = opts;
        this.backendUrl = opts.backendUrl.replace(/\/$/, "");
        this.token = opts.token;
        this.address = opts.address;
        this.rpcTargets = opts.rpcTargets;
        this.chainId = opts.defaultChainId;
        this.listeners = new Map();

        const rpcUrl =
            opts.rpcTargets[opts.defaultChainId] ??
            Object.values(opts.rpcTargets)[0] ??
            "http://localhost:8545";

        this.publicClient = createPublicClient({ transport: http(rpcUrl) });
    }

    // ---- Public API ----

    get provider(): EIP1193Provider {
        return {
            request: (args) => this.request(args),
            on: (event, listener) => this.on(event, listener),
            removeListener: (event, listener) =>
                this.removeListener(event, listener),
        };
    }

    get chain(): string {
        return this.chainId;
    }

    get addr(): `0x${string}` {
        return this.address;
    }

    // ---- Switch chain ----

    async switchChain(chainId: string): Promise<void> {
        const rpcUrl = this.rpcTargets[chainId];
        if (!rpcUrl) throw new Error(`No RPC for chain ${chainId}`);
        this.chainId = chainId;
        this.publicClient = createPublicClient({ transport: http(rpcUrl) });
        this.emit("chainChanged", chainId);
    }

    // ---- EIP-1193 request handler ----

    private async request({
        method,
        params,
    }: {
        method: string;
        params?: unknown[];
    }): Promise<unknown> {
        switch (method) {
            // ---- Read operations (public RPC) ----
            case "eth_chainId":
                return this.chainId;

            case "eth_accounts":
            case "eth_requestAccounts":
                return [this.address];

            case "eth_blockNumber":
                return this.publicClient.getBlockNumber();

            case "eth_gasPrice":
            case "eth_maxPriorityFeePerGas":
                return this.publicClient.getGasPrice();

            case "eth_getBalance": {
                const [addr, block] = (params ?? []) as [string, string];
                return this.publicClient.getBalance({
                    address: addr as `0x${string}`,
                    blockTag: block as
                        "latest" | "pending" | "earliest" | undefined,
                });
            }

            case "eth_estimateGas": {
                const tx = (params?.[0] ?? {}) as Record<string, unknown>;
                return this.publicClient.estimateGas(tx as any);
            }

            case "eth_getTransactionCount": {
                const [addr, block] = (params ?? []) as [string, string];
                return this.publicClient.getTransactionCount({
                    address: addr as `0x${string}`,
                    blockTag: block as
                        "latest" | "pending" | "earliest" | undefined,
                });
            }

            case "eth_getTransactionReceipt": {
                const [hash] = (params ?? []) as [string];
                const receipt = await this.publicClient.getTransactionReceipt({
                    hash: hash as `0x${string}`,
                });

                if (receipt.status == "0x0") {
                    receipt.status = "reverted";
                }

                if (receipt.status == "0x1") {
                    receipt.status = "success";
                }
                return receipt;
            }

            case "eth_call": {
                const [tx, block] = (params ?? []) as [
                    Record<string, unknown>,
                    string,
                ];
                // 提取 call 需要的字段，避免 ...tx 把 nonce/chainId/type 等无关字段传入
                const { from, to, data, gas, gasPrice, value } = tx as Record<string, unknown>;
                // block 参数: "latest" | "pending" | "earliest" | 区块号 hex
                const blockParam = block
                    ? /^0x[0-9a-fA-F]+$/.test(block)
                        ? { blockNumber: BigInt(block) }
                        : { blockTag: block as "latest" | "pending" | "earliest" }
                    : {};
                return this.publicClient.call({
                    to: to as `0x${string}`,
                    data: data as `0x${string}` | undefined,
                    ...(from ? { account: from as `0x${string}` } : {}),
                    ...(gas ? { gas: BigInt(gas as string) } : {}),
                    ...(gasPrice ? { gasPrice: BigInt(gasPrice as string) } : {}),
                    ...(value ? { value: BigInt(value as string) } : {}),
                    ...blockParam,
                } as any);
            }

            // ---- Write operations (backend signing + broadcast) ----
            case "eth_sendTransaction": {
                const tx = (params?.[0] ?? {}) as Record<string, unknown>;
                const hasData = tx.data && (tx.data as string) !== "0x";

                const normalizeHex = (value: unknown): string => {
                    if (typeof value === "bigint")
                        return `0x${value.toString(16)}`;
                    if (typeof value === "number")
                        return `0x${value.toString(16)}`;
                    if (typeof value === "string") {
                        const raw = value.trim();
                        if (!raw || raw === "0" || raw === "0x0") return "";
                        return raw.startsWith("0x")
                            ? raw
                            : `0x${BigInt(raw).toString(16)}`;
                    }
                    return "";
                };

                const normalizeNonce = (value: unknown): string => {
                    if (typeof value === "bigint")
                        return `0x${value.toString(16)}`;
                    if (typeof value === "number")
                        return `0x${value.toString(16)}`;
                    if (typeof value === "string") {
                        const raw = value.trim();
                        if (!raw) return "";
                        return raw.startsWith("0x")
                            ? raw
                            : `0x${BigInt(raw).toString(16)}`;
                    }
                    return "";
                };

                // 自动补全 wagmi 未传的字段
                let nonce = normalizeNonce(tx.nonce);
                let gas = normalizeHex(tx.gas);
                let gasPrice =
                    normalizeHex(tx.gasPrice) || normalizeHex(tx.maxFeePerGas);

                // --- gas/gasPrice 估算：提前到确认弹窗之前，保证弹窗显示的费用与实际发送一致 ---
                if (!gas || !gasPrice) {
                    try {
                        // 规范化 value（可能是字符串/number/bigint）
                        let estimateValue: bigint | undefined;
                        if (tx.value !== undefined && tx.value !== null) {
                            if (typeof tx.value === "bigint")
                                estimateValue = tx.value;
                            else if (typeof tx.value === "number")
                                estimateValue = BigInt(tx.value);
                            else if (typeof tx.value === "string") {
                                const v = tx.value.trim();
                                estimateValue =
                                    v === "" || v === "0" || v === "0x0"
                                        ? 0n
                                        : BigInt(v);
                            }
                        }

                        const [gp, eg] = await Promise.all([
                            this.publicClient.getGasPrice(),
                            hasData
                                ? this.publicClient.estimateGas({
                                      account: this.address,
                                      to: tx.to as `0x${string}`,
                                      data: tx.data as `0x${string}`,
                                      value: estimateValue ?? 0n,
                                  } as any)
                                : 21000n,
                        ]);
                        if (!gasPrice) gasPrice = `0x${gp.toString(16)}`;
                        // 本链(Paseo AssetHub)实测：approve 估算 ~4k/实际 ~5.6k，recharge 实际 ~5.6k，
                        // 估算×2 缓冲已足够。下限仅取标准 intrinsic 21,000，避免小交易 gasLimit 虚高
                        // （实际扣费 = gasUsed × gasPrice，与上限无关，但上限会抬高所需余额和浏览器显示）。
                        if (!gas) {
                            if (!hasData) {
                                // 普通转账无需缓冲，直接用 intrinsic
                                gas = "0x5208";
                            } else {
                                const buffered = eg * 2n;
                                const MIN_GAS = 21_000n;
                                gas = `0x${(buffered > MIN_GAS ? buffered : MIN_GAS).toString(16)}`;
                            }
                        }
                        console.log("[wallet] estimateGas success:", {
                            estimated: eg.toString(),
                            buffered: (eg * 2n).toString(),
                            finalGas: gas,
                            gasPrice,
                        });
                    } catch (e) {
                        console.warn("[wallet] estimateGas failed:", e);
                        // 默认 gas：合约调用 400,000 / 普通转账 21,000
                        if (!gas) gas = hasData ? "0x61a80" : "0x5208";
                        console.log("[wallet] fallback gas:", gas);
                    }
                }

                // 写回 tx，确认弹窗（onBeforeSend）读到的 gas/gasPrice 与实际发送一致
                if (gas) tx.gas = gas;
                if (gasPrice) tx.gasPrice = gasPrice;

                // 交易确认回调（收集 signToken）
                this.signToken = "";
                if (this.opts.onBeforeSend) {
                    const ok = await this.opts.onBeforeSend(tx);
                    if (!ok) throw new Error("User rejected");
                }
                const signToken =
                    this.signToken || (tx as any)._signToken || "";

                // --- nonce 管理：支持连续交易 ---
                if (!nonce) {
                    if (this.pendingNonce !== null) {
                        // 使用本地追踪的 pending nonce（上笔交易尚未确认）
                        nonce = `0x${this.pendingNonce.toString(16)}`;
                    } else {
                        try {
                            // 优先尝试获取 pending 状态的 nonce（含 mempool）
                            const pendingCount =
                                await this.publicClient.getTransactionCount({
                                    address: this.address,
                                    blockTag: "pending",
                                });
                            nonce = `0x${pendingCount.toString(16)}`;
                        } catch {
                            // 回退到 latest
                            try {
                                const latestCount =
                                    await this.publicClient.getTransactionCount(
                                        {
                                            address: this.address,
                                        },
                                    );
                                nonce = `0x${latestCount.toString(16)}`;
                            } catch {
                                nonce = "0x0";
                            }
                        }
                    }
                }

                // 打印最终交易参数，确保 gas 被正确传递
                // console.log(
                //     "[wallet] raw tx keys:",
                //     Object.keys(tx),
                //     "values:",
                //     Object.fromEntries(
                //         Object.entries(tx).map(([k, v]) => [
                //             k,
                //             typeof v === "string" ? v.slice(0, 80) : v,
                //         ]),
                //     ),
                // );
                // console.log("[wallet] eth_sendTransaction tx:", {
                //     to: tx.to,
                //     gas,
                //     gasPrice,
                //     nonce,
                //     hasData,
                //     data: (tx.data as string)?.slice(0, 80),
                // });

                const rawTx = (await this.backendSign("sign-transaction", {
                    token: signToken || this.token,
                    tx: {
                        from: this.address,
                        to: tx.to,
                        value: normalizeHex(tx.value) || "0x0",
                        data: (tx.data as string) ?? "0x",
                        gas,
                        gasPrice,
                        nonce,
                        chainId: this.chainId,
                    },
                })) as string;

                const rpcUrl =
                    this.rpcTargets[this.chainId] ??
                    Object.values(this.rpcTargets)[0];
                const hash = await this.broadcast(rpcUrl, rawTx);

                // 更新本地 pending nonce，下笔交易使用递增后的值
                try {
                    this.pendingNonce = parseInt(nonce, 16) + 1;
                } catch {
                    /* ignore parse error */
                }
                const txUrl = this.opts.explorerUrl
                    ? `${this.opts.explorerUrl}/tx/${hash}`
                    : undefined;

                const notifyTheme = this.opts.theme ?? "dark";
                const notifyPrimary = this.opts.primaryColor;
                showTxNotification(
                    hash,
                    txUrl,
                    "pending",
                    notifyTheme,
                    notifyPrimary,
                );
                this.publicClient
                    .waitForTransactionReceipt({
                        hash: hash as `0x${string}`,
                        timeout: 120_000,
                    })
                    .then((r) => {
                        if (r.status === "success") {
                            showTxNotification(
                                hash,
                                txUrl,
                                "success",
                                notifyTheme,
                                notifyPrimary,
                            );
                        } else {
                            showTxNotification(
                                hash,
                                txUrl,
                                "failure",
                                notifyTheme,
                                notifyPrimary,
                            );
                        }
                    })
                    .catch(() => {
                        showTxNotification(
                            hash,
                            txUrl,
                            "failure",
                            notifyTheme,
                            notifyPrimary,
                        );
                    });
                return hash;
            }

            case "eth_sign":
            case "personal_sign": {
                const [message, from] = (params ?? []) as [string, string];

                // 消息签名前确认（收集 signToken）
                this.signToken = "";
                if (this.opts.onBeforeSign) {
                    const ok = await this.opts.onBeforeSign({
                        message,
                        from: from ?? this.address,
                    });
                    if (!ok) throw new Error("User rejected");
                }

                const signToken = this.signToken;

                return this.backendSign("sign-message", {
                    token: signToken || this.token,
                    message,
                    from: from ?? this.address,
                });
            }

            case "eth_signTypedData":
            case "eth_signTypedData_v4": {
                const [, typedData] = (params ?? []) as [string, unknown];

                // Typed data 签名也需要 signToken
                this.signToken = "";
                if (this.opts.onBeforeSign) {
                    const ok = await this.opts.onBeforeSign({
                        message: JSON.stringify(typedData),
                        from: this.address,
                    });
                    if (!ok) throw new Error("User rejected");
                }

                const signToken = this.signToken;

                return this.backendSign("sign-typed-data", {
                    token: signToken || this.token,
                    typedData,
                    from: this.address,
                });
            }

            case "wallet_switchEthereumChain": {
                const [{ chainId }] = (params ?? []) as [{ chainId: string }];
                await this.switchChain(chainId);
                return null;
            }

            case "wallet_addEthereumChain":
                return null;

            case "eth_sendRawTransaction": {
                // 已签名的原始交易直接广播
                const [raw] = (params ?? []) as [string];
                return this.publicClient.sendRawTransaction({
                    serializedTransaction: raw as `0x${string}`,
                } as any);
            }

            case "net_version":
                return BigInt(this.chainId).toString();

            default:
                throw new Error(`Unsupported method: ${method}`);
        }
    }

    // ---- Backend signing call (GraphQL) ----

    private async backendSign(
        endpoint: string,
        payload: Record<string, unknown>,
    ): Promise<unknown> {
        const gqlUrl = `${this.backendUrl}/gql`;

        let query: string;
        let variables: Record<string, unknown>;

        switch (endpoint) {
            case "sign-transaction": {
                query = `
                    mutation($token:String!,$tx:TxInput!){
                        signTransaction(token:$token,tx:$tx){status result error}
                    }`;
                variables = {
                    token: payload.token || this.token,
                    tx: payload.tx,
                };
                break;
            }
            case "sign-message": {
                query = `
                    mutation($token:String!,$message:String!,$from:String!){
                        signMessage(token:$token,message:$message,from:$from){status result error}
                    }`;
                variables = {
                    token: payload.token || this.token,
                    message: payload.message,
                    from: payload.from || this.address,
                };
                break;
            }
            case "sign-typed-data": {
                query = `
                    mutation($token:String!,$message:String!,$from:String!){
                        signMessage(token:$token,message:$message,from:$from){status result error}
                    }`;
                variables = {
                    token: payload.token || this.token,
                    message: JSON.stringify(payload.typedData),
                    from: this.address,
                };
                break;
            }
            default:
                throw new Error(`Unknown endpoint: ${endpoint}`);
        }

        const res = await fetch(gqlUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.token}`,
            },
            body: JSON.stringify({ query, variables }),
        });

        const json = await res.json();
        if (json.errors) {
            const errMsg = json.errors[0]?.message ?? `Signing failed`;
            if (
                res.status === 401 ||
                /unauthorized|invalid token|expired|authentication|登录过期|token/i.test(
                    errMsg,
                )
            ) {
                this.emit("disconnect", {
                    reason: "auth_expired",
                    message: errMsg,
                });
            }
            throw new Error(errMsg);
        }

        const data =
            endpoint === "sign-transaction"
                ? json.data?.signTransaction
                : json.data?.signMessage;

        if (!data || data.status === "error") {
            const errMsg = data?.error ?? "Signing failed";
            if (
                /unauthorized|invalid token|expired|authentication|登录过期|token/i.test(
                    errMsg,
                )
            ) {
                this.emit("disconnect", {
                    reason: "auth_expired",
                    message: errMsg,
                });
            }
            throw new Error(errMsg);
        }
        return data.result;
    }

    // ---- Broadcast raw transaction ----

    private async broadcast(rpcUrl: string, rawTx: string): Promise<string> {
        const res = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "eth_sendRawTransaction",
                params: [rawTx],
            }),
        });
        const json = (await res.json()) as {
            result?: string;
            error?: { message: string };
        };
        if (json.error) throw new Error(json.error.message);
        return json.result!;
    }

    // ---- Event emitter ----

    private on(event: string, listener: (...args: unknown[]) => void) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event)!.add(listener);
    }

    private removeListener(
        event: string,
        listener: (...args: unknown[]) => void,
    ) {
        this.listeners.get(event)?.delete(listener);
    }

    private emit(event: string, ...args: unknown[]) {
        this.listeners.get(event)?.forEach((fn) => fn(...args));
    }

    // ---- Cleanup ----

    destroy(): void {
        this.listeners.clear();
    }
}

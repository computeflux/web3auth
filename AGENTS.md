# web3auth（Web3Auth 替代前端 SDK）

TypeScript 前端 SDK（`@wetee/web3auth`）：邮箱免密码登录 + Google / GitHub / X 社交登录 + 嵌入式以太坊钱包（EIP-1193 Provider）。镜像 `@web3auth/modal` 的 API（`import` 路径一一对应），供 dApp 侧无感替换。

> ⚠️ 原 Go 认证后端（`back/`，OTP/社交 OAuth/JWT）已**整体迁移到 `apps/tee-node`**（`services/auth` + `services/wallet`）；本目录现只含前端 SDK。登录/签名后端地址由使用方配置指向 tee-provider（开发期可指向本地 mock）。

## 结构
```
web3auth/
├── src/
│   ├── index.ts          # 主入口（mirrors @web3auth/modal）
│   ├── react.ts          # React 入口（mirrors @web3auth/modal/react）
│   ├── core/
│   │   ├── types.ts      # 类型定义
│   │   ├── auth.ts       # 认证客户端（调后端 API）
│   │   ├── wallet.ts     # 钱包引擎（密钥派生 + EIP-1193）
│   │   └── context.tsx   # React Provider + Hooks
│   └── components/
│       └── LoginModal.tsx # 登录弹窗 UI
└── package.json          # @wetee/web3auth（exports: "." 与 "./react"）
```

## 被哪些项目引用
- `apps/dapp`、`apps/c2c`（ui/）、`apps/minishop` 均以 **`file:../web3auth`** 本地依赖引用（dapp 额外用 vite alias 指向 `src/`）。
- 配置中 `authBackendUrl` / `backendUrl` 指向登录后端（tee-provider 或规划中的 `apps/auth`）。

## 支持的登录方式
邮箱 OTP、Google（popup 或服务端 OAuth 重定向）、GitHub（服务端 OAuth 重定向）、X（OAuth 2.0 + PKCE，需 Elevated 权限获取邮箱）。

## 常用命令
```bash
cd apps/web3auth
npm install
npx tsc --noEmit       # 类型检查（无独立 build 脚本；使用方各自编译）
```

## 约定
- 遵循仓库根级约定（见上级 `AGENTS.md`）。
- 对外 API 镜像 `@web3auth/modal`，**保持 import 路径与签名兼容**，避免使用方（dapp/c2c/minishop）迁移成本。
- 改 SDK 后：dapp 无需重装（alias 直接引用源码）；c2c/minishop 为 `file:` 依赖，需重新 `npm install` 后再构建。
- 安全设计见 `docs/security-redesign-v2.md`（钱包侧交易密码/challenge-response）。

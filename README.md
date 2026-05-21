# web3auth

自建 Web3Auth 替代方案 — 邮箱免密码登录 + Google / GitHub / X 社交登录 + 嵌入式以太坊钱包。

```
web3auth/
├── front/          # TypeScript 前端 SDK（React Context + Hooks + EIP-1193 Provider）
│   ├── src/
│   │   ├── index.ts          # 主入口 (mirrors @web3auth/modal)
│   │   ├── react.ts          # React 入口 (mirrors @web3auth/modal/react)
│   │   ├── core/
│   │   │   ├── types.ts      # 类型定义
│   │   │   ├── auth.ts       # 认证客户端（调后端 API）
│   │   │   ├── wallet.ts     # 钱包引擎（密钥派生 + EIP-1193）
│   │   │   └── context.tsx   # React Provider + Hooks
│   │   └── components/
│   │       └── LoginModal.tsx # 登录弹窗 UI
│   └── package.json
│
├── back/           # Go 认证后端
│   ├── main.go               # 入口：HTTP 路由、CORS、优雅关闭
│   ├── config/config.go      # 环境变量配置
│   ├── handler/
│   │   ├── otp.go            # POST /auth/request-otp /verify-otp
│   │   ├── social.go         # POST /auth/social/{provider} (Google/GitHub/X)
│   │   └── helpers.go        # JSON 响应工具
│   ├── service/
│   │   ├── otp.go            # OTP 生成/验证（内存存储）
│   │   ├── auth.go           # HMAC-SHA256 种子派生 + JWT
│   │   ├── email.go          # 邮件（Mock / SMTP）
│   │   └── oauth.go          # Google/GitHub/X OAuth token 验证
│   └── model/types.go        # 请求/响应类型
│
└── README.md
```

## 支持的登录方式

| 方式 | 状态 | 说明 |
|------|------|------|
| 邮箱 OTP | ✅ 完整 | 输入邮箱 → 收到验证码 → 登录 |
| Google | ✅ 完整 | 前端 Google Sign-In popup 或服务端 OAuth 重定向 |
| GitHub | ✅ 完整 | 服务端 OAuth 重定向 |
| X (Twitter) | ✅ 完整 | OAuth 2.0 + PKCE（需 Elevated 权限才能获取邮箱） |

## 快速开始

### 1. 启动后端

```bash
cd web3auth/back
cp .env.example .env
# 编辑 .env，填入 OAuth 凭据（可选，邮箱 OTP 已可用）

go mod tidy
MOCK_EMAIL=true go run main.go
# → 服务运行在 http://localhost:8080
# → Mock 模式：OTP 打印到控制台
```

### 2. 在 DApp 中使用 SDK

```bash
# dapp/package.json 添加本地依赖
"@wetee/web3auth": "file:../web3auth/front"

# 替换所有 import 路径
# @web3auth/modal        → @wetee/web3auth
# @web3auth/modal/react  → @wetee/web3auth/react
```

配置中添加 `authBackendUrl`：

```ts
const web3AuthOptions: Web3AuthNoModalOptions = {
  clientId: 'your-app-id',
  web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
  authBackendUrl: 'http://localhost:8080',  // ← 指向 Go 后端
  // ...
};
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `GET /health` | GET | 健康检查 |
| `POST /auth/request-otp` | POST | `{ email, clientId }` → 发送验证码 |
| `POST /auth/verify-otp` | POST | `{ email, otp }` → `{ userInfo, token, seed }` |
| `POST /auth/social/google` | POST | `{ idToken }` 或 `{ code }` → 完成登录 |
| `POST /auth/social/github` | POST | `{ code }` → 完成登录 |
| `POST /auth/social/twitter` | POST | `{ code, codeVerifier }` → 完成登录 |
| `GET /auth/callback/:provider` | GET | OAuth 重定向回调 |

## 环境变量

详见 `back/.env.example`。

## License

MIT

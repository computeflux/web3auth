# Web3Auth 交易密码安全改造方案 V2（轻量版）

> 约束：
> 1. 后端不能存储用户私钥或从密码派生的加密密钥
> 2. 不能大改 tee-node 核心系统（私钥管理、签名流程保持不变）
> 3. 允许新增轻量级接口和少量字段

---

## 1. 当前问题总结

当前架构是**远程签名**：私钥在后端，前端通过 `token` + `passwordHash` 换取短期 `signToken` 来请求签名。

核心漏洞：
- `passwordHash = SHA256(6位数字)` 空间极小，约等于明文
- `passwordHash` 在 HTTPS 中明文传输，被截获即可直接调用 `verifyPassword` → 获得签名权限
- 无 challenge-response，截获的 hash **无限次有效**
- `eth_signTypedData` 绕过密码验证
- 无重试限制

---

## 2. 改造原则

1. **后端只存"验证凭证"，不存"用户密钥"**
   - 可以存 `PBKDF2(password, salt)` 的结果（这是验证用的 hash，不是密钥）
   - 不存从密码派生的加密密钥（不会用于解密私钥）

2. **后端改动最小化**
   - 核心签名接口 `signTransaction` / `signMessage` 只改参数名
   - 私钥派生、签名算法完全不碰
   - 只新增 challenge 生成和 HMAC 验证两个小接口

3. **passwordHash 不再作为网络凭证**
   - 引入 challenge-response：截获的数据包无法重放

---

## 3. 新架构

### 3.1 密码设置（首次/修改）

```
前端                                              后端
 │                                                │
 │  输入密码（≥8位，字母+数字+符号）                │
 │                                                │
 │  salt = randomBytes(16)                        │
 │  dk   = PBKDF2(password, salt, 100_000, 32)    │
 │                                                │
 ├─ 发送 mutation setPassword(token, salt, dk) ──>│
 │     (HTTPS，只发送一次)                        │
 │                                                │
 │                          存储 {salt, dk} 到 KV │
 │                          （dk 是验证凭证）      │
 │                                                │
 │<──────────────────────── 返回 success ─────────│
```

**后端存储**（KV 新增 key）：
```
user:{user_id}:tx_salt      -> hex string, 16 bytes
user:{user_id}:tx_dk_hash   -> hex string, PBKDF2 result
```

### 3.2 签名挑战-响应（核心改进）

```
前端                                              后端
 │                                                │
 ├─ 1. query getChallenge(token) ────────────────>│
 │                                                │
 │<─ 2. 返回 {challenge, salt, expiresAt} ────────│
 │     challenge = randomBytes(16)                │
 │     后端临时缓存 challenge（Redis，5分钟）      │
 │                                                │
 │  3. 用户输入密码                               │
 │  4. dk = PBKDF2(password, salt)                │
 │  5. response = HMAC-SHA256(dk, challenge)      │
 │     （dk 缓存在前端内存，后续签名复用）         │
 │                                                │
 ├─ 6. mutation verifyResponse(token, response) ─>│
 │     （不含 dk，不含 password）                 │
 │                                                │
 │                          取出用户 salt + dk_hash
 │                          重新计算 HMAC(dk_hash, challenge)
 │                          比对 response          │
 │                          challenge 标记为已使用 │
 │                                                │
 │<─ 7. 返回 signToken（JWT，60秒有效）───────────│
 │                                                │
 ├─ 8. mutation signTransaction(signToken, tx) ──>│
 │     （不再传 passwordHash）                    │
 │                                                │
 │<─ 9. 返回签名结果 ─────────────────────────────│
```

**关键改进**：
- 网络中传输的 `response` 只能使用一次（challenge 标记已用）
- 即使截获 `response`，也无法重放
- `dk`（真正的密码派生值）**永不离开前端**

### 3.3 后端改动清单

**新增接口（2 个）**：

```graphql
type Query {
  getChallenge(token: String!): ChallengeResponse!
}

type ChallengeResponse {
  status: String!      # "success" | "locked" | "error"
  challenge: String     # hex, 16 bytes
  salt: String          # hex, 16 bytes
  expiresAt: String     # ISO 8601
  error: String
}

type Mutation {
  verifyResponse(token: String!, response: String!): VerifyResponse!
}

type VerifyResponse {
  status: String!      # "success" | "error"
  signToken: String     # JWT, 60s
  expiresAt: String     # ISO 8601
  error: String
}
```

**修改接口（1 个）**：

```graphql
# 设置密码：参数从 passwordHash 改为 salt + dk
type Mutation {
  setPassword(token: String!, salt: String!, dk: String!): SetPasswordResponse!
}
```

**废弃接口（1 个）**：
```graphql
# 逐步废弃，保留过渡期兼容
verifyPassword(token: String!, passwordHash: String!): VerifyPasswordResponse
```

**核心签名接口不变**（只改参数名）：
```graphql
# 把 passwordHash 参数改为 signToken
type Mutation {
  signTransaction(signToken: String!, tx: TxInput!): SignResponse!
  signMessage(signToken: String!, message: String!, from: String!): SignResponse!
  signTypedData(signToken: String!, typedData: String!, from: String!): SignResponse!  # 新增，堵漏洞
}
```

**后端核心逻辑新增**（约 50 行，适配 KV 存储）：

```python
import hmac, hashlib, secrets
from datetime import datetime, timedelta

# KV 接口封装（根据实际 KV 引擎调整：Redis/Badger/LevelDB 等）
kv = get_kv_store()

def get_challenge(user_id: str):
    # 检查是否被锁定
    # if kv.get(f"lock:{user_id}"):
    #     return {"status": "locked", "error": "Too many failed attempts"}
    
    challenge = secrets.token_hex(16)  # 16 bytes
    expires_at = datetime.utcnow() + timedelta(minutes=5)
    
    # KV 直接设置 TTL 自动过期
    kv.setex(f"challenge:{user_id}:{challenge}", 300, "pending")
    
    salt = kv.get(f"user:{user_id}:tx_salt")
    if not salt:
        return {"status": "error", "error": "Password not set"}
    
    return {
        "status": "success",
        "challenge": challenge,
        "salt": salt,
        "expiresAt": expires_at.isoformat(),
    }

def verify_response(user_id: str, response: str):
    # 查找该用户下未使用的 challenge
    prefix = f"challenge:{user_id}:"
    challenge = None
    for key in kv.scan_prefix(prefix):
        if kv.get(key) == "pending":
            challenge = key[len(prefix):]
            break
    
    if not challenge:
        return {"status": "error", "error": "No valid challenge"}
    
    dk_hash = kv.get(f"user:{user_id}:tx_dk_hash")
    if not dk_hash:
        return {"status": "error", "error": "Password not set"}
    
    expected = hmac.new(
        bytes.fromhex(dk_hash),
        bytes.fromhex(challenge),
        hashlib.sha256,
    ).hexdigest()
    
    # 常量时间比较
    is_valid = hmac.compare_digest(expected, response)
    
    # 标记 challenge 已使用（无论成败）
    kv.delete(f"challenge:{user_id}:{challenge}")
    
    if is_valid:
        kv.delete(f"fail:{user_id}")
        sign_token = create_jwt_sign_token(user_id, challenge)
        return {"status": "success", "signToken": sign_token, "expiresAt": ...}
    else:
        # 失败计数（1小时过期）
        fails = kv.incr(f"fail:{user_id}")
        kv.expire(f"fail:{user_id}", 3600)
        if fails >= 5:
            kv.setex(f"lock:{user_id}", 1800, "1")  # 锁定 30 分钟
        return {"status": "error", "error": "Invalid response"}
```

---

## 4. 前端改动

### 4.1 `txPassword.ts` 重写

```typescript
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 32;

// 内存缓存
type CachedKey = { dk: Uint8Array; salt: string };
let _cached: CachedKey | null = null;

/** PBKDF2 派生 */
export async function deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const mat = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    mat, PBKDF2_KEYLEN * 8
  );
  return new Uint8Array(bits);
}

/** HMAC-SHA256 */
export async function hmacSha256(key: Uint8Array, msg: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, msg));
}

/** 密码复杂度校验 */
export function validatePassword(pwd: string): { ok: boolean; msg?: string } {
  if (pwd.length < 8) return { ok: false, msg: "至少 8 位" };
  if (!/[a-zA-Z]/.test(pwd)) return { ok: false, msg: "需包含字母" };
  if (!/[0-9]/.test(pwd)) return { ok: false, msg: "需包含数字" };
  return { ok: true };
}

/** 设置密码：生成 salt + dk */
export async function setupPassword(pwd: string): Promise<{ salt: string; dk: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const dk = await deriveKey(pwd, salt);
  return {
    salt: bufToHex(salt),
    dk: bufToHex(dk),
  };
}

/** 计算 challenge response（带缓存） */
export async function computeResponse(pwd: string, saltHex: string, challengeHex: string): Promise<string> {
  const salt = hexToBuf(saltHex);
  const challenge = hexToBuf(challengeHex);
  const dk = await deriveKey(pwd, salt);
  _cached = { dk, salt: saltHex };
  const resp = await hmacSha256(dk, challenge);
  return bufToHex(resp);
}

/** 用缓存的 dk 计算 response */
export async function computeResponseCached(challengeHex: string): Promise<string | null> {
  if (!_cached) return null;
  const resp = await hmacSha256(_cached.dk, hexToBuf(challengeHex));
  return bufToHex(resp);
}

/** 是否有缓存 */
export function hasCachedKey(): boolean { return !!_cached; }

/** 清除缓存 */
export function clearCachedKey(): void { _cached = null; }

// helpers
function bufToHex(b: Uint8Array): string {
  return Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
}
function hexToBuf(h: string): Uint8Array {
  return new Uint8Array(h.match(/.{2}/g)!.map(b => parseInt(b, 16)));
}
```

### 4.2 `wallet.ts` 改动（最小化）

```typescript
// 变更 1：移除 passwordHash 字段，改为 signToken
interface RemoteWalletOptions {
  // ... 原有字段 ...
  // passwordHash 字段移除
}

// 变更 2：verifyPassword 改为获取 signToken（由 context 调用）
// 这个函数完全移除，逻辑移到 context

// 变更 3：sign-transaction 使用 signToken
private async backendSign(endpoint: string, payload: Record<string, unknown>) {
  case "sign-transaction": {
    variables = {
      signToken: payload.signToken,  // 替换 token + passwordHash
      tx: {
        from: payload.from,
        to: payload.to,
        value: payload.value,
        data: payload.data,
        gas: payload.gas,
        gasPrice: payload.gasPrice,
        nonce: payload.nonce,
        chainId: payload.chainId,
      },
    };
  }
  case "sign-message": {
    variables = {
      signToken: payload.signToken,
      message: payload.message,
      from: payload.from,
    };
  }
  case "sign-typed-data": {  // 新增，堵漏洞
    variables = {
      signToken: payload.signToken,
      typedData: JSON.stringify(payload.typedData),
      from: payload.from,
    };
  }
}
```

### 4.3 `context.tsx` 改动

```typescript
// 新增：signToken 管理
const [signToken, setSignToken] = useState<string>("");
const signTokenExp = useRef<number>(0);

// 核心：获取 signToken 的完整流程
const acquireSignToken = useCallback(async (reason: "tx" | "sign") => {
  // 检查缓存是否有效（提前 10s 刷新）
  if (signToken && Date.now() < signTokenExp.current - 10000) {
    return signToken;
  }
  
  // 1. 获取 challenge
  const chalRes = await gqlFetch(authBackendUrl, `
    query($token:String!){getChallenge(token:$token){status challenge salt expiresAt error}}
  `, { token: walletRef.current?.token });
  
  const { challenge, salt } = chalRes.data.getChallenge;
  
  // 2. 计算 response
  let response: string;
  const cached = await computeResponseCached(challenge);
  if (cached) {
    response = cached;
  } else {
    // 弹窗让用户输入密码
    const pwd = await showPasswordModal(reason);  // 返回用户输入的密码
    response = await computeResponse(pwd, salt, challenge);
  }
  
  // 3. 验证 response
  const verifyRes = await gqlFetch(authBackendUrl, `
    mutation($token:String!,$response:String!){verifyResponse(token:$token,response:$response){status signToken expiresAt error}}
  `, { token: walletRef.current?.token, response });
  
  const { signToken: st, expiresAt } = verifyRes.data.verifyResponse;
  setSignToken(st);
  signTokenExp.current = new Date(expiresAt).getTime();
  return st;
}, [authBackendUrl]);

// onBeforeSend：获取 signToken
const onBeforeSend = useCallback(async (tx) => {
  // ... gas 估算等逻辑 ...
  const st = await acquireSignToken("tx");
  (tx as any)._signToken = st;
  return true;
}, [acquireSignToken]);

// onBeforeSign：获取 signToken
const onBeforeSign = useCallback(async (msg) => {
  const st = await acquireSignToken("sign");
  // 传给 wallet
  walletRef.current!._pendingSignToken = st;
  return true;
}, [acquireSignToken]);

// disconnect 清理
const disconnect = useCallback(async () => {
  // ... 原有逻辑 ...
  clearCachedKey();
  setSignToken("");
  signTokenExp.current = 0;
}, []);
```

### 4.4 弹窗组件改动

```typescript
// ConfirmTxModal / ConfirmSignModal
// 核心：不再区分 "isNew" 状态用于验证流程
// isNew 只影响 UI（"设置密码" vs "输入密码"），不影响安全逻辑

const [isNew, setIsNew] = useState(false);

// 初始化时检查后端是否已设置密码
useEffect(() => {
  // 调用 hasPassword 查询，或根据 getChallenge 返回的错误码判断
}, []);

// 设置密码（首次）
const handleSetup = async () => {
  const { ok, msg } = validatePassword(pwd);
  if (!ok) { setError(msg); return; }
  
  const { salt, dk } = await setupPassword(pwd);
  await setPasswordBackend(token, salt, dk);
  
  // 自动计算一次 response 来缓存 dk
  // 由 context 的 acquireSignToken 处理
  onConfirm(pwd);  // 把密码传给 context
};

// 验证密码（已设置过）
const handleVerify = async () => {
  if (pwd.length < 8) { setError("密码太短"); return; }
  onConfirm(pwd);  // 把密码传给 context
};
```

---

## 5. 部署与迁移

### 5.1 KV 数据迁移（无需 schema 变更）

```python
# KV 无 schema，运行时检测 key 存在性即可
# 旧用户：没有 user:{id}:tx_salt 和 user:{id}:tx_dk_hash
# 新用户：有上述 key

def check_tx_version(user_id: str) -> int:
    return 1 if kv.get(f"user:{user_id}:tx_salt") else 0

# 若 tx_version == 0，弹窗要求重新设置密码
```

### 5.2 接口兼容

```
过渡期（2周）：
- 后端同时支持 verifyPassword（旧）和 verifyResponse（新）
- 前端检测用户 tx_version：
  - tx_version == 0 → 走旧流程（兼容）
  - tx_version == 1 → 走新流程

强制迁移：
- 首次交易时检测到 tx_version == 0
- 弹窗提示："请重新设置交易密码以提升安全性"
- 用户设置后更新 tx_version = 1
```

### 5.3 后端新增代码量估算

| 组件 | 新增/修改 | 代码量 |
|------|----------|--------|
| `getChallenge` query | 新增 | ~30 行 |
| `verifyResponse` mutation | 新增 | ~40 行 |
| `setPassword` mutation | 修改 | ~10 行 |
| `signTransaction` mutation | 修改参数 | ~5 行 |
| `signMessage` mutation | 修改参数 | ~5 行 |
| `signTypedData` mutation | 新增 | ~15 行 |
| KV 前缀管理 | 新增 | ~5 行 |
| **总计** | | **~110 行** |

---

## 6. 安全对比

| 威胁 | 当前方案 | 新方案 |
|------|---------|--------|
| 网络抓包 | `passwordHash` 直接可用 | `response` 单次有效，无法重放 |
| 暴力破解 | 6位数字，毫秒级 | 8位混合+PBKDF2，计算不可行 |
| Rainbow Table | SHA256 无 salt，完全可行 | PBKDF2+salt，不可行 |
| XSS 窃取 | localStorage 中存 hash | 无持久化敏感数据 |
| 重放攻击 | hash 无限次有效 | challenge 单次使用 |
| signTypedData 绕过 | 完全绕过密码 | 必须通过密码验证 |
| 连续猜测 | 无限制 | 5次失败锁定30分钟 |

---

## 7. 检查清单

- [ ] 后端：新增 KV key `user:{id}:tx_salt`、`user:{id}:tx_dk_hash`
- [ ] 后端：新增 `getChallenge` query
- [ ] 后端：新增 `verifyResponse` mutation
- [ ] 后端：修改 `setPassword` 接收 salt + dk
- [ ] 后端：修改 `signTransaction` / `signMessage` 使用 signToken
- [ ] 后端：新增 `signTypedData` mutation
- [ ] 后端：KV 配置（challenge 缓存 TTL + 失败计数 TTL）
- [ ] 前端：`txPassword.ts` 重写为 PBKDF2 + HMAC
- [ ] 前端：`wallet.ts` 移除 passwordHash，使用 signToken
- [ ] 前端：`context.tsx` 引入 acquireSignToken
- [ ] 前端：弹窗支持新密码复杂度（8位+混合）
- [ ] 前端：disconnect 时清理内存缓存
- [ ] 测试：challenge 只能使用一次
- [ ] 测试：signToken 60秒过期
- [ ] 测试：5次失败锁定30分钟

/**
 * Main entry point — mirrors @web3auth/modal.
 *
 * Import everything your config currently uses from '@web3auth/modal'
 * from '@wetee/web3auth' instead.
 */

// Types & enums
export {
  WEB3AUTH_NETWORK,
  fromViemChain,
} from './core/types';

export type {
  CustomChainConfig,
  Web3AuthNetwork,
  Web3AuthNoModalOptions,
  Web3AuthUserInfo,
  Web3AuthContextConfig,
  IEIP1193Provider,
} from './core/types';

// Session validation（board SSO 枢纽回跳前服务端校验用）
export { checkSession, verifySession } from "./core/session";

// SSO 多服务登录（统一设计：登录只在枢纽 /login 页弹，所有服务跳它获取凭证，见 core/sso.ts）
export {
  hubUrl,
  isHubOrigin,
  loginPath,
  loginUrl,
  isHubLoginPage,
  redirectToLogin,
  readStoredSession,
  clearStoredSession,
  isSessionFresh,
  bumpSsoLoop,
  clearSsoLoop,
  takeUrlParam,
  consumeSsoOnBoot,
  returnUrlWithSession,
} from "./core/sso";
export type { SsoSession } from "./core/sso";

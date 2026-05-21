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

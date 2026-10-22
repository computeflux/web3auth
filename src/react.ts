/**
 * React entry point — mirrors @web3auth/modal/react.
 *
 * Import everything your components currently use from '@web3auth/modal/react'
 * from '@wetee/web3auth/react' instead.
 */

export {
    Web3AuthProvider,
    useWeb3Auth,
    useWeb3AuthConnect,
    useWeb3AuthDisconnect,
    useWeb3AuthUser,
    useFunding,
    useWalletUI,
    useWalletServicesPlugin,
} from "./core/context";

export { Web3AuthI18nProvider, useTranslation, setLocale } from "./core/i18n";

export { SsoGate } from "./core/sso-gate";
export type { Locale } from "./core/i18n";

export type {
    Web3AuthProviderProps,
    Web3AuthContextValue,
} from "./core/context";
export type { Web3AuthContextConfig } from "./core/types";

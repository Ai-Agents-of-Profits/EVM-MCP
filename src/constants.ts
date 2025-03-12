/**
 * DeFi Protocol Contract Addresses
 * These addresses are used for interacting with various DeFi protocol contracts
 */

import { ethers } from 'ethers';

/**
 * Map of token symbols to contract addresses for different token types
 */
export const TOKEN_ADDRESSES = {
  'EToken-SWETH': '0x0f1208510A8C3373179F08F496992735a4B0878e',
  'EToken-USDC': '0x7a9C5264bCa5a04B7555bEe2B85c81bd85b12D51',
  'EToken-WBTC': '0x9E8B8EF23E4dF648ad186C38868E0D09Aae0A14f',
  'EToken-aUSD': '0xcf812caa58BEcD37DA673b6c265Bb1505b1D93a4',
  'PToken-LUSD': '0xe6DB1Fb846A59E0780124b659358B6d2ccb45A81',
  'PToken-USDC': '0x9E7EbD0f8255F3A910Bc77FD006A410E9D54EE36',
  'PToken-WBTC': '0xcDA16E9c25f429F4B01A87Ff302Ee7943F2D5015',
  'PToken-aprMON': '0xCfeE48B617F60067F1976E558D47c2Af3F9BD7a7',
  'shMonUniBalance': '0x483d37C74906d258b5Fc99fC88b3A781F5bAB23a',
  'usdcUniBalance': '0xa598C0533F7BDC43b9ebef054Ac92A48001BE727',
  'Token-USDC': '0x5D876D73f4441D5f2438B1A3e2A51771B337F27A'
} as const;

/**
 * Type definitions
 */
export type TokenAddressKey = keyof typeof TOKEN_ADDRESSES;
export type TokenSymbol = 'SWETH' | 'USDC' | 'WBTC' | 'aUSD' | 'LUSD' | 'aprMON' | 'shMon';
export type ContractType = 'EToken' | 'PToken' | 'Balance';

/**
 * Helper functions to get contract addresses
 */
export function getETokenAddress(symbol: TokenSymbol): string {
  const key = `EToken-${symbol}` as TokenAddressKey;
  if (!(key in TOKEN_ADDRESSES)) {
    throw new Error(`EToken for ${symbol} not found`);
  }
  return TOKEN_ADDRESSES[key];
}

export function getPTokenAddress(symbol: TokenSymbol): string {
  const key = `PToken-${symbol}` as TokenAddressKey;
  if (!(key in TOKEN_ADDRESSES)) {
    throw new Error(`PToken for ${symbol} not found`);
  }
  return TOKEN_ADDRESSES[key];
}

export function getBalanceContractAddress(symbol: TokenSymbol): string {
  let key: TokenAddressKey;
  
  if (symbol === 'shMon') {
    key = 'shMonUniBalance';
  } else if (symbol === 'USDC') {
    key = 'usdcUniBalance';
  } else {
    throw new Error(`Balance contract for ${symbol} not found`);
  }
  
  return TOKEN_ADDRESSES[key];
}

/**
 * Get base token address
 */
export function getTokenAddress(symbol: TokenSymbol): string {
  const key = `Token-${symbol}` as TokenAddressKey;
  if (!(key in TOKEN_ADDRESSES)) {
    throw new Error(`Token address for ${symbol} not found`);
  }
  return TOKEN_ADDRESSES[key];
}

/**
 * Function to get contract address based on contract type and symbol
 */
export function getContractAddress(contractType: ContractType, symbol: TokenSymbol): string {
  if (contractType === 'EToken') {
    return getETokenAddress(symbol);
  } else if (contractType === 'PToken') {
    return getPTokenAddress(symbol);
  } else if (contractType === 'Balance') {
    return getBalanceContractAddress(symbol);
  }
  
  throw new Error(`Contract type ${contractType} not supported`);
}

/**
 * Network configuration for supported chains
 */
export const NETWORKS = {
  monad: {
    name: 'Monad Testnet',
    chainId: 10143,
    explorerUrl: 'https://testnet.monadexplorer.com'
  }
};

/**
 * Protocol-specific configuration
 */
export const PROTOCOL_CONFIG = {
  delegationIndex: 1, // Default delegation index for setDelegateApproval
  defaultSlippage: 0.005, // 0.5% default slippage
  minHealthFactor: 1.1, // Minimum recommended health factor
};

/**
 * Other utility functions
 */
export function getExplorerUrl(network: string, hash: string): string {
  if (network === 'monad') {
    return `https://testnet.monadexplorer.com/tx/${hash}`;
  }
  
  throw new Error(`Unsupported network: ${network}`);
}

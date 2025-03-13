import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';

// Load environment variables
dotenv.config();

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define network types
export type NetworkName = 'monad' | 'sepolia';

// Network configuration type
interface NetworkConfig {
  name: string;
  rpcUrl: string;
  chainId: number;
  chainIdHex: string;
  explorer: string;
  alternativeRpcUrl?: string;
  alternativeExplorer?: string;
}

// Define network configurations
const networks: Record<NetworkName, NetworkConfig> = {
  monad: {
    name: 'Monad Testnet',
    rpcUrl: 'https://monad-testnet.g.alchemy.com/v2/QsZfqi1o2pa2hcxXsgq6DXbDI2H-bbBR',
    alternativeRpcUrl: 'https://monad-testnet.g.alchemy.com/v2/QsZfqi1o2pa2hcxXsgq6DXbDI2H-bbBR',
    chainId: 10143,
    chainIdHex: '0x279F',
    explorer: 'https://testnet.monadexplorer.com/',
    alternativeExplorer: 'https://monad-testnet.socialscan.io/'
  },
  sepolia: {
    name: 'Sepolia Testnet',
    rpcUrl: `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY || ''}`,
    chainId: 11155111,
    chainIdHex: '0xaa36a7',
    explorer: 'https://sepolia.etherscan.io'
  }
};

// Define the configuration
export const config = {
  // API configuration
  provider: {
    type: 'alchemy' as 'alchemy' | 'infura', // 'alchemy' or 'infura'
    alchemyApiKey: 'QsZfqi1o2pa2hcxXsgq6DXbDI2H-bbBR',
    infuraApiKey: process.env.INFURA_API_KEY || '',
    defaultNetwork: 'monad' as NetworkName, // Changed from 'sepolia' to 'monad'
  },
  
  // Network configuration
  networks,
  
  // Key storage configuration
  keys: {
    encrypt: process.env.ENCRYPT_KEYS === 'true',
    password: process.env.KEY_PASSWORD || '',
    path: process.env.KEYS_PATH || path.resolve(__dirname, '../keys'),
  },
};

// Ensure key storage directory exists
fs.ensureDirSync(config.keys.path);

// Get network configuration by name
export function getNetworkConfig(networkName?: string): NetworkConfig {
  if (!networkName) {
    return config.networks[config.provider.defaultNetwork];
  }
  
  // Normalize network name for case-insensitive comparison
  const normalizedName = networkName.toLowerCase();
  
  // Handle common network name variations
  if (normalizedName === 'monad-testnet' || normalizedName === 'monad testnet') {
    return config.networks.monad;
  }
  
  // Try to find the network by key
  const network = config.networks[normalizedName as NetworkName];
  
  if (!network) {
    throw new Error(`Network configuration not found for: ${networkName}`);
  }
  
  return network;
}

// Get RPC URL for a network
export function getRpcUrl(networkName?: string): string {
  const network = getNetworkConfig(networkName);
  return network.rpcUrl;
}

// Get explorer URL for a network
export function getExplorerUrl(networkName?: string): string {
  const network = getNetworkConfig(networkName);
  return network.explorer;
}

export default config;
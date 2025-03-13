//@ts-nocheck
import { ethers } from 'ethers';
import * as fs from 'fs-extra';
import * as path from 'path';
import { TOKEN_ADDRESSES } from './constants.js';
import config, { getRpcUrl, getExplorerUrl, NetworkName } from './config.js';
import * as crypto from './crypto.js';

/**
 * Get Ethereum provider for a specific network
 */
export function getProvider(network: string = config.provider.defaultNetwork): ethers.JsonRpcProvider {
  const rpcUrl = getRpcUrl(network);
  return new ethers.JsonRpcProvider(rpcUrl);
}

/**
 * Get a signer for the specified address
 */
export async function getSigner(
  address: string,
  network: string = config.provider.defaultNetwork
): Promise<ethers.Wallet | null> {
  const wallet = await crypto.loadWallet(address);
  if (!wallet) return null;
  
  const provider = getProvider(network);
  return wallet.connect(provider);
}

/**
 * Check the ETH balance for an address
 */
export async function checkBalance(
  address: string,
  network: string = config.provider.defaultNetwork
): Promise<string> {
  const provider = await getProvider(network);
  const balance = await provider.getBalance(address);
  return ethers.formatEther(balance);
}

/**
 * Check balances of ETH and other tokens for an address
 */
export async function checkAllBalances(
  address: string,
  network: string = config.provider.defaultNetwork
): Promise<{
  eth: string;
  usdc: string;
  usdt: string;
  [key: string]: string;
}> {
  const provider = await getProvider(network);
  
  // Get ETH balance
  const ethBalance = await provider.getBalance(address);
  
  // Create basic ERC20 ABI for token balance checks
  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)"
  ];
  
  // Define tokens to check with their addresses
  const tokens = {
    usdc: TOKEN_ADDRESSES['Token-USDC'],
    usdt: '0x88b8E2161DEDC77EF4ab7585569D2415a1C1055D'
  };
  
  // Get token balances
  const result: { [key: string]: string } = {
    eth: ethers.formatEther(ethBalance)
  };
  
  for (const [symbol, tokenAddress] of Object.entries(tokens)) {
    try {
      const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, provider);
      const balance = await tokenContract.balanceOf(address);
      const decimals = await tokenContract.decimals();
      result[symbol] = ethers.formatUnits(balance, decimals);
    } catch (error) {
      console.warn(`Error getting ${symbol} balance:`, error);
      result[symbol] = '0';
    }
  }
  
  return result;
}

/**
 * Get transactions for an address
 */
export async function getTransactions(
  address: string,
  limit: number = 10,
  network: string = config.provider.defaultNetwork
): Promise<any[]> {
  const provider = getProvider(network);
  
  // Get the current block number
  const currentBlock = await provider.getBlockNumber();
  
  // Get recent blocks
  const blockPromises = [];
  const blockCount = Math.min(limit * 2, 100); // Look at up to 100 blocks
  
  for (let i = 0; i < blockCount; i++) {
    if (currentBlock - i > 0) {
      blockPromises.push(provider.getBlock(currentBlock - i, true));
    }
  }
  
  const blocks = await Promise.all(blockPromises);
  const transactions: any[] = [];
  const normalizedAddress = address.toLowerCase();
  
  // Filter transactions involving the address
  for (const block of blocks) {
    if (!block || !block.transactions) continue;
    
    for (const tx of block.transactions) {
      // Handle both string type and object type transactions for compatibility
      const txFrom = typeof tx === 'string' ? '' : (tx.from || '');
      const txTo = typeof tx === 'string' ? '' : (tx.to || '');
      
      if (
        (txFrom.toLowerCase && txFrom.toLowerCase() === normalizedAddress) ||
        (txTo.toLowerCase && txTo.toLowerCase() === normalizedAddress)
      ) {
        if (typeof tx === 'string') {
          // If tx is just a transaction hash, fetch the full transaction
          const fullTx = await provider.getTransaction(tx);
          if (fullTx) {
            transactions.push({
              hash: fullTx.hash,
              from: fullTx.from,
              to: fullTx.to,
              value: fullTx.value ? ethers.formatEther(fullTx.value) : '0',
              blockNumber: fullTx.blockNumber,
              timestamp: block.timestamp,
            });
          }
        } else {
          // If tx is already a full transaction object
          transactions.push({
            hash: tx.hash,
            from: tx.from || '',
            to: tx.to || '',
            value: tx.value ? ethers.formatEther(tx.value) : '0',
            blockNumber: tx.blockNumber,
            timestamp: block.timestamp,
          });
        }
        
        if (transactions.length >= limit) {
          return transactions;
        }
      }
    }
  }
  
  return transactions;
}

/**
 * Send ETH to an address
 */
export async function sendTransaction(
  fromAddress: string,
  toAddress: string,
  etherAmount: string,
  network: string = config.provider.defaultNetwork
): Promise<{hash: string; explorer: string}> {
  const signer = await getSigner(fromAddress, network);
  if (!signer) {
    throw new Error(`Unable to load wallet for address ${fromAddress}`);
  }
  
  const tx = await signer.sendTransaction({
    to: toAddress,
    value: ethers.parseEther(etherAmount)
  });
  
  // Get explorer URL from config
  const explorerUrl = getExplorerUrl(network);
  
  return {
    hash: tx.hash,
    explorer: `${explorerUrl}/tx/${tx.hash}`
  };
}

/**
 * Deploy a contract
 */
export async function deployContract(
  fromAddress: string,
  abi: any[],
  bytecode: string,
  constructorArgs: any[] = [],
  network: string = config.provider.defaultNetwork
): Promise<{
  address: string;
  deploymentHash: string;
  explorer: string;
}> {
  const signer = await getSigner(fromAddress, network);
  if (!signer) {
    throw new Error(`Unable to load wallet for address ${fromAddress}`);
  }
  
  // Create the factory
  const factory = new ethers.ContractFactory(abi, bytecode, signer);
  
  // Deploy the contract
  const contract = await factory.deploy(...constructorArgs);
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  
  const receipt = await contract.deploymentTransaction()?.wait();
  const deploymentHash = receipt?.hash || '';
  
  // Get explorer URL from config
  const explorerUrl = getExplorerUrl(network);
  
  return {
    address: contractAddress,
    deploymentHash,
    explorer: `${explorerUrl}/address/${contractAddress}`
  };
}

/**
 * Call a contract method (read-only)
 */
export async function callContractMethod(
  contractAddress: string,
  abi: any[],
  methodName: string,
  methodArgs: any[] = [],
  network: string = config.provider.defaultNetwork
): Promise<any> {
  const provider = getProvider(network);
  const contract = new ethers.Contract(contractAddress, abi, provider);
  
  return await contract[methodName](...methodArgs);
}

/**
 * Execute a contract method (write)
 */
export async function executeContractMethod(
  fromAddress: string,
  contractAddress: string,
  abi: any[],
  methodName: string,
  methodArgs: any[] = [],
  network: string = config.provider.defaultNetwork
): Promise<{
  hash: string;
  explorer: string;
}> {
  const signer = await getSigner(fromAddress, network);
  if (!signer) {
    throw new Error(`Unable to load wallet for address ${fromAddress}`);
  }
  
  const contract = new ethers.Contract(contractAddress, abi, signer);
  const tx = await contract[methodName](...methodArgs);
  await tx.wait();
  
  // Get explorer URL from config
  const explorerUrl = getExplorerUrl(network);
  
  return {
    hash: tx.hash,
    explorer: `${explorerUrl}/tx/${tx.hash}`
  };
}
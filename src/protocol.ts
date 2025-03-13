//@ts-nocheck
import { ethers } from 'ethers';
import * as fs from 'fs-extra';
import * as path from 'path';
import { getETokenAddress, getPTokenAddress, getBalanceContractAddress, getExplorerUrl, getTokenAddress, getUniversalBalanceAddress, TokenSymbol, ContractType, TOKEN_ADDRESSES } from './constants.js';
import * as ethereum from './ethereum.js';
import config from './config.js';
import transactionQueue from './transaction-queue.js';

// Type declaration for fs-extra
declare module 'fs-extra' {
  export * from 'fs';
}

/**
 * Load ABI from JSON file
 * @param abiName Name of the ABI JSON file
 * @returns The parsed ABI JSON
 */
async function loadAbi(abiName: string): Promise<any> {
  // Instead of loading from file, use simplified ABIs defined below
  if (abiName === 'ETokenABI') {
    return ETokenABI;
  } else if (abiName === 'PTokenABI') {
    return PTokenABI;
  } else if (abiName === 'UniversalBalanceABI') {
    return UniversalBalanceABI;
  } else {
    throw new Error(`Unknown ABI: ${abiName}`);
  }
}

// Simplified ABI for EToken with just the functions we need
const ETokenABI = [
  // Basic ERC20 functions
  "function balanceOf(address) view returns (uint256)",
  
  // EToken specific functions
  "function borrowFor(address account, address recipient, uint256 amount)",
  "function repayFor(address account, uint256 amount)",
  "function setDelegateApproval(address delegate, bool isApproved)",
  "function debtBalanceWithUpdateSafe(address account) returns (uint256)",
  "function totalBorrows() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function interestRateModel() view returns (address)",
  "function borrowRatePerBlock() view returns (uint256)",
  "function supplyRatePerBlock() view returns (uint256)",
  "function exchangeRateCurrent() view returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
  "function collateralFactorMantissa() view returns (uint256)",
  "function cash() view returns (uint256)",
  "function borrowBalanceCurrent(address account) view returns (uint256)",
  "function borrowBalanceStored(address account) view returns (uint256)",
  "function borrow(uint256 borrowAmount) returns (uint256)",
  "function repay(uint256 repayAmount) returns (uint256)"
];

// Simplified ABI for PToken with just the functions we need
const PTokenABI = [
  // Basic ERC20 functions
  "function balanceOf(address) view returns (uint256)",
  
  // PToken specific functions
  "function redeemCollateralFor(uint256 amount, address recipient, address account)",
  "function setDelegateApproval(address delegate, bool isApproved)",
  "function balanceOfUnderlying(address account) view returns (uint256)",
  "function collateralFactorMantissa() view returns (uint256)",
  "function exchangeRateCurrent() view returns (uint256)",
  "function redeemCollateral(uint256 shares, address receiver, address owner)"
];

// Simplified ABI for UniversalBalance with just the functions we need
const UniversalBalanceABI = [
  "function deposit(uint256 amount, bool willLend)",
  "function depositFor(uint256 amount, bool lendingDeposit, address account)",
  "function withdrawFor(uint256 amount, bool lendingRedemption, address recipient, address account)",
  "function withdraw(uint256 amount, bool forceLentRedemption, address recipient) returns (uint256 amountWithdrawn, bool lendingBalanceUsed)",
  "function setDelegateApproval(address delegate, bool isApproved)",
  "function userBalances(address user) view returns (uint256 sittingBalance, uint256 lentBalance)"
];

/**
 * Get EToken contract instance
 * @param symbol Token symbol
 * @param signerAddress Address to use for signing transactions
 * @param network Network to connect to
 * @returns Contract instance
 */
export async function getETokenContract(symbol: string | TokenSymbol, signerAddress: string, network: string): Promise<ethers.Contract> {
  const address = getETokenAddress(symbol as TokenSymbol);
  const signer = await ethereum.getSigner(signerAddress, network);
  const abi = await loadAbi('ETokenABI');
  return new ethers.Contract(address, abi, signer);
}

/**
 * Get PToken contract instance
 * @param symbol Token symbol
 * @param signerAddress Address to use for signing transactions
 * @param network Network to connect to
 * @returns Contract instance
 */
export async function getPTokenContract(symbol: string | TokenSymbol, signerAddress: string, network: string): Promise<ethers.Contract> {
  const address = getPTokenAddress(symbol as TokenSymbol);
  const signer = await ethereum.getSigner(signerAddress, network);
  const abi = await loadAbi('PTokenABI');
  return new ethers.Contract(address, abi, signer);
}

/**
 * Get Universal Balance contract instance
 * @param symbol Token symbol
 * @param signerAddress Address to use for signing transactions
 * @param network Network to connect to
 * @returns Contract instance
 */
export async function getUniversalBalanceContract(symbol: string | TokenSymbol, signerAddress: string, network: string): Promise<ethers.Contract> {
  const address = getBalanceContractAddress(symbol as TokenSymbol);
  const signer = await ethereum.getSigner(signerAddress, network);
  const abi = await loadAbi('UniversalBalanceABI');
  return new ethers.Contract(address, abi, signer);
}

/**
 * Set delegation approval for a contract
 * @param contractType Contract type (EToken, PToken, Balance)
 * @param symbol Token symbol
 * @param delegateAddress Address to be delegated
 * @param isApproved Whether to approve or revoke
 * @param ownerAddress Owner address
 * @param network Network to connect to
 * @returns Transaction hash and explorer URL
 */
export async function setDelegateApproval(
  contractType: ContractType,
  symbol: string | TokenSymbol,
  delegateAddress: string,
  isApproved: boolean,
  ownerAddress: string,
  network: string = config.infura.defaultNetwork
): Promise<{hash: string; explorer: string}> {
  let contract: ethers.Contract;
  
  // Get appropriate contract based on type
  if (contractType === 'EToken') {
    contract = await getETokenContract(symbol, ownerAddress, network);
  } else if (contractType === 'PToken') {
    contract = await getPTokenContract(symbol, ownerAddress, network);
  } else { // Balance
    contract = await getUniversalBalanceContract(symbol, ownerAddress, network);
  }
  
  // Call contract method to approve delegate
  const functionName = 'setDelegateApproval';
  const tx = await contract[functionName](delegateAddress, isApproved);
  await tx.wait();
  
  return {
    hash: tx.hash,
    explorer: getExplorerUrl(network, tx.hash)
  };
}

/**
 * Deposit funds to the protocol
 * @param symbol Token symbol
 * @param amount Amount to deposit
 * @param willLend Whether to deposit to lending market
 * @param fromAddress Sender address
 * @param network Network to connect to
 * @returns Transaction hash and explorer URL
 */
export async function depositFunds(
  symbol: string | TokenSymbol,
  amount: string,
  willLend: boolean,
  fromAddress: string,
  network: string = config.infura.defaultNetwork
): Promise<{hash: string; explorer: string; transactionId: string}> {
  // Create a transaction record first to track this transaction
  const transactionId = transactionQueue.createTransaction('deposit', {
    symbol, amount, willLend, fromAddress, network
  });
  
  // Start the transaction process in the background immediately
  setTimeout(async () => {
    try {
      const contract = await getUniversalBalanceContract(symbol, fromAddress, network);
      
      // Convert amount to proper format (wei)
      const decimals = symbol === 'USDC' ? 6 : 18; // Use 6 decimals for USDC, 18 for other tokens
      const formattedAmount = ethers.parseUnits(amount, decimals);
    
      // Set up transaction with explicit gas limit to avoid timeouts
      const options = {
        gasLimit: 500000, // Explicit gas limit
      };
      
      console.log(`Depositing ${amount} ${symbol} from address ${fromAddress}`);
      console.log(`Using decimals: ${decimals}, formatted amount: ${formattedAmount.toString()}, willLend: ${willLend}`);
      
      // Call deposit function with options
      const tx = await contract.deposit(formattedAmount, willLend, options);
      console.log(`Transaction initiated with hash: ${tx.hash}`);
      
      // Update transaction record with hash
      transactionQueue.setTransactionHash(transactionId, tx.hash);
      
      // Continue processing in the background
      try {
        // Wait for transaction confirmation
        const receipt = await tx.wait(1);
        console.log(`Transaction confirmed: ${tx.hash}`);
        
        const result = {
          hash: tx.hash,
          explorer: getExplorerUrl(network, tx.hash)
        };
        
        console.log('Deposit successful:', result);
        
        // Mark transaction as confirmed
        transactionQueue.confirmTransaction(transactionId, {
          ...result,
          amount,
          symbol,
          willLend,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error during deposit confirmation:', error);
        // Mark transaction as failed
        transactionQueue.failTransaction(transactionId, error);
      }
    } catch (error) {
      console.error('Error initiating deposit transaction:', error);
      // Mark transaction as failed
      transactionQueue.failTransaction(transactionId, error);
    }
  }, 0);
  
  // Return immediately with transaction ID
  return {
    hash: 'pending', // Will be updated in the transaction queue once available
    explorer: '',
    transactionId
  };
}

/**
 * Withdraw funds from the protocol
 * @param symbol Token symbol
 * @param amount Amount to withdraw
 * @param forceLentRedemption Whether to redeem from lending market
 * @param recipientAddress Recipient address
 * @param fromAddress Sender address
 * @param network Network to connect to
 * @returns Transaction hash, explorer URL, and assets redeemed
 */
export async function withdrawFunds(
  symbol: string | TokenSymbol,
  amount: string,
  forceLentRedemption: boolean,
  recipientAddress: string,
  fromAddress: string,
  network: string = config.infura.defaultNetwork
): Promise<{hash: string; explorer: string; amountWithdrawn: string; lendingBalanceUsed: boolean; transactionId: string}> {
  // Create a transaction record first to track this transaction
  const transactionId = transactionQueue.createTransaction('withdraw', {
    symbol, amount, forceLentRedemption, recipientAddress, fromAddress, network
  });
  
  // Start the transaction process in the background immediately
  setTimeout(async () => {
    try {
      const contract = await getUniversalBalanceContract(symbol, fromAddress, network);
      
      // Convert amount to proper format using the correct decimals for the token
      const decimals = symbol === 'USDC' ? 6 : 18; // Use 6 decimals for USDC, 18 for other tokens
      const formattedAmount = ethers.parseUnits(amount, decimals);
      
      // Set up transaction with explicit gas limit to avoid timeouts
      const options = {
        gasLimit: 500000, // Explicit gas limit
      };
      
      console.log(`Withdrawing ${amount} ${symbol} from address ${fromAddress} to ${recipientAddress}`);
      console.log(`Using decimals: ${decimals}, formatted amount: ${formattedAmount.toString()}`);
      
      // Call withdraw function with options
      const tx = await contract.withdraw(formattedAmount, forceLentRedemption, recipientAddress, options);
      console.log(`Transaction initiated with hash: ${tx.hash}`);
      
      // Update transaction record with hash
      transactionQueue.setTransactionHash(transactionId, tx.hash);
      
      // Continue processing in the background
      try {
        // Wait for transaction confirmation
        const receipt = await tx.wait(1);
        console.log(`Transaction confirmed: ${tx.hash}`);
        
        // Extract return values from event logs if possible
        let amountWithdrawn = amount;
        let lendingBalanceUsed = forceLentRedemption;
        
        try {
          // Attempt to parse event logs to get actual return values
          const withdrawalEvent = receipt.events?.find(e => e.event === 'Withdrawal');
          if (withdrawalEvent && withdrawalEvent.args) {
            amountWithdrawn = ethers.formatUnits(withdrawalEvent.args.amountWithdrawn || formattedAmount, decimals);
            lendingBalanceUsed = withdrawalEvent.args.lendingBalanceUsed || forceLentRedemption;
          }
        } catch (error) {
          console.warn('Could not parse withdrawal event data', error);
        }
        
        const result = {
          hash: tx.hash,
          explorer: getExplorerUrl(network, tx.hash),
          amountWithdrawn,
          lendingBalanceUsed
        };
        
        console.log('Withdrawal successful:', result);
        
        // Mark transaction as confirmed
        transactionQueue.confirmTransaction(transactionId, {
          ...result,
          amount,
          symbol,
          recipientAddress,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error during withdrawal confirmation:', error);
        // Mark transaction as failed
        transactionQueue.failTransaction(transactionId, error);
      }
    } catch (error) {
      console.error('Error initiating withdrawal transaction:', error);
      // Mark transaction as failed
      transactionQueue.failTransaction(transactionId, error);
    }
  }, 0);
  
  // Return immediately with transaction ID
  return {
    hash: 'pending', // Will be updated in the transaction queue once available
    explorer: '',
    amountWithdrawn: amount, // Initial estimate
    lendingBalanceUsed: forceLentRedemption,
    transactionId
  };
}

/**
 * Borrow funds from the protocol
 * @param symbol Token symbol
 * @param amount Amount to borrow
 * @param fromAddress Sender address
 * @param network Network to connect to
 * @returns Transaction hash and explorer URL
 */
export async function borrowFunds(
  symbol: string | TokenSymbol,
  amount: string,
  fromAddress: string,
  network: string = config.infura.defaultNetwork
): Promise<{hash: string; explorer: string}> {
  const contract = await getETokenContract(symbol, fromAddress, network);
  
  // Convert amount to proper format (wei)
  const formattedAmount = ethers.parseUnits(amount, 18); // Assuming 18 decimals
  
  // Call borrow function directly
  const tx = await contract.borrow(formattedAmount);
  await tx.wait();
  
  return {
    hash: tx.hash,
    explorer: getExplorerUrl(network, tx.hash)
  };
}

/**
 * Redeem collateral from the protocol
 * @param symbol Token symbol
 * @param shares Amount of collateral shares to redeem
 * @param receiverAddress Recipient address
 * @param ownerAddress Owner address
 * @param fromAddress Sender address
 * @param network Network to connect to
 * @returns Transaction hash, explorer URL, and assets redeemed
 */
export async function redeemCollateral(
  symbol: string | TokenSymbol,
  shares: string,
  receiverAddress: string,
  ownerAddress: string,
  fromAddress: string,
  network: string = config.infura.defaultNetwork
): Promise<{hash: string; explorer: string; assets: string}> {
  const contract = await getPTokenContract(symbol, fromAddress, network);
  
  // Convert amount to proper format (wei)
  const formattedShares = ethers.parseUnits(shares, 18); // Assuming 18 decimals
  
  // Call redeemCollateral function directly
  const tx = await contract.redeemCollateral(formattedShares, receiverAddress, ownerAddress);
  const receipt = await tx.wait();
  
  // Try to extract returned assets value from event logs
  let assets = shares; // Default to the input amount
  
  try {
    // Attempt to parse event logs to get actual assets returned
    const redemptionEvent = receipt.events?.find(e => e.event === 'Redeem' || e.event === 'Withdrawal');
    if (redemptionEvent && redemptionEvent.args) {
      assets = ethers.formatUnits(redemptionEvent.args.assets || formattedShares, 18);
    }
  } catch (error) {
    console.warn('Could not parse redemption event data', error);
  }
  
  return {
    hash: tx.hash,
    explorer: getExplorerUrl(network, tx.hash),
    assets
  };
}

/**
 * Get interest rates for a token based on Curvance's interest rate model
 * @param symbol Token symbol
 * @param network Network to connect to
 * @returns Interest rate information
 */
export async function getInterestRates(
  symbol: string | TokenSymbol,
  network: string = config.infura.defaultNetwork
): Promise<any> {
  try {
    // Extract the base token symbol if a full token key was provided
    let baseSymbol = symbol;
    if (typeof symbol === 'string' && symbol.includes('-')) {
      baseSymbol = symbol.split('-')[1] as TokenSymbol;
    }
    
    // Check if EToken exists for this symbol
    let address;
    try {
      address = getETokenAddress(baseSymbol as TokenSymbol);
    } catch (error) {
      // If EToken doesn't exist, return error information
      console.log(`No EToken found for ${baseSymbol}, cannot get interest rates`);
      return {
        token: baseSymbol,
        error: `EToken for ${baseSymbol} not found`,
        estimated: false
      };
    }
    
    // Use a read-only provider since we don't need to sign transactions
    const provider = await ethereum.getProvider(network);
    const abi = await loadAbi('ETokenABI');
    const contract = new ethers.Contract(address, abi, provider);
    
    // Get interest rate model address
    const interestRateModelAddress = await contract.interestRateModel();
    
    // Get liquidity data to calculate utilization
    const marketData = await getMarketLiquidity(baseSymbol, network);
    
    // Extract utilization percentage from market data (remove the % sign)
    const utilization = parseFloat(marketData.utilization.replace('%', ''));
    
    // Curvance interest rate model parameters based on their documentation
    const baseRate = 2.0; // Base interest rate (2%)
    const vertexPoint = 85; // The vertex point where rates accelerate (85%)
    
    // Calculate borrow APY based on Curvance's model
    let borrowAPY;
    if (utilization <= vertexPoint) {
      // Below vertex: linear increase from base rate
      // Formula: baseRate + (utilization / vertexPoint) * (vertexRate - baseRate)
      const vertexRate = 4.0; // Rate at vertex point
      borrowAPY = baseRate + (utilization / vertexPoint) * (vertexRate - baseRate);
    } else {
      // Above vertex: exponential increase
      // Formula from docs: rates increase significantly and can double every 4 hours
      // We'll use a simplified exponential model here
      const excessUtilization = utilization - vertexPoint;
      const multiplier = Math.pow(2, excessUtilization / (100 - vertexPoint));
      borrowAPY = 4.0 * multiplier; // Starts at 4% at vertex and grows exponentially
    }
    
    // Supply APY calculation based on Curvance model
    // Supply rate = Borrow rate * Utilization * (1 - Reserve Factor)
    const reserveFactor = 0.1; // Typical reserve factor of 10%
    const supplyAPY = borrowAPY * (utilization / 100) * (1 - reserveFactor);
    
    // Format the response
    return {
      token: baseSymbol,
      interestRateModel: interestRateModelAddress,
      borrowAPY: borrowAPY.toFixed(2) + '%',
      supplyAPY: supplyAPY.toFixed(2) + '%',
      utilization: utilization.toFixed(2) + '%',
      vertexPoint: vertexPoint + '%',
      estimated: true,
      note: "Rates estimated based on Curvance's dynamic interest rate model. Actual rates may vary."
    };
  } catch (error) {
    console.error(`Error getting interest rates for ${symbol}:`, error);
    // In case of any error, return minimal information
    return {
      token: symbol,
      error: error.message,
      estimated: false
    };
  }
}

/**
 * Get market liquidity for a token
 * @param symbol Token symbol
 * @param network Network to connect to
 * @returns Market liquidity information
 */
export async function getMarketLiquidity(
  symbol: string | TokenSymbol,
  network: string = config.infura.defaultNetwork
): Promise<any> {
  try {
    // Extract the base token symbol if a full token key was provided
    let baseSymbol = symbol;
    if (typeof symbol === 'string' && symbol.includes('-')) {
      baseSymbol = symbol.split('-')[1] as TokenSymbol;
    }
    
    // Check if EToken exists for this symbol
    let address;
    try {
      address = getETokenAddress(baseSymbol as TokenSymbol);
    } catch (error) {
      // If EToken doesn't exist, return default values
      console.log(`No EToken found for ${baseSymbol}, returning default liquidity values`);
      return {
        token: baseSymbol,
        totalBorrows: "0",
        totalSupply: "0",
        availableLiquidity: "0",
        utilization: "0%"
      };
    }
    
    // Use a read-only provider since we don't need to sign transactions
    const provider = await ethereum.getProvider(network);
    const abi = await loadAbi('ETokenABI');
    const contract = new ethers.Contract(address, abi, provider);
    
    // Get liquidity info using only totalBorrows and totalSupply
    const totalBorrows = await contract.totalBorrows();
    const totalSupply = await contract.totalSupply();
    
    // Convert values to strings
    const totalBorrowsStr = totalBorrows.toString();
    const totalSupplyStr = totalSupply.toString();
    
    // Calculate available liquidity and utilization using regular math
    // (converting from strings to numbers)
    const totalBorrowsNum = parseFloat(totalBorrowsStr);
    const totalSupplyNum = parseFloat(totalSupplyStr);
    const availableLiquidity = Math.max(0, totalSupplyNum - totalBorrowsNum);
    const utilization = totalSupplyNum > 0 ? (totalBorrowsNum * 100 / totalSupplyNum) : 0;
    
    return {
      token: baseSymbol,
      totalBorrows: totalBorrowsStr,
      totalSupply: totalSupplyStr,
      availableLiquidity: availableLiquidity.toString(),
      utilization: utilization.toFixed(2) + '%'
    };
  } catch (error) {
    console.error(`Error getting market liquidity for ${symbol}:`, error);
    throw new Error(`Failed to get market liquidity for ${symbol}: ${(error as Error).message}`);
  }
}

/**
 * Get market liquidity for a token asynchronously
 * @param symbol Token symbol
 * @param network Network to connect to
 * @returns Object with taskId and initial status
 */
export async function getMarketLiquidityAsync(
  symbol: string | TokenSymbol,
  network: string = config.infura.defaultNetwork
): Promise<{
  taskId: string;
  status: string;
  partial?: {
    message: string;
    progress: number;
  }
}> {
  try {
    // Create a unique task ID
    const taskId = `liquidity-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    
    // Start the analysis in the background
    processMarketLiquidityTask(taskId, symbol, network);
    
    // Return immediately with the task ID
    return {
      taskId,
      status: 'pending',
      partial: {
        message: 'Market liquidity analysis started',
        progress: 0
      }
    };
  } catch (error) {
    console.error(`Error starting market liquidity analysis for ${symbol}:`, error);
    throw new Error(`Failed to start market liquidity analysis: ${(error as Error).message}`);
  }
}

/**
 * Process the market liquidity task in the background
 * @param taskId Task ID
 * @param symbol Token symbol
 * @param network Network to connect to
 */
async function processMarketLiquidityTask(
  taskId: string,
  symbol: string | TokenSymbol,
  network: string
): Promise<void> {
  try {
    // Update task status to processing
    transactionQueue.updateTaskStatus(taskId, {
      status: "processing",
      message: "Retrieving market liquidity data...",
      progress: 10,
      result: null
    });

    // Extract the base token symbol if a full token key was provided
    let baseSymbol = symbol;
    if (typeof symbol === 'string' && symbol.includes('-')) {
      baseSymbol = symbol.split('-')[1] as TokenSymbol;
    }
    
    // Update progress
    transactionQueue.updateTaskStatus(taskId, {
      status: "processing",
      message: `Processing token ${baseSymbol}...`,
      progress: 30,
      result: null
    });
    
    // Check if EToken exists for this symbol
    let address;
    try {
      address = getETokenAddress(baseSymbol as TokenSymbol);
    } catch (error) {
      // If EToken doesn't exist, return default values
      console.log(`No EToken found for ${baseSymbol}, returning default liquidity values`);
      
      const defaultResult = {
        token: baseSymbol,
        totalBorrows: "0",
        totalSupply: "0",
        availableLiquidity: "0",
        utilization: "0%"
      };

      // Complete the task
      transactionQueue.updateTaskStatus(taskId, {
        status: "completed",
        message: "Market liquidity analysis completed",
        progress: 100,
        result: defaultResult
      });
      
      return;
    }
    
    // Update progress
    transactionQueue.updateTaskStatus(taskId, {
      status: "processing",
      message: "Connecting to contract...",
      progress: 50,
      result: null
    });
    
    // Use a read-only provider since we don't need to sign transactions
    const provider = await ethereum.getProvider(network);
    const abi = await loadAbi('ETokenABI');
    const contract = new ethers.Contract(address, abi, provider);
    
    // Update progress
    transactionQueue.updateTaskStatus(taskId, {
      status: "processing",
      message: "Fetching contract data...",
      progress: 70,
      result: null
    });
    
    // Get liquidity info using only totalBorrows and totalSupply
    const totalBorrows = await contract.totalBorrows();
    const totalSupply = await contract.totalSupply();
    
    // Convert values to strings
    const totalBorrowsStr = totalBorrows.toString();
    const totalSupplyStr = totalSupply.toString();
    
    // Calculate available liquidity and utilization using regular math
    // (converting from strings to numbers)
    const totalBorrowsNum = parseFloat(totalBorrowsStr);
    const totalSupplyNum = parseFloat(totalSupplyStr);
    const availableLiquidity = Math.max(0, totalSupplyNum - totalBorrowsNum);
    const utilization = totalSupplyNum > 0 ? (totalBorrowsNum * 100 / totalSupplyNum) : 0;
    
    const result = {
      token: baseSymbol,
      totalBorrows: totalBorrowsStr,
      totalSupply: totalSupplyStr,
      availableLiquidity: availableLiquidity.toString(),
      utilization: utilization.toFixed(2) + '%'
    };
    
    // Complete the task
    transactionQueue.updateTaskStatus(taskId, {
      status: "completed",
      message: "Market liquidity analysis completed",
      progress: 100,
      result
    });
    
  } catch (error) {
    console.error(`Error processing market liquidity task for ${symbol}:`, error);
    // Update task status to failed
    transactionQueue.updateTaskStatus(taskId, {
      status: "failed",
      message: `Error: ${(error as Error).message}`,
      progress: 0,
      result: null
    });
  }
}

/**
 * Get market liquidity task status
 * @param taskId Task ID
 * @returns Task status
 */
export function getMarketLiquidityStatus(taskId: string): any {
  return transactionQueue.getTaskStatus(taskId);
}

/**
 * Get a complete summary of a user's position across all supported tokens
 * @param userAddress Address of the user
 * @param network Network to connect to
 * @returns Complete position summary
 */
export async function getUserPosition(
  userAddress: string,
  network: string = config.infura.defaultNetwork
): Promise<any> {
  try {
    const provider = await ethereum.getProvider(network);
    
    // Define the tokens we want to check
    const tokens: { symbol: TokenSymbol, universalBalance?: string }[] = [
      { symbol: 'SWETH' },
      { symbol: 'USDC', universalBalance: TOKEN_ADDRESSES['usdcUniBalance'] },
      { symbol: 'WBTC' },
      { symbol: 'aUSD' },
      { symbol: 'LUSD' },
      { symbol: 'aprMON' },
      { symbol: 'shMon', universalBalance: TOKEN_ADDRESSES['shMonUniBalance'] }
    ];
    
    // Initialize results object
    const result: any = {
      supplied: [],
      borrowed: [],
      collateral: [],
      universalBalances: [],
      healthFactor: null,
      totalSuppliedValueUSD: 0,
      totalBorrowedValueUSD: 0,
      totalCollateralValueUSD: 0,
      totalUniversalBalanceUSD: 0
    };
    
    // 1. Get UniversalBalance data first (as required)
    for (const token of tokens) {
      if (token.universalBalance) {
        try {
          const universalBalanceAbi = await loadAbi('UniversalBalanceABI');
          const universalBalanceContract = new ethers.Contract(
            token.universalBalance,
            universalBalanceAbi,
            provider
          );
          
          // Call userBalances function as required by specifications
          const balances = await universalBalanceContract.userBalances(userAddress);
          
          // Use correct decimal formatting based on token type
          const decimals = token.symbol === 'USDC' ? 6 : 18;
          const sittingBalance = ethers.formatUnits(balances.sittingBalance, decimals);
          const lentBalance = ethers.formatUnits(balances.lentBalance, decimals);
          const totalBalance = parseFloat(sittingBalance) + parseFloat(lentBalance);
          
          if (totalBalance > 0) {
            result.universalBalances.push({
              token: token.symbol,
              sittingBalance,
              lentBalance,
              totalBalance: totalBalance.toString()
            });
            
            result.totalUniversalBalanceUSD += totalBalance;
          }
        } catch (error) {
          console.log(`Error getting UniversalBalance for ${token.symbol}: ${error.message}`);
        }
      }
    }
    
    // 2. Get position data for each token
    for (const token of tokens) {
      try {
        // Check if user has supplied any of this asset
        try {
          const eTokenContract = new ethers.Contract(
            getETokenAddress(token.symbol),
            await loadAbi('ETokenABI'),
            provider
          );
          
          const supplied = await eTokenContract.balanceOf(userAddress);
          if (supplied.gt(0)) {
            const exchangeRate = await eTokenContract.exchangeRateStored();
            const suppliedUnderlying = supplied.mul(exchangeRate).div(ethers.parseUnits('1', 18));
            
            result.supplied.push({
              token: token.symbol,
              amount: ethers.formatUnits(supplied, 18),
              amountUnderlying: ethers.formatUnits(suppliedUnderlying, 18)
            });
            
            // Add to total USD value (in a real implementation, would use price oracles)
            result.totalSuppliedValueUSD += parseFloat(ethers.formatUnits(suppliedUnderlying, 18));
          }
          
          // Check if user has borrowed any of this asset
          const borrowed = await eTokenContract.borrowBalanceStored(userAddress);
          if (borrowed.gt(0)) {
            result.borrowed.push({
              token: token.symbol,
              amount: ethers.formatUnits(borrowed, 18)
            });
            
            // Add to total USD value
            result.totalBorrowedValueUSD += parseFloat(ethers.formatUnits(borrowed, 18));
          }
        } catch (error) {
          console.log(`No EToken data for ${token.symbol}: ${error?.message || 'Unknown error'}`);
        }
        
        // Check if user has collateral of this asset
        try {
          // Only try to get collateral for tokens that have PTokens available
          if (token.symbol === 'USDC' || token.symbol === 'WBTC' || token.symbol === 'LUSD' || token.symbol === 'aprMON') {
            // Get PToken contract directly instead of using removed getCollateralBalance
            const pTokenContract = new ethers.Contract(
              getPTokenAddress(token.symbol),
              await loadAbi('PTokenABI'),
              provider
            );
            
            const tokenBalance = await pTokenContract.balanceOf(userAddress);
            const underlyingBalance = await pTokenContract.balanceOfUnderlying(userAddress);
            const collateralBalance = ethers.formatUnits(underlyingBalance, 18);
            
            result.collateral.push({
              token: token.symbol,
              amount: ethers.formatUnits(tokenBalance, 18),
              amountUnderlying: collateralBalance
            });
            
            // Add to total USD value
            result.totalCollateralValueUSD += parseFloat(collateralBalance);
          } else {
            console.log(`Skipping collateral check for ${token.symbol}: No PToken available`);
          }
        } catch (error) {
          if ((error as Error).message.includes('PToken for')) {
            console.log(`Skipping collateral for ${token.symbol}: No PToken available`);
          } else {
            console.warn(`Error getting collateral for ${token.symbol}:`, error);
          }
          // Continue with zero collateral balance
        }
      } catch (error) {
        console.log(`Error processing ${token.symbol}: ${error?.message || 'Unknown error'}`);
      }
    }
    
    // Calculate health factor
    if (result.totalBorrowedValueUSD > 0 && result.totalCollateralValueUSD > 0) {
      result.healthFactor = result.totalCollateralValueUSD / result.totalBorrowedValueUSD;
    } else if (result.totalCollateralValueUSD > 0) {
      result.healthFactor = Number.POSITIVE_INFINITY; // No borrows, so no liquidation risk
    } else {
      result.healthFactor = null; // No collateral, so health factor is undefined
    }
    
    return result;
  } catch (error) {
    console.error(`Error getting user position: ${error.message}`);
    throw error;
  }
}

/**
 * Get a complete summary of a user's position across all tokens asynchronously
 * @param userAddress User address
 * @param network Network to connect to
 * @returns Object with taskId and initial status
 */
export async function getUserPositionAsync(
  userAddress: string,
  network: string = config.provider.defaultNetwork
): Promise<{
  taskId: string;
  status: string;
  partial?: {
    message: string;
    progress: number;
  }
}> {
  try {
    // Create a unique task ID
    const taskId = `position-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    
    // Start the position retrieval in the background
    processUserPositionTask(taskId, userAddress, network);
    
    // Return immediately with the task ID
    return {
      taskId,
      status: 'pending',
      partial: {
        message: 'User position analysis started',
        progress: 0
      }
    };
  } catch (error) {
    console.error(`Error starting user position analysis for ${userAddress}:`, error);
    throw new Error(`Failed to start user position analysis: ${(error as Error).message}`);
  }
}

/**
 * Process the user position task in the background
 * @param taskId Task ID
 * @param userAddress User address
 * @param network Network to connect to
 */
async function processUserPositionTask(
  taskId: string,
  userAddress: string,
  network: string
): Promise<void> {
  try {
    // Update task status to processing
    transactionQueue.updateTaskStatus(taskId, {
      status: "processing",
      message: "Retrieving user position data...",
      progress: 10,
      result: null
    });

    // Get Universal Balance contract (which tracks all tokens for a user)
    const provider = await ethereum.getProvider(network);
    
    // Define the tokens we want to check
    const tokens: { symbol: string, universalBalance?: string }[] = [
      { symbol: 'SWETH' },
      { symbol: 'USDC', universalBalance: TOKEN_ADDRESSES['usdcUniBalance'] },
      { symbol: 'WBTC' },
      { symbol: 'aUSD' },
      { symbol: 'LUSD' },
      { symbol: 'aprMON' },
      { symbol: 'shMon', universalBalance: TOKEN_ADDRESSES['shMonUniBalance'] }
    ];
    
    // Update progress
    transactionQueue.updateTaskStatus(taskId, {
      status: "processing",
      message: "Fetching balances from Universal Balance contract...",
      progress: 30,
      result: null
    });
    
    // Get balances from Universal Balance for tokens with universalBalance address
    const collateralBalances: { [token: string]: string } = {};
    const borrowBalances: { [token: string]: string } = {};
    let totalCollateralUsd = 0;
    let totalBorrowedUsd = 0;
    
    // Process each token and get its balances
    for (const token of tokens) {
      if (token.universalBalance) {
        try {
          const universalBalanceAbi = await loadAbi('UniversalBalanceABI');
          const universalBalanceContract = new ethers.Contract(
            token.universalBalance,
            universalBalanceAbi,
            provider
          );
          
          // Call userBalances function as required by specifications
          const balances = await universalBalanceContract.userBalances(userAddress);
          
          // Use correct decimal formatting based on token type
          const decimals = token.symbol === 'USDC' ? 6 : 18;
          const sittingBalance = ethers.formatUnits(balances.sittingBalance, decimals);
          const lentBalance = ethers.formatUnits(balances.lentBalance, decimals);
          const totalBalance = parseFloat(sittingBalance) + parseFloat(lentBalance);
          
          if (totalBalance > 0) {
            collateralBalances[token.symbol] = totalBalance.toString();
            
            // Get token price and calculate USD value
            const price = await getPriceForToken(token.symbol, network);
            const collateralUsd = totalBalance * parseFloat(price);
            totalCollateralUsd += collateralUsd;
          }
        } catch (error) {
          console.log(`Error getting UniversalBalance for ${token.symbol}: ${error.message}`);
        }
      }
      
      // Check if token has a borrowable/debt version
      try {
        // Get PToken contract for the token (borrowable version)
        const pTokenContract = new ethers.Contract(
          getPTokenAddress(token.symbol),
          await loadAbi('PTokenABI'),
          provider
        );
        
        const borrowed = await pTokenContract.borrowBalanceStored(userAddress);
        if (borrowed.gt(0)) {
          // Use correct decimal formatting based on token type
          const decimals = token.symbol === 'USDC' ? 6 : 18;
          const borrowedAmount = ethers.formatUnits(borrowed, decimals);
          
          borrowBalances[token.symbol] = borrowedAmount;
          
          // Get token price and calculate USD value
          const price = await getPriceForToken(token.symbol, network);
          const borrowedUsd = parseFloat(borrowedAmount) * parseFloat(price);
          totalBorrowedUsd += borrowedUsd;
        }
      } catch (error) {
        // This is normal if token doesn't have a debt version
        console.log(`No debt token for ${token.symbol}: ${error.message}`);
      }
    }
    
    // Update progress
    transactionQueue.updateTaskStatus(taskId, {
      status: "processing",
      message: "Processing balances...",
      progress: 60,
      result: null
    });
    
    // Mock supply APY and borrow rates for demonstration
    const supplyApy: { [key: string]: string } = {
      'SWETH': '0.21',
      'USDC': '0.27',
      'WBTC': '2.92',
      'aUSD': '0.48',
      'LUSD': '0',
      'aprMON': '0',
      'shMon': '0'
    };
    
    const borrowApr: { [key: string]: string } = {
      'SWETH': '2.25',
      'USDC': '2.30',
      'WBTC': '3.94',
      'aUSD': '2.50',
      'LUSD': '0',
      'aprMON': '0',
      'shMon': '0'
    };
    
    // Build position details by token
    const positions = [];
    let netWorthUsd = 0;
    let averageApy = 0;
    
    // Update progress
    transactionQueue.updateTaskStatus(taskId, {
      status: "processing",
      message: "Calculating positions by token...",
      progress: 80,
      result: null
    });
    
    // Process each supported token - use predefined list instead of TokenSymbol object
    const supportedTokens = ['SWETH', 'USDC', 'WBTC', 'aUSD', 'LUSD', 'aprMON', 'shMon'];
    
    for (const token of supportedTokens) {
      if (collateralBalances[token] || borrowBalances[token]) {
        // Get token price
        const price = await getPriceForToken(token, network);
        
        // Calculate USD values
        const collateralAmount = collateralBalances[token] || "0";
        const borrowAmount = borrowBalances[token] || "0";
        
        const collateralUsd = parseFloat(collateralAmount) * parseFloat(price);
        const borrowedUsd = parseFloat(borrowAmount) * parseFloat(price);
        
        netWorthUsd += collateralUsd - borrowedUsd;
        
        // Only add if there's a balance
        if (parseFloat(collateralAmount) > 0 || parseFloat(borrowAmount) > 0) {
          positions.push({
            symbol: token,
            collateralBalance: (parseFloat(collateralAmount) + parseFloat(borrowAmount)).toString(),
            collateralBalanceUsd: (collateralUsd + borrowedUsd).toString(),
            borrowBalance: borrowAmount,
            borrowBalanceUsd: borrowedUsd.toString(),
            utilization: parseFloat(collateralAmount) > 0 && parseFloat(borrowAmount) > 0
              ? `${((parseFloat(borrowAmount) / parseFloat(collateralAmount)) * 100).toFixed(2)}%`
              : "0%"
          });
        }
      }
    }
    
    // Update progress
    transactionQueue.updateTaskStatus(taskId, {
      status: "processing",
      message: "Calculating metrics and strategies...",
      progress: 85,
      result: null
    });
    
    // Use health factor from user position if available, or calculate it
    let healthFactor;
    if (totalBorrowedUsd > 0 && totalCollateralUsd > 0) {
      healthFactor = ((totalCollateralUsd * 0.75) / totalBorrowedUsd).toString();
    } else if (totalCollateralUsd > 0) {
      healthFactor = "∞"; // No borrows, so no liquidation risk
    } else {
      healthFactor = null; // No collateral, so health factor is undefined
    }
    
    // Calculate average APY from supply rates weighted by collateral balances
    let weightedApySum = 0;
    let totalCollateralWeight = 0;
    
    for (const position of positions) {
      const collateralValue = parseFloat(position.collateralBalance);
      if (collateralValue > 0) {
        const tokenApy = parseFloat(supplyApy[position.symbol] || "0");
        const weight = parseFloat(position.collateralBalanceUsd);
        weightedApySum += tokenApy * weight;
        totalCollateralWeight += weight;
      }
    }
    
    averageApy = totalCollateralWeight > 0
      ? (weightedApySum / totalCollateralWeight).toString()
      : "0";
    
    // Assemble the final result
    const result = {
      address: userAddress,
      healthFactor,
      totalCollateralUsd: totalCollateralUsd.toString(),
      totalBorrowedUsd: totalBorrowedUsd.toString(), 
      netWorthUsd: netWorthUsd.toString(),
      averageApy,
      liquidationThreshold: "0.75", // Default value
      positions
    };
    
    // Mark task as completed with the final result
    transactionQueue.updateTaskStatus(taskId, {
      status: "completed",
      message: "User position analysis completed",
      progress: 100,
      result
    });
  } catch (error) {
    console.error("Error in user position analysis:", error);
    // Mark task as failed
    transactionQueue.updateTaskStatus(taskId, {
      status: "failed",
      message: `Analysis failed: ${(error as Error).message}`,
      progress: 0,
      result: null
    });
  }
}

/**
 * Get the status of a user position task
 * @param taskId Task ID to check
 * @returns Current status of the user position analysis task
 */
export function getUserPositionStatus(taskId: string): any {
  return transactionQueue.getTaskStatus(taskId);
}

/**
 * Repay borrowed funds to the lending protocol
 * @param symbol Token symbol
 * @param amount Amount to repay
 * @param fromAddress Sender address
 * @param network Network to connect to
 * @returns Transaction hash and explorer URL
 */
export async function repayBorrowed(
  symbol: string | TokenSymbol,
  amount: string,
  fromAddress: string,
  network: string = config.provider.defaultNetwork
): Promise<{hash: string; explorer: string}> {
  try {
    const contract = await getETokenContract(symbol, fromAddress, network);
    
    // Convert amount to proper format (wei)
    const formattedAmount = ethers.parseUnits(amount, 18); // Assuming 18 decimals - adjust if needed
    
    // Call repay function directly
    const tx = await contract.repay(formattedAmount);
    await tx.wait();
    
    return {
      hash: tx.hash,
      explorer: getExplorerUrl(network, tx.hash)
    };
  } catch (error) {
    console.error(`Error repaying borrowed funds:`, error);
    throw new Error(`Failed to repay borrowed funds: ${(error as Error).message}`);
  }
}

/**
 * Helper function to get price for a token
 * This is a placeholder function that would be replaced with actual price oracle integration
 * @param symbol Token symbol
 * @param network Network to connect to
 * @returns Token price in USD
 */
async function getPriceForToken(
  symbol: string | TokenSymbol,
  network: string
): Promise<string> {
  // This is a simplified placeholder for price data
  // In a production environment, this would connect to a price oracle
  
  const prices: Record<string, string> = {
    'ETH': '3500.00',
    'WETH': '3500.00',
    'SWETH': '3750.00',
    'BTC': '65000.00',
    'WBTC': '65000.00',
    'USDC': '1.00',
    'USDT': '1.00',
    'DAI': '1.00',
    'LUSD': '1.00',
    'aUSD': '1.00',
    'MON': '2.50',
    'aprMON': '2.75'
  };
  
  // Convert the symbol to string and extract base token if needed
  const tokenSymbol = typeof symbol === 'string' ? symbol : symbol.toString();
  const baseToken = tokenSymbol.replace(/^[ep]?Token-/, '');
  
  return prices[baseToken] || '1.00'; // Default to 1.00 if price not found
}

/**
 * Get comprehensive protocol analysis for AI agent decision making
 * @param userAddress User address to analyze
 * @param network Network to connect to
 * @returns Object with taskId and initial status
 */
export async function getProtocolAnalysis(
  userAddress: string,
  network: string = config.provider.defaultNetwork
): Promise<{
  taskId: string;
  status: string;
  partial?: {
    message: string;
    progress: number;
  }
}> {
  try {
    // Create a unique task ID
    const taskId = `analysis-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    
    // Start the analysis in the background
    processProtocolAnalysis(taskId, userAddress, network);
    
    // Return immediately with the task ID
    return {
      taskId,
      status: "pending",
      partial: {
        message: "Analysis started. Processing user position data...",
        progress: 5
      }
    };
  } catch (error) {
    console.error("Error initiating protocol analysis:", error);
    throw new Error(`Failed to initiate protocol analysis: ${(error as Error).message}`);
  }
}

/**
 * Process protocol analysis task in the background
 * @param taskId Task ID for tracking
 * @param userAddress User address to analyze
 * @param network Network to connect to
 */
async function processProtocolAnalysis(
  taskId: string,
  userAddress: string,
  network: string
): Promise<void> {
  // Set initial task status
  transactionQueue.updateTaskStatus(taskId, {
    status: "processing",
    message: "Retrieving user position data...",
    progress: 10,
    result: null
  });
  
  try {
    // Define tokens that have both EToken and PToken variants for market analysis
    const marketTokens = ['SWETH', 'USDC', 'WBTC', 'aUSD', 'LUSD', 'aprMON'];
    
    // Update status
    transactionQueue.updateTaskStatus(taskId, {
      status: "processing",
      message: "Retrieving user position data...",
      progress: 15,
      result: null
    });
    
    // Get user position using the existing getUserPosition function which already works
    const userPositionData = await getUserPosition(userAddress, network);
    
    // Update status
    transactionQueue.updateTaskStatus(taskId, {
      status: "processing",
      message: "Processing user balances...",
      progress: 30,
      result: null
    });
    
    // Format user positions from the user position data
    const userPositions = [];
    let totalCollateralUsd = userPositionData.totalCollateralValueUSD;
    let totalBorrowedUsd = userPositionData.totalBorrowedValueUSD;
    
    // Add universal balance to total collateral (these are already deposited into the protocol)
    totalCollateralUsd += userPositionData.totalUniversalBalanceUSD;
    
    // Create a map of token data from user's position
    const tokenMap = new Map();
    
    // Process universal balances
    for (const balance of userPositionData.universalBalances) {
      const token = balance.token;
      if (!tokenMap.has(token)) {
        tokenMap.set(token, {
          symbol: token,
          collateralBalance: "0",
          collateralBalanceUsd: "0",
          borrowBalance: "0",
          borrowBalanceUsd: "0",
          totalBalance: balance.totalBalance,
          totalBalanceUsd: balance.totalBalance // Will multiply by price later
        });
      } else {
        const existing = tokenMap.get(token);
        existing.totalBalance = balance.totalBalance;
        existing.totalBalanceUsd = balance.totalBalance; // Will multiply by price later
      }
    }
    
    // Process collateral
    for (const collateral of userPositionData.collateral) {
      const token = collateral.token;
      if (!tokenMap.has(token)) {
        tokenMap.set(token, {
          symbol: token,
          collateralBalance: collateral.amountUnderlying,
          collateralBalanceUsd: collateral.amountUnderlying, // Will multiply by price later
          borrowBalance: "0",
          borrowBalanceUsd: "0",
          totalBalance: "0",
          totalBalanceUsd: "0"
        });
      } else {
        const existing = tokenMap.get(token);
        existing.collateralBalance = collateral.amountUnderlying;
        existing.collateralBalanceUsd = collateral.amountUnderlying; // Will multiply by price later
      }
    }
    
    // Update status
    transactionQueue.updateTaskStatus(taskId, {
      status: "processing",
      message: "Processing borrowing data...",
      progress: 40,
      result: null
    });
    
    // Process borrowed
    for (const borrowed of userPositionData.borrowed) {
      const token = borrowed.token;
      if (!tokenMap.has(token)) {
        tokenMap.set(token, {
          symbol: token,
          collateralBalance: "0",
          collateralBalanceUsd: "0",
          borrowBalance: borrowed.amount,
          borrowBalanceUsd: borrowed.amount, // Will multiply by price later
          totalBalance: "0",
          totalBalanceUsd: "0"
        });
      } else {
        const existing = tokenMap.get(token);
        existing.borrowBalance = borrowed.amount;
        existing.borrowBalanceUsd = borrowed.amount; // Will multiply by price later
      }
    }
    
    // Process supplied (as additional collateral)
    for (const supplied of userPositionData.supplied) {
      const token = supplied.token;
      if (!tokenMap.has(token)) {
        tokenMap.set(token, {
          symbol: token,
          collateralBalance: supplied.amountUnderlying,
          collateralBalanceUsd: supplied.amountUnderlying, // Will multiply by price later
          borrowBalance: "0",
          borrowBalanceUsd: "0",
          totalBalance: "0",
          totalBalanceUsd: "0"
        });
      } else {
        const existing = tokenMap.get(token);
        // Add to existing collateral balance
        const currentCollateral = parseFloat(existing.collateralBalance) || 0;
        const additionalCollateral = parseFloat(supplied.amountUnderlying) || 0;
        existing.collateralBalance = (currentCollateral + additionalCollateral).toString();
        existing.collateralBalanceUsd = existing.collateralBalance; // Will multiply by price later
      }
    }
    
    // Update status
    transactionQueue.updateTaskStatus(taskId, {
      status: "processing",
      message: "Retrieving market data...",
      progress: 50,
      result: null
    });
    
    // Get market data using existing functions
    const marketUtilization: Record<string, string> = {};
    const supplyApy: Record<string, string> = {};
    const borrowApr: Record<string, string> = {};
    const liquidityRisk: Record<string, string> = {};
    const volatilityRisk: Record<string, string> = {};
    
    let totalTvl = 0;
    let totalBorrows = 0;
    
    // Get market data and apply prices to user positions
    let tokenProcessed = 0;
    for (const token of marketTokens) {
      try {
        // Update progress based on token processing
        tokenProcessed++;
        const progressValue = 50 + Math.floor((tokenProcessed / marketTokens.length) * 30);
        
        transactionQueue.updateTaskStatus(taskId, {
          status: "processing",
          message: `Processing token ${token} (${tokenProcessed}/${marketTokens.length})...`,
          progress: progressValue,
          result: null
        });
        
        // Get price for token
        const price = await getPriceForToken(token, network);
        
        // Apply price to user positions if they exist for this token
        if (tokenMap.has(token)) {
          const position = tokenMap.get(token);
          position.collateralBalanceUsd = (parseFloat(position.collateralBalance) * parseFloat(price)).toString();
          position.borrowBalanceUsd = (parseFloat(position.borrowBalance) * parseFloat(price)).toString();
          position.totalBalanceUsd = (parseFloat(position.totalBalance) * parseFloat(price)).toString();
          
          // Calculate utilization for this position
          const collateralValue = parseFloat(position.collateralBalance) + parseFloat(position.totalBalance);
          const borrowValue = parseFloat(position.borrowBalance);
          
          position.utilization = collateralValue > 0 && borrowValue > 0
            ? `${((borrowValue / collateralValue) * 100).toFixed(2)}%`
            : "0%";
            
          // Add to user positions array if user has any balance
          if (collateralValue > 0 || borrowValue > 0) {
            userPositions.push({
              symbol: token,
              collateralBalance: (parseFloat(position.collateralBalance) + parseFloat(position.totalBalance)).toString(),
              collateralBalanceUsd: (parseFloat(position.collateralBalanceUsd) + parseFloat(position.totalBalanceUsd)).toString(),
              borrowBalance: position.borrowBalance,
              borrowBalanceUsd: position.borrowBalanceUsd,
              utilization: position.utilization
            });
          }
        }
        
        // Get interest rates for this token
        const interestRates = await getInterestRates(token, network);
        supplyApy[token] = interestRates.supplyAPY || "0%";
        borrowApr[token] = interestRates.borrowAPY || "0%";
        
        // Get liquidity data
        const liquidity = await getMarketLiquidity(token, network);
        const tokenTvl = parseFloat(liquidity.totalSupply);
        const tokenBorrows = parseFloat(liquidity.totalBorrows);
        
        totalTvl += tokenTvl;
        totalBorrows += tokenBorrows;
        
        // Calculate utilization
        const utilization = tokenTvl > 0 
          ? (tokenBorrows / tokenTvl) 
          : 0;
        // Format utilization as percentage for display
        marketUtilization[token] = `${(utilization * 100).toFixed(2)}%`;
        
        // Assess risk levels based on utilization and volatility
        // Liquidity risk based on utilization
        if (utilization > 0.8) {
          liquidityRisk[token] = "high";
        } else if (utilization > 0.6) {
          liquidityRisk[token] = "medium";
        } else {
          liquidityRisk[token] = "low";
        }
        
        // Volatility risk based on token type (simplified)
        if (token === "WBTC" || token === "SWETH") {
          volatilityRisk[token] = "high";
        } else if (token === "aprMON") {
          volatilityRisk[token] = "medium";
        } else {
          volatilityRisk[token] = "low"; // Stablecoins
        }
      } catch (error) {
        console.error(`Error getting market data for ${token}:`, error);
        // Set defaults if there's an error
        supplyApy[token] = "0%";
        borrowApr[token] = "0%";
        marketUtilization[token] = "0%";
        liquidityRisk[token] = "medium";
        volatilityRisk[token] = "medium";
      }
    }
    
    // Update status
    transactionQueue.updateTaskStatus(taskId, {
      status: "processing",
      message: "Calculating metrics and strategies...",
      progress: 85,
      result: null
    });
    
    // Use health factor from user position if available, or calculate it
    let healthFactor;
    if (userPositionData.healthFactor !== null) {
      healthFactor = userPositionData.healthFactor.toString();
    } else if (totalBorrowedUsd > 0) {
      const liquidationThreshold = 0.75; // Default value
      healthFactor = ((totalCollateralUsd * liquidationThreshold) / totalBorrowedUsd).toString();
    } else {
      healthFactor = "∞"; // No borrows, so no liquidation risk
    }
    
    // Calculate net worth
    const netWorthUsd = (totalCollateralUsd - totalBorrowedUsd).toString();
    
    // Calculate average APY from supply rates weighted by collateral balances
    let weightedApySum = 0;
    let totalCollateralWeight = 0;
    
    for (const position of userPositions) {
      const collateralValue = parseFloat(position.collateralBalance);
      if (collateralValue > 0) {
        const tokenApy = parseFloat(supplyApy[position.symbol] || "0");
        const weight = parseFloat(position.collateralBalanceUsd);
        weightedApySum += tokenApy * weight;
        totalCollateralWeight += weight;
      }
    }
    
    const averageApy = totalCollateralWeight > 0
      ? (weightedApySum / totalCollateralWeight).toString()
      : "0";
    
    // Generate strategies based on real data
    const generateStrategies = () => {
      const strategies = [];
      
      // Low risk strategy - focus on stablecoins with best yield
      const stablecoins = ["USDC", "aUSD", "LUSD"];
      const bestStablecoin = stablecoins.reduce((best, token) => {
        return parseFloat(supplyApy[token] || "0") > parseFloat(supplyApy[best] || "0") ? token : best;
      }, stablecoins[0]);
      
      strategies.push({
        name: "Stablecoin Yield Optimizer",
        description: `Deposit ${bestStablecoin} into lending pool to earn optimal yield with minimum risk`,
        estimatedApy: supplyApy[bestStablecoin] || "0%",
        riskLevel: "low",
        steps: [
          `Deposit ${bestStablecoin} to earn ${supplyApy[bestStablecoin]}% APY`,
          "Maintain zero borrow to avoid liquidation risk"
        ]
      });
      
      // Medium risk strategy - moderate leverage with ETH
      if (parseFloat(supplyApy["SWETH"] || "0") > 0 && parseFloat(borrowApr["USDC"] || "0") > 0) {
        const leverageApy = (parseFloat(supplyApy["SWETH"]) * 1.5 - parseFloat(borrowApr["USDC"]) * 0.5).toString();
        
        strategies.push({
          name: "Moderate ETH Leverage",
          description: "Use SWETH as collateral to borrow stablecoins and reinvest",
          estimatedApy: leverageApy,
          riskLevel: "medium",
          steps: [
            "Deposit SWETH as collateral",
            `Borrow USDC at 50% of collateral value (${borrowApr["USDC"]}% APR)`,
            `Reinvest borrowed USDC into ${bestStablecoin} lending (${supplyApy[bestStablecoin]}% APY)`
          ]
        });
      }
      
      // High risk strategy - max yield with highest APY token
      const highestApyToken = marketTokens.reduce((best, token) => {
        return parseFloat(supplyApy[token] || "0") > parseFloat(supplyApy[best] || "0") ? token : best;
      }, marketTokens[0]);
      
      if (parseFloat(supplyApy[highestApyToken] || "0") > 0) {
        strategies.push({
          name: "Maximum Yield Strategy",
          description: `Leverage ${highestApyToken} for highest yield with active management`,
          estimatedApy: (parseFloat(supplyApy[highestApyToken]) * 1.3).toString(), // Estimate with leverage
          riskLevel: "high",
          steps: [
            `Deposit ${highestApyToken} as collateral`,
            `Borrow USDC at 30% of collateral value (${borrowApr["USDC"]}% APR)`,
            `Convert USDC to more ${highestApyToken}`,
            `Deposit additional ${highestApyToken} as collateral`
          ]
        });
      }
      
      return strategies;
    };
    
    // Generate liquidation protection advice based on health factor
    const getLiquidationProtection = (healthFactor: string) => {
      const hf = parseFloat(healthFactor);
      
      if (hf === Infinity || isNaN(hf)) {
        return {
          riskLevel: "none",
          recommendedActions: [
            "No active loans, no liquidation risk",
            "Safe to explore borrowing strategies"
          ],
          safetyBuffer: "100%"
        };
      }
      
      if (hf < 1.2) {
        return {
          riskLevel: "high",
          recommendedActions: [
            "Critical: Repay borrowed assets immediately",
            "Add more collateral urgently",
            "Reduce leverage positions",
            `Consider repaying ${userPositions.length > 0 ? userPositions[0].symbol : 'assets'} first`
          ],
          safetyBuffer: ((hf - 1) * 100).toFixed(2) + "%"
        };
      } else if (hf < 1.5) {
        return {
          riskLevel: "medium",
          recommendedActions: [
            "Warning: Monitor position closely",
            "Consider adding more collateral",
            "Prepare for market volatility",
            "Avoid additional borrowing"
          ],
          safetyBuffer: ((hf - 1) * 100).toFixed(2) + "%"
        };
      } else {
        return {
          riskLevel: "low",
          recommendedActions: [
            "Position is well-collateralized",
            "Safe to maintain current strategy",
            hf > 2 ? "Consider increasing leverage for higher returns" : "Current leverage is optimal"
          ],
          safetyBuffer: ((hf - 1) * 100).toFixed(2) + "%"
        };
      }
    };
    
    // Assemble the final result
    const result = {
      user: {
        address: userAddress,
        healthFactor,
        totalCollateralUsd: totalCollateralUsd.toString(),
        totalBorrowedUsd: totalBorrowedUsd.toString(),
        netWorthUsd,
        averageApy,
        liquidationThreshold: "0.75", // Default value
        positions: userPositions
      },
      market: {
        tvl: totalTvl.toString(),
        totalBorrows: totalBorrows.toString(),
        marketUtilization,
        supplyApy,
        borrowApr,
        liquidityRisk,
        volatilityRisk
      },
      strategies: {
        recommended: generateStrategies(),
        liquidationProtection: getLiquidationProtection(healthFactor)
      }
    };
    
    // Mark task as completed with the final result
    transactionQueue.updateTaskStatus(taskId, {
      status: "completed",
      message: "Protocol analysis completed successfully",
      progress: 100,
      result
    });
  } catch (error) {
    console.error("Error in protocol analysis:", error);
    // Mark task as failed
    transactionQueue.updateTaskStatus(taskId, {
      status: "failed",
      message: `Analysis failed: ${(error as Error).message}`,
      progress: 0,
      result: null
    });
  }
}

/**
 * Get the status of a protocol analysis task
 * @param taskId Task ID to check
 * @returns Current status of the analysis task
 */
export function getProtocolAnalysisStatus(taskId: string): {
  status: string;
  message: string;
  progress: number;
  result: any;
} {
  return transactionQueue.getTaskStatus(taskId);
}

/**
 * Approve token spending for protocol interactions
 * @param symbol Token symbol to approve
 * @param amount Amount to approve (or "max" for unlimited approval)
 * @param fromAddress Sender address
 * @param network Network to connect to
 * @returns Transaction hash and explorer URL
 */
export async function approveToken(
  symbol: string | TokenSymbol,
  amount: string,
  fromAddress: string,
  network: string = config.infura.defaultNetwork
): Promise<{hash: string; explorer: string}> {
  try {
    // Get token address and contract
    const tokenAddress = getTokenAddress(symbol as TokenSymbol);
    
    // Get the spender address (Universal Balance contract for this token)
    const spenderAddress = getBalanceContractAddress(symbol as TokenSymbol);
    
    // Use a provider with signer
    const provider = await ethereum.getProvider(network);
    const signer = await ethereum.getSigner(fromAddress, network);
    
    if (!signer) {
      throw new Error(`Could not load wallet for address ${fromAddress}`);
    }
    
    // Basic ERC20 ABI for approval
    const abi = [
      "function approve(address spender, uint256 amount) external returns (bool)",
      "function allowance(address owner, address spender) external view returns (uint256)"
    ];
    
    const tokenContract = new ethers.Contract(tokenAddress, abi, signer);
    
    // Convert amount to proper format (wei)
    let approvalAmount;
    if (amount.toLowerCase() === "max") {
      // Max approval (uint256 max value)
      approvalAmount = ethers.MaxUint256;
    } else {
      const decimals = symbol === 'USDC' ? 6 : 18; // Use 6 decimals for USDC, 18 for other tokens
      approvalAmount = ethers.parseUnits(amount, decimals);
    }
    
    // Check current allowance
    const currentAllowance = await tokenContract.allowance(fromAddress, spenderAddress);
    // Use direct BigInt comparison (ethers v6) instead of .gte() (ethers v5)
    if (currentAllowance >= approvalAmount) {
      console.log(`Approval already sufficient. Current: ${ethers.formatUnits(currentAllowance)}, Requested: ${amount}`);
      return {
        hash: "0x0", // No transaction needed
        explorer: ""
      };
    }
    
    console.log(`Approving ${symbol} for spending by ${spenderAddress}...`);
    const tx = await tokenContract.approve(spenderAddress, approvalAmount);
    const receipt = await tx.wait();
    
    console.log(`Approval successful: ${receipt.hash}`);
    return {
      hash: receipt.hash,
      explorer: getExplorerUrl(network, receipt.hash)
    };
  } catch (error) {
    console.error(`Error approving token ${symbol}:`, error);
    throw new Error(`Failed to approve token: ${(error as Error).message}`);
  }
}

/**
 * Check token approval amount
 * @param symbol Token symbol
 * @param owner Owner address
 * @param spender Spender address (optional, uses balance contract if not provided)
 * @param network Network to connect to
 * @returns Approval amount
 */
export async function checkTokenApproval(
  symbol: string | TokenSymbol,
  owner: string,
  spender?: string,
  network: string = config.infura.defaultNetwork
): Promise<string> {
  try {
    // Get token address
    const tokenAddress = getTokenAddress(symbol as TokenSymbol);
    
    // Get spender address if not provided
    const spenderAddress = spender || getBalanceContractAddress(symbol as TokenSymbol);
    
    // Use a read-only provider
    const provider = await ethereum.getProvider(network);
    
    // Basic ERC20 ABI for allowance
    const abi = [
      "function allowance(address owner, address spender) external view returns (uint256)"
    ];
    
    const tokenContract = new ethers.Contract(tokenAddress, abi, provider);
    
    // Get current allowance
    const allowance = await tokenContract.allowance(owner, spenderAddress);
    
    return ethers.formatUnits(allowance, 18); // Adjust decimals if needed
  } catch (error) {
    console.error(`Error checking token approval for ${symbol}:`, error);
    throw new Error(`Failed to check token approval: ${(error as Error).message}`);
  }
}

//@ts-nocheck
import { ethers } from 'ethers';
import * as fs from 'fs-extra';
import * as path from 'path';
import { getETokenAddress, getPTokenAddress, getBalanceContractAddress, getExplorerUrl, getTokenAddress, TokenSymbol, ContractType, TOKEN_ADDRESSES } from './constants.js';
import * as ethereum from './ethereum.js';
import config from './config.js';

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
): Promise<{hash: string; explorer: string}> {
  const contract = await getUniversalBalanceContract(symbol, fromAddress, network);
  
  // Convert amount to proper format (wei)
  const decimals = symbol === 'USDC' ? 6 : 18; // Use 6 decimals for USDC, 18 for other tokens
  const formattedAmount = ethers.parseUnits(amount, decimals);

  // Call deposit function (using the function signature from the ABI)
  const tx = await contract.deposit(formattedAmount, willLend);
  await tx.wait();
  
  return {
    hash: tx.hash,
    explorer: getExplorerUrl(network, tx.hash)
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
): Promise<{hash: string; explorer: string; amountWithdrawn: string; lendingBalanceUsed: boolean}> {
  const contract = await getUniversalBalanceContract(symbol, fromAddress, network);
  
  // Convert amount to proper format (wei)
  const formattedAmount = ethers.parseUnits(amount, 18); // Assuming 18 decimals
  
  // Call withdraw function directly
  const tx = await contract.withdraw(formattedAmount, forceLentRedemption, recipientAddress);
  const receipt = await tx.wait();
  
  // Extract return values from event logs if possible
  let amountWithdrawn = amount;
  let lendingBalanceUsed = forceLentRedemption;
  
  try {
    // Attempt to parse event logs to get actual return values
    // This would need to be customized based on the actual events emitted
    const withdrawalEvent = receipt.events?.find(e => e.event === 'Withdrawal');
    if (withdrawalEvent && withdrawalEvent.args) {
      amountWithdrawn = ethers.formatUnits(withdrawalEvent.args.amountWithdrawn || formattedAmount, 18);
      lendingBalanceUsed = withdrawalEvent.args.lendingBalanceUsed || forceLentRedemption;
    }
  } catch (error) {
    console.warn('Could not parse withdrawal event data', error);
  }
  
  return {
    hash: tx.hash,
    explorer: getExplorerUrl(network, tx.hash),
    amountWithdrawn,
    lendingBalanceUsed
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
 * Get collateral balance for a user
 * @param symbol Token symbol
 * @param userAddress User address
 * @param network Network to connect to
 * @returns Collateral balance information
 */
export async function getCollateralBalance(
  symbol: string | TokenSymbol,
  userAddress: string,
  network: string = config.infura.defaultNetwork
): Promise<any> {
  // Use a read-only provider since we don't need to sign transactions
  const provider = ethereum.getProvider(network);
  const address = getPTokenAddress(symbol as TokenSymbol);
  const abi = await loadAbi('PTokenABI');
  const contract = new ethers.Contract(address, abi, provider);
  
  // Get balances
  const tokenBalance = await contract.balanceOf(userAddress);
  const underlyingBalance = await contract.balanceOfUnderlying(userAddress);
  
  // Use ethers v6 format (no utils namespace)
  return {
    token: symbol,
    tokenBalance: ethers.formatUnits(tokenBalance, 18), 
    underlyingBalance: ethers.formatUnits(underlyingBalance, 18), 
    isCollateral: true // Assuming all PTokens are used as collateral
  };
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
            const collateralData = await getCollateralBalance(token, userAddress, network);
            const collateralBalance = collateralData.underlyingBalance;
            
            result.collateral.push({
              token: token.symbol,
              amount: collateralData.tokenBalance,
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
 * Get lending balance for a user
 * @param symbol Token symbol
 * @param userAddress User address
 * @param network Network to connect to
 * @returns Lending balance information
 */
export async function getLendingBalance(
  symbol: string | TokenSymbol,
  userAddress: string,
  network: string = config.provider.defaultNetwork
): Promise<{balance: string; balanceUsd: string}> {
  try {
    const contract = await getETokenContract(symbol, userAddress, network);
    const provider = ethereum.getProvider(network);
    
    // Get balance in lending protocol
    const balanceWei = await contract.balanceOf(userAddress);
    const balance = ethers.formatUnits(balanceWei, 18); // Assuming 18 decimals
    
    // Get exchange rate to USD
    const exchangeRate = await contract.exchangeRateCurrent();
    const formattedExchangeRate = ethers.formatUnits(exchangeRate, 18);
    
    // Calculate USD value (simplified - would need price oracle in real implementation)
    const balanceUsd = (parseFloat(balance) * parseFloat(formattedExchangeRate)).toString();
    
    return {
      balance,
      balanceUsd
    };
  } catch (error) {
    console.error(`Error getting lending balance:`, error);
    throw new Error(`Failed to get lending balance: ${(error as Error).message}`);
  }
}

/**
 * Get borrow balance for a user
 * @param symbol Token symbol
 * @param userAddress User address
 * @param network Network to connect to
 * @returns Borrow balance information
 */
export async function getBorrowBalance(
  symbol: string | TokenSymbol,
  userAddress: string,
  network: string = config.provider.defaultNetwork
): Promise<{borrowed: string; borrowedUsd: string; limit: string}> {
  try {
    const contract = await getETokenContract(symbol, userAddress, network);
    
    // Get borrowed amount - use borrowBalanceStored instead of borrowBalanceCurrent if needed
    const borrowedWei = await contract.borrowBalanceStored(userAddress);
    const borrowed = ethers.formatUnits(borrowedWei, 18); // Assuming 18 decimals
    
    // Get collateral factor if available
    let formattedCollateralFactor = "0.75"; // Default value if not available
    try {
      const collateralFactor = await contract.collateralFactorMantissa();
      formattedCollateralFactor = ethers.formatUnits(collateralFactor, 18);
    } catch (error) {
      console.warn("Could not get collateral factor, using default", error);
    }
    
    // Get price in USD (simplified)
    const priceInUsd = await getPriceForToken(symbol, network);
    
    // Calculate borrowed value in USD
    const borrowedUsd = (parseFloat(borrowed) * parseFloat(priceInUsd)).toString();
    
    // Get borrow limit based on collateral
    const limit = (parseFloat(borrowedUsd) / parseFloat(formattedCollateralFactor)).toString();
    
    return {
      borrowed,
      borrowedUsd,
      limit
    };
  } catch (error) {
    console.error(`Error getting borrow balance:`, error);
    throw new Error(`Failed to get borrow balance: ${(error as Error).message}`);
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
 * Analyze lending opportunities across supported tokens
 * @param network Network to connect to
 * @returns Analysis of lending opportunities
 */
export async function analyzeLendingOpportunities(
  network: string = config.provider.defaultNetwork
): Promise<any> {
  try {
    // Array of supported token symbols
    const supportedTokens = [
      'SWETH', 'USDC', 'WBTC', 'aUSD', 'LUSD', 'aprMON'
    ];
    
    const opportunities = [];
    
    // Analyze each token
    for (const symbol of supportedTokens) {
      try {
        // For ETokens (lending)
        if (['SWETH', 'USDC', 'WBTC', 'aUSD'].includes(symbol)) {
          const address = getETokenAddress(symbol as TokenSymbol);
          const provider = ethereum.getProvider(network);
          const abi = await loadAbi('ETokenABI');
          const contract = new ethers.Contract(address, abi, provider);
          
          // Get supply rate
          const supplyRate = await contract.supplyRatePerBlock();
          const formattedSupplyRate = ethers.formatUnits(supplyRate, 18);
          
          // Get borrow rate
          const borrowRate = await contract.borrowRatePerBlock();
          const formattedBorrowRate = ethers.formatUnits(borrowRate, 18);
          
          // Get liquidity
          const cash = await contract.getCash();
          const formattedCash = ethers.formatUnits(cash, 18);
          
          // Calculate APY (simplified)
          const blocksPerYear = 2102400; // Estimate: ~6500 blocks per day * 365
          const supplyApy = (Math.pow(1 + parseFloat(formattedSupplyRate), blocksPerYear) - 1) * 100;
          const borrowApy = (Math.pow(1 + parseFloat(formattedBorrowRate), blocksPerYear) - 1) * 100;
          
          opportunities.push({
            symbol,
            type: 'EToken',
            supplyApy: `${supplyApy.toFixed(2)}%`,
            borrowApy: `${borrowApy.toFixed(2)}%`,
            liquidity: formattedCash,
            address
          });
        }
        // For PTokens (collateral)
        else if (['LUSD', 'aprMON'].includes(symbol)) {
          const address = getPTokenAddress(symbol as TokenSymbol);
          const provider = ethereum.getProvider(network);
          const abi = await loadAbi('PTokenABI');
          const contract = new ethers.Contract(address, abi, provider);
          
          // Get collateral factor
          const collateralFactor = await contract.collateralFactorMantissa();
          const formattedCollateralFactor = ethers.formatUnits(collateralFactor, 18);
          
          // Get exchange rate
          const exchangeRate = await contract.exchangeRateCurrent();
          const formattedExchangeRate = ethers.formatUnits(exchangeRate, 18);
          
          opportunities.push({
            symbol,
            type: 'PToken',
            collateralFactor: `${(parseFloat(formattedCollateralFactor) * 100).toFixed(2)}%`,
            exchangeRate: formattedExchangeRate,
            address
          });
        }
      } catch (error) {
        console.error(`Error analyzing token ${symbol}:`, error);
        // Continue with other tokens if one fails
      }
    }
    
    return opportunities;
  } catch (error) {
    console.error(`Error analyzing lending opportunities:`, error);
    throw new Error(`Failed to analyze lending opportunities: ${(error as Error).message}`);
  }
}

/**
 * Get comprehensive protocol analysis for AI agent decision making
 * @param userAddress User address to analyze
 * @param network Network to connect to
 * @returns Comprehensive analysis of protocol state and user position
 */
export async function getProtocolAnalysis(
  userAddress: string,
  network: string = config.provider.defaultNetwork
): Promise<{
  user: {
    healthFactor: string;
    totalCollateralUsd: string;
    totalBorrowedUsd: string;
    netWorthUsd: string;
    averageApy: string;
    liquidationThreshold: string;
    positions: Array<{
      symbol: string;
      collateralBalance: string;
      collateralBalanceUsd: string;
      borrowBalance: string;
      borrowBalanceUsd: string;
      utilization: string;
    }>;
  };
  market: {
    tvl: string;
    totalBorrows: string;
    marketUtilization: Record<string, string>;
    supplyApy: Record<string, string>;
    borrowApr: Record<string, string>;
    liquidityRisk: Record<string, string>;
    volatilityRisk: Record<string, string>;
  };
  strategies: {
    recommended: Array<{
      name: string;
      description: string;
      estimatedApy: string;
      riskLevel: string;
      steps: Array<string>;
    }>;
    liquidationProtection: {
      riskLevel: string;
      recommendedActions: Array<string>;
      safetyBuffer: string;
    };
  };
}> {
  try {
    // Define tokens that have both EToken and PToken variants
    const collateralTokens = ['USDC', 'WBTC', 'LUSD', 'aprMON'];
    
    // Define tokens that have EToken variants (for borrowing)
    const borrowTokens = ['SWETH', 'USDC', 'WBTC', 'aUSD'];
    
    // Tokens used for market analysis (combining both sets)
    const marketTokens = Array.from(new Set([...collateralTokens, ...borrowTokens]));
    
    // Get user positions
    const userPositions = [];
    let totalCollateralUsd = 0;
    let totalBorrowedUsd = 0;
    
    // Get user position data using existing functions
    for (const token of marketTokens) {
      try {
        let collateralBalance = "0";
        let borrowBalance = "0";
        
        // Only try to get collateral for tokens that have PTokens available
        if (token === 'USDC' || token === 'WBTC' || token === 'LUSD' || token === 'aprMON') {
          try {
            const collateralData = await getCollateralBalance(token, userAddress, network);
            collateralBalance = collateralData.underlyingBalance;
          } catch (error) {
            console.warn(`Error getting collateral for ${token}:`, error);
            // Continue with zero collateral balance
          }
        } else {
          console.log(`Skipping collateral check for ${token}: No PToken available`);
        }
        
        try {
          const borrowData = await getBorrowBalance(token, userAddress, network);
          borrowBalance = borrowData.borrowed;
        } catch (error) {
          console.warn(`Error getting borrow balance for ${token}:`, error);
          // Continue with zero borrow balance
        }
        
        // Get token price from our existing function
        const price = await getPriceForToken(token, network);
        
        // Calculate USD values
        const collateralBalanceUsd = (parseFloat(collateralBalance) * parseFloat(price)).toString();
        const borrowBalanceUsd = (parseFloat(borrowBalance) * parseFloat(price)).toString();
        
        // Calculate utilization
        const utilization = parseFloat(borrowBalance) > 0 && parseFloat(collateralBalance) > 0
          ? (parseFloat(borrowBalance) / parseFloat(collateralBalance)).toString()
          : "0";
        
        // Add to totals
        totalCollateralUsd += parseFloat(collateralBalanceUsd);
        totalBorrowedUsd += parseFloat(borrowBalanceUsd);
        
        // Add position
        if (parseFloat(collateralBalance) > 0 || parseFloat(borrowBalance) > 0) {
          userPositions.push({
            symbol: token,
            collateralBalance,
            collateralBalanceUsd,
            borrowBalance,
            borrowBalanceUsd,
            utilization
          });
        }
      } catch (error) {
        console.warn(`Error processing position for ${token}:`, error);
        // Continue with next token
      }
    }
    
    // Get market data using existing functions
    const marketUtilization: Record<string, string> = {};
    const supplyApy: Record<string, string> = {};
    const borrowApr: Record<string, string> = {};
    const liquidityRisk: Record<string, string> = {};
    const volatilityRisk: Record<string, string> = {};
    
    let totalTvl = 0;
    let totalBorrows = 0;
    
    // Get market data for each token
    for (const token of marketTokens) {
      try {
        // Get interest rates for this token using our existing function
        const interestRates = await getInterestRates(token, network);
        supplyApy[token] = interestRates.supplyApy;
        borrowApr[token] = interestRates.borrowApr;
        
        // Get liquidity data using our existing function
        const liquidity = await getMarketLiquidity(token, network);
        const tokenTvl = parseFloat(liquidity.totalSupply);
        const tokenBorrows = parseFloat(liquidity.totalBorrows);
        
        totalTvl += tokenTvl;
        totalBorrows += tokenBorrows;
        
        // Calculate utilization
        const utilization = tokenTvl > 0 
          ? (tokenBorrows / tokenTvl).toString() 
          : "0";
        marketUtilization[token] = utilization;
        
        // Assess risk levels based on utilization and volatility
        // Liquidity risk based on utilization
        const utilRate = parseFloat(utilization);
        if (utilRate > 0.8) {
          liquidityRisk[token] = "high";
        } else if (utilRate > 0.6) {
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
        console.warn(`Error getting market data for ${token}:`, error);
        // Set defaults if there's an error
        supplyApy[token] = "0";
        borrowApr[token] = "0";
        marketUtilization[token] = "0";
        liquidityRisk[token] = "medium";
        volatilityRisk[token] = "medium";
      }
    }
    
    // Calculate health factor
    const liquidationThreshold = "0.75"; // Default, should be obtained from protocol
    const healthFactor = totalBorrowedUsd > 0
      ? ((totalCollateralUsd * parseFloat(liquidationThreshold)) / totalBorrowedUsd).toString()
      : "∞"; // Infinity if no borrows
    
    // Calculate net worth
    const netWorthUsd = (totalCollateralUsd - totalBorrowedUsd).toString();
    
    // Calculate average APY from supply rates weighted by collateral balances
    let weightedApySum = 0;
    let totalCollateralWeight = 0;
    
    for (const position of userPositions) {
      if (parseFloat(position.collateralBalance) > 0) {
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
        estimatedApy: supplyApy[bestStablecoin] || "0",
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
    
    return {
      user: {
        healthFactor,
        totalCollateralUsd: totalCollateralUsd.toString(),
        totalBorrowedUsd: totalBorrowedUsd.toString(),
        netWorthUsd,
        averageApy,
        liquidationThreshold,
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
  } catch (error) {
    console.error("Error in protocol analysis:", error);
    throw new Error(`Failed to analyze protocol: ${(error as Error).message}`);
  }
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

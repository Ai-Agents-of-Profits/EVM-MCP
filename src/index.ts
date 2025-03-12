#!/usr/bin/env node
//@ts-nocheck
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import * as crypto from './crypto.js';
import * as ethereum from './ethereum.js';
import * as protocol from './protocol.js';
import { TokenSymbol } from './constants.js';
import config from './config.js';

// Helper for handling errors consistently
function handleError(error: any, defaultMessage: string = "An error occurred") {
  console.error(defaultMessage, error);
  return {
    error: true,
    message: `${defaultMessage}: ${error.message || JSON.stringify(error)}`
  };
}

// Define wallet management tools
const CREATE_WALLET_TOOL: Tool = {
  name: 'create-wallet',
  description: 'Create a new Ethereum wallet',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

const IMPORT_WALLET_TOOL: Tool = {
  name: 'import-wallet',
  description: 'Import an existing Ethereum wallet using a private key',
  inputSchema: {
    type: 'object',
    properties: {
      privateKey: {
        type: 'string',
        description: 'The private key of the wallet to import'
      }
    },
    required: ['privateKey'],
  },
};

const LIST_WALLETS_TOOL: Tool = {
  name: 'list-wallets',
  description: 'List all available wallets',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

// Define transaction tools
const CHECK_BALANCE_TOOL: Tool = {
  name: 'check-balance',
  description: 'Check the balance of a wallet',
  inputSchema: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'The wallet address to check (optional, will use default wallet if not provided)'
      },
      network: {
        type: 'string',
        description: 'Network name (e.g. mainnet, goerli, sepolia)'
      }
    }
  },
};

const GET_TRANSACTIONS_TOOL: Tool = {
  name: 'get-transactions',
  description: 'Get transaction history for a wallet',
  inputSchema: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'The wallet address'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of transactions to return'
      },
      network: {
        type: 'string',
        description: 'Network name (e.g. mainnet, goerli, sepolia)'
      }
    },
    required: ['address'],
  },
};

const SEND_TRANSACTION_TOOL: Tool = {
  name: 'send-transaction',
  description: 'Send a transaction from one address to another',
  inputSchema: {
    type: 'object',
    properties: {
      fromAddress: {
        type: 'string', 
        description: 'The sender wallet address'
      },
      toAddress: {
        type: 'string',
        description: 'The recipient wallet address'
      },
      amount: {
        type: 'string',
        description: 'Amount of ETH to send'
      },
      network: {
        type: 'string',
        description: 'Network name (e.g. mainnet, goerli, sepolia)'
      }
    },
    required: ['fromAddress', 'toAddress', 'amount'],
  },
};

const CALL_CONTRACT_TOOL: Tool = {
  name: 'call-contract',
  description: 'Call a read-only smart contract method',
  inputSchema: {
    type: 'object',
    properties: {
      contractAddress: {
        type: 'string',
        description: 'The address of the smart contract'
      },
      abi: {
        type: 'string',
        description: 'The ABI of the contract (JSON string)'
      },
      method: {
        type: 'string',
        description: 'The method to call'
      },
      args: {
        type: 'string',
        description: 'Arguments for the method (JSON array string)'
      },
      network: {
        type: 'string',
        description: 'Network name (e.g. mainnet, goerli, sepolia)'
      }
    },
    required: ['contractAddress', 'abi', 'method'],
  },
};

const EXECUTE_CONTRACT_TOOL: Tool = {
  name: 'execute-contract',
  description: 'Execute a state-changing smart contract method',
  inputSchema: {
    type: 'object',
    properties: {
      fromAddress: {
        type: 'string',
        description: 'The wallet address to execute from'
      },
      contractAddress: {
        type: 'string',
        description: 'The address of the smart contract'
      },
      abi: {
        type: 'string',
        description: 'The ABI of the contract (JSON string)'
      },
      method: {
        type: 'string',
        description: 'The method to execute'
      },
      args: {
        type: 'string',
        description: 'Arguments for the method (JSON array string)'
      },
      value: {
        type: 'string',
        description: 'Amount of ETH to send with the transaction (in wei)'
      },
      network: {
        type: 'string',
        description: 'Network name (e.g. mainnet, goerli, sepolia)'
      }
    },
    required: ['fromAddress', 'contractAddress', 'abi', 'method'],
  },
};

// Define DeFi protocol tools
const DEPOSIT_TO_LENDING_TOOL: Tool = {
  name: 'deposit-to-lending',
  description: 'Deposit funds to a lending protocol',
  inputSchema: {
    type: 'object',
    properties: {
      fromAddress: {
        type: 'string',
        description: 'The wallet address to execute from'
      },
      token: {
        type: 'string',
        description: 'Token symbol to deposit (e.g. ETH, USDC)'
      },
      amount: {
        type: 'string',
        description: 'Amount to deposit'
      },
      network: {
        type: 'string',
        description: 'Network name (e.g. mainnet, goerli, sepolia)'
      }
    },
    required: ['fromAddress', 'token', 'amount'],
  },
};

const WITHDRAW_FROM_LENDING_TOOL: Tool = {
  name: 'withdraw-from-lending',
  description: 'Withdraw funds from a lending protocol',
  inputSchema: {
    type: 'object',
    properties: {
      fromAddress: {
        type: 'string',
        description: 'The wallet address to execute from'
      },
      token: {
        type: 'string',
        description: 'Token symbol to withdraw (e.g. ETH, USDC)'
      },
      amount: {
        type: 'string',
        description: 'Amount to withdraw'
      },
      network: {
        type: 'string',
        description: 'Network name (e.g. mainnet, goerli, sepolia)'
      }
    },
    required: ['fromAddress', 'token', 'amount'],
  },
};

const BORROW_FUNDS_TOOL: Tool = {
  name: 'borrow-funds',
  description: 'Borrow funds from a lending protocol',
  inputSchema: {
    type: 'object',
    properties: {
      fromAddress: {
        type: 'string',
        description: 'The wallet address to execute from'
      },
      token: {
        type: 'string',
        description: 'Token symbol to borrow (e.g. ETH, USDC)'
      },
      amount: {
        type: 'string',
        description: 'Amount to borrow'
      },
      network: {
        type: 'string',
        description: 'Network name (e.g. mainnet, goerli, sepolia)'
      }
    },
    required: ['fromAddress', 'token', 'amount'],
  },
};

const REPAY_BORROWED_TOOL: Tool = {
  name: 'repay-borrowed',
  description: 'Repay borrowed funds to a lending protocol',
  inputSchema: {
    type: 'object',
    properties: {
      fromAddress: {
        type: 'string',
        description: 'The wallet address to execute from'
      },
      token: {
        type: 'string',
        description: 'Token symbol to repay (e.g. ETH, USDC)'
      },
      amount: {
        type: 'string',
        description: 'Amount to repay'
      },
      network: {
        type: 'string',
        description: 'Network name (e.g. mainnet, goerli, sepolia)'
      }
    },
    required: ['fromAddress', 'token', 'amount'],
  },
};

const REDEEM_COLLATERAL_TOOL: Tool = {
  name: 'redeem-collateral',
  description: 'Redeem collateral from a lending protocol',
  inputSchema: {
    type: 'object',
    properties: {
      fromAddress: {
        type: 'string',
        description: 'The wallet address to execute from'
      },
      token: {
        type: 'string',
        description: 'Token symbol of collateral to redeem (e.g. ETH, USDC)'
      },
      amount: {
        type: 'string',
        description: 'Amount to redeem'
      },
      network: {
        type: 'string',
        description: 'Network name (e.g. mainnet, goerli, sepolia)'
      }
    },
    required: ['fromAddress', 'token', 'amount'],
  },
};

const GET_LENDING_BALANCE_TOOL: Tool = {
  name: 'get-lending-balance',
  description: 'Get lending balance for a specific token',
  inputSchema: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'The wallet address to check'
      },
      token: {
        type: 'string',
        description: 'Token symbol (e.g. ETH, USDC)'
      },
      network: {
        type: 'string',
        description: 'Network name (e.g. mainnet, goerli, sepolia)'
      }
    },
    required: ['address', 'token'],
  },
};

const GET_COLLATERAL_BALANCE_TOOL: Tool = {
  name: 'get-collateral-balance',
  description: 'Get collateral balance for a specific token',
  inputSchema: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'The wallet address to check'
      },
      token: {
        type: 'string',
        description: 'Token symbol (e.g. ETH, USDC)'
      },
      network: {
        type: 'string',
        description: 'Network name (e.g. mainnet, goerli, sepolia)'
      }
    },
    required: ['address', 'token'],
  },
};

const GET_BORROW_BALANCE_TOOL: Tool = {
  name: 'get-borrow-balance',
  description: 'Get borrow balance for a specific token',
  inputSchema: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'The wallet address to check'
      },
      token: {
        type: 'string',
        description: 'Token symbol (e.g. ETH, USDC)'
      },
      network: {
        type: 'string',
        description: 'Network name (e.g. mainnet, goerli, sepolia)'
      }
    },
    required: ['address', 'token'],
  },
};

const GET_USER_POSITION_TOOL: Tool = {
  name: 'get-user-position',
  description: 'Get complete position summary for a user across all tokens',
  inputSchema: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'The wallet address to check'
      },
      network: {
        type: 'string',
        description: 'Network name (e.g. mainnet, goerli, sepolia)'
      }
    },
    required: ['address'],
  },
};

const ANALYZE_LENDING_TOOL: Tool = {
  name: 'analyze-lending',
  description: 'Analyze lending opportunities and APY across protocols',
  inputSchema: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'User address to analyze specific opportunities for'
      },
      network: {
        type: 'string',
        description: 'Network name (e.g. mainnet, goerli, sepolia)'
      }
    },
  },
};

const GET_INTEREST_RATES_TOOL: Tool = {
  name: 'get-interest-rates',
  description: 'Get current interest rates for a specific token',
  inputSchema: {
    type: 'object',
    properties: {
      token: {
        type: 'string',
        description: 'Token symbol (e.g. ETH, USDC)'
      },
      network: {
        type: 'string',
        description: 'Network name (e.g. mainnet, goerli, sepolia)'
      }
    },
    required: ['token'],
  },
};

const GET_MARKET_LIQUIDITY_TOOL: Tool = {
  name: 'get-market-liquidity',
  description: 'Get market liquidity information for a specific token',
  inputSchema: {
    type: 'object',
    properties: {
      token: {
        type: 'string',
        description: 'Token symbol (e.g. ETH, USDC)'
      },
      network: {
        type: 'string',
        description: 'Network name (e.g. mainnet, goerli, sepolia)'
      }
    },
    required: ['token'],
  },
};

const GET_PROTOCOL_ANALYSIS_TOOL: Tool = {
  name: 'get-protocol-analysis',
  description: 'Get comprehensive protocol analysis for AI agent decision making (e.g., smart order execution, liquidation protections, strategy triggers, automated yield optimization, leveraged strategies, position management, automated rebalancing)',
  inputSchema: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'The wallet address to analyze (optional, will use default wallet if not provided)'
      },
      network: {
        type: 'string',
        description: 'Network name (e.g. mainnet, goerli, sepolia)'
      }
    }
  }
};

// Define a new tool for checking token approvals
const CHECK_TOKEN_APPROVAL_TOOL: Tool = {
  name: 'check-token-approval',
  description: 'Check how much of a token is approved for spending by the protocol',
  inputSchema: {
    type: 'object',
    properties: {
      token: {
        type: 'string',
        description: 'Token symbol (e.g. ETH, USDC)'
      },
      owner: {
        type: 'string',
        description: 'The wallet address that owns the tokens'
      },
      network: {
        type: 'string',
        description: 'Network name (e.g. mainnet, goerli, sepolia)'
      }
    },
    required: ['token', 'owner'],
  },
};

// Define a new tool for token approval
const APPROVE_TOKEN_TOOL: Tool = {
  name: 'approve-token',
  description: 'Approve a token for spending by the protocol',
  inputSchema: {
    type: 'object',
    properties: {
      token: {
        type: 'string',
        description: 'Token symbol (e.g. ETH, USDC)'
      },
      amount: {
        type: 'string',
        description: 'Amount to approve (or "max" for unlimited approval)'
      },
      fromAddress: {
        type: 'string',
        description: 'The wallet address to execute from'
      },
      network: {
        type: 'string',
        description: 'Network name (e.g. mainnet, goerli, sepolia)'
      }
    },
    required: ['token', 'amount', 'fromAddress'],
  },
};

// Create an array of all tools
const ALL_TOOLS = [
  CREATE_WALLET_TOOL,
  IMPORT_WALLET_TOOL,
  LIST_WALLETS_TOOL,
  CHECK_BALANCE_TOOL,
  GET_TRANSACTIONS_TOOL,
  SEND_TRANSACTION_TOOL,
  CALL_CONTRACT_TOOL,
  EXECUTE_CONTRACT_TOOL,
  DEPOSIT_TO_LENDING_TOOL,
  WITHDRAW_FROM_LENDING_TOOL,
  BORROW_FUNDS_TOOL,
  REPAY_BORROWED_TOOL,
  REDEEM_COLLATERAL_TOOL,
  GET_LENDING_BALANCE_TOOL,
  GET_BORROW_BALANCE_TOOL,
  GET_COLLATERAL_BALANCE_TOOL,
  ANALYZE_LENDING_TOOL,
  GET_PROTOCOL_ANALYSIS_TOOL,
  GET_USER_POSITION_TOOL,
  GET_MARKET_LIQUIDITY_TOOL,
  GET_INTEREST_RATES_TOOL,
  CHECK_TOKEN_APPROVAL_TOOL,
  APPROVE_TOKEN_TOOL
];

// Define interface types for the tool handlers
interface CreateWalletParams {}

interface ImportWalletParams {
  privateKey: string;
}

interface ListWalletsParams {}

interface CheckBalanceParams {
  address?: string;
  network?: string;
}

interface GetTransactionsParams {
  address: string;
  limit?: number;
  network?: string;
}

interface SendTransactionParams {
  fromAddress: string;
  toAddress: string;
  amount: string;
  network?: string;
}

interface CallContractParams {
  contractAddress: string;
  abi: string;
  method: string;
  args?: string;
  network?: string;
}

interface ExecuteContractParams {
  fromAddress: string;
  contractAddress: string;
  abi: string;
  method: string;
  args?: string;
  value: string;
  network?: string;
}

interface DepositToLendingParams {
  fromAddress: string;
  token: string;
  amount: string;
  network?: string;
}

interface WithdrawFromLendingParams {
  fromAddress: string;
  token: string;
  amount: string;
  network?: string;
}

interface BorrowFundsParams {
  fromAddress: string;
  token: string;
  amount: string;
  network?: string;
}

interface RepayBorrowedParams {
  fromAddress: string;
  token: string;
  amount: string;
  network?: string;
}

interface RedeemCollateralParams {
  fromAddress: string;
  token: string;
  amount: string;
  network?: string;
}

interface GetLendingBalanceParams {
  address: string;
  token: string;
  network?: string;
}

interface GetCollateralBalanceParams {
  address: string;
  token: string;
  network?: string;
}

interface GetBorrowBalanceParams {
  address: string;
  token: string;
  network?: string;
}

interface AnalyzeLendingParams {
  address?: string;
  network?: string;
}

interface GetInterestRatesParams {
  token: string;
  network?: string;
}

interface GetMarketLiquidityParams {
  token: string;
  network?: string;
}

interface GetUserPositionParams {
  address: string;
  network?: string;
}

interface GetProtocolAnalysisParams {
  address?: string;
  network?: string;
}

interface CheckTokenApprovalParams {
  token: string;
  owner: string;
  network?: string;
}

interface ApproveTokenParams {
  token: string;
  amount: string;
  fromAddress: string;
  network?: string;
}

// Helper function to extract the base token symbol from token strings like "EToken-WBTC"
function extractBaseTokenSymbol(tokenString: string): string {
  // If the token string contains a hyphen, extract the part after it
  if (tokenString.includes('-')) {
    return tokenString.split('-')[1];
  }
  // Otherwise return the original token string
  return tokenString;
}

// Server implementation
const server = new Server(
  {
    name: "evm-signer",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Set up the request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ALL_TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error("No arguments provided");
    }

    switch (name) {
      case "create-wallet": {
        try {
          const wallet = await crypto.createWallet();
          await crypto.saveWallet(wallet);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                address: wallet.address,
                privateKey: wallet.privateKey,
                mnemonic: wallet.mnemonic?.phrase
              }, null, 2)
            }],
            isError: false,
          };
        } catch (error: any) {
          return {
            content: [{
              type: 'text',
              text: `Error creating wallet: ${error.message}`
            }],
            isError: true,
          };
        }
      }

      case "import-wallet": {
        try {
          const wallet = await crypto.importWallet(args.privateKey);
          await crypto.saveWallet(wallet);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                address: wallet.address,
                privateKey: wallet.privateKey,
                imported: true
              }, null, 2)
            }],
            isError: false,
          };
        } catch (error: any) {
          return {
            content: [{
              type: 'text',
              text: `Error importing wallet: ${error.message}`
            }],
            isError: true,
          };
        }
      }

      case "list-wallets": {
        try {
          const wallets = await crypto.listWallets();
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(wallets, null, 2)
            }],
            isError: false,
          };
        } catch (error: any) {
          return {
            content: [{
              type: 'text',
              text: `Error listing wallets: ${error.message}`
            }],
            isError: true,
          };
        }
      }

      case "check-balance": {
        try {
          const address = args.address || await crypto.getDefaultWalletAddress();
          
          if (!address) {
            throw new Error("No wallet address provided and no default wallet found");
          }
          
          const balance = await ethereum.checkBalance(address, args.network);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                address,
                balance: balance.toString(),
                network: args.network || 'monad-testnet'
              }, null, 2)
            }],
            isError: false,
          };
        } catch (error: any) {
          return {
            content: [{
              type: 'text',
              text: `Error checking balance: ${error.message}`
            }],
            isError: true,
          };
        }
      }

      case "send-transaction": {
        try {
          const { fromAddress, toAddress, amount, network } = args;
          const result = await ethereum.sendTransaction(fromAddress, toAddress, amount, network);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                fromAddress,
                toAddress,
                amount,
                transactionHash: result.hash,
                explorerUrl: result.explorer,
                network: network || 'monad-testnet'
              }, null, 2)
            }],
            isError: false,
          };
        } catch (error: any) {
          return {
            content: [{
              type: 'text',
              text: `Error sending transaction: ${error.message}`
            }],
            isError: true,
          };
        }
      }

      case "get-transactions": {
        try {
          const { address, limit, network } = args;
          const walletAddress = address || await crypto.getDefaultWalletAddress();
          
          if (!walletAddress) {
            throw new Error("No wallet address provided and no default wallet found");
          }
          
          const transactions = await ethereum.getTransactions(walletAddress, limit, network);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                address: walletAddress,
                transactions,
                count: transactions.length,
                network: network || 'monad-testnet'
              }, null, 2)
            }],
            isError: false,
          };
        } catch (error: any) {
          return {
            content: [{
              type: 'text',
              text: `Error getting transactions: ${error.message}`
            }],
            isError: true,
          };
        }
      }

      case "deposit-to-lending": {
        const { amount, token, fromAddress, network } = args;
        
        if (!amount) {
          return { error: "Amount is required" };
        }
        
        if (!token) {
          return { error: "Token symbol is required" };
        }
        
        if (!fromAddress) {
          return { error: "Sender address is required" };
        }
        
        try {
          // Step 1: Approve token spending first
          console.log(`Approving ${token} spending before deposit...`);
          const approvalResult = await protocol.approveToken(
            token,
            "max", // Approve max amount to prevent future approvals
            fromAddress,
            network
          );
          
          if (approvalResult.hash !== "0x0") {
            console.log(`Token approval successful. Hash: ${approvalResult.hash}`);
          } else {
            console.log(`Token already approved, proceeding with deposit.`);
          }
          
          // Step 2: Deposit funds using depositFor as per protocol spec
          const result = await protocol.depositFunds(
            token, 
            amount, 
            true, // willLend = true for lending deposit
            fromAddress,
            network
          );
          
          return {
            success: true,
            message: `Successfully deposited ${amount} ${token} to lending pool`,
            approvalHash: approvalResult.hash !== "0x0" ? approvalResult.hash : "Already approved",
            txHash: result.hash,
            explorerUrl: result.explorer
          };
        } catch (error) {
          return handleError(error, "Error depositing to lending pool");
        }
      }

      case "withdraw-from-lending": {
        const { amount, token, fromAddress, network } = args;
        
        if (!amount) {
          return { error: "Amount is required" };
        }
        
        if (!token) {
          return { error: "Token symbol is required" };
        }
        
        if (!fromAddress) {
          return { error: "Sender address is required" };
        }
        
        try {
          const result = await protocol.withdrawFunds(
            token, 
            amount, 
            true, // forceLentRedemption = true to withdraw from lending pool
            fromAddress, // Recipient is the same as sender by default
            fromAddress,
            network
          );
          
          return {
            success: true,
            message: `Successfully withdrawn ${result.amountWithdrawn} ${token} from lending pool`,
            txHash: result.hash,
            explorerUrl: result.explorer,
            lendingBalanceUsed: result.lendingBalanceUsed
          };
        } catch (error) {
          return handleError(error, "Error withdrawing from lending pool");
        }
      }

      case "borrow-funds": {
        const { amount, token, fromAddress, network } = args;
        
        if (!amount) {
          return { error: "Amount is required" };
        }
        
        if (!token) {
          return { error: "Token symbol is required" };
        }
        
        if (!fromAddress) {
          return { error: "Sender address is required" };
        }
        
        try {
          const result = await protocol.borrowFunds(
            token,
            amount,
            fromAddress,
            network
          );
          
          return {
            success: true,
            message: `Successfully borrowed ${amount} ${token}`,
            txHash: result.hash,
            explorerUrl: result.explorer
          };
        } catch (error) {
          return handleError(error, "Error borrowing funds");
        }
      }

      case "repay-borrowed": {
        try {
          const { fromAddress, token, amount, network } = args;
          
          if (!amount) {
            return { error: "Amount is required" };
          }
          
          if (!token) {
            return { error: "Token symbol is required" };
          }
          
          if (!fromAddress) {
            return { error: "Sender address is required" };
          }
          
          const result = await protocol.repayBorrowed(
            token,
            amount,
            fromAddress,
            network
          );
          
          return {
            success: true,
            message: `Successfully repaid ${amount} ${token}`,
            txHash: result.hash,
            explorerUrl: result.explorer
          };
        } catch (error) {
          return handleError(error, "Error repaying borrowed funds");
        }
      }

      case "redeem-collateral": {
        const { amount, token, fromAddress, network } = args;
        
        if (!amount) {
          return { error: "Amount is required" };
        }
        
        if (!token) {
          return { error: "Token symbol is required" };
        }
        
        if (!fromAddress) {
          return { error: "Sender address is required" };
        }
        
        try {
          const result = await protocol.redeemCollateral(
            token,
            amount, // shares amount
            fromAddress, // receiver is the same as sender by default
            fromAddress, // owner is the same as sender by default
            fromAddress,
            network
          );
          
          return {
            success: true,
            message: `Successfully redeemed ${result.assets} ${token} from collateral`,
            txHash: result.hash,
            explorerUrl: result.explorer,
            assetsRedeemed: result.assets
          };
        } catch (error) {
          return handleError(error, "Error redeeming collateral");
        }
      }

      case "get-lending-balance": {
        try {
          const { address, token, network } = args;
          const walletAddress = address || await crypto.getDefaultWalletAddress();
          
          if (!walletAddress) {
            throw new Error("No wallet address provided and no default wallet found");
          }
          
          const baseToken = extractBaseTokenSymbol(token);
          const balance = await protocol.getLendingBalance(baseToken, walletAddress, network);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                address: walletAddress,
                token: token,
                balance: balance.balance,
                balanceUsd: balance.balanceUsd,
                network: network || 'monad-testnet'
              }, null, 2)
            }],
            isError: false,
          };
        } catch (error: any) {
          return {
            content: [{
              type: 'text',
              text: `Error getting lending balance: ${error.message}`
            }],
            isError: true,
          };
        }
      }

      case "get-borrow-balance": {
        try {
          const { address, token, network } = args;
          const walletAddress = address || await crypto.getDefaultWalletAddress();
          
          if (!walletAddress) {
            throw new Error("No wallet address provided and no default wallet found");
          }
          
          const baseToken = extractBaseTokenSymbol(token);
          const borrowData = await protocol.getBorrowBalance(baseToken, walletAddress, network);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                address: walletAddress,
                token: token,
                borrowed: borrowData.borrowed,
                borrowedUsd: borrowData.borrowedUsd,
                limit: borrowData.limit,
                network: network || 'monad-testnet'
              }, null, 2)
            }],
            isError: false,
          };
        } catch (error: any) {
          return {
            content: [{
              type: 'text',
              text: `Error getting borrow balance: ${error.message}`
            }],
            isError: true,
          };
        }
      }

      case "get-collateral-balance": {
        try {
          const { address, token, network } = args;
          const walletAddress = address || await crypto.getDefaultWalletAddress();
          
          if (!walletAddress) {
            throw new Error("No wallet address provided and no default wallet found");
          }
          
          const baseToken = extractBaseTokenSymbol(token);
          const collateralData = await protocol.getCollateralBalance(baseToken, walletAddress, network);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                address: walletAddress,
                token: token,
                tokenBalance: collateralData.tokenBalance,
                underlyingBalance: collateralData.underlyingBalance,
                isCollateral: collateralData.isCollateral,
                network: network || 'monad-testnet'
              }, null, 2)
            }],
            isError: false,
          };
        } catch (error: any) {
          return {
            content: [{
              type: 'text',
              text: `Error getting collateral balance: ${error.message}`
            }],
            isError: true,
          };
        }
      }

      case "analyze-lending": {
        try {
          const { address, network } = args;
          const walletAddress = address || await crypto.getDefaultWalletAddress();
          
          if (!walletAddress) {
            throw new Error("No wallet address provided and no default wallet found");
          }
          
          const analyzeResult = await protocol.analyzeLending(walletAddress, network);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(analyzeResult, null, 2)
            }],
            isError: false,
          };
        } catch (error: any) {
          return {
            content: [{
              type: 'text',
              text: `Error analyzing lending: ${error.message}`
            }],
            isError: true,
          };
        }
      }
      
      case "get-protocol-analysis": {
        try {
          const { address, network } = args;
          const walletAddress = address || await crypto.getDefaultWalletAddress();
          
          if (!walletAddress) {
            throw new Error("No wallet address provided and no default wallet found");
          }
          
          const analysisResult = await protocol.getProtocolAnalysis(walletAddress, network);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(analysisResult, null, 2)
            }],
            isError: false,
          };
        } catch (error: any) {
          return {
            content: [{
              type: 'text',
              text: `Error getting protocol analysis: ${error.message}`
            }],
            isError: true,
          };
        }
      }

      case "get-interest-rates": {
        try {
          const { token, network } = args;
          const baseToken = extractBaseTokenSymbol(token);
          const interestRates = await protocol.getInterestRates(baseToken, network);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                token: token,
                interestRates,
                network: network || 'monad-testnet'
              }, null, 2)
            }],
            isError: false,
          };
        } catch (error: any) {
          return {
            content: [{
              type: 'text',
              text: `Error getting interest rates: ${error.message}`
            }],
            isError: true,
          };
        }
      }

      case "get-market-liquidity": {
        try {
          const { token, network } = args;
          const baseToken = extractBaseTokenSymbol(token);
          const liquidityData = await protocol.getMarketLiquidity(baseToken, network);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                token: token,
                totalBorrows: liquidityData.totalBorrows,
                totalSupply: liquidityData.totalSupply,
                availableLiquidity: liquidityData.availableLiquidity,
                utilization: liquidityData.utilization,
                network: network || 'monad-testnet'
              }, null, 2)
            }],
            isError: false,
          };
        } catch (error: any) {
          return {
            content: [{
              type: 'text',
              text: `Error getting market liquidity: ${error.message}`
            }],
            isError: true,
          };
        }
      }

      case "get-user-position": {
        try {
          const { address, network } = args;
          const walletAddress = address || await crypto.getDefaultWalletAddress();
          
          if (!walletAddress) {
            throw new Error("No wallet address provided and no default wallet found");
          }
          
          const positionData = await protocol.getUserPosition(walletAddress, network);
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                address: walletAddress,
                position: positionData,
                network: network || 'monad-testnet'
              }, null, 2)
            }],
            isError: false,
          };
        } catch (error: any) {
          return {
            content: [{
              type: 'text',
              text: `Error getting user position: ${error.message}`
            }],
            isError: true,
          };
        }
      }

      case "check-token-approval": {
        try {
          const { token, owner, network } = args;
          const baseToken = extractBaseTokenSymbol(token);
          const approvalAmount = await protocol.checkTokenApproval(baseToken, owner, network);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                token: token,
                owner: owner,
                approvalAmount: approvalAmount,
                network: network || 'monad-testnet'
              }, null, 2)
            }],
            isError: false,
          };
        } catch (error: any) {
          return {
            content: [{
              type: 'text',
              text: `Error checking token approval: ${error.message}`
            }],
            isError: true,
          };
        }
      }

      case "approve-token": {
        try {
          const { token, amount, fromAddress, network } = args;
          const baseToken = extractBaseTokenSymbol(token);
          const result = await protocol.approveToken(baseToken, amount, fromAddress, network);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                token: token,
                amount: amount,
                fromAddress: fromAddress,
                txHash: result.hash,
                explorerUrl: result.explorer,
                network: network || 'monad-testnet'
              }, null, 2)
            }],
            isError: false,
          };
        } catch (error: any) {
          return {
            content: [{
              type: 'text',
              text: `Error approving token: ${error.message}`
            }],
            isError: true,
          };
        }
      }

      // Add other tool handlers here...

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP EVM Signer server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
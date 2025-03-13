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
import transactionQueue from './transaction-queue.js';

// Helper for handling errors consistently
function handleError(error: any, defaultMessage: string = "An error occurred") {
  console.error(defaultMessage, error);
  const errorMessage = `${defaultMessage}: ${error.message || JSON.stringify(error)}`;
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: false,
        error: true,
        message: errorMessage,
        details: error.code ? { code: error.code, reason: error.reason } : undefined
      })
    }],
    isError: true
  };
}

// Helper for handling successful transactions consistently
function handleSuccess(data: any, message: string) {
  console.log(message, data);
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: true,
        message: message,
        data: data,
        timestamp: new Date().toISOString()
      })
    }]
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

const CHECK_ALL_BALANCES_TOOL: Tool = {
  name: 'check-all-balances',
  description: 'Check all token balances of a wallet',
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

const GET_MARKET_LIQUIDITY_STATUS_TOOL: Tool = {
  name: 'get-market-liquidity-status',
  description: 'Get the status of a market liquidity task',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'The ID of the market liquidity task'
      }
    },
    required: ['taskId'],
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

const CHECK_TRANSACTION_STATUS_TOOL: Tool = {
  name: 'check-transaction-status',
  description: 'Check the status of a previously submitted transaction',
  inputSchema: {
    type: 'object',
    properties: {
      transactionId: {
        type: 'string',
        description: 'Transaction ID to check'
      }
    },
    required: ['transactionId'],
  },
};

const GET_PROTOCOL_ANALYSIS_STATUS_TOOL: Tool = {
  name: 'get-protocol-analysis-status',
  description: 'Get the status of a protocol analysis task',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'The ID of the protocol analysis task'
      }
    },
    required: ['taskId'],
  },
};

const GET_USER_POSITION_STATUS_TOOL: Tool = {
  name: 'get-user-position-status',
  description: 'Get the status of a user position task',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'The ID of the user position task'
      }
    },
    required: ['taskId'],
  },
};

// Create an array of all tools
const ALL_TOOLS = [
  CREATE_WALLET_TOOL,
  IMPORT_WALLET_TOOL,
  LIST_WALLETS_TOOL,
  CHECK_BALANCE_TOOL,
  CHECK_ALL_BALANCES_TOOL,
  GET_TRANSACTIONS_TOOL,
  SEND_TRANSACTION_TOOL,
  CALL_CONTRACT_TOOL,
  EXECUTE_CONTRACT_TOOL,
  DEPOSIT_TO_LENDING_TOOL,
  WITHDRAW_FROM_LENDING_TOOL,
  BORROW_FUNDS_TOOL,
  REPAY_BORROWED_TOOL,
  REDEEM_COLLATERAL_TOOL,
  GET_PROTOCOL_ANALYSIS_TOOL,
  GET_USER_POSITION_TOOL,
  GET_USER_POSITION_STATUS_TOOL,
  GET_MARKET_LIQUIDITY_TOOL,
  GET_MARKET_LIQUIDITY_STATUS_TOOL,
  GET_INTEREST_RATES_TOOL,
  CHECK_TOKEN_APPROVAL_TOOL,
  APPROVE_TOKEN_TOOL,
  CHECK_TRANSACTION_STATUS_TOOL,
  GET_PROTOCOL_ANALYSIS_STATUS_TOOL
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

interface CheckAllBalancesParams {
  address: string;
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

interface GetProtocolAnalysisParams {
  address?: string;
  network?: string;
}

interface GetProtocolAnalysisStatusParams {
  taskId: string;
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

interface CheckTransactionStatusParams {
  transactionId: string;
}

interface GetUserPositionParams {
  address: string;
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

interface GetMarketLiquidityStatusParams {
  taskId: string;
}

interface GetUserPositionStatusParams {
  taskId: string;
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
      tools: {
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            arguments: { type: "object" }
          },
          required: ["name"]
        }
      },
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
          return handleSuccess({
            address: wallet.address,
            privateKey: wallet.privateKey,
            mnemonic: wallet.mnemonic?.phrase
          }, "Wallet created successfully");
        } catch (error: any) {
          return handleError(error, "Error creating wallet");
        }
      }

      case "import-wallet": {
        try {
          const wallet = await crypto.importWallet(args.privateKey);
          await crypto.saveWallet(wallet);
          return handleSuccess({
            address: wallet.address,
            privateKey: wallet.privateKey,
            imported: true
          }, "Wallet imported successfully");
        } catch (error: any) {
          return handleError(error, "Error importing wallet");
        }
      }

      case "list-wallets": {
        try {
          const wallets = await crypto.listWallets();
          return handleSuccess(wallets, "Wallets listed successfully");
        } catch (error: any) {
          return handleError(error, "Error listing wallets");
        }
      }

      case "check-balance": {
        try {
          const address = args.address || await crypto.getDefaultWalletAddress();
          
          if (!address) {
            throw new Error("No wallet address provided and no default wallet found");
          }
          
          const balance = await ethereum.checkBalance(address, args.network);
          return handleSuccess({
            address,
            balance: balance.toString(),
            network: args.network || 'monad-testnet'
          }, "Balance checked successfully");
        } catch (error: any) {
          return handleError(error, "Error checking balance");
        }
      }

      case "check-all-balances": {
        try {
          const address = args.address;
          const network = args.network || 'monad-testnet';
          
          if (!address) {
            throw new Error("Address is required");
          }
          
          const balances = await ethereum.checkAllBalances(address, network);
          return handleSuccess({
            address,
            balances,
            network
          }, "Token balances checked successfully");
        } catch (error: any) {
          return handleError(error, "Error checking token balances");
        }
      }

      case "send-transaction": {
        try {
          const { fromAddress, toAddress, amount, network } = args;
          const result = await ethereum.sendTransaction(fromAddress, toAddress, amount, network);
          return handleSuccess({
            fromAddress,
            toAddress,
            amount,
            transactionHash: result.hash,
            explorerUrl: result.explorer,
            network: network || 'monad-testnet'
          }, "Transaction sent successfully");
        } catch (error: any) {
          return handleError(error, "Error sending transaction");
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
          return handleSuccess({
            address: walletAddress,
            transactions,
            count: transactions.length,
            network: network || 'monad-testnet'
          }, "Transactions retrieved successfully");
        } catch (error: any) {
          return handleError(error, "Error getting transactions");
        }
      }

      case "deposit-to-lending": {
        const { amount, token, fromAddress, network } = args;
        
        if (!amount) {
          return handleError(new Error("Amount is required"), "Invalid request");
        }
        
        if (!token) {
          return handleError(new Error("Token symbol is required"), "Invalid request");
        }
        
        if (!fromAddress) {
          return handleError(new Error("Sender address is required"), "Invalid request");
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
          
          // Set a strict timeout for the deposit operation
          const depositPromise = protocol.depositFunds(
            token, 
            String(amount), // Convert amount to string to ensure correct type
            true, // willLend = true for lending deposit
            fromAddress,
            network
          );
          
          // Use Promise.race to prevent timeout
          const result = await depositPromise;
          
          return handleSuccess({
            amount: amount,
            token: token,
            txHash: result.hash,
            explorerUrl: result.explorer,
            network: network || 'monad-testnet',
            transactionId: result.transactionId,
            message: "Transaction submitted and is being processed in the background. Use check-transaction-status tool with this transactionId to check status. The transaction hash will be available shortly."
          }, "Deposit request submitted successfully");
        } catch (error) {
          return handleError(error, "Error depositing to lending pool");
        }
      }

      case "withdraw-from-lending": {
        const { amount, token, fromAddress, network } = args;
        
        if (!amount) {
          return handleError(new Error("Amount is required"), "Invalid request");
        }
        
        if (!token) {
          return handleError(new Error("Token symbol is required"), "Invalid request");
        }
        
        if (!fromAddress) {
          return handleError(new Error("Sender address is required"), "Invalid request");
        }
        
        try {
          // Set a strict timeout for the withdrawal operation
          const withdrawPromise = protocol.withdrawFunds(
            token, 
            amount, 
            true, // forceLentRedemption = true to withdraw from lending pool
            fromAddress, // Recipient is the same as sender by default
            fromAddress,
            network
          );
          
          // Use Promise.race to prevent timeout
          const result = await withdrawPromise;
          
          return handleSuccess({
            amount: amount,
            token: token,
            txHash: result.hash,
            explorerUrl: result.explorer,
            lendingBalanceUsed: result.lendingBalanceUsed,
            network: network || 'monad-testnet',
            transactionId: result.transactionId,
            message: "Transaction submitted and is being processed in the background. Use check-transaction-status tool with this transactionId to check status. The transaction hash will be available shortly."
          }, "Withdrawal request submitted successfully");
        } catch (error) {
          return handleError(error, "Error withdrawing from lending pool");
        }
      }

      case "borrow-funds": {
        const { amount, token, fromAddress, network } = args;
        
        if (!amount) {
          return handleError(new Error("Amount is required"), "Invalid request");
        }
        
        if (!token) {
          return handleError(new Error("Token symbol is required"), "Invalid request");
        }
        
        if (!fromAddress) {
          return handleError(new Error("Sender address is required"), "Invalid request");
        }
        
        try {
          const result = await protocol.borrowFunds(
            token,
            amount,
            fromAddress,
            network
          );
          
          return handleSuccess({
            amount: amount,
            token: token,
            txHash: result.hash,
            explorerUrl: result.explorer,
            network: network || 'monad-testnet',
            transactionId: result.transactionId,
            message: "Transaction submitted and is being processed in the background. Use check-transaction-status tool with this transactionId to check status. The transaction hash will be available shortly."
          }, "Borrowing funds successful");
        } catch (error) {
          return handleError(error, "Error borrowing funds");
        }
      }

      case "repay-borrowed": {
        try {
          const { fromAddress, token, amount, network } = args;
          
          if (!amount) {
            return handleError(new Error("Amount is required"), "Invalid request");
          }
          
          if (!token) {
            return handleError(new Error("Token symbol is required"), "Invalid request");
          }
          
          if (!fromAddress) {
            return handleError(new Error("Sender address is required"), "Invalid request");
          }
          
          const result = await protocol.repayBorrowed(
            token,
            amount,
            fromAddress,
            network
          );
          
          return handleSuccess({
            amount: amount,
            token: token,
            txHash: result.hash,
            explorerUrl: result.explorer,
            network: network || 'monad-testnet',
            transactionId: result.transactionId,
            message: "Transaction submitted and is being processed in the background. Use check-transaction-status tool with this transactionId to check status. The transaction hash will be available shortly."
          }, "Repaying borrowed funds successful");
        } catch (error) {
          return handleError(error, "Error repaying borrowed funds");
        }
      }

      case "redeem-collateral": {
        const { amount, token, fromAddress, network } = args;
        
        if (!amount) {
          return handleError(new Error("Amount is required"), "Invalid request");
        }
        
        if (!token) {
          return handleError(new Error("Token symbol is required"), "Invalid request");
        }
        
        if (!fromAddress) {
          return handleError(new Error("Sender address is required"), "Invalid request");
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
          
          return handleSuccess({
            amount: amount,
            token: token,
            txHash: result.hash,
            explorerUrl: result.explorer,
            assetsRedeemed: result.assets,
            network: network || 'monad-testnet',
            transactionId: result.transactionId,
            message: "Transaction submitted and is being processed in the background. Use check-transaction-status tool with this transactionId to check status. The transaction hash will be available shortly."
          }, "Redeeming collateral successful");
        } catch (error) {
          return handleError(error, "Error redeeming collateral");
        }
      }

      case "get-protocol-analysis": {
        try {
          const { address, network } = args;
          
          if (!address) {
            return handleError(new Error("Address is required"), "Missing required parameter");
          }
          
          // Get analysis task
          const analysisTask = await protocol.getProtocolAnalysis(
            address,
            network
          );
          
          return handleSuccess(analysisTask, "Protocol analysis started");
        } catch (error: any) {
          return handleError(error, "Error starting protocol analysis");
        }
      }

      case "get-protocol-analysis-status": {
        try {
          const { taskId } = args;
          
          if (!taskId) {
            return handleError(new Error("Task ID is required"), "Missing required parameter");
          }
          
          // Get analysis task status
          const taskStatus = protocol.getProtocolAnalysisStatus(taskId);
          
          if (!taskStatus) {
            return handleError(new Error(`Task with ID ${taskId} not found`), "Task not found");
          }
          
          return handleSuccess(taskStatus, `Protocol analysis status: ${taskStatus.status}`);
        } catch (error: any) {
          return handleError(error, "Error checking protocol analysis status");
        }
      }

      case "get-interest-rates": {
        try {
          const { token, network } = args;
          const baseToken = extractBaseTokenSymbol(token);
          const interestRates = await protocol.getInterestRates(baseToken, network);
          return handleSuccess({
            token: token,
            interestRates,
            network: network || 'monad-testnet'
          }, "Interest rates retrieved successfully");
        } catch (error: any) {
          return handleError(error, "Error getting interest rates");
        }
      }

      case "get-market-liquidity": {
        try {
          const { token, network } = args;
          const baseToken = extractBaseTokenSymbol(token);
          const result = await protocol.getMarketLiquidityAsync(baseToken, network);
          return handleSuccess(result, "Market liquidity analysis initiated");
        } catch (error: any) {
          return handleError(error, "Error starting market liquidity analysis");
        }
      }

      case "get-market-liquidity-status": {
        try {
          const { taskId } = args;
          
          if (!taskId) {
            throw new Error("Task ID is required");
          }
          
          const status = protocol.getMarketLiquidityStatus(taskId);
          
          if (!status) {
            throw new Error(`Task with ID ${taskId} not found`);
          }
          
          return handleSuccess(status, `Market liquidity status: ${status.status}`);
        } catch (error: any) {
          return handleError(error, "Error getting market liquidity status");
        }
      }

      case "get-user-position": {
        try {
          const { address, network } = args;
          const walletAddress = address || await crypto.getDefaultWalletAddress();
          
          if (!walletAddress) {
            throw new Error("No wallet address provided and no default wallet found");
          }
          
          // Use the new async function instead of direct call
          const result = await protocol.getUserPositionAsync(walletAddress, network);
          return handleSuccess(result, "User position analysis initiated");
        } catch (error: any) {
          return handleError(error, "Error starting user position analysis");
        }
      }

      case "get-user-position-status": {
        try {
          const { taskId } = args;
          
          if (!taskId) {
            throw new Error("Task ID is required");
          }
          
          const status = protocol.getUserPositionStatus(taskId);
          
          if (!status) {
            throw new Error(`Task with ID ${taskId} not found`);
          }
          
          return handleSuccess(status, `User position status: ${status.status}`);
        } catch (error: any) {
          return handleError(error, "Error getting user position status");
        }
      }

      case "check-token-approval": {
        try {
          const { token, owner, network } = args;
          const baseToken = extractBaseTokenSymbol(token);
          const approvalAmount = await protocol.checkTokenApproval(baseToken, owner, network);
          return handleSuccess({
            token: token,
            owner: owner,
            approvalAmount: approvalAmount,
            network: network || 'monad-testnet'
          }, "Token approval retrieved successfully");
        } catch (error: any) {
          return handleError(error, "Error checking token approval");
        }
      }

      case "approve-token": {
        try {
          const { token, amount, fromAddress, network } = args;
          const baseToken = extractBaseTokenSymbol(token);
          const result = await protocol.approveToken(baseToken, amount, fromAddress, network);
          return handleSuccess({
            token: token,
            amount: amount,
            fromAddress: fromAddress,
            txHash: result.hash,
            explorerUrl: result.explorer,
            network: network || 'monad-testnet'
          }, "Token approval successful");
        } catch (error: any) {
          return handleError(error, "Error approving token");
        }
      }

      case "check-transaction-status": {
        try {
          const { transactionId } = args;
          
          // Get transaction from queue
          const transaction = transactionQueue.getTransaction(transactionId);
          
          if (!transaction) {
            return handleError(new Error(`Transaction with ID ${transactionId} not found`), "Transaction not found");
          }
          
          // Return transaction details
          return handleSuccess({
            id: transaction.id,
            type: transaction.type,
            status: transaction.status,
            hash: transaction.hash || 'pending',
            params: transaction.params,
            createdAt: new Date(transaction.timestamp).toISOString(),
            timeElapsed: Date.now() - transaction.timestamp + 'ms',
            error: transaction.error
          }, `Transaction status: ${transaction.status}`);
        } catch (error) {
          return handleError(error, "Error checking transaction status");
        }
      }

      // Add other tool handlers here...

      default:
        return handleError(new Error(`Unknown tool: ${name}`), "Invalid request");
    }
  } catch (error) {
    return handleError(error, "Error processing request");
  }
});

async function runServer() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP EVM Signer server running on stdio");
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
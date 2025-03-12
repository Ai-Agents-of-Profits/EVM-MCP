# MCP EVM Signer

A Model Context Protocol (MCP) server for managing Ethereum private keys and interacting with DeFi lending protocols on EVM-compatible blockchains. This server enables Claude and other AI assistants to securely manage wallets and interact with DeFi protocols through the MCP interface.

## Features

- 🔑 Securely store and manage Ethereum private keys locally
- 💼 Create, import, and list wallets
- 💰 Check account balances and transaction history
- 🏦 Interact with DeFi lending protocols
- 🔄 Deposit funds, borrow against collateral, and manage positions
- 📊 View market liquidity, interest rates, and protocol analytics
- 🛡️ Set up delegation and approve token spending
- 🐳 Docker support for easy deployment

## Supported DeFi Operations

The server integrates with lending protocols and supports the following operations:

### Key Operations
- **Delegation Setup**: `setDelegateApproval(delegateAddress, true)`
- **Deposit Funds**: `deposit(amount, willLend)` or `depositFor(amount, willLend, address)`
- **Withdraw Funds**: `withdrawFor(amount, forceLentRedemption, recipientAddress, ownerAddress)`
- **Borrowing Funds**: `borrowFor(adminWalletAddress, recipientAddress, amount)`
- **Redeem Collateral**: `redeemCollateralFor(amount, recipientAddress, adminWalletAddress)`

### Data Retrieval Functions
- **Interest Rates**: View current borrow and supply APY
- **User Positions**: Get complete position summary across all tokens
- **Market Liquidity**: View total supply, borrows, and utilization rates
- **Protocol Analysis**: Get comprehensive protocol state and strategy recommendations

## Supported Tokens

The server supports interaction with multiple tokens including:
- **SWETH** (18 decimals)
- **USDC** (6 decimals)
- **WBTC** (18 decimals)
- **aUSD** (18 decimals)
- **LUSD** (18 decimals)
- **aprMON** (18 decimals)
- **shMon** (18 decimals)

> **Note**: USDC uses 6 decimal places, while most other tokens use 18 decimals. The server handles these differences automatically.

## Quick Start

### Prerequisites

- Node.js v16 or higher
- Monad Testnet access (or other supported network)

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/mcp-evm-signer.git
   cd mcp-evm-signer
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. Start the server:
   ```bash
   npm start
   ```

### Docker Deployment

You can also run the server using Docker:

1. Build the Docker image:
   ```bash
   docker build -t evm-signer-mcp .
   ```

2. Run the container:
   ```bash
   docker run -it evm-signer-mcp
   ```

For production use, mount your keys directory as a volume:
   ```bash
   docker run -it -v /path/to/keys:/app/keys evm-signer-mcp
   ```

## Using with Cascade

To use this MCP server with Cascade:

1. Start the server using one of the methods above
2. In Cascade, use the MCP-specific functions to interact with your wallets and DeFi protocols:

```javascript
// Example: Get user position
get-user-position({
  address: "0x95723432b6a145b658995881b0576d1e16850b02",
  network: "monad"
})

// Example: Get market liquidity for WBTC
get-market-liquidity({
  token: "WBTC",
  network: "monad"
})

// Example: Get interest rates for WBTC
get-interest-rates({
  token: "WBTC",
  network: "monad"
})
```

## Key Management

Wallet keys are stored in the `keys/` directory. Each wallet is saved as a JSON file with the wallet address as the filename.

For security:
- Never share your private keys
- In production, consider mounting the keys directory as a volume
- Enable encryption for stored keys when using in production



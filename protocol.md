# Curvance DeFi Protocol Integration

## Overview

This MCP server integrates with Curvance, a DeFi lending protocol that enables users to deposit assets, borrow against collateral, and earn yield. The key innovation in this implementation is the delegation system, which allows users to safely grant permissions to third-party contracts or agents to perform actions on their behalf.

## Delegation System

The protocol uses a powerful delegation mechanism via `setDelegateApproval(address delegate, bool isApproved)`, which enables users to authorize other addresses to act on their behalf without giving up custody of their assets. This creates several possibilities:

- **Security**: Users maintain custody while delegating specific permissions
- **Automation**: Allows AI agents or smart contracts to manage positions
- **Composability**: Enables building complex financial strategies across multiple protocols

## Supported Contract Types & Operations

### 1. EToken (Lending Markets)
- **Borrowing**: Delegates can borrow assets using `borrowFor()`  
- **Repaying**: Delegates can repay loans using `repayBorrowFor()`
- **Interest Rate Model**: Dynamic rates based on utilization with vertex points

### 2. PToken (Collateral)
- **Redemption**: Delegates can redeem collateral using `redeemCollateralFor()`
- **Collateralization**: Delegates can manage collateral positions
- **Balance Checking**: Track collateral values with `balanceOfUnderlying()`

### 3. UniversalBalance (Liquidity Management)
- **Depositing**: Delegates can deposit funds with `depositFor()` 
- **Withdrawing**: Delegates can withdraw funds with `withdrawFor()`
- **Balance Management**: Shifting between idle and active balances
- **Transferring**: Moving balances between accounts

### 4. RewardManager (Incentives)
- **Reward Claiming**: Delegates can claim rewards on behalf of users

## Key Use Cases

### Yield-Bearing Applications
The Universal Balance system is particularly powerful as it allows users to:
- Earn lending yield while maintaining easy access to tokens
- Build yield-bearing payroll systems
- Create conditional orders (limit orders, etc.)
- Set up automatic top-ups to avoid liquidation
- Add native yield to any application

## AI Agent Integration

This MCP server enables an AI agent to:

1. **Monitor Positions**: Track user positions, health factors, and market conditions
2. **Optimize Yield**: Rebalance assets to maximize returns based on market conditions
3. **Manage Risk**: Automatically adjust positions to avoid liquidation
4. **Execute Strategies**: Implement complex strategies across lending markets
5. **Make Informed Decisions**: Utilize LLM capabilities for better decision-making

## Implementation Workflow

1. Users deposit assets into an agent vault
2. Users call `setDelegateApproval(agentAddress, true)` to authorize the AI agent
3. The AI agent, connected to this MCP server, can then:
   - Monitor market conditions using data retrieval functions
   - Make decisions based on LLM analysis
   - Execute transactions on behalf of users
   - Optimize positions based on market changes

## Contract Addresses

### Token Contracts
- EToken-SWETH: 0x0f1208510A8C3373179F08F496992735a4B0878e
- EToken-USDC: 0x7a9C5264bCa5a04B7555bEe2B85c81bd85b12D51
- EToken-WBTC: 0x9E8B8EF23E4dF648ad186C38868E0D09Aae0A14f
- EToken-aUSD: 0xcf812caa58BEcD37DA673b6c265Bb1505b1D93a4
- PToken-LUSD: 0xe6DB1Fb846A59E0780124b659358B6d2ccb45A81
- PToken-USDC: 0x9E7EbD0f8255F3A910Bc77FD006A410E9D54EE36
- PToken-WBTC: 0xcDA16E9c25f429F4B01A87Ff302Ee7943F2D5015
- PToken-aprMON: 0xCfeE48B617F60067F1976E558D47c2Af3F9BD7a7
- shMonUniBalance: 0x483d37C74906d258b5Fc99fC88b3A781F5bAB23a
- usdcUniBalance: 0xa598C0533F7BDC43b9ebef054Ac92A48001BE727

## MCP Server Functionality

This MCP server provides a comprehensive set of tools for interacting with the protocol:

1. **Wallet Management**:
   - Create, import, and list wallets
   - Check balances and transaction history

2. **Position Management**:
   - Get user positions across all tokens
   - Analyze lending opportunities
   - Check collateral and borrow balances

3. **Market Data**:
   - Get market liquidity information
   - Calculate interest rates based on dynamic models
   - Analyze market conditions for optimal decisions

4. **Transaction Execution**:
   - Set delegate approvals
   - Deposit and withdraw funds
   - Borrow against collateral
   - Repay loans
   - Redeem collateral

By combining these capabilities with advanced AI decision-making, this system creates a powerful framework for automated DeFi position management and optimization.

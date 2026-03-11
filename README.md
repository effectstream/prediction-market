# Midnight Prediction Market

A prediction market built on the [Midnight](https://midnight.network/) blockchain using Paima Engine (Effectstream). Users stake points on outcomes of real-world events. Bet option choices are **hidden on-chain using zero-knowledge proofs** — nobody can see who voted for what.

## ⚡ Quick Start

```bash
# First time setup
deno install --allow-scripts

# Start the backend node (API + state machine + Midnight infra)
deno task dev

# In a separate terminal — start the frontend
deno task frontend:dev
```

- **Frontend**: http://localhost:3002
- **API**: http://localhost:9996
- **Admin panel**: http://localhost:3002?admin=1

## Project Structure

```
/packages/
├── frontend/              # Web UI (TypeScript, Vite, Lace wallet integration)
├── client/
│   ├── node/             # Paima engine node (state machine, REST API)
│   ├── batcher/          # Transaction batching service for Midnight
│   └── database/         # Postgres schema and query helpers
└── shared/
    ├── contracts/
    │   └── midnight/     # Compact smart contract (ZK-private bets)
    └── data-types/       # Shared grammar and types
```

## Architecture

- **Frontend**: Vanilla TypeScript UI, connects to the Midnight [Lace](https://www.lace.io/) wallet for identity
- **Midnight Contract**: Compact language — stores bet commitments (not raw option choices), verifies winners in ZK
- **Paima Node**: Processes commands via state machine, maintains Postgres projection, forwards to batcher
- **Batcher**: Funded Midnight wallet that submits circuit calls on behalf of users
- **Database**: Postgres for fast read queries (markets, leaderboard, user profiles)

### Privacy Model

Bet option choices are hidden using a **commitment + blinding factor** scheme:

- When placing a bet, the frontend generates a random blinding factor and computes `commitment = persistentHash([optionId, blinding])`
- Only the commitment is stored on-chain — the option choice is never disclosed
- To claim winnings, the user proves in zero-knowledge that they know an `(optionId, blinding)` that opens their commitment AND that `optionId` matches the winning option
- Winners receive **2× their stake** (fixed multiplier)
- The blinding factor is stored in browser localStorage — users should save their **claim receipt** in case they switch devices

## Commands

```bash
# Root
deno task dev              # Start backend node
deno task testnet          # Start in testnet mode
deno task frontend:dev     # Start frontend dev server
deno task frontend:build   # Production frontend build
deno task contract:compile # Compile the Compact contract

# Frontend (packages/frontend/)
npm install
npm run dev                # Dev server (http://localhost:3002)
npm run build              # Production build
npm run preview            # Preview production build
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MIDNIGHT_SEED` | `000...001` | Batcher/resolver wallet seed (32-byte hex) |
| `RESOLVER_ADDRESS` | `0x000...001` | Wallet address allowed to create/resolve markets |
| `INDEXER_HTTP_URL` | `http://localhost:8088/api/v3/graphql` | Midnight indexer HTTP endpoint |
| `INDEXER_WS_URL` | `ws://localhost:8088/api/v3/graphql/ws` | Midnight indexer WebSocket endpoint |
| `NODE_URL` | `http://localhost:9944` | Midnight node RPC endpoint |
| `PROOF_SERVER_URL` | `http://localhost:6300` | Midnight proof server endpoint |
| `EFFECTSTREAM_ENV` | `dev` | Set to `testnet` for testnet mode |
| `DISCORD_CLIENT_ID` | — | Discord OAuth app client ID (optional) |
| `DISCORD_CLIENT_SECRET` | — | Discord OAuth app client secret (optional) |
| `VITE_API_BASE` | `""` | Override API base URL (leave empty to use Vite proxy) |
| `VITE_MIDNIGHT_NETWORK_ID` | `undeployed` | Midnight network ID for the Lace wallet |

## Database Schema

Postgres tables:

- **markets** — Market metadata (title, status, close time, resolved option)
- **market_options** — Available options per market (labels only; stakes are private)
- **bets** — One bet per user per market; stores `commitment` (not the raw option)
- **user_profiles** — Display names, point balances, Discord links, leaderboard stats

Migrations are defined in [packages/client/database/src/mod.ts](packages/client/database/src/mod.ts).

## Blockchain Commands (Grammar)

Commands are submitted as pipe-delimited strings via the Paima batcher:

| Command | Format | Description |
|---------|--------|-------------|
| Register | `reg\|displayName` | Set display name, mint 1000 starting points |
| Place bet | `b\|marketId\|commitment\|amount` | Bet with private option (commitment = hash of choice) |
| Claim winnings | `cw\|marketId\|optionId\|blinding` | Prove correct pick in ZK, receive 2× stake |
| Create market | `cm\|marketId\|title\|description\|category\|closeTime` | Admin only |
| Close market | `clm\|marketId` | Admin only |
| Resolve market | `rm\|marketId\|winningOptionId` | Admin only |
| Link Discord | `discord\|walletAddress\|discordUsername` | Link Discord account |

See [packages/shared/data-types/src/grammar.ts](packages/shared/data-types/src/grammar.ts).

## Technology Stack

- **Backend**: Deno, TypeScript, Paima Engine, Fastify, Postgres
- **Frontend**: Vite, TypeScript (no framework)
- **Blockchain**: Midnight (Compact language, ZK proofs, Lace wallet)
- **Privacy**: Commitment + blinding factor scheme, `persistentHash` from `@midnight-ntwrk/compact-runtime`

## Resources

- [Midnight Network](https://midnight.network/)
- [Lace Wallet](https://www.lace.io/)
- [Paima Engine](https://docs.paimastudios.com/)
- [Compact Language Docs](https://docs.midnight.network/)

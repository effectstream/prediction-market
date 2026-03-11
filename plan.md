# Simple Prediction Market

## Summary

Build a lightweight, low-friction prediction market where users can place simple bets on culturally relevant events (e.g., Super Bowl winner, awards, viral moments).

The primary goal is user engagement + Discord growth, not financial sophistication. This is designed as a social, fun, and repeatable mechanic that introduces users to the ecosystem and nudges them into Discord for results, rewards, and community discussion.

## Goals

1. Drive new users into Discord
2. Encourage repeat engagement
3. Create lightweight social participation (not hardcore trading)
4. Validate appetite for future market/game mechanics

## Non-Goals

- No complex DeFi mechanics
- No open-ended markets or long-tail instruments
- No professional trading UX
- No secondary market / order books

---

## Core Feature Set (V1)

### 1. Prediction Markets

Each market is:
- Binary or multi-choice
- Time-bound
- Clearly resolvable

**Examples**
- Who will win the Super Bowl?
- Will Taylor Swift attend the Super Bowl? (Yes / No)
- Will Team A score first?
- Will X movie win Best Picture?

### 2. Betting Mechanics

- Users receive **free points** on signup (no real money)
- Fixed bet size options (10 / 25 / 50 points)
- One bet per market per user (keeps it simple)

**Outcome**
- Winning users receive proportional payout from the total pool
- Losing users lose their stake
- Leaderboard updates after resolution

### 3. Rewards & Incentives

Points can be used for:
- Leaderboards (weekly / event-based)
- Discord roles (e.g. "Oracle", "Prophet", "Super Bowl Sage")
- Eligibility for raffles / giveaways (merch, NFTs, shoutouts)

---

## Discord Growth Loop (Critical)

### Mandatory Discord Touchpoints

- **Account linking**: Users must link Discord to claim rewards, appear on leaderboard, and receive role upgrades
- **Results revealed on Discord first**: Winners announced in a dedicated channel; claim button links back to Discord
- **Discussion-driven markets**: Market pages show "Join the discussion on Discord →"

---

## User Flow

### New User

1. Lands on prediction market page
2. Connects Midnight wallet (extension)
3. Receives 1000 free points automatically (registerUser circuit)
4. Sees active markets
5. Places bet
6. Prompted: "Link Discord to track results & earn rewards"

### Existing User

1. Receives Discord ping: "New market live"
2. Clicks through → places bet
3. Returns to Discord for results, leaderboard movement, role updates

### After Resolution

1. Admin resolves market via admin panel
2. Discord announcement posted
3. Winners see "Claim Winnings" button in My Bets
4. User claims → Midnight transaction credits their balance

---

## Market Lifecycle

1. Market created (admin panel → on-chain via batcher)
2. Market opens for bets
3. Market closes (lock time — no more bets)
4. Outcome resolved manually by admin oracle
5. Bets settled automatically in Postgres; on-chain resolution sent to Midnight
6. Winners claim via UI → batcher submits claimWinnings circuit
7. Discord announcement + leaderboard update

---

## Admin / Ops

- Create markets: title, description, category, close time, options (default yes/no)
- Close market manually (or auto at close_time)
- Resolve market: pick winning option
- Trigger Discord announcements
- All operations protected by RESOLVER_ADDRESS env var check

---

## UX Requirements

- Extremely simple UI
- No charts, no probabilities shown
- Clear "Bet → Wait → Results" loop
- Fun copy, emojis encouraged
- Mobile-friendly layout

---

## Trust & Safety

- Clear disclaimer: "For fun / points only"
- Transparent resolution source
- Visible countdown timers
- Immutable result once resolved (Midnight contract enforces)

---

# Implementation

## Architecture Overview

```
Frontend (Vite/TS)
  └─ calls REST API

Node / API Server (Deno, Paima runtime)
  ├─ REST API (Fastify)
  ├─ State machine (processes on-chain commands)
  └─ Batcher client (fire-and-forget Midnight calls)

Batcher (Deno)
  └─ MidnightAdapter → submits circuit calls to Midnight network

Midnight Contract (Compact)
  └─ Authoritative on-chain state: balances, markets, bets

Postgres (Paima EffectStream)
  └─ Projection of on-chain state for fast queries
```

---

## Contract (`PredictionMarket.compact`)

### Ledger State

```
resolverKey: ZswapCoinPublicKey           // set at deploy; only this key can create/close/resolve markets
initialized: Boolean
balances: Map<ZswapCoinPublicKey, Uint<128>>
markets: Map<Bytes<32>, Market>           // keyed by marketId hash
bets: Map<Bytes<32>, Bet>                 // keyed by hash(marketId, userKey)
optionStakes: Map<Bytes<32>, Uint<128>>   // per-option totals, keyed by hash(marketId, optionId)
```

### Structs

```
struct Market {
  status: Uint<8>              // 0=open, 1=closed, 2=resolved
  resolvedOptionId: Bytes<32>
  totalStaked: Uint<128>
  winnerTotalStaked: Uint<128> // total staked on winning option (set at resolution)
}

struct Bet {
  optionId: Bytes<32>
  amount: Uint<128>
  claimed: Boolean
}
```

### Circuits

| Circuit | Auth | Description |
|---|---|---|
| `initialize(resolverKey)` | anyone (once) | Set resolver key, idempotent |
| `registerUser(userKey)` | anyone | Mint 1000 pts to new user, idempotent |
| `createMarket(marketId)` | resolver only | Assert unique, mark open |
| `closeMarket(marketId)` | resolver only | Assert open, mark closed |
| `resolveMarket(marketId, winningOptionId)` | resolver only | Store winner + winnerTotalStaked |
| `placeBet(marketId, optionId, userKey, amount)` | batcher (submits for user) | Deduct balance, record bet |
| `claimWinnings(marketId, userKey, payoutWitness, remainderWitness)` | batcher (submits for user) | Verify payout math, credit balance |

**Payout formula** (no division in Compact):
Payout = `userStake * totalStaked / winnerTotalStaked` (floor)
Verified on-chain via witness: `payout * winnerStaked + remainder == userStake * totalStaked`

### Status

✅ Fully implemented and compiled
✅ All circuits tested in-memory (`deno task contract:test`)

---

## Grammar (Concise-Encoded Commands)

```
registeredUser:   reg|displayName
placedBet:        b|marketId|optionId|amount
createdMarket:    cm|marketId|title|description|category|closeTime
closedMarket:     clm|marketId
resolvedMarket:   rm|marketId|winningOptionId
claimedWinnings:  cw|marketId
linkedDiscord:    discord|walletAddress|discordUsername
```

### Status

✅ All 7 commands implemented in grammar.ts

---

## Database Schema

Tables: `user_profiles`, `markets`, `market_options`, `bets`
Uses Paima EffectStream's `effectstream.addresses` for wallet → account_id mapping.

Key invariants:
- `bets` has `UNIQUE (market_id, account_id)` — one bet per market per user
- `user_profiles.points` starts at 1000, decremented on bet, incremented on win
- Payout computed with floor-division SQL on resolution

### Status

✅ Schema complete (`packages/client/database/migrations/database.sql`)
✅ Query helpers complete (`packages/client/database/src/mod.ts`)

---

## State Machine

Each handler: updates Postgres projection + fire-and-forget batcher call.
Handlers are generators (`function*`) — cannot use `await`; async work uses `.then()/.catch()`.

### Status

✅ All 7 handlers implemented (`packages/client/node/src/state-machine.ts`)

---

## API Endpoints

| Method | Route | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/markets` | List open markets with options |
| GET | `/api/markets/:id` | Single market + options |
| POST | `/api/admin/markets` | Create market (resolver) |
| POST | `/api/admin/markets/:id/close` | Close market (resolver) |
| POST | `/api/admin/markets/:id/resolve` | Resolve + settle bets (resolver) |
| POST | `/api/bets` | Place bet |
| POST | `/api/bets/:id/claim` | Claim winnings |
| GET | `/api/user/:wallet` | User profile + points |
| GET | `/api/user/:wallet/bets` | User's bet history |
| GET | `/api/leaderboard` | Top 20 ranked by points |

### Status

✅ All endpoints implemented (`packages/client/node/src/api.ts`)
⚠️ Admin endpoints have no auth gate yet (env var check only)

---

## Batcher

Holds a funded Midnight wallet (`MIDNIGHT_SEED`). Submits all circuit calls on behalf of users so users need no dust.

### Status

✅ Wired and running (`packages/client/batcher/`)
✅ Contract JSON path fixed (explicit `baseDir` via `import.meta.url`)
⚠️ Contract address is empty stub until first deployment

---

## Frontend

Vanilla TypeScript + Vite. No framework.
Screens: Markets, Market Detail, My Bets, Leaderboard, Profile.

### Wallet Connection

The frontend needs to connect to a **Midnight wallet** (browser extension) to:
1. Get the user's `ZswapCoinPublicKey` (passed to batcher for circuit calls)
2. Sign commands submitted to the Paima chain (EVM-style address used as user identity)

The wallet provides two identities:
- **EVM address** (`walletAddress`) — used as Paima identity, passed to API
- **ZswapCoinPublicKey** — used in Midnight circuits for balances and bets

### API Integration (`API_BASE = http://localhost:9999`)

All API calls use the connected wallet's EVM address as identity. No session tokens — the wallet address is the user ID.

### Status

✅ All screens built with correct layout and UX
✅ Types defined (`types.ts`)
❌ All data is hardcoded dummy data — no real API calls
❌ Wallet connection is faked (generates dummy address)
❌ Bet placement is local-only (does not call `/api/bets`)
❌ No claim winnings button/flow
❌ No display name registration on first connect
❌ Discord linking is a placeholder
❌ No admin panel

---

# Remaining Work

## Phase 2 — Full Functionality

### 2.1 Wallet Connection
- Integrate Midnight wallet extension (or MetaMask as fallback for EVM address only)
- On connect: get EVM address + ZswapCoinPublicKey
- Store both in app state
- On first connect: call `POST /api/bets` is not needed — `GET /api/user/:wallet` returns `isNew: true`
- Trigger `registeredUser` command via batcher to mint points on-chain
- Show display name prompt on first connect

### 2.2 API Wiring — Markets
- `MarketsScreen`: fetch `GET /api/markets` on mount; poll every 30s
- `MarketDetailScreen`: fetch `GET /api/markets/:id` on open

### 2.3 API Wiring — Bets
- `MarketDetailScreen` "Place Bet": call `POST /api/bets` with `{ marketId, optionId, amount, walletAddress }`
- On success: refresh market + user profile
- `MyBetsScreen`: fetch `GET /api/user/:wallet/bets` on mount

### 2.4 API Wiring — User Profile
- On wallet connect: fetch `GET /api/user/:wallet`
- Refresh after bet placement and after claiming winnings
- Show real points in nav bar

### 2.5 API Wiring — Leaderboard
- `LeaderboardScreen`: fetch `GET /api/leaderboard` on mount

### 2.6 Claim Winnings
- `MyBetsScreen`: show "Claim" button on bets where `status === "won"`
- Call `POST /api/bets/:marketId/claim` with `{ walletAddress }`
- On success: refresh user profile (points updated)

### 2.7 Display Name Registration
- On first connect (when `isNew: true` from API): show modal/prompt asking for display name
- Submit `registeredUser` command via batcher: `reg|displayName`
- Fall back to truncated wallet address if skipped

### 2.8 Admin Panel
- Simple password-protected page (or separate URL, gated by `RESOLVER_ADDRESS` env var)
- Create market form: title, description, category, close time, options
- Market list with "Close" and "Resolve" buttons (resolve requires picking winning option)
- Calls `POST /api/admin/markets`, `POST /api/admin/markets/:id/close`, `POST /api/admin/markets/:id/resolve`

### 2.9 Discord Linking
- "Link Discord" button → Discord OAuth redirect
- OAuth callback endpoint: `GET /api/user/discord/callback`
- Stores Discord username + marks `discord_linked = true` in DB
- Triggers `linkedDiscord` state machine command

---

## Phase 3 — Polish & Deployment

### 3.1 Midnight Testnet Deployment
- Run `deploy.ts` against Midnight testnet
- Set `MIDNIGHT_CONTRACT_ADDRESS` env var on batcher + node
- Update `prediction-market-contract.undeployed.json` with real address

### 3.2 Discord Bot
- Post announcement when market is created (new market ping)
- Post results when market is resolved (winner announcement)
- Assign roles based on points thresholds ("Oracle", "Prophet", "Super Bowl Sage")

### 3.3 Auto-close Markets
- Cron job or Paima block hook to auto-close markets at `close_time`
- Calls `POST /api/admin/markets/:id/close` when `close_time` is passed

### 3.4 Error Handling & UX Polish
- User-friendly error messages for: insufficient points, market closed, already bet, wallet not connected
- Loading states on all async operations
- Optimistic UI updates on bet placement

### 3.5 Mobile Layout
- Verify all screens are usable on mobile
- Adjust nav for small screens

---

## File Structure

```
packages/
  shared/
    contracts/
      midnight/
        prediction-market-contract/
          src/
            PredictionMarket.compact        ✅ implemented
            _index.ts                       ✅ witnesses + exports
            test-contract.ts               ✅ in-memory test suite
          deno.json
        prediction-market-contract.undeployed.json  ✅ stub (empty address)
        deploy.ts                           ✅ deployment script
        deno.json
    data-types/
      src/
        grammar.ts                          ✅ all 7 commands
        types.ts
  client/
    batcher/
      src/
        main.ts                             ✅
        config.ts                           ✅
        adapter-midnight.ts                 ✅ (fixed baseDir)
      deno.json
    node/
      src/
        state-machine.ts                    ✅ all 7 handlers
        api.ts                              ✅ all endpoints
        batcher-client.ts                   ✅
      deno.json
    database/
      src/
        mod.ts                              ✅ all queries
      migrations/
        database.sql                        ✅
  frontend/
    src/
      App.ts                                ✅ built, ❌ needs API wiring
      types.ts                              ✅
      utils.ts                              ✅
      dummy-data.ts                         → replace with real API calls
      screens/
        MarketsScreen.ts                    ✅ built, ❌ needs API wiring
        MarketDetailScreen.ts               ✅ built, ❌ needs API wiring
        MyBetsScreen.ts                     ✅ built, ❌ needs claim button + API
        LeaderboardScreen.ts                ✅ built, ❌ needs API wiring
        ProfileScreen.ts                    ✅ built, ❌ needs API wiring
      components/
        Nav.ts                              ✅
        MarketCard.ts                       ✅
        ConnectBanner.ts                    ✅
        Logo.ts                             ✅
    package.json

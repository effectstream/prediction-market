# **Simple Prediction Market** 

# **Summary**

Build a lightweight, low-friction prediction market where users can place simple bets on culturally relevant events (e.g., Super Bowl winner, awards, viral moments).  
 The primary goal is user engagement \+ Discord growth, not financial sophistication.

This is designed as a social, fun, and repeatable mechanic that introduces users to the ecosystem and nudges them into Discord for results, rewards, and community discussion.

## **Goals**

1. Drive new users into Discord  
2. Encourage repeat engagement   
3. Create lightweight social participation (not hardcore trading)  
4. Validate appetite for future market/game mechanics

## **Non-Goals**

* No complex DeFi mechanics  
* No open-ended markets or long-tail instruments  
* No professional trading UX  
* No secondary market / order books

## **Core Feature Set (V1)**

### **1\. Prediction Markets**

Each market is:

* Binary or multi-choice  
* Time-bound  
* Clearly resolvable

**Examples**

* Who will win the Super Bowl?  
* Will Taylor Swift attend the Super Bowl? (Yes / No)  
* Will Team A score first?  
* Will X movie win Best Picture?

### **2\. Betting Mechanics**

* Users receive **free points** on signup (no real money)  
* Fixed bet size options (ex 10 / 25 / 50 points)  
* One bet per market per user (keeps it simple)

**Outcome**

* Winning users receive points  
* Losing users lose their stake  
* Leaderboard updates after resolution

### **3\. Rewards & Incentives**

Points can be used for:

* Leaderboards (weekly / event-based)  
* Discord roles (e.g. “Oracle”, “Prophet”, “Super Bowl Sage”)  
* Eligibility for raffles / giveaways (merch, NFTs, shoutouts)

## **Discord Growth Loop (Critical)**

### **Mandatory Discord Touchpoints**

* **Account linking**:  
   Users must link Discord to:  
  * Claim rewards  
  * Appear on leaderboard  
  * Receive role upgrades

* **Results revealed on Discord first**  
  * Winners announced in a dedicated channel  
  * Claim button links back to Discord

* **Discussion-driven markets**  
  * Market pages show:  
     “Join the discussion on Discord →”

## **User Flow**

### **New User**

1. Lands on prediction market page  
2. Sees active markets (Super Bowl highlighted)  
3. Places bet using free points  
4. Prompted:  
    “Link Discord to track results & earn rewards”

### **Existing User**

1. Receives Discord ping: “New market live”  
2. Clicks through → places bet  
3. Returns to Discord for:  
   * Results  
   * Leaderboard movement  
   * Role updates

## **Market Lifecycle**

1. Market created (admin)  
2. Market opens for bets  
3. Market closes (lock time)  
4. Outcome resolved (manual oracle in v1)  
5. Rewards distributed  
6. Discord announcement \+ leaderboard update

## **Admin / Ops Requirements**

* Create / edit markets  
* Set:  
  * Title  
  * Options  
  * Close time

* Resolve outcome manually  
* Trigger Discord announcements

## **UX Requirements**

* Extremely simple UI  
* No charts, no probabilities  
* Clear “Bet → Wait → Results” loop  
* Fun copy, emojis encouraged

## **Trust & Safety**

* Clear disclaimer: “For fun / points only”  
* Transparent resolution source  
* Visible countdown timers  
* Immutable result once resolved


# ** Implementation **

## ** Contract **

The betting logic and token balances are represented in a single Midnight contract written in Compact (`PredictionMarket.compact`).

### **Ledger State**

```
ledger resolverKey: ZswapCoinPublicKey        // set at deploy time from env var; only this key can resolve markets
ledger markets: Map<Bytes<32>, Market>        // keyed by marketId (hash of title+timestamp)
ledger bets: Map<Bytes<32>, Bet>              // keyed by hash(marketId, userKey)
ledger balances: Map<ZswapCoinPublicKey, Uint<128>>  // fungible point token balances
```

### **Structs**

```
struct Market {
  status: Uint<8>              // 0=open, 1=closed, 2=resolved
  resolvedOptionId: Bytes<32>  // set on resolution
  totalStaked: Uint<128>       // total points staked across all options
}

struct Bet {
  user: ZswapCoinPublicKey
  optionId: Bytes<32>
  amount: Uint<128>
  claimed: Boolean
}
```

### **Circuits**

- `placeBet(marketId, optionId, userKey, amount)` — batcher submits on behalf of user; deducts from user balance; asserts market is open and user has no existing bet on this market
- `resolveMarket(marketId, winningOptionId)` — asserts `ownPublicKey() == resolverKey`; marks market resolved
- `claimWinnings(marketId)` — user calls directly; asserts market is resolved and caller won; mints proportional payout to caller's balance; marks bet as claimed

### **Resolver Key**

The resolver key (`resolverKey`) is the `ZswapCoinPublicKey` derived from the batcher's `MIDNIGHT_SEED` env var. It is passed as a constructor argument at deploy time — no key material is hardcoded in the contract. The Paima node's state machine triggers resolution by submitting a `resolveMarket` circuit call through the batcher when an admin sends a `resolveMarket` Paima command.

### **Token Mechanics**

- Tokens are fungible point balances stored in the contract ledger (not a separate ERC-20 contract)
- New users receive 1000 points minted to their balance at registration
- Winning payout is proportional: `winnerStake / totalWinnerStake * totalPoolStaked`
- Losing bets forfeit their stake (no refund)
- Tokens can be used for future bets (spent from ledger balance)

## ** Batcher **

To simplify engagement and eliminate the need for users to hold dust (the token needed to pay gas for Midnight transactions), a batcher application in the backend handles all blockchain interactions on behalf of users.

The batcher pattern is modeled on the night-bitcoin template:
> https://github.com/PaimaStudios/paima-engine/tree/v-next/templates/night-bitcoin

The batcher holds a funded Midnight wallet (seed from `MIDNIGHT_SEED` env var). When a user places a bet via the frontend, the Paima node processes the intent and the batcher submits the `placeBet` circuit call to the Midnight contract, passing the user's `ZswapCoinPublicKey` explicitly as a parameter (since `ownPublicKey()` inside the circuit would return the batcher's key, not the user's).

### **Dividing Up Winnings**

Compact `for` loops require a hardcoded constant iteration count — you cannot loop over an unbounded number of winners. This rules out a "distribute to all" circuit.

**Solution: user-initiated claims.** After a market is resolved, each winning user calls `claimWinnings(marketId)` themselves. This is a single circuit call per user, which is acceptable. The batcher can optionally assist with this call as well (same gasless UX). The `claimed` flag on each `Bet` struct prevents double-claiming.

## ** File Structure **

The batcher lives under `packages/client/batcher/` following the go-fish pattern (no separate `filler/` directory).

```
packages/
  shared/
    contracts/
      midnight/
        prediction-market-contract/
          src/
            PredictionMarket.compact   # main contract
          deno.json
  client/
    batcher/
      src/
        main.ts                        # batcher process
        config.ts                      # reads MIDNIGHT_SEED, contract address
        adapter-midnight.ts            # Midnight adapter wiring
    node/
      src/
        state-machine.ts               # handles placeBet, resolveMarket commands
        api.ts                         # REST endpoints
```
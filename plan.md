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


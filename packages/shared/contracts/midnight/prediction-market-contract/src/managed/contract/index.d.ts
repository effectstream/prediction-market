import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  initialize(context: __compactRuntime.CircuitContext<PS>,
             resolverKey__0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  registerUser(context: __compactRuntime.CircuitContext<PS>,
               userKey_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  createMarket(context: __compactRuntime.CircuitContext<PS>,
               marketId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  closeMarket(context: __compactRuntime.CircuitContext<PS>,
              marketId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  resolveMarket(context: __compactRuntime.CircuitContext<PS>,
                marketId_0: Uint8Array,
                winningOptionId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  placeBet(context: __compactRuntime.CircuitContext<PS>,
           marketId_0: Uint8Array,
           optionId_0: Uint8Array,
           userKey_0: { bytes: Uint8Array },
           amount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  claimWinnings(context: __compactRuntime.CircuitContext<PS>,
                marketId_0: Uint8Array,
                userKey_0: { bytes: Uint8Array },
                payoutWitness_0: bigint,
                remainderWitness_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  getBalance(context: __compactRuntime.CircuitContext<PS>,
             userKey_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, bigint>;
  getMarketStatus(context: __compactRuntime.CircuitContext<PS>,
                  marketId_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
  getMarketTotalStaked(context: __compactRuntime.CircuitContext<PS>,
                       marketId_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
  getWinnerStakeForOption(context: __compactRuntime.CircuitContext<PS>,
                          marketId_0: Uint8Array,
                          optionId_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
  getBetAmount(context: __compactRuntime.CircuitContext<PS>,
               marketId_0: Uint8Array,
               userKey_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, bigint>;
  getBetOptionId(context: __compactRuntime.CircuitContext<PS>,
                 marketId_0: Uint8Array,
                 userKey_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, Uint8Array>;
  isBetClaimed(context: __compactRuntime.CircuitContext<PS>,
               marketId_0: Uint8Array,
               userKey_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, boolean>;
  isUserRegistered(context: __compactRuntime.CircuitContext<PS>,
                   userKey_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, boolean>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  initialize(context: __compactRuntime.CircuitContext<PS>,
             resolverKey__0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  registerUser(context: __compactRuntime.CircuitContext<PS>,
               userKey_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  createMarket(context: __compactRuntime.CircuitContext<PS>,
               marketId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  closeMarket(context: __compactRuntime.CircuitContext<PS>,
              marketId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  resolveMarket(context: __compactRuntime.CircuitContext<PS>,
                marketId_0: Uint8Array,
                winningOptionId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  placeBet(context: __compactRuntime.CircuitContext<PS>,
           marketId_0: Uint8Array,
           optionId_0: Uint8Array,
           userKey_0: { bytes: Uint8Array },
           amount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  claimWinnings(context: __compactRuntime.CircuitContext<PS>,
                marketId_0: Uint8Array,
                userKey_0: { bytes: Uint8Array },
                payoutWitness_0: bigint,
                remainderWitness_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  getBalance(context: __compactRuntime.CircuitContext<PS>,
             userKey_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, bigint>;
  getMarketStatus(context: __compactRuntime.CircuitContext<PS>,
                  marketId_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
  getMarketTotalStaked(context: __compactRuntime.CircuitContext<PS>,
                       marketId_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
  getWinnerStakeForOption(context: __compactRuntime.CircuitContext<PS>,
                          marketId_0: Uint8Array,
                          optionId_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
  getBetAmount(context: __compactRuntime.CircuitContext<PS>,
               marketId_0: Uint8Array,
               userKey_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, bigint>;
  getBetOptionId(context: __compactRuntime.CircuitContext<PS>,
                 marketId_0: Uint8Array,
                 userKey_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, Uint8Array>;
  isBetClaimed(context: __compactRuntime.CircuitContext<PS>,
               marketId_0: Uint8Array,
               userKey_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, boolean>;
  isUserRegistered(context: __compactRuntime.CircuitContext<PS>,
                   userKey_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, boolean>;
}

export type Ledger = {
  readonly resolverKey: { bytes: Uint8Array };
  readonly initialized: boolean;
  balances: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: { bytes: Uint8Array }): boolean;
    lookup(key_0: { bytes: Uint8Array }): bigint;
    [Symbol.iterator](): Iterator<[{ bytes: Uint8Array }, bigint]>
  };
  markets: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): { status: bigint,
                                 resolvedOptionId: Uint8Array,
                                 totalStaked: bigint,
                                 winnerTotalStaked: bigint
                               };
    [Symbol.iterator](): Iterator<[Uint8Array, { status: bigint,
  resolvedOptionId: Uint8Array,
  totalStaked: bigint,
  winnerTotalStaked: bigint
}]>
  };
  bets: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): { optionId: Uint8Array,
                                 amount: bigint,
                                 claimed: boolean
                               };
    [Symbol.iterator](): Iterator<[Uint8Array, { optionId: Uint8Array, amount: bigint, claimed: boolean }]>
  };
  optionStakes: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;

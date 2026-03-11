import type { UserBet, Market } from "../types.ts";
import { formatDate, formatPoints } from "../utils.ts";
import { getLocalBetOption } from "../api-client.ts";

interface MyBetsProps {
  bets: UserBet[];
  markets: Market[];
  walletConnected: boolean;
  walletAddress?: string;
  onOpenMarket: (marketId: string) => void;
  onClaimWinnings: (marketId: string) => void;
}

export function renderMyBetsScreen(props: MyBetsProps): string {
  const { bets, markets, walletConnected, walletAddress } = props;

  if (!walletConnected) {
    return `
      <div class="screen-my-bets">
        <div class="page-header">
          <h1 class="page-title">🎯 My Bets</h1>
        </div>
        <div class="empty-state">
          <span class="empty-icon">🔒</span>
          <p>Connect your wallet to see your bets.</p>
          <button class="btn btn-primary" data-connect-wallet>Connect Wallet</button>
        </div>
      </div>
    `;
  }

  if (bets.length === 0) {
    return `
      <div class="screen-my-bets">
        <div class="page-header">
          <h1 class="page-title">🎯 My Bets</h1>
        </div>
        <div class="empty-state">
          <span class="empty-icon">🎲</span>
          <p>No bets placed yet. Go pick a market and make your prediction!</p>
          <button class="btn btn-primary" data-navigate="markets">Browse Markets</button>
        </div>
      </div>
    `;
  }

  const pending = bets.filter((b) => b.status === "pending");
  const claimed = bets.filter((b) => b.status === "claimed");

  // Claimable = pending bets on resolved markets
  const resolvedMarketIds = new Set(
    markets.filter((m) => m.status === "resolved").map((m) => m.marketId)
  );
  const claimable = pending.filter((b) => resolvedMarketIds.has(b.marketId));

  const totalStaked = bets.reduce((s, b) => s + b.amount, 0);
  const totalClaimed = claimed.reduce((s, b) => s + (b.payout ?? 0), 0);

  const renderBet = (bet: UserBet) => {
    const market = markets.find((m) => m.marketId === bet.marketId);
    const isResolved = market?.status === "resolved";

    // Resolve option label from localStorage (option is private — not stored server-side)
    const localBet = walletAddress ? getLocalBetOption(bet.marketId, walletAddress) : null;
    const optionLabel = localBet
      ? (market?.options.find((o) => o.optionId === localBet.optionId)?.label ?? localBet.optionId)
      : null;

    const statusIcon = bet.status === "claimed" ? "✅" : isResolved ? "🏆" : "⏳";
    const statusLabel =
      bet.status === "claimed"
        ? `Claimed ${bet.payout ?? 0} pts`
        : isResolved
        ? "Ready to claim!"
        : "Pending";

    const claimButton =
      bet.status === "pending" && isResolved
        ? `<button class="btn btn-sm btn-primary claim-btn"
                  data-claim-winnings="${bet.marketId}">
             Claim 🏆
           </button>`
        : "";

    const missingReceiptWarning =
      bet.status === "pending" && isResolved && !localBet
        ? `<p class="missing-receipt-warning">⚠️ Claim data not found in browser storage. You may need your saved claim receipt.</p>`
        : "";

    return `
      <div class="bet-row ${bet.status === "claimed" ? "bet-row--claimed" : ""}">
        <div class="bet-row-info" data-open-market="${bet.marketId}" style="cursor:pointer">
          <p class="bet-market-title">${bet.marketTitle}</p>
          <p class="bet-option-label">
            ${statusIcon}
            ${optionLabel ? optionLabel : '<span class="private-label">🔒 Private pick</span>'}
          </p>
          <p class="bet-date">Placed ${formatDate(bet.placedAt)}</p>
          ${missingReceiptWarning}
        </div>
        <div class="bet-row-amount">
          <span class="bet-amount">${bet.amount} pts</span>
          <span class="bet-status ${bet.status}">${statusLabel}</span>
          ${claimButton}
        </div>
      </div>
    `;
  };

  const summaryCards = `
    <div class="bets-summary">
      <div class="summary-card">
        <span class="summary-value">${bets.length}</span>
        <span class="summary-label">Total Bets</span>
      </div>
      <div class="summary-card">
        <span class="summary-value">${formatPoints(totalStaked)}</span>
        <span class="summary-label">Points Staked</span>
      </div>
      <div class="summary-card">
        <span class="summary-value">${pending.length}</span>
        <span class="summary-label">Pending</span>
      </div>
      <div class="summary-card ${totalClaimed > 0 ? "summary-card--positive" : ""}">
        <span class="summary-value">${formatPoints(totalClaimed)}</span>
        <span class="summary-label">Points Claimed</span>
      </div>
    </div>
  `;

  const claimBanner = claimable.length > 0
    ? `<div class="claim-banner">
         🏆 You have <strong>${claimable.length}</strong> bet${claimable.length > 1 ? "s" : ""} ready to claim!
         Scroll down to claim your 2× payout.
       </div>`
    : "";

  return `
    <div class="screen-my-bets">
      <div class="page-header">
        <h1 class="page-title">🎯 My Bets</h1>
        <p class="page-subtitle">Track your predictions — option choices are private 🔒</p>
      </div>

      ${claimBanner}
      ${summaryCards}

      ${pending.length > 0 ? `
        <section>
          <h2 class="section-title">⏳ Pending Results (${pending.length})</h2>
          <div class="bets-list">
            ${pending.map(renderBet).join("")}
          </div>
        </section>` : ""}

      ${claimed.length > 0 ? `
        <section>
          <h2 class="section-title">✅ Claimed Bets (${claimed.length})</h2>
          <div class="bets-list">
            ${claimed.map(renderBet).join("")}
          </div>
        </section>` : ""}
    </div>
  `;
}

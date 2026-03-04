import type { UserBet, Market } from "../types.ts";
import { formatDate, formatPoints } from "../utils.ts";

interface MyBetsProps {
  bets: UserBet[];
  markets: Market[];
  walletConnected: boolean;
  onOpenMarket: (marketId: string) => void;
}

export function renderMyBetsScreen(props: MyBetsProps): string {
  const { bets, walletConnected } = props;

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
  const settled = bets.filter((b) => b.status !== "pending");

  const totalStaked = bets.reduce((s, b) => s + b.amount, 0);
  const totalWon = settled
    .filter((b) => b.status === "won")
    .reduce((s, b) => s + (b.payout ?? 0), 0);

  const renderBet = (bet: UserBet) => {
    const statusIcon =
      bet.status === "won" ? "✅" : bet.status === "lost" ? "❌" : "⏳";
    const statusLabel =
      bet.status === "won"
        ? `Won ${bet.payout ?? 0} pts`
        : bet.status === "lost"
        ? "Lost"
        : "Pending";

    return `
      <div class="bet-row ${bet.status !== "pending" ? `bet-row--${bet.status}` : ""}"
           data-open-market="${bet.marketId}">
        <div class="bet-row-info">
          <p class="bet-market-title">${bet.marketTitle}</p>
          <p class="bet-option-label">${statusIcon} ${bet.optionLabel}</p>
          <p class="bet-date">Placed ${formatDate(bet.placedAt)}</p>
        </div>
        <div class="bet-row-amount">
          <span class="bet-amount">${bet.amount} pts</span>
          <span class="bet-status ${bet.status}">${statusLabel}</span>
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
      <div class="summary-card ${totalWon > 0 ? "summary-card--positive" : ""}">
        <span class="summary-value">${formatPoints(totalWon)}</span>
        <span class="summary-label">Points Won</span>
      </div>
    </div>
  `;

  return `
    <div class="screen-my-bets">
      <div class="page-header">
        <h1 class="page-title">🎯 My Bets</h1>
        <p class="page-subtitle">Track your predictions and see how you're doing!</p>
      </div>

      ${summaryCards}

      ${pending.length > 0 ? `
        <section>
          <h2 class="section-title">⏳ Pending Results (${pending.length})</h2>
          <div class="bets-list">
            ${pending.map(renderBet).join("")}
          </div>
        </section>` : ""}

      ${settled.length > 0 ? `
        <section>
          <h2 class="section-title">📋 Settled Bets</h2>
          <div class="bets-list">
            ${settled.map(renderBet).join("")}
          </div>
        </section>` : ""}
    </div>
  `;
}

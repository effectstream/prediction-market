import type { Market, UserBet } from "../types.ts";
import { formatTimeRemaining, formatPoints, pct, getCategoryColor } from "../utils.ts";

interface MarketDetailProps {
  market: Market;
  existingBet?: UserBet;
  walletConnected: boolean;
  userPoints: number;
  onPlaceBet: (optionId: string, amount: number) => void;
  onBack: () => void;
}

export function renderMarketDetailScreen(props: MarketDetailProps): string {
  const { market, existingBet, walletConnected, userPoints } = props;

  if (!market) {
    return `<div class="empty-state">Market not found. <a href="#" data-back>← Back</a></div>`;
  }

  const totalStaked = market.options.reduce((s, o) => s + o.totalStaked, 0);
  const isOpen = market.status === "open";
  const canBet = isOpen && walletConnected && !existingBet;

  const optionBars = market.options
    .map((opt) => {
      const percent = pct(opt.totalStaked, totalStaked);
      const isWinner = market.resolvedOption === opt.optionId;
      const isMyBet = existingBet?.optionId === opt.optionId;

      return `
        <div class="option-row ${canBet ? "option-row--selectable" : ""} ${isMyBet ? "option-row--my-bet" : ""} ${isWinner ? "option-row--winner" : ""}"
             ${canBet ? `data-option-id="${opt.optionId}"` : ""}>
          <div class="option-info">
            <div class="option-label-row">
              <span class="option-label">${opt.label}</span>
              ${isWinner ? `<span class="winner-tag">✅ Winner</span>` : ""}
              ${isMyBet ? `<span class="my-bet-tag">🎯 Your bet</span>` : ""}
            </div>
            <div class="option-meta">${opt.betCount} bets · ${formatPoints(opt.totalStaked)} pts staked</div>
          </div>
          <div class="option-bar-wrap">
            <div class="option-bar" style="width: ${percent}%"></div>
            <span class="option-pct">${percent}%</span>
          </div>
        </div>
      `;
    })
    .join("");

  const betSection = (() => {
    if (!walletConnected) {
      return `
        <div class="bet-section bet-section--locked">
          <p>Connect your wallet to place a bet on this market.</p>
          <button class="btn btn-primary" data-connect-wallet>Connect Wallet</button>
        </div>
      `;
    }

    if (existingBet) {
      return `
        <div class="bet-section bet-section--placed">
          <div class="placed-bet-info">
            <span class="placed-bet-icon">🎯</span>
            <div>
              <strong>Bet placed!</strong>
              <p>You bet <strong>${existingBet.amount} pts</strong> on <strong>${existingBet.optionLabel}</strong></p>
            </div>
          </div>
          <p class="bet-result-hint">Results will be announced on Discord. Good luck! 🍀</p>
        </div>
      `;
    }

    if (!isOpen) {
      return `
        <div class="bet-section bet-section--locked">
          <p>Betting is now closed for this market. Results coming soon!</p>
        </div>
      `;
    }

    const amounts = [10, 25, 50];
    const amountButtons = amounts
      .map(
        (amt) => `
        <button class="bet-amount-btn ${userPoints < amt ? "disabled" : ""}"
                data-bet-amount="${amt}"
                ${userPoints < amt ? "disabled" : ""}>
          ${amt} pts
        </button>
      `
      )
      .join("");

    return `
      <div class="bet-section">
        <h3 class="bet-section-title">Place Your Bet</h3>
        <p class="bet-section-hint">Select an option above, then choose your stake amount below.</p>
        <div class="bet-amounts">
          ${amountButtons}
        </div>
        <div class="bet-actions">
          <button class="btn btn-primary btn-lg" data-place-bet>
            Confirm Bet 🎲
          </button>
          <span class="user-points">Your balance: <strong>${userPoints.toLocaleString()} pts</strong></span>
        </div>
        <p class="bet-disclaimer">⚠️ For fun only — no real money involved. One bet per market.</p>
      </div>
    `;
  })();

  const timeLabel =
    market.status === "open"
      ? `⏰ Closes in ${formatTimeRemaining(market.closeTime)}`
      : market.status === "closed"
      ? "🔒 Betting closed"
      : "✅ Resolved";

  return `
    <div class="screen-detail">
      <button class="back-btn" data-back>← Back to Markets</button>

      <div class="detail-header">
        <div class="detail-header-meta">
          <span class="category-tag" style="background:${getCategoryColor(market.category)}">${market.category}</span>
          <span class="time-remaining">${timeLabel}</span>
        </div>
        <h1 class="detail-title">${market.title}</h1>
        <p class="detail-description">${market.description}</p>
        <div class="detail-stats">
          <span>${market.totalBets} total bets</span>
          <span>·</span>
          <span>${formatPoints(totalStaked)} pts staked</span>
        </div>
      </div>

      <div class="options-section">
        <h2 class="options-title">${canBet ? "Choose your pick:" : "Options:"}</h2>
        <div class="options-list">
          ${optionBars}
        </div>
      </div>

      ${betSection}

      <div class="discord-row">
        <span>💬 Join the discussion on Discord →</span>
        <a href="#" class="discord-link">Join Discord</a>
      </div>
    </div>
  `;
}

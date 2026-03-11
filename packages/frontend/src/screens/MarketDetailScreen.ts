import type { Market, UserBet } from "../types.ts";
import { formatTimeRemaining, formatTokens, getCategoryColor } from "../utils.ts";
import { getLocalBetOption } from "../api-client.ts";

interface MarketDetailProps {
  market: Market;
  existingBet?: UserBet;
  walletConnected: boolean;
  walletAddress?: string;
  userPoints: number;
  onPlaceBet: (optionId: string, amount: number) => void;
  onBack: () => void;
}

export function renderMarketDetailScreen(props: MarketDetailProps): string {
  const { market, existingBet, walletConnected, walletAddress, userPoints } = props;

  if (!market) {
    return `<div class="empty-state">Market not found. <a href="#" data-back>← Back</a></div>`;
  }

  const isOpen = market.status === "open";
  const canBet = isOpen && walletConnected && !existingBet;

  // Resolve the user's option from localStorage (option choice is private — not in existingBet)
  const localBet = walletAddress
    ? getLocalBetOption(market.marketId, walletAddress)
    : null;
  const myOptionId = localBet?.optionId ?? null;
  const myOptionLabel = myOptionId
    ? (market.options.find((o) => o.optionId === myOptionId)?.label ?? myOptionId)
    : null;

  // Option rows — per-option stakes are hidden (private bets)
  const optionBars = market.options
    .map((opt) => {
      const isWinner = market.resolvedOption === opt.optionId;
      const isMyBet = myOptionId === opt.optionId;

      return `
        <div class="option-row ${canBet ? "option-row--selectable" : ""} ${isMyBet ? "option-row--my-bet" : ""} ${isWinner ? "option-row--winner" : ""}"
             ${canBet ? `data-option-id="${opt.optionId}"` : ""}>
          <div class="option-info">
            <div class="option-label-row">
              <span class="option-label">${opt.label}</span>
              ${isWinner ? `<span class="winner-tag">✅ Winner</span>` : ""}
              ${isMyBet ? `<span class="my-bet-tag">🎯 Your pick</span>` : ""}
            </div>
            <div class="option-meta option-meta--private">🔒 Stakes hidden · ZK private</div>
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
      const receiptData = localBet
        ? JSON.stringify({ optionId: localBet.optionId, blinding: localBet.blinding })
        : null;

      return `
        <div class="bet-section bet-section--placed">
          <div class="placed-bet-info">
            <span class="placed-bet-icon">🎯</span>
            <div>
              <strong>Bet placed!</strong>
              <p>You bet <strong>${existingBet.amount} tkn</strong>${myOptionLabel ? ` on <strong>${myOptionLabel}</strong>` : ""}</p>
              <p class="privacy-note">🔒 Your option is private — proven by zero-knowledge proof</p>
            </div>
          </div>
          ${receiptData ? `
            <details class="claim-receipt">
              <summary>🔑 Save your claim receipt</summary>
              <p class="claim-receipt-warning">⚠️ If you clear browser storage, you'll need this to claim your winnings.</p>
              <code class="claim-receipt-code">${receiptData}</code>
            </details>
          ` : ""}
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
          ${amt} tkn
        </button>
      `
      )
      .join("");

    return `
      <div class="bet-section">
        <h3 class="bet-section-title">Place Your Bet <span class="privacy-badge">🔒 ZK Private</span></h3>
        <p class="bet-section-hint">Select an option above, then choose your stake amount below.</p>
        <p class="privacy-hint">Your choice is hidden on-chain using a zero-knowledge proof. Only you can reveal it.</p>
        <div class="bet-amounts">
          ${amountButtons}
        </div>
        <div class="bet-actions">
          <button class="btn btn-primary btn-lg" data-place-bet>
            Confirm Bet 🎲
          </button>
          <span class="user-points">Your balance: <strong>${userPoints.toLocaleString()} tkn</strong></span>
        </div>
        <p class="bet-disclaimer">⚠️ For fun only — no real money involved. One bet per market. Winners receive 2× their stake.</p>
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
          <span>${formatTokens(market.totalBets * 25)} tkn staked</span>
          <span>·</span>
          <span>🔒 Option distribution hidden</span>
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

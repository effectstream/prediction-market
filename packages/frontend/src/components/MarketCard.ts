import type { Market, UserBet } from "../types.ts";
import { formatTimeRemaining, getCategoryColor, formatPoints } from "../utils.ts";

interface MarketCardProps {
  market: Market;
  existingBet?: UserBet;
}

export function renderMarketCard({ market, existingBet }: MarketCardProps): string {
  const timeLabel = getTimeLabel(market);
  const statusBadge = getStatusBadge(market);

  // Per-option stakes are hidden (private bets) — show only total bets count
  const betBadge = existingBet
    ? `<div class="bet-badge">✅ Bet placed: ${existingBet.amount} pts 🔒</div>`
    : "";

  const resolvedBanner =
    market.status === "resolved" && market.resolvedOption
      ? (() => {
          const winner = market.options.find(
            (o) => o.optionId === market.resolvedOption
          );
          return `<div class="resolved-banner">✅ Resolved: <strong>${winner?.label ?? "Unknown"}</strong></div>`;
        })()
      : "";

  return `
    <div class="market-card ${market.status !== "open" ? "market-card--inactive" : ""}"
         data-open-market="${market.marketId}" role="button" tabindex="0">
      <div class="market-card-header">
        <span class="category-tag" style="background:${getCategoryColor(market.category)}">${market.category}</span>
        ${statusBadge}
      </div>
      <h3 class="market-title">${market.title}</h3>
      <p class="market-desc">${market.description}</p>
      ${resolvedBanner}
      ${betBadge}
      <div class="market-stats">
        <div class="market-stat">
          <span class="stat-value">${market.totalBets}</span>
          <span class="stat-label">bets</span>
        </div>
        <div class="market-stat">
          <span class="stat-value">${market.options.length}</span>
          <span class="stat-label">options</span>
        </div>
        <div class="market-stat">
          <span class="stat-value">🔒</span>
          <span class="stat-label">private bets</span>
        </div>
      </div>
      <div class="market-footer">
        <span class="time-label">${timeLabel}</span>
        ${market.status === "open" ? `<span class="cta-text">Bet now →</span>` : ""}
      </div>
    </div>
  `;
}

function getStatusBadge(market: Market): string {
  if (market.status === "open") return `<span class="status-badge status-open">🟢 Open</span>`;
  if (market.status === "closed") return `<span class="status-badge status-closed">🔒 Closed</span>`;
  return `<span class="status-badge status-resolved">✅ Resolved</span>`;
}

function getTimeLabel(market: Market): string {
  if (market.status === "resolved") return "Resolved";
  if (market.status === "closed") return "Betting closed";
  return `⏰ ${formatTimeRemaining(market.closeTime)} left`;
}

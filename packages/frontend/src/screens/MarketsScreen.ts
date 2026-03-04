import type { Market, UserBet } from "../types.ts";
import { renderMarketCard } from "../components/MarketCard.ts";

interface MarketsScreenProps {
  markets: Market[];
  userBets: UserBet[];
  walletConnected: boolean;
  onOpenMarket: (marketId: string) => void;
}

export function renderMarketsScreen(props: MarketsScreenProps): string {
  const { markets, userBets } = props;

  const openMarkets = markets.filter((m) => m.status === "open");
  const closedMarkets = markets.filter((m) => m.status === "closed");
  const resolvedMarkets = markets.filter((m) => m.status === "resolved");

  const betMap = new Map(userBets.map((b) => [b.marketId, b]));

  const renderSection = (title: string, items: Market[]) => {
    if (items.length === 0) return "";
    const cards = items
      .map((m) => renderMarketCard({ market: m, existingBet: betMap.get(m.marketId) }))
      .join("");
    return `
      <section class="markets-section">
        <h2 class="section-title">${title}</h2>
        <div class="markets-grid">
          ${cards}
        </div>
      </section>
    `;
  };

  return `
    <div class="screen-markets">
      <div class="page-header">
        <div>
          <h1 class="page-title">🔮 Prediction Markets</h1>
          <p class="page-subtitle">Bet on upcoming events using your points. Winners earn more!</p>
        </div>
      </div>

      <div class="discord-callout">
        <div class="discord-callout-content">
          <span class="discord-icon">💬</span>
          <div>
            <strong>Results announced on Discord first!</strong>
            <p>Join the community to get early results, earn Discord roles, and join the discussion.</p>
          </div>
        </div>
        <a href="#" class="btn btn-discord">Join Discord →</a>
      </div>

      ${renderSection("🟢 Open Markets", openMarkets)}
      ${renderSection("🔒 Closed (Pending Results)", closedMarkets)}
      ${renderSection("✅ Resolved Markets", resolvedMarkets)}

      ${markets.length === 0 ? `<div class="empty-state">No markets available yet. Check back soon!</div>` : ""}
    </div>
  `;
}

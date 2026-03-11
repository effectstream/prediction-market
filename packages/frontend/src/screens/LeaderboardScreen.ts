import type { LeaderboardEntry } from "../types.ts";
import { truncateAddress, formatTokens } from "../utils.ts";

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  currentWallet?: string;
}

export function renderLeaderboardScreen(props: LeaderboardProps): string {
  const { entries, currentWallet } = props;

  const rows = entries
    .map((entry, i) => {
      const isMe = entry.walletAddress === currentWallet;
      const rankIcon = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${entry.rank}`;
      const winRate =
        entry.totalBets > 0
          ? Math.round((entry.correctBets / entry.totalBets) * 100)
          : 0;

      const nameDisplay =
        entry.discordUsername ??
        entry.displayName ??
        truncateAddress(entry.walletAddress);

      return `
        <tr class="lb-row ${isMe ? "lb-row--me" : ""}">
          <td class="lb-rank">${rankIcon}</td>
          <td class="lb-player">
            <span class="lb-name">${nameDisplay}</span>
            ${isMe ? `<span class="me-tag">You</span>` : ""}
          </td>
          <td class="lb-points">${entry.tokens.toLocaleString()} tkn</td>
          <td class="lb-bets">${entry.correctBets}/${entry.totalBets}</td>
          <td class="lb-winrate">
            <span class="winrate ${winRate >= 60 ? "winrate--good" : ""}">${winRate}%</span>
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="screen-leaderboard">
      <div class="page-header">
        <h1 class="page-title">🏆 Leaderboard</h1>
        <p class="page-subtitle">Top predictors of the week. Can you make it to the top?</p>
      </div>

      <div class="discord-callout discord-callout--compact">
        <span>🎖️ Top predictors earn exclusive Discord roles!</span>
        <a href="#" class="btn btn-discord btn-sm">Join Discord →</a>
      </div>

      <div class="table-wrap">
        <table class="lb-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Tokens</th>
              <th>Correct/Total</th>
              <th>Win Rate</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>

      ${!currentWallet ? `
        <div class="lb-cta">
          <p>Connect your wallet to appear on the leaderboard!</p>
          <button class="btn btn-primary" data-connect-wallet>Connect Wallet</button>
        </div>
      ` : ""}
    </div>
  `;
}

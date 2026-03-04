import type { UserProfile } from "../types.ts";
import { truncateAddress } from "../utils.ts";

interface ProfileScreenProps {
  profile?: UserProfile;
  walletConnected: boolean;
  onConnectWallet: () => void;
}

export function renderProfileScreen(props: ProfileScreenProps): string {
  const { profile, walletConnected } = props;

  if (!walletConnected || !profile) {
    return `
      <div class="screen-profile">
        <div class="page-header">
          <h1 class="page-title">👤 Profile</h1>
        </div>
        <div class="empty-state">
          <span class="empty-icon">🔮</span>
          <p>Connect your wallet to view and manage your profile.</p>
          <button class="btn btn-primary" data-connect-wallet>Connect Wallet</button>
        </div>
      </div>
    `;
  }

  const winRate =
    profile.totalBets > 0
      ? Math.round((profile.totalWon / profile.totalBets) * 100)
      : 0;

  return `
    <div class="screen-profile">
      <div class="page-header">
        <h1 class="page-title">👤 Profile</h1>
      </div>

      <div class="profile-card">
        <div class="profile-avatar">${profile.displayName ? profile.displayName[0].toUpperCase() : "?"}</div>
        <div class="profile-info">
          <h2 class="profile-name">${profile.displayName ?? "Anonymous"}</h2>
          <p class="profile-wallet">${truncateAddress(profile.walletAddress)}</p>
        </div>
      </div>

      <div class="profile-stats">
        <div class="profile-stat">
          <span class="stat-value">${profile.points.toLocaleString()}</span>
          <span class="stat-label">⚡ Points</span>
        </div>
        <div class="profile-stat">
          <span class="stat-value">${profile.totalBets}</span>
          <span class="stat-label">🎲 Total Bets</span>
        </div>
        <div class="profile-stat">
          <span class="stat-value">${profile.totalWon}</span>
          <span class="stat-label">✅ Correct</span>
        </div>
        <div class="profile-stat">
          <span class="stat-value">${winRate}%</span>
          <span class="stat-label">🎯 Win Rate</span>
        </div>
      </div>

      <div class="profile-section">
        <h3>Discord Integration</h3>
        ${
          profile.discordLinked
            ? `<div class="discord-linked">
                <span>✅ Linked: <strong>${profile.discordUsername}</strong></span>
              </div>`
            : `<div class="discord-unlinked">
                <p>Link your Discord to appear on the leaderboard and earn exclusive roles!</p>
                <a href="#" class="btn btn-discord">Link Discord Account</a>
              </div>`
        }
      </div>

      <div class="profile-section">
        <h3>About Points</h3>
        <div class="points-explainer">
          <p>🎁 You start with <strong>1,000 free points</strong> — no real money needed!</p>
          <p>💡 Points are used for fun only. Win predictions to grow your balance and climb the leaderboard.</p>
          <p>🏆 Top players earn Discord roles: Oracle, Prophet, Super Bowl Sage...</p>
        </div>
      </div>

      <div class="profile-section">
        <h3>Built on Midnight</h3>
        <div class="midnight-badge">
          <span class="midnight-icon">🌙</span>
          <div>
            <strong>Powered by the Midnight Blockchain</strong>
            <p>Each bet generates unique stake tokens on the Midnight network, ensuring transparent and verifiable prediction outcomes.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

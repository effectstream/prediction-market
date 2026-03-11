import type { AppScreen, UserProfile } from "../types.ts";
import { renderLogoCanvas } from "./Logo.ts";

interface NavProps {
  currentScreen: AppScreen;
  walletConnected: boolean;
  userProfile?: UserProfile;
  onNavigate: (screen: AppScreen) => void;
  onConnectWallet: () => void;
}

export function renderNav(props: NavProps): string {
  const { currentScreen, walletConnected, userProfile } = props;

  const navItems: { screen: AppScreen; label: string; emoji: string }[] = [
    { screen: "markets", label: "Markets", emoji: "🔮" },
    { screen: "my-bets", label: "My Bets", emoji: "🎯" },
    { screen: "leaderboard", label: "Leaderboard", emoji: "🏆" },
    { screen: "profile", label: "Profile", emoji: "👤" },
  ];

  const navLinks = navItems
    .map(
      ({ screen, label, emoji }) => `
      <a href="#" data-navigate="${screen}"
         class="nav-link ${currentScreen === screen ? "active" : ""}">
        <span class="nav-emoji">${emoji}</span>
        <span class="nav-label">${label}</span>
      </a>`
    )
    .join("");

  const walletButton = walletConnected && userProfile
    ? `<div class="wallet-info">
        <span class="points-badge">⚡ ${userProfile.tokens.toLocaleString()} tkn</span>
        <span class="wallet-addr">${userProfile.walletAddress.slice(0, 6)}...${userProfile.walletAddress.slice(-4)}</span>
      </div>`
    : `<button class="btn btn-primary btn-sm" data-connect-wallet>Connect Wallet</button>`;

  return `
    <nav class="navbar">
      <div class="navbar-brand">
        ${renderLogoCanvas()}
        <span class="brand-name">Midnight<br/><small>Predictions</small></span>
      </div>
      <div class="nav-links">
        ${navLinks}
      </div>
      <div class="navbar-actions">
        ${walletButton}
      </div>
    </nav>
  `;
}

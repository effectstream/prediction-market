import type { AppState, AppScreen, Market, UserBet, UserProfile } from "./types.ts";
import { DUMMY_MARKETS, DUMMY_USER_PROFILE, DUMMY_USER_BETS, DUMMY_LEADERBOARD } from "./dummy-data.ts";
import { renderMarketsScreen } from "./screens/MarketsScreen.ts";
import { renderMarketDetailScreen } from "./screens/MarketDetailScreen.ts";
import { renderMyBetsScreen } from "./screens/MyBetsScreen.ts";
import { renderLeaderboardScreen } from "./screens/LeaderboardScreen.ts";
import { renderProfileScreen } from "./screens/ProfileScreen.ts";
import { renderNav } from "./components/Nav.ts";
import { renderConnectBanner } from "./components/ConnectBanner.ts";
import { initLogo } from "./components/Logo.ts";

export class App {
  private state: AppState;
  private markets: Market[];
  private userBets: UserBet[];
  private container: HTMLElement;

  constructor() {
    this.markets = JSON.parse(JSON.stringify(DUMMY_MARKETS)); // deep clone
    this.userBets = JSON.parse(JSON.stringify(DUMMY_USER_BETS));
    this.state = {
      currentScreen: "markets",
      walletConnected: false,
    };

    this.container = document.getElementById("app")!;
    this.render();
  }

  private navigate(screen: AppScreen, params?: { marketId?: string }) {
    this.state.currentScreen = screen;
    if (params?.marketId) this.state.selectedMarketId = params.marketId;
    this.render();
  }

  private connectWallet() {
    // Phase 1: simulate wallet connection with a fake address
    const fakeAddress = "0xDummy1234567890abcdef1234567890abcdef12";
    this.state.walletAddress = fakeAddress;
    this.state.walletConnected = true;
    this.state.userProfile = { ...DUMMY_USER_PROFILE, walletAddress: fakeAddress };
    this.render();
  }

  private placeBet(marketId: string, optionId: string, amount: number) {
    if (!this.state.walletConnected || !this.state.userProfile) {
      alert("Please connect your wallet first!");
      return;
    }

    const profile = this.state.userProfile;
    if (profile.points < amount) {
      alert("Not enough points! You need " + amount + " points.");
      return;
    }

    // Check if already bet on this market
    const existingBet = this.userBets.find((b) => b.marketId === marketId);
    if (existingBet) {
      alert("You've already placed a bet on this market.");
      return;
    }

    const market = this.markets.find((m) => m.marketId === marketId);
    if (!market) return;

    const option = market.options.find((o) => o.optionId === optionId);
    if (!option) return;

    // Deduct points
    profile.points -= amount;
    profile.totalBets += 1;

    // Update market stats
    option.totalStaked += amount;
    option.betCount += 1;
    market.totalBets += 1;

    // Record bet
    const newBet: UserBet = {
      betId: `bet_${Date.now()}`,
      marketId,
      marketTitle: market.title,
      optionId,
      optionLabel: option.label,
      amount: amount as 10 | 25 | 50,
      placedAt: new Date().toISOString(),
      status: "pending",
    };
    this.userBets.push(newBet);

    // Also update leaderboard entry for current user
    const lbEntry = DUMMY_LEADERBOARD.find(
      (e) => e.walletAddress === this.state.walletAddress
    );
    if (lbEntry) {
      lbEntry.points = profile.points;
      lbEntry.totalBets = profile.totalBets;
    }

    this.render();
  }

  private render() {
    const nav = renderNav({
      currentScreen: this.state.currentScreen,
      walletConnected: this.state.walletConnected,
      userProfile: this.state.userProfile,
      onNavigate: (screen) => this.navigate(screen),
      onConnectWallet: () => this.connectWallet(),
    });

    const connectBanner = !this.state.walletConnected
      ? renderConnectBanner(() => this.connectWallet())
      : "";

    let screenContent = "";
    switch (this.state.currentScreen) {
      case "markets":
        screenContent = renderMarketsScreen({
          markets: this.markets,
          userBets: this.userBets,
          walletConnected: this.state.walletConnected,
          onOpenMarket: (marketId) =>
            this.navigate("market-detail", { marketId }),
        });
        break;

      case "market-detail":
        if (!this.state.selectedMarketId) {
          this.state.currentScreen = "markets";
          this.render();
          return;
        }
        screenContent = renderMarketDetailScreen({
          market: this.markets.find(
            (m) => m.marketId === this.state.selectedMarketId
          )!,
          existingBet: this.userBets.find(
            (b) => b.marketId === this.state.selectedMarketId
          ),
          walletConnected: this.state.walletConnected,
          userPoints: this.state.userProfile?.points ?? 1000,
          onPlaceBet: (optionId, amount) =>
            this.placeBet(this.state.selectedMarketId!, optionId, amount),
          onBack: () => this.navigate("markets"),
        });
        break;

      case "my-bets":
        screenContent = renderMyBetsScreen({
          bets: this.userBets,
          markets: this.markets,
          walletConnected: this.state.walletConnected,
          onOpenMarket: (marketId) =>
            this.navigate("market-detail", { marketId }),
        });
        break;

      case "leaderboard":
        screenContent = renderLeaderboardScreen({
          entries: DUMMY_LEADERBOARD,
          currentWallet: this.state.walletAddress,
        });
        break;

      case "profile":
        screenContent = renderProfileScreen({
          profile: this.state.userProfile,
          walletConnected: this.state.walletConnected,
          onConnectWallet: () => this.connectWallet(),
        });
        break;
    }

    this.container.innerHTML = `
      ${nav}
      ${connectBanner}
      <main class="main-content">
        ${screenContent}
      </main>
    `;

    this.attachEventListeners();
    initLogo(); // (re-)initialize 3D logo after each render
  }

  private attachEventListeners() {
    // Nav links
    this.container.querySelectorAll("[data-navigate]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const screen = (el as HTMLElement).dataset.navigate as AppScreen;
        this.navigate(screen);
      });
    });

    // Connect wallet buttons
    this.container.querySelectorAll("[data-connect-wallet]").forEach((el) => {
      el.addEventListener("click", () => this.connectWallet());
    });

    // Open market buttons
    this.container.querySelectorAll("[data-open-market]").forEach((el) => {
      el.addEventListener("click", () => {
        const marketId = (el as HTMLElement).dataset.openMarket!;
        this.navigate("market-detail", { marketId });
      });
    });

    // Back buttons
    this.container.querySelectorAll("[data-back]").forEach((el) => {
      el.addEventListener("click", () => this.navigate("markets"));
    });

    // Bet amount selection
    this.container.querySelectorAll("[data-bet-amount]").forEach((el) => {
      el.addEventListener("click", () => {
        this.container
          .querySelectorAll("[data-bet-amount]")
          .forEach((btn) => btn.classList.remove("selected"));
        el.classList.add("selected");
      });
    });

    // Option selection
    this.container.querySelectorAll("[data-option-id]").forEach((el) => {
      el.addEventListener("click", () => {
        this.container
          .querySelectorAll("[data-option-id]")
          .forEach((btn) => btn.classList.remove("selected"));
        el.classList.add("selected");
      });
    });

    // Place bet button
    const placeBetBtn = this.container.querySelector("[data-place-bet]");
    if (placeBetBtn) {
      placeBetBtn.addEventListener("click", () => {
        const selectedOption = this.container.querySelector(
          "[data-option-id].selected"
        ) as HTMLElement | null;
        const selectedAmount = this.container.querySelector(
          "[data-bet-amount].selected"
        ) as HTMLElement | null;

        if (!selectedOption) {
          alert("Please select an option to bet on.");
          return;
        }
        if (!selectedAmount) {
          alert("Please select a bet amount.");
          return;
        }

        const optionId = selectedOption.dataset.optionId!;
        const amount = parseInt(selectedAmount.dataset.betAmount!, 10);
        this.placeBet(this.state.selectedMarketId!, optionId, amount);
      });
    }
  }
}

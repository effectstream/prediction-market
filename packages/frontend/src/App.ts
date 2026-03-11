import type { AppState, AppScreen, Market, UserBet, UserProfile } from "./types.ts";
import { renderMarketsScreen } from "./screens/MarketsScreen.ts";
import { renderMarketDetailScreen } from "./screens/MarketDetailScreen.ts";
import { renderMyBetsScreen } from "./screens/MyBetsScreen.ts";
import { renderLeaderboardScreen } from "./screens/LeaderboardScreen.ts";
import { renderProfileScreen } from "./screens/ProfileScreen.ts";
import { renderNav } from "./components/Nav.ts";
import { renderConnectBanner } from "./components/ConnectBanner.ts";
import { initLogo } from "./components/Logo.ts";
import {
  connectLaceWallet,
  getWalletInfo,
  isWalletAvailable,
  disconnectWallet,
} from "./wallet.ts";
import {
  fetchMarkets,
  fetchMarket,
  fetchUserProfile,
  fetchUserBets,
  placeBetApi,
  claimWinningsApi,
  fetchLeaderboard,
  registerUser,
} from "./api-client.ts";
import type { LeaderboardEntry } from "./types.ts";
import { renderAdminScreen, attachAdminListeners } from "./screens/AdminScreen.ts";

const POLL_INTERVAL_MS = 30_000;

export class App {
  private state: AppState;
  private markets: Market[] = [];
  private userBets: UserBet[] = [];
  private leaderboard: LeaderboardEntry[] = [];
  private container: HTMLElement;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const isAdmin = new URLSearchParams(window.location.search).get("admin") === "1";
    this.state = {
      currentScreen: isAdmin ? "admin" : "markets",
      walletConnected: false,
    };
    this.container = document.getElementById("app")!;

    // Restore wallet if already connected this session (e.g. HMR reload)
    const existing = getWalletInfo();
    if (existing) {
      this.handleWalletConnected(existing.address);
    }

    this.loadMarkets();
    this.render();
  }

  // ── Data loading ────────────────────────────────────────────────────────

  private async loadMarkets() {
    try {
      this.markets = await fetchMarkets();
    } catch (err) {
      console.warn("[App] fetchMarkets failed:", err);
      this.markets = [];
    }
    this.render();

    // Start polling
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => this.refreshMarkets(), POLL_INTERVAL_MS);
  }

  private async refreshMarkets() {
    try {
      this.markets = await fetchMarkets();
      this.render();
    } catch {
      // silent — keep showing stale data
    }
  }

  private async refreshUserData() {
    const addr = this.state.walletAddress;
    if (!addr) return;
    try {
      const [profile, bets] = await Promise.all([
        fetchUserProfile(addr),
        fetchUserBets(addr),
      ]);
      this.state.userProfile = profile;
      this.userBets = bets;
    } catch (err) {
      console.warn("[App] refreshUserData failed:", err);
    }
    this.render();
  }

  private async loadLeaderboard() {
    try {
      this.leaderboard = await fetchLeaderboard();
    } catch {
      this.leaderboard = [];
    }
    this.render();
  }

  // ── Wallet ──────────────────────────────────────────────────────────────

  private async connectWallet() {
    if (!isWalletAvailable()) {
      alert(
        "Midnight Lace wallet not found.\n\n" +
        "Please install the Lace browser extension and enable the Midnight network."
      );
      return;
    }
    try {
      const { address } = await connectLaceWallet();
      await this.handleWalletConnected(address);
    } catch (err: any) {
      alert(`Failed to connect wallet: ${err.message ?? "Unknown error"}`);
    }
  }

  private async handleWalletConnected(address: string) {
    this.state.walletAddress = address;
    this.state.walletConnected = true;

    let profile: UserProfile;
    try {
      profile = await fetchUserProfile(address);
    } catch {
      // API unreachable — create a local stub so the UI still renders
      profile = {
        walletAddress: address,
        tokens: 1000,
        discordLinked: false,
        totalBets: 0,
        totalWon: 0,
        isNew: true,
      };
    }
    this.state.userProfile = profile;

    // Load user bets
    try {
      this.userBets = await fetchUserBets(address);
    } catch {
      this.userBets = [];
    }

    this.render();

    // Show display name prompt for new users
    if (profile.isNew || !profile.displayName) {
      this.showDisplayNameModal(address);
    }
  }

  private handleWalletDisconnected() {
    disconnectWallet();
    this.state.walletAddress = undefined;
    this.state.walletConnected = false;
    this.state.userProfile = undefined;
    this.userBets = [];
    this.render();
  }

  // ── Display name modal ──────────────────────────────────────────────────

  private showDisplayNameModal(walletAddress: string) {
    // Remove any existing modal
    document.getElementById("display-name-modal")?.remove();

    const modal = document.createElement("div");
    modal.id = "display-name-modal";
    modal.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-box">
          <h2 class="modal-title">👋 Welcome to Midnight Predictions!</h2>
          <p class="modal-subtitle">Choose a display name to appear on the leaderboard.</p>
          <input
            id="display-name-input"
            class="modal-input"
            type="text"
            placeholder="e.g. CryptoOracle42"
            maxlength="30"
            autocomplete="off"
          />
          <div class="modal-actions">
            <button id="display-name-submit" class="btn btn-primary">Save Name</button>
            <button id="display-name-skip" class="btn btn-ghost">Skip for now</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const input = document.getElementById("display-name-input") as HTMLInputElement;
    input.focus();

    document.getElementById("display-name-submit")!.addEventListener("click", async () => {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      await this.registerDisplayName(walletAddress, name);
      modal.remove();
    });

    document.getElementById("display-name-skip")!.addEventListener("click", () => {
      modal.remove();
    });

    input.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        const name = input.value.trim();
        if (!name) return;
        await this.registerDisplayName(walletAddress, name);
        modal.remove();
      }
    });
  }

  private async registerDisplayName(walletAddress: string, displayName: string) {
    if (this.state.userProfile) {
      this.state.userProfile.displayName = displayName;
      this.render();
    }

    try {
      await registerUser(walletAddress, displayName);
    } catch (err) {
      console.warn("[App] registerDisplayName failed:", err);
    }
  }

  // ── Navigation ──────────────────────────────────────────────────────────

  private navigate(screen: AppScreen, params?: { marketId?: string }) {
    this.state.currentScreen = screen;
    if (params?.marketId) this.state.selectedMarketId = params.marketId;

    // Lazy-load data when navigating to a screen that needs it
    if (screen === "leaderboard") {
      this.loadLeaderboard();
    }
    if (screen === "my-bets" && this.state.walletAddress) {
      fetchUserBets(this.state.walletAddress)
        .then((bets) => { this.userBets = bets; this.render(); })
        .catch(() => {});
    }
    if (screen === "market-detail" && params?.marketId) {
      // Refresh the single market so we have up-to-date stakes
      fetchMarket(params.marketId)
        .then((m) => {
          if (m) {
            const idx = this.markets.findIndex((x) => x.marketId === m.marketId);
            if (idx >= 0) this.markets[idx] = m;
            else this.markets.push(m);
          }
          this.render();
        })
        .catch(() => {});
    }

    this.render();
  }

  // ── Bet placement ───────────────────────────────────────────────────────

  private async placeBet(marketId: string, optionId: string, amount: number) {
    if (!this.state.walletConnected || !this.state.userProfile) {
      alert("Please connect your wallet first!");
      return;
    }

    const profile = this.state.userProfile;
    if (profile.tokens < amount) {
      alert(`Not enough tokens! You need ${amount} tokens but have ${profile.tokens}.`);
      return;
    }

    const existingBet = this.userBets.find((b) => b.marketId === marketId);
    if (existingBet) {
      alert("You've already placed a bet on this market.");
      return;
    }

    // Optimistic UI update
    profile.tokens -= amount;
    this.render();

    try {
      await placeBetApi(marketId, optionId, amount, this.state.walletAddress!);
    } catch (err: any) {
      // Roll back optimistic update
      profile.tokens += amount;
      alert(`Bet failed: ${err.message ?? "Unknown error"}`);
      this.render();
      return;
    }

    // Refresh real data from server
    await this.refreshUserData();
    // Also refresh the market detail so stakes update
    const updated = await fetchMarket(marketId).catch(() => null);
    if (updated) {
      const idx = this.markets.findIndex((m) => m.marketId === marketId);
      if (idx >= 0) this.markets[idx] = updated;
    }
    this.render();
  }

  // ── Claim winnings ──────────────────────────────────────────────────────

  private async claimWinnings(marketId: string) {
    if (!this.state.walletAddress) return;

    try {
      const result = await claimWinningsApi(marketId, this.state.walletAddress);
      alert(`🎉 Claimed ${result.payout} tkn!`);
      await this.refreshUserData();
    } catch (err: any) {
      alert(`Claim failed: ${err.message ?? "Unknown error"}`);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  private render() {
    const nav = renderNav({
      currentScreen: this.state.currentScreen,
      walletConnected: this.state.walletConnected,
      userProfile: this.state.userProfile,
      onNavigate: (screen) => this.navigate(screen),
      onConnectWallet: () => this.connectWallet(),
    });

    const connectBanner = !this.state.walletConnected
      ? renderConnectBanner()
      : "";

    let screenContent = "";
    switch (this.state.currentScreen) {
      case "markets":
        screenContent = renderMarketsScreen({
          markets: this.markets,
          userBets: this.userBets,
          walletConnected: this.state.walletConnected,
          onOpenMarket: (marketId) => this.navigate("market-detail", { marketId }),
        });
        break;

      case "market-detail": {
        if (!this.state.selectedMarketId) {
          this.state.currentScreen = "markets";
          this.render();
          return;
        }
        const market = this.markets.find(
          (m) => m.marketId === this.state.selectedMarketId
        );
        if (!market) {
          this.state.currentScreen = "markets";
          this.render();
          return;
        }
        screenContent = renderMarketDetailScreen({
          market,
          existingBet: this.userBets.find(
            (b) => b.marketId === this.state.selectedMarketId
          ),
          walletConnected: this.state.walletConnected,
          walletAddress: this.state.walletAddress,
          userPoints: this.state.userProfile?.tokens ?? 1000,
          onPlaceBet: (optionId, amount) =>
            this.placeBet(this.state.selectedMarketId!, optionId, amount),
          onBack: () => this.navigate("markets"),
        });
        break;
      }

      case "my-bets":
        screenContent = renderMyBetsScreen({
          bets: this.userBets,
          markets: this.markets,
          walletConnected: this.state.walletConnected,
          walletAddress: this.state.walletAddress,
          onOpenMarket: (marketId) => this.navigate("market-detail", { marketId }),
          onClaimWinnings: (marketId) => this.claimWinnings(marketId),
        });
        break;

      case "leaderboard":
        screenContent = renderLeaderboardScreen({
          entries: this.leaderboard,
          currentWallet: this.state.walletAddress,
        });
        break;

      case "profile":
        screenContent = renderProfileScreen({
          profile: this.state.userProfile,
          walletConnected: this.state.walletConnected,
          onConnectWallet: () => this.connectWallet(),
          onLinkDiscord: () => this.linkDiscord(),
        });
        break;

      case "admin":
        screenContent = renderAdminScreen({
          markets: this.markets,
          onRefreshMarkets: () => this.loadMarkets(),
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
    // Attach admin-specific listeners if on admin screen
    if (this.state.currentScreen === "admin") {
      attachAdminListeners(this.container, () => this.loadMarkets());
    }
    initLogo();
  }

  // ── Discord linking ─────────────────────────────────────────────────────

  private linkDiscord() {
    if (!this.state.walletAddress) {
      alert("Connect your wallet first.");
      return;
    }
    // Redirect to backend Discord OAuth — the callback will return with the
    // discord username and the node will store it via the linkedDiscord handler.
    const params = new URLSearchParams({ wallet: this.state.walletAddress });
    window.location.href = `/api/auth/discord?${params}`;
  }

  // ── Event listeners ─────────────────────────────────────────────────────

  private attachEventListeners() {
    // Nav links
    this.container.querySelectorAll("[data-navigate]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const screen = (el as HTMLElement).dataset.navigate as AppScreen;
        this.navigate(screen);
      });
    });

    // Connect wallet
    this.container.querySelectorAll("[data-connect-wallet]").forEach((el) => {
      el.addEventListener("click", () => this.connectWallet());
    });

    // Open market
    this.container.querySelectorAll("[data-open-market]").forEach((el) => {
      el.addEventListener("click", () => {
        const marketId = (el as HTMLElement).dataset.openMarket!;
        this.navigate("market-detail", { marketId });
      });
    });

    // Back
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

    // Place bet
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

    // Claim winnings buttons
    this.container.querySelectorAll("[data-claim-winnings]").forEach((el) => {
      el.addEventListener("click", () => {
        const marketId = (el as HTMLElement).dataset.claimWinnings!;
        this.claimWinnings(marketId);
      });
    });

    // Link Discord
    this.container.querySelectorAll("[data-link-discord]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        this.linkDiscord();
      });
    });
  }
}

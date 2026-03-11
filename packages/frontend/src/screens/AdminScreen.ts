/**
 * Admin Panel — market lifecycle management.
 * Accessible at ?admin=1 or via a hidden nav trigger.
 * Calls the /api/admin/* endpoints directly.
 */

import type { Market } from "../types.ts";
import { formatDate } from "../utils.ts";
import {
  adminCreateMarket,
  adminCloseMarket,
  adminResolveMarket,
} from "../api-client.ts";

interface AdminScreenProps {
  markets: Market[];
  onRefreshMarkets: () => void;
}

export function renderAdminScreen(props: AdminScreenProps): string {
  const { markets } = props;

  const marketRows = markets.map((m) => {
    const optionButtons = m.options
      .map(
        (o) =>
          `<button class="btn btn-sm btn-outline admin-resolve-btn"
                  data-admin-resolve="${m.marketId}"
                  data-winning-option="${o.optionId}">
             ✅ ${o.label}
           </button>`
      )
      .join(" ");

    const actions = (() => {
      if (m.status === "open") {
        return `
          <button class="btn btn-sm btn-warning" data-admin-close="${m.marketId}">
            🔒 Close
          </button>
        `;
      }
      if (m.status === "closed") {
        return `
          <div class="resolve-options">
            <span class="resolve-label">Resolve as:</span>
            ${optionButtons}
          </div>
        `;
      }
      return `<span class="resolved-tag">✅ Resolved: ${
        m.options.find((o) => o.optionId === m.resolvedOption)?.label ?? m.resolvedOption
      }</span>`;
    })();

    return `
      <div class="admin-market-row">
        <div class="admin-market-info">
          <strong>${m.title}</strong>
          <span class="admin-market-meta">
            ${m.category} · ${m.status} · closes ${formatDate(m.closeTime)}
          </span>
          <span class="admin-market-id">${m.marketId}</span>
        </div>
        <div class="admin-market-actions">
          ${actions}
        </div>
      </div>
    `;
  });

  return `
    <div class="screen-admin">
      <div class="page-header">
        <h1 class="page-title">⚙️ Admin Panel</h1>
        <p class="page-subtitle">Manage markets — create, close, and resolve.</p>
      </div>

      <div class="admin-section">
        <h2 class="section-title">➕ Create Market</h2>
        <form id="admin-create-form" class="admin-form">
          <div class="form-row">
            <label>Title *</label>
            <input id="admin-title" type="text" class="form-input" placeholder="Will X happen?" maxlength="200" required />
          </div>
          <div class="form-row">
            <label>Description</label>
            <input id="admin-description" type="text" class="form-input" placeholder="Additional context..." maxlength="500" />
          </div>
          <div class="form-row">
            <label>Category</label>
            <select id="admin-category" class="form-input">
              <option value="Sports">Sports</option>
              <option value="Entertainment">Entertainment</option>
              <option value="Crypto">Crypto</option>
              <option value="Culture">Culture</option>
              <option value="General" selected>General</option>
            </select>
          </div>
          <div class="form-row">
            <label>Close Time *</label>
            <input id="admin-closetime" type="datetime-local" class="form-input" required />
          </div>
          <div class="form-row">
            <label>Options (comma-separated labels, blank = Yes/No)</label>
            <input id="admin-options" type="text" class="form-input" placeholder="e.g. Chiefs, Eagles, Other" />
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Create Market</button>
          </div>
          <div id="admin-create-status" class="admin-status"></div>
        </form>
      </div>

      <div class="admin-section">
        <h2 class="section-title">📋 All Markets (${markets.length})</h2>
        ${
          markets.length === 0
            ? `<p class="empty-note">No markets yet. Create one above!</p>`
            : `<div class="admin-markets-list">${marketRows.join("")}</div>`
        }
      </div>
    </div>
  `;
}

/**
 * Attach admin panel event listeners. Call after rendering.
 */
export function attachAdminListeners(
  container: HTMLElement,
  onRefreshMarkets: () => void,
) {
  // Create market form
  const form = container.querySelector("#admin-create-form") as HTMLFormElement | null;
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const statusEl = container.querySelector("#admin-create-status") as HTMLElement;
      statusEl.textContent = "Creating...";
      statusEl.className = "admin-status";

      const title = (container.querySelector("#admin-title") as HTMLInputElement).value.trim();
      const description = (container.querySelector("#admin-description") as HTMLInputElement).value.trim();
      const category = (container.querySelector("#admin-category") as HTMLSelectElement).value;
      const closeTimeLocal = (container.querySelector("#admin-closetime") as HTMLInputElement).value;
      const optionsRaw = (container.querySelector("#admin-options") as HTMLInputElement).value.trim();

      if (!title || !closeTimeLocal) {
        statusEl.textContent = "Title and close time are required.";
        statusEl.className = "admin-status admin-status--error";
        return;
      }

      const closeTime = new Date(closeTimeLocal).toISOString();
      const marketId = `market_${Date.now()}`;

      let options: Array<{ optionId: string; label: string }> | undefined;
      if (optionsRaw) {
        options = optionsRaw.split(",").map((l, i) => ({
          optionId: `opt_${i}_${Date.now()}`,
          label: l.trim(),
        }));
      }

      try {
        await adminCreateMarket({ marketId, title, description, category, closeTime, options });
        statusEl.textContent = `✅ Market created: ${marketId}`;
        statusEl.className = "admin-status admin-status--success";
        form.reset();
        onRefreshMarkets();
      } catch (err: any) {
        statusEl.textContent = `❌ Error: ${err.message}`;
        statusEl.className = "admin-status admin-status--error";
      }
    });
  }

  // Close market buttons
  container.querySelectorAll("[data-admin-close]").forEach((el) => {
    el.addEventListener("click", async () => {
      const marketId = (el as HTMLElement).dataset.adminClose!;
      if (!confirm(`Close market ${marketId}? No more bets will be accepted.`)) return;
      try {
        await adminCloseMarket(marketId);
        onRefreshMarkets();
      } catch (err: any) {
        alert(`Failed to close market: ${err.message}`);
      }
    });
  });

  // Resolve market buttons
  container.querySelectorAll("[data-admin-resolve]").forEach((el) => {
    el.addEventListener("click", async () => {
      const marketId = (el as HTMLElement).dataset.adminResolve!;
      const winningOptionId = (el as HTMLElement).dataset.winningOption!;
      const label = el.textContent?.trim() ?? winningOptionId;
      if (!confirm(`Resolve market ${marketId} with winner: ${label}?`)) return;
      try {
        await adminResolveMarket(marketId, winningOptionId);
        onRefreshMarkets();
      } catch (err: any) {
        alert(`Failed to resolve market: ${err.message}`);
      }
    });
  });
}

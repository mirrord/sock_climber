/* Shared styles injected once for all menu screens */
const STYLE_ID = 'sock_climber-menu-styles';

export function injectMenuStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .sock_climber-overlay {
      position: fixed; inset: 0; z-index: 100;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      background: #0f0f23; color: #eee;
      font-family: monospace;
    }
    .sock_climber-overlay h1 {
      font-size: 48px; margin-bottom: 8px;
      letter-spacing: 6px; color: #48bfe3;
    }
    .sock_climber-overlay .subtitle {
      font-size: 14px; color: #667; margin-bottom: 40px;
    }
    .sock_climber-overlay .menu-list {
      list-style: none; padding: 0; margin: 0; width: 280px;
    }
    .sock_climber-overlay .menu-list li {
      margin: 6px 0;
    }
    .sock_climber-overlay .menu-btn {
      display: block; width: 100%; padding: 14px 0;
      background: #1a1a3a; color: #ccc; border: 1px solid #333;
      font-family: inherit; font-size: 16px; cursor: pointer;
      text-align: center; border-radius: 4px;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    .sock_climber-overlay .menu-btn:hover, .sock_climber-overlay .menu-btn:focus {
      background: #2a2a5a; color: #fff; border-color: #48bfe3; outline: none;
    }
    .sock_climber-overlay .menu-btn.menu-nav-selected {
      background: #2a2a5a; color: #fff; border-color: #48bfe3;
    }
    .sock_climber-overlay .back-btn {
      margin-top: 24px; padding: 10px 30px;
      background: none; border: 1px solid #555; color: #888;
      font-family: inherit; font-size: 14px; cursor: pointer;
      border-radius: 4px;
    }
    .sock_climber-overlay .back-btn:hover { color: #eee; border-color: #aaa; }
    .sock_climber-overlay .back-btn.menu-nav-selected {
      color: #eee; border-color: #48bfe3;
    }
    .sock_climber-overlay .panel {
      background: #1a1a3a; border: 1px solid #333;
      padding: 20px; border-radius: 6px; width: 340px; max-height: 60vh;
      overflow-y: auto;
    }
    .sock_climber-overlay .panel h2 {
      font-size: 20px; margin: 0 0 16px; color: #48bfe3;
    }
    .sock_climber-overlay .level-item {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 12px; margin: 4px 0; background: #0f0f23;
      border: 1px solid #333; border-radius: 3px;
    }
    .sock_climber-overlay .level-item:hover { border-color: #48bfe3; }
    .sock_climber-overlay .level-item.menu-nav-selected { border-color: #48bfe3; background: #1a1a3a; }
    .sock_climber-overlay .level-item .name { flex: 1; }
    .sock_climber-overlay .level-item button {
      background: #2a2a5a; color: #eee; border: 1px solid #555;
      padding: 4px 12px; cursor: pointer; font-family: inherit;
      font-size: 12px; border-radius: 3px; margin-left: 6px;
    }
    .sock_climber-overlay .level-item button:hover { background: #3a3a7a; }
    .sock_climber-overlay .level-item button.danger { border-color: #a33; }
    .sock_climber-overlay .level-item button.danger:hover { background: #533; }
    .sock_climber-overlay .empty-msg { color: #556; font-style: italic; text-align: center; padding: 20px; }
    .sock_climber-overlay .setting-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 0; border-bottom: 1px solid #222;
    }
    .sock_climber-overlay .setting-row:last-child { border-bottom: none; }
    .sock_climber-overlay .setting-label { color: #aab; white-space: nowrap; margin-right: 12px; }
    .sock_climber-overlay .setting-value { color: #667; font-style: italic; }

    /* ── Volume sliders ───────────────────────────────────────────────── */
    .sock_climber-overlay .slider-wrap {
      display: flex; align-items: center; gap: 10px; flex: 1; justify-content: flex-end;
    }
    .sock_climber-overlay .vol-slider {
      flex: 1; max-width: 160px; cursor: pointer; accent-color: #48bfe3;
    }
    .sock_climber-overlay .vol-value {
      color: #aab; width: 40px; text-align: right; font-size: 13px;
    }

    /* ── Settings tabs ────────────────────────────────────────────────── */
    .sock_climber-overlay .settings-panel { width: 460px; max-height: 70vh; }
    .sock_climber-overlay .settings-tabs {
      display: flex; gap: 4px; margin-bottom: 16px;
    }
    .sock_climber-overlay .tab-btn {
      flex: 1; padding: 8px 0;
      background: #0f0f23; color: #667; border: 1px solid #333;
      font-family: inherit; font-size: 14px; cursor: pointer;
      border-radius: 3px; transition: background 0.15s, color 0.15s;
    }
    .sock_climber-overlay .tab-btn:hover { color: #ccc; border-color: #555; }
    .sock_climber-overlay .tab-btn.active {
      background: #1e1e45; color: #48bfe3; border-color: #48bfe3;
    }
    .sock_climber-overlay .tab-btn.menu-nav-selected {
      color: #ccc; border-color: #48bfe3;
    }
    .sock_climber-overlay .settings-content { overflow-y: auto; max-height: 46vh; }

    /* ── Key-binding table ────────────────────────────────────────────── */
    .sock_climber-overlay .bindings-table {
      width: 100%; border-collapse: collapse;
    }
    .sock_climber-overlay .bindings-table th {
      text-align: left; padding: 6px 8px; font-size: 11px;
      color: #556; text-transform: uppercase; letter-spacing: 1px;
      border-bottom: 1px solid #222;
    }
    .sock_climber-overlay .bindings-table .col-action { width: 34%; }
    .sock_climber-overlay .bindings-table .col-bind   { width: 33%; }
    .sock_climber-overlay .binding-row td { padding: 5px 8px; border-bottom: 1px solid #1a1a2e; }
    .sock_climber-overlay .action-name { color: #aab; font-size: 14px; }
    .sock_climber-overlay .bind-btn {
      background: #0f0f23; color: #99b; border: 1px solid #2a2a4a;
      font-family: inherit; font-size: 13px; padding: 4px 10px;
      border-radius: 3px; cursor: pointer; width: 100%;
      transition: background 0.12s, border-color 0.12s, color 0.12s;
    }
    .sock_climber-overlay .bind-btn:hover {
      background: #1e1e3a; border-color: #48bfe3; color: #fff;
    }
    .sock_climber-overlay .bind-btn.menu-nav-selected {
      background: #1e1e3a; border-color: #48bfe3; color: #fff;
    }
    .sock_climber-overlay .bind-btn.listening {
      border-color: #f4a261; color: #f4a261; animation: sc-pulse 0.8s ease-in-out infinite alternate;
    }
    @keyframes sc-pulse {
      from { opacity: 1; }
      to   { opacity: 0.45; }
    }
    .sock_climber-overlay .hint-text {
      margin-top: 10px; font-size: 11px; color: #445; text-align: center;
    }
  `;
  document.head.appendChild(style);
}

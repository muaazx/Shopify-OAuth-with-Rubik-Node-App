(function () {
  // 1. Resolve store domain
  const shop = window.Shopify ? window.Shopify.shop : location.hostname;
  const API_BASE = "https://shopify-oauth-with-rubik-node-app-production.up.railway.app";
  const FRONTEND_BASE = "https://shopify-o-auth-with-rubik-node-app.vercel.app";

  async function initRubikChat() {
    try {
      // 2. Query Supabase status for this store
      const res = await fetch(`${API_BASE}/api/widget/status?shop=${encodeURIComponent(shop)}`);
      if (!res.ok) return;

      const data = await res.json();

      // 3. Render iframe if enabled in database
      if (data.enabled) {
        if (document.getElementById("rubikchat-widget-iframe")) return;

        const iframe = document.createElement("iframe");
        iframe.id = "rubikchat-widget-iframe";
        iframe.src = `${FRONTEND_BASE}/chat-embed?shop=${encodeURIComponent(shop)}`;
        iframe.style.cssText = `
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 380px;
          height: 600px;
          border: none;
          z-index: 999999;
          border-radius: 16px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
        `;
        document.body.appendChild(iframe);
      } else {
        // Remove iframe if toggled OFF
        const existingIframe = document.getElementById("rubikchat-widget-iframe");
        if (existingIframe) existingIframe.remove();
      }
    } catch (err) {
      console.error("RubikChat Widget Initialization Error:", err);
    }
  }

  // Execute on DOM load
  if (document.readyState === "complete" || document.readyState === "interactive") {
    initRubikChat();
  } else {
    window.addEventListener("DOMContentLoaded", initRubikChat);
  }
})();

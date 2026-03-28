(function () {
  const utils = (window.AppUtils = window.AppUtils || {});

  utils.getAppFingerprint = function getAppFingerprint() {
    if (typeof document === "undefined") return "";
    const appEl = document.getElementById("app");
    if (appEl && appEl.dataset && appEl.dataset.fingerprint) {
      return String(appEl.dataset.fingerprint);
    }
    const meta = document.querySelector('meta[name="fingerprint"]');
    const metaValue = meta && meta.getAttribute ? meta.getAttribute("content") : "";
    return metaValue ? String(metaValue) : "";
  };

  utils.triggerJsonDownload = function triggerJsonDownload(filename, payload) {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  };

  utils.collectFrontendDeliveryDiagnostic = async function collectFrontendDeliveryDiagnostic() {
    const pageUrl =
      typeof window !== "undefined" && window.location && window.location.href
        ? String(window.location.href)
        : "";
    const traceUrl =
      typeof window !== "undefined" && window.location && window.location.origin
        ? `${window.location.origin}/cdn-cgi/trace`
        : "/cdn-cgi/trace";
    const result = {
      collectedAt: new Date().toISOString(),
      pageUrl,
      traceUrl,
      server: "",
      serverError: "",
      traceRaw: "",
      traceError: "",
    };
    if (typeof fetch !== "function") {
      result.serverError = "fetch_unavailable";
      result.traceError = "fetch_unavailable";
      return result;
    }
    try {
      const response = await fetch(pageUrl || ".", {
        method: "HEAD",
        cache: "no-store",
        credentials: "same-origin",
      });
      result.server = String(response.headers.get("server") || "").trim();
      if (!response.ok && !result.server) {
        result.serverError = `HTTP ${response.status}`;
      }
    } catch (error) {
      result.serverError = error && error.message ? String(error.message) : "server_probe_failed";
    }
    try {
      const response = await fetch(traceUrl, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });
      const raw = await response.text();
      if (response.ok) {
        result.traceRaw = String(raw || "");
      } else {
        result.traceError = raw ? String(raw) : `HTTP ${response.status}`;
      }
    } catch (error) {
      result.traceError = error && error.message ? String(error.message) : "trace_probe_failed";
    }
    return result;
  };
})();

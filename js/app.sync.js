(function () {
  const modules = (window.AppModules = window.AppModules || {});

  modules.initSync = function initSync(ctx, state) {
    const { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } = ctx;
    const syncMetaStorageKey = state.syncMetaStorageKey || "planner-sync-meta:v1";
    const syncPrefsStorageKey = state.syncPrefsStorageKey || "planner-sync-prefs:v1";
    const syncDevStorageKey = state.syncDevStorageKey || "planner-sync-dev:v1";
    const syncSessionHintStorageKey = state.syncSessionHintStorageKey || "planner-session-hint:v1";
    const getDefaultApiBase = () => "https://ldy.canmoe.com/api";
    const devHostPattern = /^(localhost|127\.0\.0\.1)$/i;
    const defaultMeta = {
      serverVersion: 0,
      localHash: "",
      syncedAt: "",
      remoteUpdatedAt: "",
    };
    const runtimeEnv =
      typeof window !== "undefined" && typeof window.__APP_RUNTIME_ENV__ === "string"
        ? String(window.__APP_RUNTIME_ENV__ || "").toLowerCase()
        : "";
    const syncStatusLimit = 8;
    const autoSyncDelayMs = 8000;
    const syncModalOpenCheckCooldownMs = 30000;
    const remoteRefreshFocusCooldownMs = 60000;
    const remoteRefreshIntervalMs = 300000;
    const syncConflictToastSignature = "sync-conflict-active";
    const syncConflictReminderThrottleMs = 1800;
    const usernamePattern = /^[a-zA-Z0-9_]{3,24}$/;
    const devHeaderNamePattern = /^[A-Za-z0-9-]+$/;
    const syncTurnstileSiteKey = "0x4AAAAAACxC56LlFLuFLUXe";
    const syncTurnstileAction = "sync_auth";
    const syncTurnstileScriptSrc = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    let autoSyncTimer = null;
    let autoSyncCountdownTimer = null;
    let syncSessionRequest = null;
    let remoteRefreshTimer = null;
    let syncModalCleanupTimer = null;
    let lastRemoteRefreshAt = 0;
    let lastSyncModalOpenCheckAt = 0;
    let lastSyncConflictReminderAt = 0;
    let lastSyncConflictReminderHash = "";
    let suppressNextConflictToastUntil = 0;
    let syncTurnstileLoadPromise = null;
    let syncTurnstileMountPromise = null;
    let syncTurnstileMountVersion = 0;

    const getRefValue = (target, fallback) =>
      target && typeof target === "object" && "value" in target ? target.value : fallback;

    const isPlainObject = (value) =>
      Boolean(value) && typeof value === "object" && !Array.isArray(value);

    const readVersionInfo = () => {
      if (typeof window === "undefined") return {};
      const info = window.__APP_VERSION_INFO;
      return info && typeof info === "object" ? info : {};
    };

    const stableSerialize = (value) => {
      if (value === null) return "null";
      const type = typeof value;
      if (type === "number" || type === "boolean") return JSON.stringify(value);
      if (type === "string") return JSON.stringify(value);
      if (Array.isArray(value)) {
        return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
      }
      if (!isPlainObject(value)) return JSON.stringify(null);
      const keys = Object.keys(value).sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
    };

    const hashText = (input) => {
      const text = String(input || "");
      let hash = 2166136261;
      for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return `h${(hash >>> 0).toString(16).padStart(8, "0")}`;
    };

    const cloneJson = (value, fallback) => {
      try {
        return JSON.parse(JSON.stringify(value == null ? fallback : value));
      } catch (error) {
        return fallback;
      }
    };

    const isLocalhostFrontend = () => {
      if (typeof window === "undefined" || !window.location) return false;
      return devHostPattern.test(String(window.location.hostname || ""));
    };

    const isOfficialSyncFrontend = () => {
      if (typeof window === "undefined" || !window.location) return true;
      return String(window.location.hostname || "").toLowerCase() === "end.canmoe.com";
    };

    const isSyncFrontendAllowed = () => isLocalhostFrontend() || isOfficialSyncFrontend();

    const defaultWorkspaceConfig = cloneJson(getRefValue(state.recommendationConfig, {}), {});

    const normalizeWorkspace = (raw, options) => {
      const source = isPlainObject(raw) ? raw : {};
      const useCurrentFallback = Boolean(options && options.useCurrentFallback);
      const candidate = {
        selectedNames: Array.isArray(source.selectedNames)
          ? source.selectedNames.slice()
          : useCurrentFallback
            ? cloneJson(getRefValue(state.selectedNames, []), [])
            : [],
        schemeBaseSelections: cloneJson(
          source.schemeBaseSelections,
          useCurrentFallback ? cloneJson(getRefValue(state.schemeBaseSelections, {}), {}) : {}
        ),
        recommendationConfig: cloneJson(
          source.recommendationConfig,
          useCurrentFallback ? cloneJson(getRefValue(state.recommendationConfig, {}), {}) : defaultWorkspaceConfig
        ),
        filterS1: Array.isArray(source.filterS1)
          ? source.filterS1.slice()
          : useCurrentFallback
            ? cloneJson(getRefValue(state.filterS1, []), [])
            : [],
        filterS2: Array.isArray(source.filterS2)
          ? source.filterS2.slice()
          : useCurrentFallback
            ? cloneJson(getRefValue(state.filterS2, []), [])
            : [],
        filterS3: Array.isArray(source.filterS3)
          ? source.filterS3.slice()
          : useCurrentFallback
            ? cloneJson(getRefValue(state.filterS3, []), [])
            : [],
        equipRefiningSelectedName:
          typeof source.equipRefiningSelectedName === "string"
            ? source.equipRefiningSelectedName
            : useCurrentFallback
              ? String(getRefValue(state.equipRefiningSelectedName, "") || "")
              : "",
        weaponAttrOverrides: cloneJson(
          source.weaponAttrOverrides,
          useCurrentFallback ? cloneJson(getRefValue(state.weaponAttrOverrides, {}), {}) : {}
        ),
        showWeaponAttrs:
          typeof source.showWeaponAttrs === "boolean"
            ? source.showWeaponAttrs
            : useCurrentFallback
              ? Boolean(getRefValue(state.showWeaponAttrs, false))
              : false,
        showWeaponOwnership:
          typeof source.showWeaponOwnership === "boolean"
            ? source.showWeaponOwnership
            : useCurrentFallback
              ? Boolean(getRefValue(state.showWeaponOwnership, false))
              : false,
        showAllSchemes:
          typeof source.showAllSchemes === "boolean"
            ? source.showAllSchemes
            : useCurrentFallback
              ? Boolean(getRefValue(state.showAllSchemes, false))
              : false,
      };
      if (typeof state.sanitizeUiState === "function") {
        return state.sanitizeUiState(candidate) || {};
      }
      return candidate;
    };

    const normalizeComparableData = (raw, options) => {
      const source = isPlainObject(raw) ? raw : {};
      const planner = isPlainObject(source.planner) ? source.planner : source;
      const marksSource = isPlainObject(planner.marks) && "items" in planner.marks
        ? planner.marks.items
        : planner.marks;
      const customWeaponsSource = isPlainObject(planner.customWeapons) && "items" in planner.customWeapons
        ? planner.customWeapons.items
        : planner.customWeapons;
      const workspaceSource = isPlainObject(planner.workspace) ? planner.workspace : {};
      return {
        marks:
          typeof state.normalizeWeaponMarks === "function"
            ? state.normalizeWeaponMarks(marksSource)
            : cloneJson(marksSource, {}),
        customWeapons:
          typeof state.sanitizeCustomWeapons === "function"
            ? state.sanitizeCustomWeapons(customWeaponsSource)
            : cloneJson(customWeaponsSource, []),
        workspace: normalizeWorkspace(workspaceSource, options),
      };
    };

    const normalizeDurableComparableData = (raw, options) => {
      const comparable = normalizeComparableData(raw, options);
      const workspace = isPlainObject(comparable.workspace) ? comparable.workspace : {};
      comparable.workspace = Object.assign({}, workspace);
      return comparable;
    };

    const buildComparableHash = (raw, options) =>
      hashText(stableSerialize(normalizeDurableComparableData(raw, options)));

    const buildLocalComparable = () =>
      normalizeComparableData({
        marks: cloneJson(getRefValue(state.weaponMarks, {}), {}),
        customWeapons: cloneJson(getRefValue(state.customWeapons, []), []),
        workspace: normalizeWorkspace({}, { useCurrentFallback: true }),
      }, { useCurrentFallback: true });

    const buildLocalPayload = () => {
      const now = new Date().toISOString();
      const versionInfo = readVersionInfo();
      const comparable = buildLocalComparable();
      return {
        schemaVersion: 1,
        capturedAt: now,
        source: {
          app: "endfield-essence-planner",
          buildId: String(versionInfo.buildId || ""),
          displayVersion: String(versionInfo.displayVersion || ""),
          host:
            typeof window !== "undefined" && window.location ? String(window.location.host || "") : "",
        },
        planner: {
          marks: {
            updatedAt: now,
            items: comparable.marks,
          },
          customWeapons: {
            updatedAt: now,
            items: comparable.customWeapons,
          },
          workspace: Object.assign({ updatedAt: now }, comparable.workspace),
        },
      };
    };

    const clearAutoSyncCountdownTimer = () => {
      if (autoSyncCountdownTimer) {
        clearInterval(autoSyncCountdownTimer);
        autoSyncCountdownTimer = null;
      }
    };

    const ensureAutoSyncCountdownTimer = () => {
      clearAutoSyncCountdownTimer();
      if (!state.syncAutoSyncDueAt || !("value" in state.syncAutoSyncDueAt) || !state.syncAutoSyncDueAt.value) return;
      if (!state.syncAutoSyncClock || !("value" in state.syncAutoSyncClock)) return;
      state.syncAutoSyncClock.value = Date.now();
      autoSyncCountdownTimer = setInterval(() => {
        state.syncAutoSyncClock.value = Date.now();
        if (!state.syncAutoSyncDueAt.value || state.syncAutoSyncDueAt.value <= Date.now()) {
          clearAutoSyncCountdownTimer();
        }
      }, 1000);
    };

    const clearAutoSyncTimer = () => {
      if (autoSyncTimer) {
        clearTimeout(autoSyncTimer);
        autoSyncTimer = null;
      }
      clearAutoSyncCountdownTimer();
      if (state.syncAutoSyncDueAt && "value" in state.syncAutoSyncDueAt) {
        state.syncAutoSyncDueAt.value = 0;
      }
      if (state.syncAutoSyncClock && "value" in state.syncAutoSyncClock) {
        state.syncAutoSyncClock.value = Date.now();
      }
    };

    const scheduleAutoSync = () => {
      clearAutoSyncTimer();
      if (!state.syncAuthenticated.value || state.syncBusy.value || state.syncConflictDetected.value) return;
      const currentHash = String(state.syncCurrentComparableHash.value || "");
      const lastHash = String(state.syncLastLocalHash.value || "");
      if (!currentHash || currentHash === lastHash) return;
      state.syncAutoSyncDueAt.value = Date.now() + autoSyncDelayMs;
      ensureAutoSyncCountdownTimer();
      autoSyncTimer = setTimeout(() => {
        autoSyncTimer = null;
        state.syncAutoSyncDueAt.value = 0;
        clearAutoSyncCountdownTimer();
        if (!state.syncAuthenticated.value || state.syncBusy.value || state.syncConflictDetected.value) return;
        const liveHash = String(state.syncCurrentComparableHash.value || "");
        const syncedHash = String(state.syncLastLocalHash.value || "");
        if (!liveHash || liveHash === syncedHash) return;
        performManualSync({ source: "auto" });
      }, autoSyncDelayMs);
    };

    const summarizePayload = (payload, version, updatedAt) => {
      const comparable = normalizeComparableData(payload);
      return {
        version: Number.isFinite(Number(version)) ? Number(version) : 0,
        updatedAt: String(
          updatedAt ||
            (payload && payload.capturedAt) ||
            (payload && payload.planner && payload.planner.workspace && payload.planner.workspace.updatedAt) ||
            ""
        ),
        marksCount: Object.keys(comparable.marks || {}).length,
        customWeaponsCount: Array.isArray(comparable.customWeapons) ? comparable.customWeapons.length : 0,
        selectedCount: Array.isArray(comparable.workspace.selectedNames)
          ? comparable.workspace.selectedNames.length
          : 0,
      };
    };

    const hasMeaningfulLocalData = (payload) => {
      const summary = summarizePayload(payload, 0, "");
      if (summary.marksCount > 0 || summary.customWeaponsCount > 0 || summary.selectedCount > 0) {
        return true;
      }
      const comparable = normalizeComparableData(payload);
      const workspace = comparable.workspace || {};
      if (workspace.recommendationConfig && Object.keys(workspace.recommendationConfig).length > 0) {
        return true;
      }
      if (workspace.schemeBaseSelections && Object.keys(workspace.schemeBaseSelections).length > 0) {
        return true;
      }
      if (workspace.weaponAttrOverrides && Object.keys(workspace.weaponAttrOverrides).length > 0) {
        return true;
      }
      return false;
    };

    const readJsonStorage = (key, fallback) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return cloneJson(fallback, fallback);
        const parsed = JSON.parse(raw);
        return isPlainObject(parsed) || Array.isArray(parsed) ? parsed : cloneJson(fallback, fallback);
      } catch (error) {
        return cloneJson(fallback, fallback);
      }
    };

    const writeJsonStorage = (key, value) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        if (typeof state.reportStorageIssue === "function") {
          state.reportStorageIssue("storage.write", key, error, {
            scope: "sync.persist",
          });
        }
      }
    };

    const pushSyncToast = (tone, titleKey, summaryKey, fallbackTitle, fallbackSummary, signature) => {
      if (typeof state.pushToastNotice !== "function") return;
      state.pushToastNotice(
        {
          title: typeof state.t === "function" ? state.t(titleKey) : fallbackTitle,
          summary: typeof state.t === "function" ? state.t(summaryKey) : fallbackSummary,
          tone,
          icon: tone === "danger" ? "!" : tone === "success" ? "✓" : "i",
          durationMs: tone === "danger" ? 9000 : 3600,
          signature,
          ariaLabel: typeof state.t === "function" ? state.t(titleKey) : fallbackTitle,
        },
        {
          signature,
          dedupWindowMs: 1200,
        }
      );
    };

    const openSyncModalFromConflictToast = () => {
      suppressNextConflictToastUntil = Date.now() + 6000;
      if (typeof state.openSyncModal === "function") {
        state.openSyncModal();
      }
    };

    const dismissConflictToast = () => {
      if (typeof state.dismissToastNoticeBySignature !== "function") return;
      state.dismissToastNoticeBySignature(syncConflictToastSignature);
    };

    const pushSyncConflictToast = (options) => {
      if (typeof state.pushToastNotice !== "function") return;
      const dedupWindowMs = Number(
        options && Number.isFinite(options.dedupWindowMs) ? options.dedupWindowMs : 0
      );
      state.pushToastNotice(
        {
          title: getSyncText("sync.conflict_title", "检测到冲突"),
          summary: getSyncText(
            "sync.error_conflict",
            "检测到同步冲突，请先确认当前设备还是云端数据应保留为最新版本。"
          ),
          tone: "warning",
          icon: "!",
          durationMs: 9000,
          signature: syncConflictToastSignature,
          ariaLabel: getSyncText("sync.conflict_title", "检测到冲突"),
          onActivate: openSyncModalFromConflictToast,
        },
        {
          signature: syncConflictToastSignature,
          dedupWindowMs,
        }
      );
    };

    const pushSyncReauthToast = () => {
      if (typeof state.pushToastNotice !== "function") return;
      state.pushToastNotice(
        {
          title: getSyncText("sync.session_expired_title", "登录状态已失效"),
          summary: getSyncText("sync.session_expired_summary", "点击这里重新打开登录面板。"),
          tone: "warning",
          icon: "!",
          onActivate: typeof state.openSyncModal === "function" ? () => state.openSyncModal() : null,
          durationMs: 9000,
          signature: "sync-session-expired",
          ariaLabel: getSyncText("sync.session_expired_title", "登录状态已失效"),
        },
        {
          signature: "sync-session-expired",
          dedupWindowMs: 3000,
        }
      );
    };

    const formatSyncStatusTime = (timestamp) => {
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
      if (Number.isNaN(date.getTime())) return "";
      const locale = getRefValue(state.locale, undefined);
      try {
        return date.toLocaleTimeString(locale || undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
      } catch (error) {
        return date.toLocaleTimeString();
      }
    };

    const readSessionHint = () => {
      try {
        return localStorage.getItem(syncSessionHintStorageKey) === "1";
      } catch (error) {
        return false;
      }
    };

    const writeSessionHint = (enabled) => {
      try {
        if (enabled) {
          localStorage.setItem(syncSessionHintStorageKey, "1");
          return;
        }
        localStorage.removeItem(syncSessionHintStorageKey);
      } catch (error) {
        // ignore storage failures for non-sensitive session hint
      }
    };

    const formatSyncDateTime = (value) => {
      const text = String(value || "").trim();
      if (!text) return "";
      const date = new Date(text);
      if (Number.isNaN(date.getTime())) return text;
      const locale = getRefValue(state.locale, undefined);
      try {
        return new Intl.DateTimeFormat(locale || undefined, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(date);
      } catch (error) {
        return date.toLocaleString();
      }
    };

    const createSyncTextEntry = (key, fallback, params) => ({
      key: String(key || ""),
      fallback: String(fallback || ""),
      params: isPlainObject(params) ? cloneJson(params, {}) : null,
    });

    const coerceSyncText = (value, fallback) => {
      if (typeof value === "string") return value.trim();
      if (typeof value === "number" || typeof value === "boolean") return String(value);
      if (isPlainObject(value)) {
        if (typeof value.message === "string" && value.message.trim()) return value.message.trim();
        if (typeof value.error === "string" && value.error.trim()) return value.error.trim();
        if (typeof value.code === "string" && value.code.trim()) return value.code.trim();
      }
      return String(fallback || "").trim();
    };

    const resolveSyncEntry = (message) => {
      if (isPlainObject(message) && typeof message.key === "string" && message.key) {
        const translated = getSyncText(message.key, message.fallback || message.key, message.params || undefined);
        return {
          text: coerceSyncText(translated, message.fallback || message.key),
          messageKey: String(message.key || ""),
          params: isPlainObject(message.params) ? cloneJson(message.params, {}) : null,
        };
      }
      return {
        text: coerceSyncText(message, ""),
        messageKey: "",
        params: null,
      };
    };

    const resolveSyncStatusMessage = (item) => {
      if (!item) return "";
      if (item.messageKey) {
        return coerceSyncText(
          getSyncText(item.messageKey, item.message || "", item.messageParams || undefined),
          item.message || ""
        );
      }
      const translated = translateSyncError(item.message);
      if (translated && translated !== item.message) return coerceSyncText(translated, item.message || "");
      return coerceSyncText(item.message, "");
    };

    const pushSyncStatus = (tone, message) => {
      const entry = resolveSyncEntry(message);
      const text = String(entry.text || "").trim();
      if (!text || !state.syncStatusItems || !("value" in state.syncStatusItems)) return;
      const now = new Date();
      const next = {
        id: `${now.getTime()}-${Math.random().toString(16).slice(2, 8)}`,
        tone: tone === "error" ? "error" : tone === "info" ? "info" : "success",
        message: text,
        messageKey: entry.messageKey,
        messageParams: entry.params,
        timestamp: now.toISOString(),
        timeLabel: formatSyncStatusTime(now),
      };
      const current = Array.isArray(state.syncStatusItems.value) ? state.syncStatusItems.value.slice() : [];
      if (
        current.length &&
        current[0].tone === next.tone &&
        current[0].message === next.message &&
        current[0].messageKey === next.messageKey
      ) {
        current[0] = next;
      } else {
        current.unshift(next);
      }
      state.syncStatusItems.value = current.slice(0, syncStatusLimit);
    };

    const scrollSyncStatusListToTop = () => {
      const list = getRefValue(state.syncStatusListRef, null);
      if (!list || typeof list.scrollTop !== "number") return;
      list.scrollTop = 0;
    };

    const setSyncError = (message) => {
      const entry = resolveSyncEntry(message);
      const text = String(entry.text || "");
      state.syncError.value = text;
      state.syncNotice.value = "";
      if (text) {
        pushSyncStatus("error", entry);
      }
    };

    const setSyncNotice = (message, tone) => {
      const entry = resolveSyncEntry(message);
      const text = String(entry.text || "");
      state.syncNotice.value = text;
      state.syncError.value = "";
      if (text) {
        pushSyncStatus(tone || "success", entry);
      }
    };

    const persistMeta = (meta) => {
      const next = Object.assign({}, defaultMeta, isPlainObject(meta) ? meta : {});
      state.syncLastSyncedServerVersion.value = Number(next.serverVersion || 0);
      state.syncLastSyncedAt.value = String(next.syncedAt || "");
      state.syncLastRemoteUpdatedAt.value = String(next.remoteUpdatedAt || "");
      state.syncLastLocalHash.value = String(next.localHash || "");
      writeJsonStorage(syncMetaStorageKey, next);
    };

    const persistPrefs = () => {
      writeJsonStorage(syncPrefsStorageKey, {
        successToastEnabled: Boolean(state.syncSuccessToastEnabled.value),
      });
    };

    const persistDevSettings = () => {
      writeJsonStorage(syncDevStorageKey, {
        apiBase: String(state.syncApiBaseInput.value || ""),
        headerName: String(state.syncDevHeaderNameInput.value || ""),
        headerValue: String(state.syncDevHeaderValueInput.value || ""),
      });
    };

    const resolveApiBase = () => {
      if (!isLocalhostFrontend()) return getDefaultApiBase();
      const raw = String(state.syncApiBaseInput.value || "").trim();
      if (!raw) return getDefaultApiBase();
      return raw.replace(/\/+$/, "");
    };

    const buildApiUrl = (endpoint, query) => {
      const base = `${resolveApiBase()}/${endpoint}.php`;
      if (!isPlainObject(query)) return base;
      const params = new URLSearchParams();
      Object.keys(query).forEach((key) => {
        const value = query[key];
        if (value === undefined || value === null || value === "") return;
        params.set(key, String(value));
      });
      const search = params.toString();
      return search ? `${base}?${search}` : base;
    };

    const shouldSkipAutoRefresh = () =>
      isLocalhostFrontend() && (
        String(state.syncDevHeaderNameInput.value || "").trim() === "" ||
        String(state.syncDevHeaderValueInput.value || "").trim() === ""
      );

    const getOfficialOnlyEntry = () =>
      createSyncTextEntry("sync.error_official_only", "同步功能仅在官方网站 https://end.canmoe.com 可用");

    const ensureSyncFrontendAllowed = (options) => {
      if (isSyncFrontendAllowed()) return true;
      if (!options || !options.silent) {
        setSyncError(getOfficialOnlyEntry());
      }
      return false;
    };

    const isDocumentVisible = () =>
      typeof document === "undefined" || document.visibilityState !== "hidden";

    const getSyncRequestHeaders = (options) => {
      const headers = {};
      if (options && options.body != null) {
        headers["Content-Type"] = "application/json";
      }
      if (isLocalhostFrontend()) {
        const headerName = String(state.syncDevHeaderNameInput.value || "").trim();
        const headerValue = String(state.syncDevHeaderValueInput.value || "").trim();
        if (headerValue && devHeaderNamePattern.test(headerName)) {
          headers[headerName] = headerValue;
        }
      }
      return headers;
    };

    const isTurnstileEnabled = () => String(syncTurnstileSiteKey || "").trim() !== "";

    const isTurnstileApiReady = () =>
      typeof window !== "undefined" &&
      window.turnstile &&
      typeof window.turnstile.render === "function";

    const setSyncTurnstileMessage = (key, fallback, tone) => {
      state.syncTurnstileMessageKey.value = String(key || "");
      state.syncTurnstileMessageFallback.value = String(fallback || "");
      state.syncTurnstileMessageTone.value =
        tone === "error" || tone === "warning" ? tone : "info";
    };

    const clearSyncTurnstileMessage = () => {
      state.syncTurnstileMessageKey.value = "";
      state.syncTurnstileMessageFallback.value = "";
      state.syncTurnstileMessageTone.value = "info";
    };

    const loadTurnstileScript = () => {
      if (!isTurnstileEnabled()) {
        return Promise.reject(new Error("turnstile_site_key_missing"));
      }
      if (isTurnstileApiReady()) return Promise.resolve(window.turnstile);
      if (syncTurnstileLoadPromise) return syncTurnstileLoadPromise;
      syncTurnstileLoadPromise = new Promise((resolve, reject) => {
        if (typeof document === "undefined") {
          reject(new Error("turnstile_document_missing"));
          return;
        }
        let settled = false;
        const finishResolve = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          resolve(window.turnstile);
        };
        const finishReject = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          reject(error);
        };
        const timeoutId = setTimeout(() => {
          finishReject(new Error("turnstile_script_timeout"));
        }, 12000);
        const existing = document.querySelector(
          'script[data-sync-turnstile="1"], script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
        );
        const finish = () => {
          if (!isTurnstileApiReady()) {
            finishReject(new Error("turnstile_api_missing"));
            return;
          }
          finishResolve();
        };
        if (existing) {
          if (isTurnstileApiReady()) {
            finishResolve();
            return;
          }
          existing.remove();
        }
        const script = document.createElement("script");
        script.src = syncTurnstileScriptSrc;
        script.async = true;
        script.defer = true;
        script.setAttribute("data-sync-turnstile", "1");
        script.addEventListener("load", finish, { once: true });
        script.addEventListener("error", () => finishReject(new Error("turnstile_script_load_failed")), { once: true });
        document.head.appendChild(script);
      }).catch((error) => {
        syncTurnstileLoadPromise = null;
        throw error;
      });
      return syncTurnstileLoadPromise;
    };

    const clearSyncTurnstileToken = () => {
      if (!state.syncTurnstileToken || !("value" in state.syncTurnstileToken)) return;
      state.syncTurnstileToken.value = "";
    };

    const destroySyncTurnstileWidget = () => {
      syncTurnstileMountVersion += 1;
      syncTurnstileMountPromise = null;
      const widgetId = state.syncTurnstileWidgetId && "value" in state.syncTurnstileWidgetId
        ? state.syncTurnstileWidgetId.value
        : null;
      if (widgetId != null && isTurnstileApiReady() && typeof window.turnstile.remove === "function") {
        try {
          window.turnstile.remove(widgetId);
        } catch (error) {
          // ignore widget cleanup failures
        }
      }
      if (state.syncTurnstileWidgetId && "value" in state.syncTurnstileWidgetId) {
        state.syncTurnstileWidgetId.value = null;
      }
      clearSyncTurnstileToken();
      if (state.syncTurnstileRef && "value" in state.syncTurnstileRef && state.syncTurnstileRef.value) {
        state.syncTurnstileRef.value.innerHTML = "";
      }
    };

    const resetSyncTurnstileWidget = (options) => {
      clearSyncTurnstileToken();
      if (state.syncTurnstileUnavailable && "value" in state.syncTurnstileUnavailable) {
        state.syncTurnstileUnavailable.value = false;
      }
      const widgetId = state.syncTurnstileWidgetId && "value" in state.syncTurnstileWidgetId
        ? state.syncTurnstileWidgetId.value
        : null;
      if (widgetId != null && isTurnstileApiReady() && typeof window.turnstile.reset === "function") {
        try {
          window.turnstile.reset(widgetId);
          return;
        } catch (error) {
          // fall back to full re-render
        }
      }
      destroySyncTurnstileWidget();
      if (!options || !options.skipRemount) {
        void mountSyncTurnstile();
      }
    };

    const mountSyncTurnstile = async () => {
      if (!isTurnstileEnabled() || state.syncAuthenticated.value || !state.showSyncModal.value) return;
      if (state.syncFrontendBlocked.value) return;
      if (state.syncTurnstileWidgetId.value != null) return;
      if (syncTurnstileMountPromise) return syncTurnstileMountPromise;
      const mountVersion = syncTurnstileMountVersion;
      syncTurnstileMountPromise = (async () => {
        if (typeof nextTick === "function") {
          await nextTick();
        }
        if (mountVersion !== syncTurnstileMountVersion) return;
        const container = state.syncTurnstileRef && "value" in state.syncTurnstileRef
          ? state.syncTurnstileRef.value
          : null;
        if (!container || state.syncTurnstileWidgetId.value != null) return;
        if (state.syncTurnstileLoading && "value" in state.syncTurnstileLoading) {
          state.syncTurnstileLoading.value = true;
        }
        if (state.syncTurnstileUnavailable && "value" in state.syncTurnstileUnavailable) {
          state.syncTurnstileUnavailable.value = false;
        }
        setSyncTurnstileMessage("sync.turnstile_loading", "正在加载人机验证…", "info");
        clearSyncTurnstileToken();
        container.innerHTML = "";
        try {
          await loadTurnstileScript();
        } catch (error) {
          if (mountVersion !== syncTurnstileMountVersion) return;
          state.syncTurnstileLoading.value = false;
          state.syncTurnstileUnavailable.value = true;
          setSyncTurnstileMessage(
            "sync.error_turnstile_unavailable",
            "Verification is temporarily unavailable. Please try again later.",
            "warning"
          );
          return;
        }
        if (mountVersion !== syncTurnstileMountVersion) return;
        if (!isTurnstileApiReady()) {
          state.syncTurnstileLoading.value = false;
          state.syncTurnstileUnavailable.value = true;
          setSyncTurnstileMessage(
            "sync.error_turnstile_unavailable",
            "Verification is temporarily unavailable. Please try again later.",
            "warning"
          );
          return;
        }
        try {
          if (mountVersion !== syncTurnstileMountVersion) return;
          state.syncTurnstileWidgetId.value = window.turnstile.render(container, {
            sitekey: syncTurnstileSiteKey,
            action: syncTurnstileAction,
            theme: "auto",
            size: "flexible",
            callback: (token) => {
              state.syncTurnstileToken.value = String(token || "");
              state.syncTurnstileUnavailable.value = false;
              clearSyncTurnstileMessage();
            },
            "expired-callback": () => {
              clearSyncTurnstileToken();
              setSyncTurnstileMessage(
                "sync.error_turnstile_expired",
                "Verification expired. Please complete it again.",
                "warning"
              );
              resetSyncTurnstileWidget({ skipRemount: false });
            },
            "timeout-callback": () => {
              clearSyncTurnstileToken();
              setSyncTurnstileMessage(
                "sync.error_turnstile_expired",
                "Verification expired. Please complete it again.",
                "warning"
              );
              resetSyncTurnstileWidget({ skipRemount: false });
            },
            "error-callback": () => {
              clearSyncTurnstileToken();
              state.syncTurnstileUnavailable.value = true;
              setSyncTurnstileMessage(
                "sync.error_turnstile_failed",
                "Verification failed. Please retry.",
                "warning"
              );
            },
          });
          clearSyncTurnstileMessage();
        } catch (error) {
          state.syncTurnstileUnavailable.value = true;
          setSyncTurnstileMessage(
            "sync.error_turnstile_unavailable",
            "Verification is temporarily unavailable. Please try again later.",
            "warning"
          );
        } finally {
          state.syncTurnstileLoading.value = false;
        }
      })();
      try {
        await syncTurnstileMountPromise;
      } finally {
        syncTurnstileMountPromise = null;
      }
    };

    const extractSyncErrorCode = (value) => {
      if (typeof value === "string" || typeof value === "number") {
        return String(value || "").trim();
      }
      if (!isPlainObject(value)) return "";
      if (typeof value.code === "string" && value.code.trim()) return value.code.trim();
      if (typeof value.error === "string" && value.error.trim()) return value.error.trim();
      if (typeof value.message === "string" && value.message.trim()) return value.message.trim();
      return "";
    };

    const translateSyncError = (code) => {
      const map = {
        invalid_credentials: "sync.error_invalid_credentials",
        invalid_username: "sync.error_invalid_username",
        username_taken: "sync.error_username_taken",
        weak_password: "sync.error_weak_password",
        invalid_current_password: "sync.error_invalid_current_password",
        invalid_reset_code: "sync.error_invalid_reset_code",
        reset_code_unavailable: "sync.error_reset_code_unavailable",
        password_mismatch: "sync.error_password_mismatch",
        account_disabled: "sync.error_account_disabled",
        unauthorized: "sync.error_unauthorized",
        invalid_payload: "sync.error_invalid_payload",
        auth_failed: "sync.error_auth_failed",
        turnstile_required: "sync.error_turnstile_required",
        turnstile_failed: "sync.error_turnstile_failed",
        turnstile_unavailable: "sync.error_turnstile_unavailable",
        dev_token_required: "sync.error_dev_token_required",
        forbidden_host: "sync.error_forbidden_host",
        origin_not_allowed: "sync.error_origin_not_allowed",
        official_only: "sync.error_official_only",
        forbidden: "sync.error_official_only",
        https_required: "sync.error_https_required",
        rate_limited: "sync.error_rate_limited",
        sync_failed: "sync.error_sync_failed",
        api_abuse_blocked: "sync.error_api_abuse_blocked",
      };
      const key = map[String(code || "")];
      if (key) return getSyncText(key, String(code || ""));
      return extractSyncErrorCode(code);
    };

    const getSyncText = (key, fallback, params) =>
      coerceSyncText(typeof state.t === "function" ? state.t(key, params) : fallback, fallback || key);

    const getPreferredBackendMessage = (payload) => {
      if (!payload || typeof payload !== "object") return "";
      const locale = String(getRefValue(state.locale, "") || "").toLowerCase();
      if ((locale || "").startsWith("zh") && typeof payload.message_zh === "string" && payload.message_zh.trim()) {
        return payload.message_zh;
      }
      if ((locale || "").startsWith("ja") && typeof payload.message_ja === "string" && payload.message_ja.trim()) {
        return payload.message_ja;
      }
      if (typeof payload.message_en === "string" && payload.message_en.trim()) {
        return payload.message_en;
      }
      if (typeof payload.message === "string" && payload.message.trim()) {
        return payload.message;
      }
      return "";
    };

    const getAutoSyncRemainingSeconds = () => {
      const dueAt = Number(state.syncAutoSyncDueAt.value || 0);
      if (!dueAt) return 0;
      const now = Number(
        state.syncAutoSyncClock && "value" in state.syncAutoSyncClock
          ? state.syncAutoSyncClock.value
          : Date.now()
      );
      const remaining = Math.ceil((dueAt - now) / 1000);
      return remaining > 0 ? remaining : 0;
    };

    const normalizeSyncMessage = (message, fallbackKey, fallbackText, payload) => {
      const errorCode = extractSyncErrorCode((payload && payload.error) || message);
      const supportHint = getSyncText(
        "sync.support_hint",
        "If the issue keeps happening, contact the developer via GitHub or the notice-group entry."
      );
      const appendSupportHint = (text) => {
        const base = coerceSyncText(text, "");
        if (!base || !supportHint || base.indexOf(supportHint) >= 0) return base;
        return `${base} ${supportHint}`.trim();
      };
      const maybeAppendSupportHint = (text) => {
        if (
          fallbackKey === "sync.error_sync_failed" ||
          errorCode === "sync_failed" ||
          errorCode === "turnstile_unavailable"
        ) {
          return appendSupportHint(text);
        }
        return text;
      };
      const backendMessage = getPreferredBackendMessage(payload);
      const raw = coerceSyncText(backendMessage || message, "");
      const translated = translateSyncError(raw);
      if (translated && translated !== raw) return maybeAppendSupportHint(translated);
      if (!isSyncFrontendAllowed()) {
        return getSyncText("sync.error_official_only", "同步功能仅在官方网站 https://end.canmoe.com 可用");
      }
      if (!raw || /^TypeError\b/i.test(raw) || /Failed to fetch|Load failed|NetworkError/i.test(raw)) {
        return maybeAppendSupportHint(getSyncText(fallbackKey, fallbackText));
      }
      return maybeAppendSupportHint(raw);
    };

    const syncTurnstileToneByErrorCode = (errorCode) => {
      if (errorCode === "turnstile_unavailable") return "warning";
      if (errorCode === "turnstile_failed" || errorCode === "turnstile_expired") return "warning";
      return "";
    };

    const syncTurnstileEntryByErrorCode = (errorCode) => {
      if (errorCode === "turnstile_unavailable") {
        return createSyncTextEntry(
          "sync.error_turnstile_unavailable",
          "Verification is temporarily unavailable. Please try again later."
        );
      }
      if (errorCode === "turnstile_failed") {
        return createSyncTextEntry(
          "sync.error_turnstile_failed",
          "Verification failed. Please retry."
        );
      }
      if (errorCode === "turnstile_expired") {
        return createSyncTextEntry(
          "sync.error_turnstile_expired",
          "Verification expired. Please complete it again."
        );
      }
      return null;
    };

    const requestJson = async (endpoint, options) => {
      const requestOptions = Object.assign(
        {
          method: "GET",
          credentials: "include",
        },
        options || {}
      );
      const query = isPlainObject(requestOptions.query) ? requestOptions.query : null;
      delete requestOptions.query;
      requestOptions.headers = Object.assign(
        {},
        getSyncRequestHeaders(requestOptions),
        options && isPlainObject(options.headers) ? options.headers : {}
      );
      const response = await fetch(buildApiUrl(endpoint, query), requestOptions);
      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }
      if (!response.ok) {
        const errorCode = extractSyncErrorCode(payload && payload.error);
        const errorMessage = normalizeSyncMessage(
          translateSyncError(errorCode) || coerceSyncText(payload && payload.message, ""),
          response.status === 403 ? "sync.error_official_only" : "sync.error_sync_failed",
          response.status === 403 ? "同步功能仅在官方网站 https://end.canmoe.com 可用" : `HTTP ${response.status}`,
          payload
        );
        const error = new Error(errorMessage);
        error.status = response.status;
        error.payload = payload;
        throw error;
      }
      return payload || {};
    };

    const clearSyncConflictUiState = () => {
      state.syncConflictConfirmMode.value = "";
    };

    const clearSyncConflictState = () => {
      state.syncConflictDetected.value = false;
      state.syncConflictCurrent.value = null;
      clearSyncConflictUiState();
      lastSyncConflictReminderHash = "";
      lastSyncConflictReminderAt = 0;
      suppressNextConflictToastUntil = 0;
      dismissConflictToast();
    };

    const applyRemotePayload = (payload, options) => {
      const comparable = normalizeComparableData(payload);
      state.weaponMarks.value = comparable.marks;
      state.customWeapons.value = comparable.customWeapons;
      state.selectedNames.value = comparable.workspace.selectedNames || [];
      state.schemeBaseSelections.value = comparable.workspace.schemeBaseSelections || {};
      state.recommendationConfig.value = comparable.workspace.recommendationConfig || {};
      state.filterS1.value = comparable.workspace.filterS1 || [];
      state.filterS2.value = comparable.workspace.filterS2 || [];
      state.filterS3.value = comparable.workspace.filterS3 || [];
      state.weaponAttrOverrides.value = comparable.workspace.weaponAttrOverrides || {};
      state.showWeaponAttrs.value = Boolean(comparable.workspace.showWeaponAttrs);
      state.showWeaponOwnership.value = Boolean(comparable.workspace.showWeaponOwnership);
      state.showAllSchemes.value = Boolean(comparable.workspace.showAllSchemes);
      if (state.equipRefiningSelectedName) {
        state.equipRefiningSelectedName.value = String(
          comparable.workspace.equipRefiningSelectedName || ""
        );
      }
      const localHash = buildComparableHash(payload);
      persistMeta({
        serverVersion: options && options.serverVersion,
        localHash,
        syncedAt: new Date().toISOString(),
        remoteUpdatedAt: options && options.remoteUpdatedAt,
      });
      state.syncRemoteData.value = cloneJson(payload, {});
      state.syncRemoteVersion.value = Number((options && options.serverVersion) || 0);
      state.syncRemoteUpdatedAt.value = String((options && options.remoteUpdatedAt) || "");
      clearSyncConflictState();
    };

    const updateRemoteSnapshot = (remote) => {
      state.syncRemoteData.value = cloneJson(remote && remote.data, {});
      state.syncRemoteVersion.value = Number((remote && remote.version) || 0);
      state.syncRemoteUpdatedAt.value = String((remote && remote.updated_at) || "");
    };

    const updateRemoteSnapshotMeta = (remote) => {
      state.syncRemoteVersion.value = Number((remote && remote.version) || 0);
      state.syncRemoteUpdatedAt.value = String((remote && remote.updated_at) || "");
    };

    const fetchRemoteSnapshot = async () => {
      const remote = await requestJson("sync");
      updateRemoteSnapshot(remote);
      return remote;
    };

    const fetchRemoteMeta = async () => {
      const remote = await requestJson("sync", {
        query: {
          meta: "1",
        },
      });
      updateRemoteSnapshotMeta(remote);
      return remote;
    };

    const handleConflictPayload = (payload) => {
      state.syncConflictCurrent.value = payload && payload.current ? payload.current : null;
      state.syncConflictDetected.value = true;
      clearSyncConflictUiState();
      state.syncRemoteData.value = payload && payload.current && payload.current.data
        ? cloneJson(payload.current.data, {})
        : {};
      state.syncRemoteVersion.value = payload && payload.current ? Number(payload.current.version || 0) : 0;
      state.syncRemoteUpdatedAt.value =
        payload && payload.current ? String(payload.current.updated_at || "") : "";
      setSyncError(createSyncTextEntry("sync.error_conflict", "检测到同步冲突，请先确认当前设备还是云端数据应保留为最新版本。"));
      lastSyncConflictReminderHash = String(state.syncCurrentComparableHash.value || "");
      lastSyncConflictReminderAt = Date.now();
      const shouldSuppressToast =
        suppressNextConflictToastUntil > 0 && Date.now() <= suppressNextConflictToastUntil;
      suppressNextConflictToastUntil = 0;
      if (!shouldSuppressToast) {
        pushSyncConflictToast({ dedupWindowMs: 0 });
      }
    };

    const describeRemoteState = (remote) => {
      const localPayload = buildLocalPayload();
      const localHash = buildComparableHash(localPayload);
      const lastServerVersion = Number(state.syncLastSyncedServerVersion.value || 0);
      const lastLocalHash = String(state.syncLastLocalHash.value || "");
      return {
        localPayload,
        localHasData: hasMeaningfulLocalData(localPayload),
        localHash,
        lastServerVersion,
        lastLocalHash,
        hasSyncHistory: Boolean(lastLocalHash || lastServerVersion || state.syncLastSyncedAt.value),
        serverVersion: Number((remote && remote.version) || 0),
        serverChanged: Number((remote && remote.version) || 0) !== lastServerVersion,
        localChanged: localHash !== lastLocalHash,
      };
    };

    const applyRemoteSnapshotWithNotice = (remote, noticeKey, fallbackNotice) => {
      applyRemotePayload(remote.data, {
        serverVersion: remote.version,
        remoteUpdatedAt: remote.updated_at,
      });
      setSyncNotice(createSyncTextEntry(noticeKey, fallbackNotice), "info");
      pushSyncToast(
        "info",
        "sync.pull_success_title",
        noticeKey,
        "已拉取云端数据",
        fallbackNotice,
        `sync-pull:${Number(remote && remote.version || 0)}:${String(remote && remote.updated_at || "")}`
      );
    };

    const reconcileRemoteSnapshot = async (remote, options) => {
      const comparison = describeRemoteState(remote);
      if (!comparison.hasSyncHistory) {
        if (comparison.serverVersion > 0 && comparison.localHasData) {
          handleConflictPayload({ current: remote });
          return "conflict";
        }
        if (comparison.serverVersion > 0) {
          applyRemoteSnapshotWithNotice(
            remote,
            options && options.noticeKey ? options.noticeKey : "sync.remote_pulled_notice",
            options && options.fallbackNotice ? options.fallbackNotice : "检测到云端更新，已同步到当前设备。"
          );
          return "pulled";
        }
        return "idle";
      }
      if (!comparison.serverChanged) return "unchanged";
      if (!comparison.localChanged) {
        applyRemoteSnapshotWithNotice(
          remote,
          options && options.noticeKey ? options.noticeKey : "sync.remote_pulled_notice",
          options && options.fallbackNotice ? options.fallbackNotice : "检测到云端更新，已同步到当前设备。"
        );
        return "pulled";
      }
      handleConflictPayload({ current: remote });
      return "conflict";
    };

    const clearRemoteSnapshot = () => {
      state.syncRemoteData.value = {};
      state.syncRemoteVersion.value = 0;
      state.syncRemoteUpdatedAt.value = "";
    };

    const clearPasswordChangeForm = () => {
      if (state.syncCurrentPasswordInput && "value" in state.syncCurrentPasswordInput) {
        state.syncCurrentPasswordInput.value = "";
      }
      if (state.syncResetCodeInput && "value" in state.syncResetCodeInput) {
        state.syncResetCodeInput.value = "";
      }
      if (state.syncNewPasswordInput && "value" in state.syncNewPasswordInput) {
        state.syncNewPasswordInput.value = "";
      }
      if (state.syncChangePasswordConfirmInput && "value" in state.syncChangePasswordConfirmInput) {
        state.syncChangePasswordConfirmInput.value = "";
      }
      if (state.syncPasswordChangeMode && "value" in state.syncPasswordChangeMode) {
        state.syncPasswordChangeMode.value = "current";
      }
      if (state.syncPasswordChangeError && "value" in state.syncPasswordChangeError) {
        state.syncPasswordChangeError.value = "";
      }
      if (state.syncPasswordChangeNotice && "value" in state.syncPasswordChangeNotice) {
        state.syncPasswordChangeNotice.value = "";
      }
    };

    const closeSyncPasswordModal = () => {
      if (state.syncShowPasswordModal && "value" in state.syncShowPasswordModal) {
        state.syncShowPasswordModal.value = false;
      }
      if (state.syncPasswordChangeMode && "value" in state.syncPasswordChangeMode) {
        state.syncPasswordChangeMode.value = "current";
      }
      if (state.syncPasswordChangeError && "value" in state.syncPasswordChangeError) {
        state.syncPasswordChangeError.value = "";
      }
      if (state.syncPasswordChangeNotice && "value" in state.syncPasswordChangeNotice) {
        state.syncPasswordChangeNotice.value = "";
      }
    };

    const openSyncPasswordModal = () => {
      if (!ensureSyncFrontendAllowed()) return;
      if (state.syncShowPasswordModal && "value" in state.syncShowPasswordModal) {
        state.syncShowPasswordModal.value = true;
      }
      if (state.syncPasswordChangeMode && "value" in state.syncPasswordChangeMode) {
        state.syncPasswordChangeMode.value = state.syncAuthenticated.value ? "current" : "reset_code";
      }
      if (state.syncPasswordChangeError && "value" in state.syncPasswordChangeError) {
        state.syncPasswordChangeError.value = "";
      }
      if (state.syncPasswordChangeNotice && "value" in state.syncPasswordChangeNotice) {
        state.syncPasswordChangeNotice.value = "";
      }
    };

    const clearSyncModalCleanupTimer = () => {
      if (!syncModalCleanupTimer) return;
      clearTimeout(syncModalCleanupTimer);
      syncModalCleanupTimer = null;
    };

    const scheduleSyncModalCleanup = () => {
      clearSyncModalCleanupTimer();
      syncModalCleanupTimer = setTimeout(() => {
        destroySyncTurnstileWidget();
        clearSyncConflictUiState();
        closeSyncPasswordModal();
        clearPasswordChangeForm();
        syncModalCleanupTimer = null;
      }, 320);
    };

    const resetSyncSessionState = () => {
      state.syncUser.value = null;
      state.syncAuthenticated.value = false;
      clearRemoteSnapshot();
      clearSyncConflictState();
      closeSyncPasswordModal();
      clearPasswordChangeForm();
    };

    const handleSyncUnauthorized = (options) => {
      writeSessionHint(false);
      resetSyncSessionState();
      if (options && options.toastLogin) {
        pushSyncReauthToast();
      }
      if (options && options.silent) return;
      setSyncError(
        options && options.message
          ? options.message
          : createSyncTextEntry("sync.error_unauthorized", "请先登录。")
      );
    };

    const handleSyncAccountDisabled = (options) => {
      writeSessionHint(false);
      resetSyncSessionState();
      const message = createSyncTextEntry(
        "sync.error_account_disabled",
        "This account has been disabled. Please contact support."
      );
      setSyncError(message);
      pushSyncToast(
        "danger",
        "sync.account_disabled_title",
        "sync.error_account_disabled",
        "Account Disabled",
        "This account has been disabled. Please contact support.",
        "sync-account-disabled"
      );
      if (options && options.silent) return;
    };

    const handleSyncRequestFailure = (error, fallbackKey, fallbackText, options) => {
      const errorCode = extractSyncErrorCode(error && error.payload ? error.payload.error : error && error.message);
      if (errorCode === "account_disabled") {
        handleSyncAccountDisabled(options);
        return "account_disabled";
      }
      if (error && error.status === 401) {
        handleSyncUnauthorized(options);
        return "unauthorized";
      }
      if (error && error.status === 403 && shouldSkipAutoRefresh()) {
        return "blocked";
      }
      if (options && options.silent) {
        return "error";
      }
      const message = normalizeSyncMessage(
        error && error.message ? error.message : "",
        fallbackKey,
        fallbackText,
        error && error.payload ? error.payload : null
      );
      setSyncError(message);
      if (options && options.toastOnError) {
        pushSyncToast("danger", "sync.failure_title", "sync.failure_summary", "同步失败", message, `sync-failure:${message}`);
      }
      return "error";
    };

    const refreshSyncSession = async (skipSyncFetch, options) => {
      if (!ensureSyncFrontendAllowed({ silent: true })) return;
      if (shouldSkipAutoRefresh()) return;
      if (syncSessionRequest) return syncSessionRequest;
      state.syncSessionChecking.value = true;
      const currentRequest = (async () => {
        try {
          const me = await requestJson("me");
          state.syncUser.value = me;
          state.syncAuthenticated.value = true;
          writeSessionHint(true);
          if (skipSyncFetch) return;
          if (options && options.forceFullSnapshot) {
            const remote = await fetchRemoteSnapshot();
            await reconcileRemoteSnapshot(remote, {
              noticeKey: "sync.remote_pulled_notice",
              fallbackNotice: "检测到云端更新，已同步到当前设备。",
            });
            return;
          }
          await runPassiveRemoteCheck({ force: true, silentBlocked: true });
        } catch (error) {
          const failureType = handleSyncRequestFailure(error, "sync.error_sync_failed", "Sync failed due to a server error.", {
            silent: shouldSkipAutoRefresh(),
            toastLogin: readSessionHint(),
          });
          if (failureType === "unauthorized" || failureType === "account_disabled") {
            return;
          }
          if (error && error.status === 403 && shouldSkipAutoRefresh()) {
            return;
          }
        }
      })();
      syncSessionRequest = currentRequest;
      try {
        return await currentRequest;
      } finally {
        if (syncSessionRequest === currentRequest) {
          syncSessionRequest = null;
        }
        state.syncSessionChecking.value = false;
      }
    };

    const handleInitialRemoteStateAfterAuth = async () => {
      const remote = await fetchRemoteSnapshot();
      const comparison = describeRemoteState(remote);
      if (comparison.serverVersion <= 0 && comparison.localHasData) {
        const pushed = await requestJson("sync", {
          method: "POST",
          body: JSON.stringify({
            base_version: 0,
            data: comparison.localPayload,
          }),
        });
        applySuccessfulPushResult(pushed, comparison.localPayload, comparison.localHash, {
          noticeKey: "sync.push_success_title",
          summaryKey: "sync.push_success_summary",
          fallbackTitle: "已上传本地数据",
          fallbackSummary: "本地数据已同步到云端。",
        });
        return "pushed";
      }
      return reconcileRemoteSnapshot(remote, {
        noticeKey: "sync.pull_success_summary",
        fallbackNotice: "服务器数据已应用到当前设备。",
      });
    };

    const runPassiveRemoteCheck = async (options) => {
      if (!ensureSyncFrontendAllowed({ silent: Boolean(options && options.silentBlocked) })) {
        return "blocked";
      }
      if (shouldSkipAutoRefresh()) return "skip";
      if (!isDocumentVisible() && !(options && options.force)) return "hidden";
      if (state.syncBusy.value || state.syncConflictDetected.value) return "busy";
      const now = Date.now();
      if (!(options && options.force) && now - lastRemoteRefreshAt < remoteRefreshFocusCooldownMs) {
        return "cooldown";
      }
      if (!state.syncAuthenticated.value) {
        if (!readSessionHint()) return "idle";
        await refreshSyncSession(true);
        if (!state.syncAuthenticated.value) return "signed_out";
      }
      try {
        lastRemoteRefreshAt = now;
        const remoteMeta = await fetchRemoteMeta();
        const comparison = describeRemoteState(remoteMeta);
        if (comparison.hasSyncHistory && !comparison.serverChanged) {
          return "unchanged";
        }
        if (!comparison.hasSyncHistory && comparison.serverVersion <= 0) {
          return "idle";
        }
        const remote = await fetchRemoteSnapshot();
        return await reconcileRemoteSnapshot(remote, {
          noticeKey: "sync.remote_pulled_notice",
          fallbackNotice: "检测到云端更新，已同步到当前设备。",
        });
      } catch (error) {
        const result = handleSyncRequestFailure(error, "sync.error_sync_failed", "Sync failed due to a server error.", {
          silent: Boolean(options && options.silentErrors),
          silentBlocked: Boolean(options && options.silentBlocked),
          toastLogin: readSessionHint(),
        });
        return result === "unauthorized" || result === "account_disabled" ? "signed_out" : result;
      }
    };

    const stopRemoteRefreshTimer = () => {
      if (!remoteRefreshTimer) return;
      clearInterval(remoteRefreshTimer);
      remoteRefreshTimer = null;
    };

    const commitSyncSuccess = (noticeKey, summaryKey, fallbackTitle, fallbackSummary) => {
      setSyncNotice(createSyncTextEntry(summaryKey, fallbackSummary));
      const forceToast = summaryKey === "sync.pull_success_summary" || summaryKey === "sync.remote_pulled_notice";
      if (state.syncSuccessToastEnabled.value || forceToast) {
        pushSyncToast(
          forceToast ? "info" : "success",
          noticeKey,
          summaryKey,
          fallbackTitle,
          fallbackSummary,
          `${summaryKey}:${state.syncRemoteVersion.value}:${state.syncRemoteUpdatedAt.value}`
        );
      }
    };

    const applySuccessfulPushResult = (pushed, localPayload, localHash, options) => {
      persistMeta({
        serverVersion: Number(pushed && pushed.version || 0),
        localHash,
        syncedAt: new Date().toISOString(),
        remoteUpdatedAt: pushed && pushed.updated_at ? pushed.updated_at : "",
      });
      state.syncRemoteData.value = cloneJson(localPayload, {});
      state.syncRemoteVersion.value = Number(pushed && pushed.version || 0);
      state.syncRemoteUpdatedAt.value = String(pushed && pushed.updated_at || "");
      commitSyncSuccess(
        options && options.noticeKey ? options.noticeKey : "sync.push_success_title",
        options && options.summaryKey ? options.summaryKey : "sync.push_success_summary",
        options && options.fallbackTitle ? options.fallbackTitle : "已上传本地数据",
        options && options.fallbackSummary ? options.fallbackSummary : "本地数据已同步到云端。"
      );
    };

    const performManualSync = async () => {
      if (!ensureSyncFrontendAllowed()) return;
      if (!state.syncAuthenticated.value) {
        setSyncError(createSyncTextEntry("sync.error_unauthorized", "请先登录。"));
        return;
      }
      clearAutoSyncTimer();
      state.syncBusy.value = true;
      clearSyncConflictState();
      try {
        const localPayload = buildLocalPayload();
        const localHash = buildComparableHash(localPayload);
        const remote = await requestJson("sync");
        state.syncRemoteData.value = cloneJson(remote.data, {});
        state.syncRemoteVersion.value = Number(remote.version || 0);
        state.syncRemoteUpdatedAt.value = String(remote.updated_at || "");

        const lastServerVersion = Number(state.syncLastSyncedServerVersion.value || 0);
        const lastLocalHash = String(state.syncLastLocalHash.value || "");
        const localHasData = hasMeaningfulLocalData(localPayload);
        const hasSyncHistory = Boolean(lastLocalHash || lastServerVersion || state.syncLastSyncedAt.value);

        if (!hasSyncHistory) {
          if (remote.version > 0 && localHasData) {
            handleConflictPayload({ current: remote });
            return;
          }
          if (remote.version > 0) {
            applyRemotePayload(remote.data, {
              serverVersion: remote.version,
              remoteUpdatedAt: remote.updated_at,
            });
            commitSyncSuccess(
              "sync.pull_success_title",
              "sync.pull_success_summary",
              "已拉取云端数据",
              "服务器数据已应用到当前设备。"
            );
            return;
          }
          if (!localHasData) {
            setSyncNotice(createSyncTextEntry("sync.no_data_notice", "No local or cloud data yet."), "info");
            return;
          }
        }

        const localChanged = localHash !== lastLocalHash;
        const serverChanged = Number(remote.version || 0) !== lastServerVersion;

        if (!localChanged && !serverChanged) {
          setSyncNotice(createSyncTextEntry("sync.already_up_to_date", "Already up to date."), "info");
          return;
        }

        if (!localChanged && serverChanged) {
          applyRemotePayload(remote.data, {
            serverVersion: remote.version,
            remoteUpdatedAt: remote.updated_at,
          });
          commitSyncSuccess(
            "sync.pull_success_title",
            "sync.pull_success_summary",
            "已拉取云端数据",
            "服务器数据已应用到当前设备。"
          );
          return;
        }

        if (localChanged && serverChanged) {
          handleConflictPayload({ current: remote });
          return;
        }

        const pushed = await requestJson("sync", {
          method: "POST",
          body: JSON.stringify({
            base_version: Number(remote.version || 0),
            data: localPayload,
          }),
        });
        persistMeta({
          serverVersion: Number(pushed.version || 0),
          localHash,
          syncedAt: new Date().toISOString(),
          remoteUpdatedAt: pushed.updated_at || "",
        });
        state.syncRemoteData.value = cloneJson(localPayload, {});
        state.syncRemoteVersion.value = Number(pushed.version || 0);
        state.syncRemoteUpdatedAt.value = String(pushed.updated_at || "");
        commitSyncSuccess(
          "sync.push_success_title",
          "sync.push_success_summary",
          "已上传本地数据",
          "本地数据已同步到云端。"
        );
      } catch (error) {
        if (error && error.status === 409 && error.payload) {
          handleConflictPayload(error.payload);
        } else {
          handleSyncRequestFailure(error, "sync.error_sync_failed", "Sync failed due to a server error.", {
            toastOnError: true,
          });
        }
      } finally {
        state.syncBusy.value = false;
      }
    };

    const applySyncConflictUseServer = async () => {
      const current = state.syncConflictCurrent.value;
      if (!current) return;
      applyRemotePayload(current.data || {}, {
        serverVersion: current.version,
        remoteUpdatedAt: current.updated_at,
      });
      commitSyncSuccess(
        "sync.conflict_server_title",
        "sync.conflict_server_summary",
        "已采用云端数据",
        "当前设备已切换为云端版本。"
      );
    };

    const applySyncConflictUseLocal = async () => {
      if (!ensureSyncFrontendAllowed()) return;
      if (!state.syncAuthenticated.value) return;
      clearAutoSyncTimer();
      state.syncBusy.value = true;
      try {
        const localPayload = buildLocalPayload();
        const localHash = buildComparableHash(localPayload);
        const current = state.syncConflictCurrent.value;
        const baseVersion = current ? Number(current.version || 0) : Number(state.syncRemoteVersion.value || 0);
        const pushed = await requestJson("sync", {
          method: "POST",
          body: JSON.stringify({
            base_version: baseVersion,
            data: localPayload,
          }),
        });
        persistMeta({
          serverVersion: Number(pushed.version || 0),
          localHash,
          syncedAt: new Date().toISOString(),
          remoteUpdatedAt: pushed.updated_at || "",
        });
        state.syncRemoteData.value = cloneJson(localPayload, {});
        state.syncRemoteVersion.value = Number(pushed.version || 0);
        state.syncRemoteUpdatedAt.value = String(pushed.updated_at || "");
        clearSyncConflictState();
        commitSyncSuccess(
          "sync.conflict_local_title",
          "sync.conflict_local_summary",
          "已用当前设备覆盖云端",
          "当前设备内容已写入云端。"
        );
      } catch (error) {
        if (error && error.status === 409 && error.payload) {
          handleConflictPayload(error.payload);
        } else {
          handleSyncRequestFailure(error, "sync.error_sync_failed", "Sync failed due to a server error.");
        }
      } finally {
        state.syncBusy.value = false;
      }
    };

    const resolveSyncConflictUseServer = () => {
      state.syncConflictConfirmMode.value = "use-server";
    };

    const resolveSyncConflictUseLocal = () => {
      state.syncConflictConfirmMode.value = "use-local";
    };

    const cancelSyncConflictConfirmation = () => {
      state.syncConflictConfirmMode.value = "";
    };

    const confirmSyncConflictResolution = async () => {
      const mode = String(state.syncConflictConfirmMode.value || "");
      if (!mode) return;
      state.syncConflictConfirmMode.value = "";
      if (mode === "use-server") {
        await applySyncConflictUseServer();
        return;
      }
      if (mode === "use-local") {
        await applySyncConflictUseLocal();
        return;
      }
    };

    const clearSyncFeedback = () => {
      state.syncError.value = "";
      state.syncNotice.value = "";
      state.syncStatusItems.value = [];
    };

    const sendBestEffortLeaveSync = () => {
      if (!ensureSyncFrontendAllowed({ silent: true })) return;
      if (isLocalhostFrontend()) return;
      if (shouldSkipAutoRefresh()) return;
      if (!state.syncAuthenticated.value || state.syncBusy.value || state.syncConflictDetected.value) return;
      if (typeof fetch !== "function") return;
      const currentHash = String(state.syncCurrentComparableHash.value || "");
      const lastHash = String(state.syncLastLocalHash.value || "");
      if (!currentHash || currentHash === lastHash) return;
      const localPayload = buildLocalPayload();
      const baseVersion = Number(state.syncRemoteVersion.value || state.syncLastSyncedServerVersion.value || 0);
      try {
        fetch(buildApiUrl("sync"), {
          method: "POST",
          credentials: "include",
          keepalive: true,
          headers: {
            "Content-Type": "text/plain;charset=UTF-8",
          },
          body: JSON.stringify({
            base_version: baseVersion,
            data: localPayload,
          }),
        });
      } catch (error) {
        // best effort only; normal timed sync remains the primary guarantee
      }
    };

    const submitSyncAuth = async () => {
      if (!ensureSyncFrontendAllowed()) return;
      const username = String(state.syncUsernameInput.value || "").trim();
      const password = String(state.syncPasswordInput.value || "");
      const confirmPassword = String(state.syncPasswordConfirmInput.value || "");
      if (!username || !password) {
        setSyncError(createSyncTextEntry("sync.error_missing_credentials", "请输入用户名和密码。"));
        return;
      }
      if (state.syncAuthMode.value === "register" && !usernamePattern.test(username)) {
        setSyncError(createSyncTextEntry("sync.error_invalid_username", "用户名只能使用 3-24 位字母、数字或下划线。"));
        return;
      }
      if (state.syncAuthMode.value === "register" && password.length < 6) {
        setSyncError(createSyncTextEntry("sync.error_weak_password", "密码至少需要 6 位。"));
        return;
      }
      if (state.syncAuthMode.value === "register" && password !== confirmPassword) {
        setSyncError(createSyncTextEntry("sync.error_password_mismatch", "两次输入的密码不一致。"));
        return;
      }
      if (isTurnstileEnabled() && !state.syncTurnstileToken.value) {
        setSyncError(createSyncTextEntry("sync.error_turnstile_required", "请先完成人机验证。"));
        return;
      }
      state.syncBusy.value = true;
      try {
        await requestJson(state.syncAuthMode.value === "register" ? "register" : "login", {
          method: "POST",
          body: JSON.stringify({
            username,
            password,
            "cf-turnstile-response": String(state.syncTurnstileToken.value || ""),
          }),
        });
        writeSessionHint(true);
        state.syncPasswordInput.value = "";
        state.syncPasswordConfirmInput.value = "";
        destroySyncTurnstileWidget();
        await refreshSyncSession(true);
        setSyncNotice(createSyncTextEntry(
          state.syncAuthMode.value === "register" ? "sync.register_success" : "sync.login_success",
          "登录成功。"
        ), "info");
        await handleInitialRemoteStateAfterAuth();
      } catch (error) {
        const errorCode = extractSyncErrorCode(
          (error && error.payload && error.payload.error) || (error && error.message) || ""
        );
        const turnstileEntry = syncTurnstileEntryByErrorCode(errorCode);
        if (turnstileEntry) {
          const tone = syncTurnstileToneByErrorCode(errorCode);
          setSyncTurnstileMessage(turnstileEntry.key, turnstileEntry.fallback, tone || "warning");
        }
        setSyncError(
          normalizeSyncMessage(
            error && error.message ? error.message : "",
            "sync.error_sync_failed",
            "Sync failed due to a server error.",
            error && error.payload ? error.payload : null
          )
        );
      } finally {
        if (isTurnstileEnabled() && !state.syncAuthenticated.value) {
          resetSyncTurnstileWidget({ skipRemount: false });
        }
        state.syncBusy.value = false;
      }
    };

    const submitSyncPasswordChange = async () => {
      if (!ensureSyncFrontendAllowed()) return;
      const authenticated = Boolean(state.syncAuthenticated.value);
      const useResetCode =
        !authenticated || String(state.syncPasswordChangeMode.value || "current") === "reset_code";
      const username = String(state.syncUsernameInput.value || "").trim();
      const currentPassword = String(state.syncCurrentPasswordInput.value || "");
      const resetCode = String(state.syncResetCodeInput.value || "").trim();
      const newPassword = String(state.syncNewPasswordInput.value || "");
      const confirmPassword = String(state.syncChangePasswordConfirmInput.value || "");
      state.syncPasswordChangeError.value = "";
      state.syncPasswordChangeNotice.value = "";

      if (!authenticated && !useResetCode) {
        const message = createSyncTextEntry("sync.error_unauthorized", "Please sign in first.");
        state.syncPasswordChangeError.value = resolveSyncEntry(message).text;
        setSyncError(message);
        return;
      }

      if (useResetCode) {
        if ((!authenticated && !username) || !resetCode || !newPassword || !confirmPassword) {
          const message = createSyncTextEntry(
            "sync.error_missing_reset_password_fields",
            "Please enter the required reset-code fields."
          );
          state.syncPasswordChangeError.value = resolveSyncEntry(message).text;
          setSyncError(message);
          return;
        }
        if (!authenticated && !usernamePattern.test(username)) {
          const message = createSyncTextEntry(
            "sync.error_invalid_username",
            "Username must be 3-24 letters, numbers, or underscores."
          );
          state.syncPasswordChangeError.value = resolveSyncEntry(message).text;
          setSyncError(message);
          return;
        }
      } else if (!currentPassword || !newPassword || !confirmPassword) {
        const message = createSyncTextEntry(
          "sync.error_missing_change_password_fields",
          "Please enter current password, new password, and confirmation."
        );
        state.syncPasswordChangeError.value = resolveSyncEntry(message).text;
        setSyncError(message);
        return;
      }

      if (newPassword.length < 6) {
        const message = createSyncTextEntry("sync.error_weak_password", "Password must be at least 6 characters.");
        state.syncPasswordChangeError.value = resolveSyncEntry(message).text;
        setSyncError(message);
        return;
      }
      if (newPassword !== confirmPassword) {
        const message = createSyncTextEntry("sync.error_password_mismatch", "The two passwords do not match.");
        state.syncPasswordChangeError.value = resolveSyncEntry(message).text;
        setSyncError(message);
        return;
      }

      state.syncBusy.value = true;
      try {
        const payload = useResetCode
          ? {
              reset_code: resetCode,
              new_password: newPassword,
              confirm_password: confirmPassword,
            }
          : {
              current_password: currentPassword,
              new_password: newPassword,
              confirm_password: confirmPassword,
            };
        if (useResetCode && !authenticated) {
          payload.username = username;
        }
        const response = await requestJson("change-password", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        clearPasswordChangeForm();
        if (useResetCode) {
          state.syncAuthMode.value = "login";
          if (authenticated && response && response.reauth_required === false) {
            const successEntry = createSyncTextEntry(
              "sync.change_password_success",
              "Password updated. Other devices have been signed out."
            );
            await refreshSyncSession(true);
            setSyncNotice(successEntry, "success");
            pushSyncToast(
              "success",
              "sync.change_password_title",
              "sync.change_password_success",
              "Change Password",
              "Password updated. Other devices have been signed out.",
              "sync-change-password-success"
            );
          } else {
            const successEntry = createSyncTextEntry(
              "sync.reset_password_success",
              "Password reset complete. Please sign in with the new password."
            );
            writeSessionHint(false);
            resetSyncSessionState();
            if (!authenticated) {
              state.syncUsernameInput.value = username;
            }
            setSyncNotice(successEntry, "info");
            pushSyncToast(
              "info",
              "sync.change_password_title",
              "sync.reset_password_success",
              "Password Reset",
              "Password reset complete. Please sign in with the new password.",
              "sync-reset-password-success"
            );
          }
          closeSyncPasswordModal();
          return;
        }

        const successEntry = createSyncTextEntry(
          "sync.change_password_success",
          "Password updated. Other devices have been signed out."
        );
        state.syncPasswordChangeNotice.value = resolveSyncEntry(successEntry).text;
        setSyncNotice(successEntry, "success");
        pushSyncToast(
          "success",
          "sync.change_password_title",
          "sync.change_password_success",
          "Change Password",
          "Password updated. Other devices have been signed out.",
          "sync-change-password-success"
        );
        closeSyncPasswordModal();
      } catch (error) {
        const message = normalizeSyncMessage(
          error && error.message ? error.message : "",
          "sync.error_sync_failed",
          "Sync failed due to a server error.",
          error && error.payload ? error.payload : null
        );
        state.syncPasswordChangeError.value = coerceSyncText(message, "");
        setSyncError(message);
      } finally {
        state.syncBusy.value = false;
      }
    };

    const logoutSync = async () => {
      if (!ensureSyncFrontendAllowed()) return;
      clearAutoSyncTimer();
      state.syncBusy.value = true;
      try {
        await requestJson("logout", {
          method: "POST",
          body: JSON.stringify({}),
        });
      } catch (error) {
        // ignore logout failures and clear local session state anyway
      } finally {
        state.syncBusy.value = false;
      }
      state.syncUser.value = null;
      resetSyncSessionState();
      clearSyncModalCleanupTimer();
      state.syncPasswordInput.value = "";
      state.syncPasswordConfirmInput.value = "";
      clearPasswordChangeForm();
      resetSyncTurnstileWidget({ skipRemount: false });
      writeSessionHint(false);
      clearSyncFeedback();
      setSyncNotice(createSyncTextEntry("sync.logout_success", "已退出登录。"), "info");
    };

    const storedMeta = readJsonStorage(syncMetaStorageKey, defaultMeta);
    const storedPrefs = readJsonStorage(syncPrefsStorageKey, { successToastEnabled: true });
    const storedDevSettingsRaw = isLocalhostFrontend()
      ? readJsonStorage(syncDevStorageKey, { apiBase: "", headerName: "", headerValue: "" })
      : { apiBase: "", headerName: "", headerValue: "" };
    const storedDevSettings = {
      apiBase: String(storedDevSettingsRaw && storedDevSettingsRaw.apiBase ? storedDevSettingsRaw.apiBase : ""),
      headerName: String(
        storedDevSettingsRaw && storedDevSettingsRaw.headerName
          ? storedDevSettingsRaw.headerName
          : storedDevSettingsRaw && storedDevSettingsRaw.devToken
            ? "X-Dev-Token"
            : ""
      ),
      headerValue: String(
        storedDevSettingsRaw && storedDevSettingsRaw.headerValue
          ? storedDevSettingsRaw.headerValue
          : storedDevSettingsRaw && storedDevSettingsRaw.devToken
            ? storedDevSettingsRaw.devToken
            : ""
      ),
    };

    state.syncAuthMode = ref("login");
    state.syncBusy = ref(false);
    state.syncAuthenticated = ref(false);
    state.syncUser = ref(null);
    state.syncUsernameInput = ref("");
    state.syncPasswordInput = ref("");
    state.syncPasswordConfirmInput = ref("");
    state.syncCurrentPasswordInput = ref("");
    state.syncResetCodeInput = ref("");
    state.syncPasswordChangeMode = ref("current");
    state.syncNewPasswordInput = ref("");
    state.syncChangePasswordConfirmInput = ref("");
    state.syncPasswordChangeError = ref("");
    state.syncPasswordChangeNotice = ref("");
    state.syncShowPasswordModal = ref(false);
    state.syncTurnstileRef = ref(null);
    state.syncTurnstileWidgetId = ref(null);
    state.syncTurnstileToken = ref("");
    state.syncTurnstileLoading = ref(false);
    state.syncTurnstileUnavailable = ref(false);
    state.syncTurnstileMessageKey = ref("");
    state.syncTurnstileMessageFallback = ref("");
    state.syncTurnstileMessageTone = ref("info");
    state.syncSessionChecking = ref(false);
    state.syncError = ref("");
    state.syncNotice = ref("");
    state.syncStatusItems = ref([]);
    state.syncStatusListRef = ref(null);
    state.syncRemoteData = ref({});
    state.syncRemoteVersion = ref(0);
    state.syncRemoteUpdatedAt = ref("");
    state.syncConflictDetected = ref(false);
    state.syncConflictCurrent = ref(null);
    state.syncConflictConfirmMode = ref("");
    state.syncSuccessToastEnabled = ref(storedPrefs.successToastEnabled !== false);
    state.syncApiBaseInput = ref(String(storedDevSettings.apiBase || ""));
    state.syncDevHeaderNameInput = ref(String(storedDevSettings.headerName || ""));
    state.syncDevHeaderValueInput = ref(String(storedDevSettings.headerValue || ""));
    state.syncLastSyncedServerVersion = ref(Number(storedMeta.serverVersion || 0));
    state.syncLastSyncedAt = ref(String(storedMeta.syncedAt || ""));
    state.syncLastRemoteUpdatedAt = ref(String(storedMeta.remoteUpdatedAt || ""));
    state.syncLastLocalHash = ref(String(storedMeta.localHash || ""));
    state.syncAutoSyncDueAt = ref(0);
    state.syncAutoSyncClock = ref(Date.now());
    state.syncCurrentComparableHash = computed(() => buildComparableHash(buildLocalComparable()));
    state.syncLastSyncedDisplay = computed(() => formatSyncDateTime(state.syncLastSyncedAt.value));
    state.syncRemoteUpdatedDisplay = computed(() => formatSyncDateTime(state.syncRemoteUpdatedAt.value));
    state.syncStatusDisplayItems = computed(() => {
      const items = Array.isArray(state.syncStatusItems.value) ? state.syncStatusItems.value : [];
      return items.map((item) => Object.assign({}, item, {
        displayMessage: resolveSyncStatusMessage(item),
      }));
    });
    state.syncStatusRenderItems = computed(() => {
      const displayItems = Array.isArray(state.syncStatusDisplayItems.value) ? state.syncStatusDisplayItems.value : [];
      if (displayItems.length) return displayItems;
      return Array.isArray(state.syncStatusItems.value) ? state.syncStatusItems.value : [];
    });
    state.syncHasStatusItems = computed(() =>
      Array.isArray(state.syncStatusRenderItems.value) && state.syncStatusRenderItems.value.length > 0
    );
    state.syncAutoSyncText = computed(() => {
      const dueAt = Number(state.syncAutoSyncDueAt.value || 0);
      const seconds = dueAt > 0 ? getAutoSyncRemainingSeconds() : Math.round(autoSyncDelayMs / 1000);
      const currentHash = String(state.syncCurrentComparableHash.value || "");
      const lastHash = String(state.syncLastLocalHash.value || "");
      if (!state.syncAuthenticated.value) {
        return getSyncText("sync.auto_sync_signed_out", "登录后开启自动同步");
      }
      if (state.syncConflictDetected.value) {
        return getSyncText("sync.auto_sync_conflict", "已暂停，需先处理同步冲突");
      }
      if (state.syncBusy.value) {
        return getSyncText("sync.auto_sync_syncing", "正在同步");
      }
      if (currentHash && currentHash !== lastHash) {
        return getSyncText(
          "sync.auto_sync_scheduled",
          `检测到本地改动，约 ${seconds} 秒后自动同步`,
          { seconds: String(seconds) }
        );
      }
      return getSyncText(
        "sync.auto_sync_waiting",
        "已开启，检测到本地改动后会自动同步"
      );
    });

    state.syncLocalSummary = computed(() => summarizePayload(buildLocalPayload(), 0, ""));
    state.syncRemoteSummary = computed(() =>
      summarizePayload(state.syncRemoteData.value, state.syncRemoteVersion.value, state.syncRemoteUpdatedAt.value)
    );
    state.syncConflictCurrentSummary = computed(() =>
      summarizePayload(
        state.syncConflictCurrent.value ? state.syncConflictCurrent.value.data : {},
        state.syncConflictCurrent.value ? state.syncConflictCurrent.value.version : 0,
        state.syncConflictCurrent.value ? state.syncConflictCurrent.value.updated_at : ""
      )
    );
    state.syncIsLocalhostMode = computed(() => isLocalhostFrontend());
    state.syncShowDevPanel = computed(() => isLocalhostFrontend() && runtimeEnv !== "production");
    state.syncFrontendBlocked = computed(() => !isSyncFrontendAllowed());
    state.syncFrontendBlockedMessage = computed(() =>
      getSyncText("sync.error_official_only", "同步功能仅在官方网站 https://end.canmoe.com 可用")
    );
    state.syncTurnstileEnabled = computed(() => isTurnstileEnabled());
    state.syncTurnstileMounted = computed(() => Boolean(state.syncTurnstileWidgetId.value));
    state.syncTurnstileVerified = computed(() => Boolean(state.syncTurnstileToken.value));
    state.syncTurnstileReadyToSubmit = computed(() =>
      !state.syncTurnstileEnabled.value || Boolean(state.syncTurnstileToken.value)
    );
    state.syncTurnstileMessage = computed(() =>
      state.syncTurnstileMessageKey.value
        ? getSyncText(state.syncTurnstileMessageKey.value, state.syncTurnstileMessageFallback.value)
        : ""
    );
    state.formatSyncDateTime = formatSyncDateTime;
    state.submitSyncAuth = submitSyncAuth;
    state.submitSyncPasswordChange = submitSyncPasswordChange;
    state.openSyncPasswordModal = openSyncPasswordModal;
    state.closeSyncPasswordModal = closeSyncPasswordModal;
    state.logoutSync = logoutSync;
    state.performManualSync = performManualSync;
    state.resolveSyncConflictUseServer = resolveSyncConflictUseServer;
    state.resolveSyncConflictUseLocal = resolveSyncConflictUseLocal;
    state.confirmSyncConflictResolution = confirmSyncConflictResolution;
    state.cancelSyncConflictConfirmation = cancelSyncConflictConfirmation;
    state.refreshSyncSession = refreshSyncSession;
    state.clearSyncFeedback = clearSyncFeedback;
    state.saveSyncDevSettings = () => {
      state.syncApiBaseInput.value = String(state.syncApiBaseInput.value || "").trim();
      state.syncDevHeaderNameInput.value = String(state.syncDevHeaderNameInput.value || "").trim();
      state.syncDevHeaderValueInput.value = String(state.syncDevHeaderValueInput.value || "").trim();
      persistDevSettings();
      setSyncNotice(createSyncTextEntry("sync.dev_settings_saved", "开发设置已保存。"), "info");
    };

    if (typeof onMounted === "function") {
      onMounted(() => {
        if (typeof window !== "undefined") {
          const handleSyncVisibilityRecovery = () => {
            if (!isDocumentVisible()) return;
            runPassiveRemoteCheck({ silentBlocked: true, silentErrors: true });
          };
          const handleSyncPageHide = () => {
            sendBestEffortLeaveSync();
          };
          state.__handleSyncVisibilityRecovery = handleSyncVisibilityRecovery;
          state.__handleSyncPageHide = handleSyncPageHide;
          window.addEventListener("focus", handleSyncVisibilityRecovery);
          window.addEventListener("pageshow", handleSyncVisibilityRecovery);
          window.addEventListener("pagehide", handleSyncPageHide);
          if (typeof document !== "undefined") {
            document.addEventListener("visibilitychange", handleSyncVisibilityRecovery);
          }
          remoteRefreshTimer = setInterval(() => {
            if (!isDocumentVisible()) return;
            runPassiveRemoteCheck({ silentBlocked: true, silentErrors: true });
          }, remoteRefreshIntervalMs);
        }
        if (readSessionHint()) {
          refreshSyncSession(false, { forceFullSnapshot: true });
        }
        if (state.showSyncModal.value) {
          void mountSyncTurnstile();
        }
      });
    }

    if (typeof onBeforeUnmount === "function") {
      onBeforeUnmount(() => {
        stopRemoteRefreshTimer();
        const handleSyncVisibilityRecovery = state.__handleSyncVisibilityRecovery;
        if (handleSyncVisibilityRecovery && typeof window !== "undefined") {
          window.removeEventListener("focus", handleSyncVisibilityRecovery);
          window.removeEventListener("pageshow", handleSyncVisibilityRecovery);
        }
        const handleSyncPageHide = state.__handleSyncPageHide;
        if (handleSyncPageHide && typeof window !== "undefined") {
          window.removeEventListener("pagehide", handleSyncPageHide);
        }
        if (handleSyncVisibilityRecovery && typeof document !== "undefined") {
          document.removeEventListener("visibilitychange", handleSyncVisibilityRecovery);
        }
        state.__handleSyncVisibilityRecovery = null;
        state.__handleSyncPageHide = null;
        clearSyncModalCleanupTimer();
        destroySyncTurnstileWidget();
      });
    }

    watch(state.syncSuccessToastEnabled, () => {
      persistPrefs();
    });

    watch(
      () => {
        const items = Array.isArray(state.syncStatusItems.value) ? state.syncStatusItems.value : [];
        return items.length ? items[0].id : "";
      },
      (currentId, previousId) => {
        if (!currentId || currentId === previousId) return;
        if (typeof nextTick === "function") {
          nextTick(scrollSyncStatusListToTop);
          return;
        }
        scrollSyncStatusListToTop();
      }
    );

    watch(
      () => [
        Boolean(state.syncAuthenticated.value),
        Boolean(state.syncBusy.value),
        Boolean(state.syncConflictDetected.value),
        String(state.syncCurrentComparableHash.value || ""),
        String(state.syncLastLocalHash.value || ""),
      ],
      (current, previous) => {
        const [authenticated, busy, conflict, currentHash, lastHash] = current;
        if (!authenticated || busy || conflict || !currentHash || currentHash === lastHash) {
          clearAutoSyncTimer();
          return;
        }
        const previousHash = Array.isArray(previous) ? previous[3] : "";
        if (currentHash !== previousHash || !autoSyncTimer) {
          scheduleAutoSync();
        }
      },
      { immediate: true }
    );

    watch(
      () => [Boolean(state.syncConflictDetected.value), String(state.syncCurrentComparableHash.value || "")],
      (current, previous) => {
        const [conflictDetected, currentHash] = current;
        if (!conflictDetected) {
          lastSyncConflictReminderHash = "";
          lastSyncConflictReminderAt = 0;
          return;
        }
        if (!currentHash) return;
        const previousConflict = Array.isArray(previous) ? Boolean(previous[0]) : false;
        const previousHash = Array.isArray(previous) ? String(previous[1] || "") : "";
        if (!previousConflict) {
          lastSyncConflictReminderHash = currentHash;
          return;
        }
        if (currentHash === previousHash || currentHash === lastSyncConflictReminderHash) return;
        const now = Date.now();
        if (now - lastSyncConflictReminderAt < syncConflictReminderThrottleMs) return;
        lastSyncConflictReminderHash = currentHash;
        lastSyncConflictReminderAt = now;
        pushSyncConflictToast({ dedupWindowMs: 0 });
      }
    );

    watch(state.showSyncModal, (open) => {
      if (open) {
        clearSyncModalCleanupTimer();
        if (!ensureSyncFrontendAllowed({ silent: true })) return;
        const now = Date.now();
        const shouldCheck =
          !lastSyncModalOpenCheckAt || (now - lastSyncModalOpenCheckAt) >= syncModalOpenCheckCooldownMs;
        if (shouldCheck) {
          lastSyncModalOpenCheckAt = now;
          if (state.syncAuthenticated.value) {
            refreshSyncSession(false, { forceFullSnapshot: true });
          } else {
            runPassiveRemoteCheck({ force: true, silentBlocked: true, silentErrors: true });
          }
        }
        if (typeof nextTick === "function") {
          nextTick(() => {
            scrollSyncStatusListToTop();
            void mountSyncTurnstile();
          });
        } else {
          scrollSyncStatusListToTop();
          void mountSyncTurnstile();
        }
        return;
      }
      scheduleSyncModalCleanup();
    });

    watch(
      () => [Boolean(state.showSyncModal.value), Boolean(state.syncAuthenticated.value)],
      ([open, authenticated]) => {
        if (!open) return;
        if (authenticated) {
          destroySyncTurnstileWidget();
          return;
        }
        void mountSyncTurnstile();
      }
    );

    watch(state.syncAuthMode, () => {
      if (!state.showSyncModal.value || state.syncAuthenticated.value || !isTurnstileEnabled()) return;
      clearSyncTurnstileMessage();
      destroySyncTurnstileWidget();
      void mountSyncTurnstile();
    });

  };

  modules.initSync.required = ["initState", "initStorage", "initModals"];
  modules.initSync.optional = ["initUi", "initUpdate"];
  modules.initSync.requiredProviders = [];
  modules.initSync.optionalProviders = [];
})();

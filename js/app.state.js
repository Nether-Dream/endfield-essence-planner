(function () {
  const modules = (window.AppModules = window.AppModules || {});

  modules.initState = function initState(ctx, state) {
    const { ref } = ctx;

    state.searchQuery = ref("");
    state.matchQuery = ref("");
    state.selectedNames = ref([]);
    state.matchSourceName = ref("");
    state.selectedCharacterId = ref(null);
    state.schemeBaseSelections = ref({});
    state.weaponMarks = ref({});
    state.weaponAttrOverrides = ref({});
    state.customWeapons = ref([]);
    state.customWeaponDraft = ref({
      name: "",
      rarity: 6,
      type: "自定义",
      s1: "",
      s2: "",
      s3: "",
    });
    state.customWeaponError = ref(null);
    state.showAbout = ref(false);
    state.aboutAdLoaded = ref(false);
    state.showAdblockNotice = ref(false);
    state.showFaq = ref(false);
    state.showSyncModal = ref(false);
    state.showCnSyncUnavailableModal = ref(false);
    state.showSecondaryMenu = ref(false);
    state.showSyncRightsDetails = ref(false);
    state.syncUserPaymentClaims = ref([]);
    state.syncRegionAccessMode = ref(
      typeof window !== "undefined" &&
        window.location &&
        /^(localhost|127\.0\.0\.1)$/i.test(String(window.location.hostname || ""))
        ? "available"
        : "checking"
    );
    state.syncRegionCode = ref("");

    state.contentLoading = ref(false);
    state.contentLoaded = ref(Boolean(window.CONTENT));
    state.charactersLoading = ref(false);
    state.charactersLoaded = ref(Array.isArray(window.characters) && window.characters.length > 0);
    state.upScheduleRawSource = window.WEAPON_UP_SCHEDULES && typeof window.WEAPON_UP_SCHEDULES === "object"
      ? window.WEAPON_UP_SCHEDULES
      : {};
    state.upScheduleNormalized = ref({});
    state.upScheduleIssues = ref([]);
    state.weaponUpByWeapon = ref({});
    state.weaponUpIssues = ref([]);
    state.getWeaponUpWindowAt = () => ({});

    state.weaponGridTopSpacer = ref(0);
    state.weaponGridBottomSpacer = ref(0);
    state.recommendationTopSpacer = ref(0);
    state.recommendationBottomSpacer = ref(0);
    state.characterGridTopSpacer = ref(0);
    state.characterGridBottomSpacer = ref(0);

    state.marksStorageKey = "weapon-marks:v2";
    state.legacyMarksStorageKey = "weapon-marks:v1";
    state.legacyExcludedKey = "excluded-notes:v1";
    state.migrationStorageKey = "weapon-marks-migration:v1";
    state.uiStateStorageKey = "planner-ui-state:v1";
    state.attrHintStorageKey = "planner-attr-hint:v1";
    state.weaponAttrOverridesStorageKey = "weapon-attr-overrides:v1";
    state.customWeaponsStorageKey = "planner-custom-weapons:v1";
    state.editorCharactersStorageKey = "planner-editor-characters:v1";
    state.noticeSkipKey = "announcement:skip";
    state.legacyNoticePrefix = "announcement:skip:";
    state.perfModeStorageKey = "planner-perf-mode:v1";
    state.themeModeStorageKey = "planner-theme-mode:v1";
    state.langStorageKey = "planner-lang";
    state.backgroundStorageKey = "planner-bg-image:v1";
    state.backgroundApiStorageKey = "planner-bg-api:v1";
    state.backgroundDisplayStorageKey = "planner-bg-display:v1";
    state.backgroundBlurStorageKey = "planner-bg-blur:v1";
    state.syncMetaStorageKey = "planner-sync-meta:v1";
    state.syncPrefsStorageKey = "planner-sync-prefs:v1";
    state.syncDevStorageKey = "planner-sync-dev:v1";
    state.planConfigHintStorageKey = "planner-plan-config-hint:v1";
    // 更新基质规划设置时递增该版本号，可让红点对所有用户重新显示一次。
    state.planConfigHintVersion = "7";
    state.planConfigOwnershipHintStorageKey = "planner-plan-config-ownership-hint:v1";
    state.planConfigOwnershipHintVersion = "2";
    state.equipRefiningNavHintStorageKey = "planner-equip-refining-nav-hint:v1";
    // 更新装备精锻导航提示时递增该版本号，可让红点对所有用户重新显示一次。
    state.equipRefiningNavHintVersion = "1";
    state.rerunRankingNavHintStorageKey = "planner-rerun-ranking-nav-hint:v1";
    // 更新复刻排行导航提示时递增该版本号，可让红点对所有用户重新显示一次。
    state.rerunRankingNavHintVersion = "1";
    state.weaponOwnershipHintStorageKey = "planner-weapon-ownership-hint:v1";
    state.weaponOwnershipHintVersion = "1";

    // 清除数据 — 勾选分组定义（checked 状态独立存储，避免 Vue template setter 破坏 Ref）
    state.clearDataChecked = ref({});
    state.clearDataNuclear = ref(false);
    state.clearDataNuclearKeysOpen = ref(false);
    state.clearDataGroups = [
      {
        id: "marks",
        label: "storage.clear_group_marks",
        keys: ["marksStorageKey", "legacyMarksStorageKey", "legacyExcludedKey", "migrationStorageKey"],
      },
      {
        id: "planner",
        label: "storage.clear_group_planner",
        keys: ["uiStateStorageKey", "weaponAttrOverridesStorageKey"],
      },
      {
        id: "preferences",
        label: "storage.clear_group_preferences",
        keys: ["themeModeStorageKey", "langStorageKey", "backgroundStorageKey",
               "backgroundApiStorageKey", "backgroundDisplayStorageKey", "backgroundBlurStorageKey", "perfModeStorageKey"],
      },
      {
        id: "hints",
        label: "storage.clear_group_hints",
        keys: ["attrHintStorageKey", "noticeSkipKey", "planConfigHintStorageKey",
               "planConfigOwnershipHintStorageKey", "equipRefiningNavHintStorageKey",
               "rerunRankingNavHintStorageKey", "weaponOwnershipHintStorageKey"],
        legacyPrefix: "legacyNoticePrefix",
      },
      {
        id: "sync",
        label: "storage.clear_group_sync",
        keys: ["syncMetaStorageKey", "syncPrefsStorageKey", "syncDevStorageKey"],
      },
      {
        id: "customWeapons",
        label: "storage.clear_group_custom_weapons",
        keys: ["customWeaponsStorageKey"],
      },
      {
        id: "editorCharacters",
        label: "storage.clear_group_editor",
        desc: "storage.clear_group_editor_desc",
        keys: ["editorCharactersStorageKey"],
      },
    ];

    state.toggleClearDataGroup = (groupId) => {
      if (!state.clearDataGroupHasData(groupId)) return;
      const checked = state.clearDataChecked.value;
      checked[groupId] = !checked[groupId];
      state.clearDataChecked.value = { ...checked };
    };

    state.clearDataPresetDefault = () => {
      const defaultOn = new Set(["planner", "preferences", "hints"]);
      const next = {};
      state.clearDataGroups.forEach((g) => {
        next[g.id] = defaultOn.has(g.id) && state.clearDataGroupHasData(g.id);
      });
      const current = state.clearDataChecked.value;
      const isSame = state.clearDataGroups.every((g) => Boolean(current[g.id]) === Boolean(next[g.id]));
      state.clearDataChecked.value = isSame ? {} : next;
    };
    state.clearDataPresetAll = () => {
      const next = {};
      state.clearDataGroups.forEach((g) => {
        next[g.id] = state.clearDataGroupHasData(g.id);
      });
      const current = state.clearDataChecked.value;
      const isSame = state.clearDataGroups.every((g) => Boolean(current[g.id]) === Boolean(next[g.id]));
      state.clearDataChecked.value = isSame ? {} : next;
    };
    state.clearDataAllSelected = () => {
      const current = state.clearDataChecked.value;
      return state.clearDataGroups.every((g) => !state.clearDataGroupHasData(g.id) || Boolean(current[g.id]));
    };
    state.clearDataUncheckAll = () => {
      state.clearDataChecked.value = {};
    };

    state.clearDataAnyChecked = () => Object.values(state.clearDataChecked.value).some(Boolean);

    state.clearDataGroupHasData = (groupId) => {
      const group = state.clearDataGroups.find((g) => g.id === groupId);
      if (!group) return false;
      try {
        for (const keyName of group.keys) {
          const key = state[keyName];
          if (key && localStorage.getItem(key) !== null) return true;
        }
        if (group.legacyPrefix && state[group.legacyPrefix]) {
          for (let i = 0; i < localStorage.length; i += 1) {
            const k = localStorage.key(i);
            if (k && k.startsWith(state[group.legacyPrefix])) return true;
          }
        }
      } catch (_) {}
      return false;
    };

    state.collectAllLocalStorageKeys = () => {
      const keys = [];
      try {
        for (let i = 0; i < localStorage.length; i += 1) {
          const k = localStorage.key(i);
          if (k) keys.push(k);
        }
      } catch (_) {}
      return keys.sort();
    };

    state.collectClearDataKeys = () => {
      const checked = state.clearDataChecked.value;
      const keys = [];
      state.clearDataGroups.forEach((group) => {
        if (!checked[group.id]) return;
        group.keys.forEach((keyName) => {
          const key = state[keyName];
          if (key) keys.push(key);
        });
        if (group.legacyPrefix && state[group.legacyPrefix]) {
          try {
            for (let i = 0; i < localStorage.length; i += 1) {
              const k = localStorage.key(i);
              if (k && k.startsWith(state[group.legacyPrefix])) keys.push(k);
            }
          } catch (_) {}
        }
      });
      return Array.from(new Set(keys.filter(Boolean)));
    };

    state.openClearDataModal = () => {
      state.clearDataUncheckAll();
      state.clearDataNuclear.value = false;
      state.clearDataNuclearKeysOpen.value = false;
      state.showClearDataModal.value = true;
    };

    state.proceedClearDataConfirm = () => {
      state.showClearDataModal.value = false;
      state.showClearDataConfirm.value = true;
      state.clearDataCountdown.value = 3;
      if (state._clearDataCountdownTimer) clearInterval(state._clearDataCountdownTimer);
      state._clearDataCountdownTimer = setInterval(() => {
        if (state.clearDataCountdown.value > 0) state.clearDataCountdown.value -= 1;
        if (state.clearDataCountdown.value <= 0) {
          state.clearDataCountdown.value = 0;
          clearInterval(state._clearDataCountdownTimer);
          state._clearDataCountdownTimer = null;
        }
      }, 1000);
    };

    state.cancelClearDataConfirm = () => {
      if (state._clearDataCountdownTimer) { clearInterval(state._clearDataCountdownTimer); state._clearDataCountdownTimer = null; }
      state.clearDataCountdown.value = 0;
      state.showClearDataConfirm.value = false;
      state.showClearDataModal.value = true;
    };

    state.executeClearData = async () => {
      if (state.clearDataCountdown.value > 0) return;
      if (state._clearDataCountdownTimer) { clearInterval(state._clearDataCountdownTimer); state._clearDataCountdownTimer = null; }

      const checked = state.clearDataChecked.value;
      const syncGroupChecked = checked.sync || state.clearDataNuclear.value;

      // 同步登录状态被勾选或彻底清理 → 先尝试 logout
      if (syncGroupChecked && typeof state.logoutSync === "function" && state.syncUser && state.syncUser.value) {
        try { await state.logoutSync(); } catch (_) {}
      }

      if (state.clearDataNuclear.value) {
        try { localStorage.clear(); } catch (_) {}
      } else {
        const keysToRemove = state.collectClearDataKeys();
        for (const key of keysToRemove) {
          try { localStorage.removeItem(key); } catch (_) {}
        }
      }
      state.showClearDataConfirm.value = false;
      location.reload();
    };

    state.lowGpuEnabled = ref(false);
    state.perfPreference = ref("auto");
    state.showPerfNotice = ref(false);
    state.themePreference = ref("auto");
    state.resolvedTheme = ref("dark");

    state.customBackground = ref("");
    state.customBackgroundName = ref("");
    state.customBackgroundError = ref("");
    state.customBackgroundApi = ref("");
    state.backgroundDisplayEnabled = ref(true);
    state.backgroundBlurEnabled = ref(true);

    state.showNotice = ref(false);
    state.showChangelog = ref(false);
    state.skipNotice = ref(false);
    state.toastNotices = ref([]);
    state.toastNotice = ref(null);
    state.pauseToastNotice = () => {};
    state.resumeToastNotice = () => {};
    state.pauseAllToastNotices = () => {};
    state.resumeAllToastNotices = () => {};
    state.editorIdentityDraft = ref({ id: "", name: "" });
    state.commitEditorCharacterIdentity = () => {};

    state.appReady = ref(false);
    state.currentView = ref("planner");
    state.mobilePanel = ref("weapons");
    state.matchMobilePanel = ref("source");
    state.equipRefiningMobilePanel = ref("equips");
    state.equipRefiningSelectedName = ref("");
    state.showWeaponAttrs = ref(false);
    state.showWeaponOwnershipInList = ref(false);
    state.showWeaponOwnershipInPlans = ref(true);
    state.showAttrHint = ref(false);
    state.showFilterPanel = ref(true);
    state.filterPanelManuallySet = ref(false);
    state.showAllSchemes = ref(false);
    state.showPlanConfig = ref(false);
    state.planConfigSectionCollapsed = ref({});
    state.planConfigSectionManuallySet = ref(false);
    state.showWeaponAttrDataModal = ref(false);
    state.showPlanConfigHintDot = ref(false);
    state.showPlanConfigOwnershipHintDot = ref(false);
    state.marksImportError = ref("");
    state.marksImportFileName = ref("");
    state.marksImportSummary = ref(null);
    state.marksImportMeta = ref(null);
    state.marksImportPending = ref(null);
    state.marksImportConfirmCountdown = ref(0);
    state.showMarksImportConfirmModal = ref(false);
    state.showClearDataModal = ref(false);
    state.showClearDataConfirm = ref(false);
    state.clearDataCountdown = ref(0);
    state.showEquipRefiningNavHintDot = ref(false);
    state.showRerunRankingNavHintDot = ref(false);
    state.rerunTimelineZoom = ref(5.0);
    state.rerunTimelineShowPreviewAxis = ref(true);
    state.rerunTimelineFullOverview = ref(false);
    state.rerunTimelineData = ref(null);
    state.rerunTimelineRowHeight = ref(52);

    // 拥有状态功能提示相关状态
    state.showWeaponOwnershipHint = ref(false);
    state.weaponOwnershipHintDismissed = ref(false);

    state.recommendationConfig = ref({
      hideEssenceOwnedWeaponsInPlans: false,
      hideEssenceOwnedOwnedOnly: false,
      hideEssenceOwnedWeaponsInSelector: false,
      hideUnownedWeaponsInPlans: false,
      hideUnownedWeaponsInSelector: false,
      hideFourStarWeaponsInPlans: true,
      hideFourStarWeaponsInSelector: true,
      attributeFilterAffectsHiddenWeapons: false,
      preferredRegion1: "",
      preferredRegion2: "",
      regionPriorityMode: "ignore",
      ownershipPriorityMode: "ignore",
      strictPriorityOrder: "ownershipFirst",
    });
    state.regionOptions = ref([]);
    state.availableRegions = ref([]);
    state.effectiveSelectedRegions = ref([]);
    state.regionPriorityModeOptions = [
      {
        value: "ignore",
        label: "不启用",
        description: "不使用地区优先，完全按刷取效率排序。",
      },
      {
        value: "strict",
        label: "严格优先",
        description:
          "只要方案里包含你设置的优先地区（地区1 > 地区2 > 其他），就先排在前面；同组里再看效率。"
      },
      {
        value: "sameCoverage",
        label: "同覆盖优先",
        description:
          "先看每个方案能覆盖多少把待刷武器；数量一样时，再按优先地区（地区1 > 地区2 > 其他）排序。"
      },
      {
        value: "sameEfficiency",
        label: "同效率优先",
        description:
          "先按效率排序；只有效率完全一样时，才按优先地区（地区1 > 地区2 > 其他）排序。"
      },
    ];
    state.ownershipPriorityModeOptions = [
      {
        value: "ignore",
        label: "不启用",
        description: "不使用已拥有武器优先，完全按刷取效率排序。",
      },
      {
        value: "strict",
        label: "严格优先",
        description: "排序时先比较“已拥有武器命中数量”，数量更多的方案排在前面，再比较效率。",
      },
      {
        value: "sameCoverage",
        label: "同覆盖优先",
        description: "先比较待刷覆盖数量；覆盖数相同时，再比较“已拥有武器命中数量”。",
      },
      {
        value: "sameEfficiency",
        label: "同效率优先",
        description: "先按效率排序；效率完全相同时，再比较“已拥有武器命中数量”。",
      },
    ];
    state.strictPriorityOrderOptions = [
      {
        value: "ownershipFirst",
        label: "已拥有武器优先在前",
        description: "当地区与已拥有武器都为严格优先时，先比较已拥有武器优先策略，再比较地区优先策略。",
      },
      {
        value: "regionFirst",
        label: "地区优先在前",
        description: "当地区与已拥有武器都为严格优先时，先比较地区优先策略，再比较已拥有武器优先策略。",
      },
    ];
    state.conflictOpenMap = ref({});
    state.showBackToTop = ref(false);

    state.legacyMigrationMarks = ref({});
    state.showStorageErrorModal = ref(false);
    state.storageErrorIgnored = ref(false);
    state.storageErrorCurrent = ref(null);
    state.storageErrorLogs = ref([]);
    state.storageErrorPreviewText = ref("");
    state.showRuntimeWarningModal = ref(false);
    state.runtimeWarningIgnored = ref(false);
    state.runtimeWarningCurrent = ref(null);
    state.runtimeWarningLogs = ref([]);
    state.runtimeWarningPreviewText = ref("");
    state.showRuntimeIgnoreConfirmModal = ref(false);
    state.showStorageClearConfirmModal = ref(false);
    state.showStorageIgnoreConfirmModal = ref(false);
    state.storageErrorClearCountdown = ref(0);
    state.storageErrorClearTargetKeys = ref([]);
    state.storageFeedbackUrl = "https://github.com/cmyyx/endfield-essence-planner/issues";
    state.pendingStorageIssues = [];
    state.showUpdatePrompt = ref(false);
    state.updateCurrentVersionText = ref("");
    state.updateLatestVersionText = ref("");
    state.updateLatestPublishedAt = ref("");
    state.versionBadgeDisplayText = ref("");
    state.gameCompatSupportedVersion = ref("");
    state.gameCompatNextVersion = ref("");
    state.gameCompatNextVersionAtText = ref("");
    state.showGameCompatWarning = ref(false);
    state.versionCopyFeedbackText = ref("");
    state.copyCurrentVersionInfo = () => {};
    state.dismissGameCompatWarning = () => {};

    state.filterS1 = ref([]);
    state.filterS2 = ref([]);
    state.filterS3 = ref([]);
    state.selectedRegions = ref([]);

    state.dropdownOpenS1 = ref(false);
    state.dropdownOpenS2 = ref(false);
    state.dropdownOpenS3 = ref(false);

    state.isPortrait = ref(false);

    state.formatS1 = formatS1;
  };
})();

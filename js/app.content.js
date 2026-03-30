(function () {
  const modules = (window.AppModules = window.AppModules || {});

  modules.initContent = function initContent(ctx, state) {
    const { computed } = ctx;

    const fallbackLocale = state.fallbackLocale || "zh-CN";
    const t = state.t || ((value) => value);

    const getContentRoot = () => (typeof window !== "undefined" && window.CONTENT ? window.CONTENT : {});
    const getSponsorEntries = () =>
      typeof window !== "undefined" && Array.isArray(window.SPONSORS) ? window.SPONSORS : [];

    let pendingContentLoad = null;
    let pendingSponsorLoad = null;
    let sponsorsLoaded =
      typeof window !== "undefined" && Array.isArray(window.SPONSORS) && window.SPONSORS.length > 0;

    const ensureBaseContentLoaded = async () => {
      if (state.contentLoaded.value) return true;
      if (pendingContentLoad) return pendingContentLoad;
      if (typeof state.loadScriptOnce !== "function") return false;
      pendingContentLoad = (async () => {
        try {
          await state.loadScriptOnce("./data/content.js");
          state.contentLoaded.value = Boolean(window.CONTENT);
          return state.contentLoaded.value;
        } catch (error) {
          return false;
        } finally {
          pendingContentLoad = null;
        }
      })();
      return pendingContentLoad;
    };

    const ensureSponsorsLoaded = async () => {
      if (sponsorsLoaded) return true;
      if (pendingSponsorLoad) return pendingSponsorLoad;
      if (typeof state.loadScriptOnce !== "function") return false;
      pendingSponsorLoad = (async () => {
        try {
          await state.loadScriptOnce("./data/sponsors.js");
          sponsorsLoaded = Array.isArray(window.SPONSORS);
          return sponsorsLoaded;
        } catch (error) {
          return false;
        } finally {
          pendingSponsorLoad = null;
        }
      })();
      return pendingSponsorLoad;
    };

    const ensureContentLoaded = async (options = {}) => {
      const withSponsors = Boolean(options && options.withSponsors);
      state.contentLoading.value = true;
      try {
        const baseLoaded = await ensureBaseContentLoaded();
        if (!baseLoaded) return false;
        if (withSponsors) {
          const sponsorsLoaded = await ensureSponsorsLoaded();
          if (!sponsorsLoaded) return false;
        }
        return true;
      } finally {
        state.contentLoading.value = false;
      }
    };

    const normalizeSponsorList = (list) => {
      if (!Array.isArray(list)) return [];
      return list
        .map((entry, index) => {
          if (entry === null || typeof entry === "undefined") return null;
          if (typeof entry === "string") {
            const name = String(entry);
            const trimmed = name.trim();
            return {
              name,
              displayName: trimmed ? name : "\u00a0",
              key: trimmed ? name : `about-sponsor-entry-${index}`,
              amount: "",
              note: "",
              date: "",
            };
          }
          if (typeof entry === "object") {
            const rawName = entry.name ?? entry.title ?? entry.label;
            if (rawName === null || typeof rawName === "undefined") return null;
            const name = String(rawName);
            const trimmed = name.trim();
            return {
              name,
              displayName: trimmed ? name : "\u00a0",
              key: trimmed ? name : `about-sponsor-entry-${index}`,
              amount: entry.amount || entry.money || "",
              note: entry.note || entry.message || "",
              date: entry.date || "",
            };
          }
          return null;
        })
        .filter(Boolean);
    };

    const normalizeFaqItems = (items) => {
      if (!Array.isArray(items)) return [];
      return items
        .map((entry) => {
          if (!entry) return null;
          if (typeof entry === "string") {
            const question = entry.trim();
            return question ? { q: question, a: "" } : null;
          }
          if (typeof entry !== "object") return null;
          const question = String(entry.q || entry.question || entry.title || "").trim();
          const answerRaw = entry.a ?? entry.answer ?? entry.body ?? "";
          const answer = Array.isArray(answerRaw)
            ? answerRaw.map((line) => String(line || "").trim()).filter(Boolean).join("\n")
            : String(answerRaw || "").trim();
          if (!question && !answer) return null;
          return { q: question, a: answer };
        })
        .filter((entry) => entry && entry.q);
    };

    const noticeSanitizer =
      typeof window !== "undefined" &&
      window.__APP_SANITIZER__ &&
      typeof window.__APP_SANITIZER__.tokenizeNoticeItem === "function"
        ? window.__APP_SANITIZER__
        : {
            tokenizeNoticeItem: (value) => [{ type: "text", text: String(value || "") }],
          };

    const getContentForLocale = (targetLocale) => {
      const content = getContentRoot();
      const base = {
        announcement: content.announcement || {},
        changelog: content.changelog || {},
        about: content.about || {},
        faq: content.faq || {},
      };
      if (!content.locales || targetLocale === fallbackLocale) return base;
      const localized = content.locales[targetLocale] || {};
      return {
        announcement: { ...base.announcement, ...(localized.announcement || {}) },
        changelog: { ...base.changelog, ...(localized.changelog || {}) },
        about: { ...base.about, ...(localized.about || {}) },
        faq: { ...base.faq, ...(localized.faq || {}) },
      };
    };
    const i18nKeyPattern = /^[A-Za-z0-9_]+(?:[.-][A-Za-z0-9_]+)+$/;
    const resolveTitleValue = (rawTitle, fallbackKey) => {
      const fallbackTitle = t(fallbackKey);
      if (typeof rawTitle !== "string") return fallbackTitle;
      const normalizedTitle = rawTitle.trim();
      if (!normalizedTitle) return fallbackTitle;
      if (!i18nKeyPattern.test(normalizedTitle)) return normalizedTitle;
      const translated = t(normalizedTitle);
      return translated === "文案缺失" ? normalizedTitle : translated;
    };

    const localizedContent = computed(() => getContentForLocale(state.locale.value));
    const defaultAnnouncement = computed(() => ({
      version: "",
      title: t("nav.announcement"),
      date: "",
      forceModal: false,
      qqGroup: "",
      qqNote: "",
      items: [],
    }));
    const announcement = computed(() => {
      const next = {
        ...defaultAnnouncement.value,
        ...(localizedContent.value.announcement || {}),
      };
      next.title = resolveTitleValue(next.title, "nav.announcement");
      return next;
    });
    const defaultChangelog = computed(() => ({
      title: t("nav.changelog"),
      entries: [],
    }));
    const changelog = computed(() => {
      const next = {
        ...defaultChangelog.value,
        ...(localizedContent.value.changelog || {}),
      };
      next.title = resolveTitleValue(next.title, "nav.changelog");
      return next;
    });
    const defaultAbout = computed(() => ({
      title: t("nav.about_this_tool"),
      paragraphs: [],
      author: "",
      links: [],
      thanks: [],
    }));
    const aboutContent = computed(() => {
      const base = {
        ...defaultAbout.value,
        ...(localizedContent.value.about || {}),
      };
      base.title = resolveTitleValue(base.title, "nav.about_this_tool");
      const list = normalizeSponsorList((base.sponsor && base.sponsor.list) || getSponsorEntries());
      const items =
        (base.sponsor && Array.isArray(base.sponsor.items) && base.sponsor.items) || [];
      if (items.length) base.sponsor = { ...(base.sponsor || {}), items };
      if (list.length) {
        base.sponsor = { ...(base.sponsor || {}), list };
      }
      return base;
    });

    const defaultFaq = computed(() => ({
      title: "常见问题",
      emptyText: "暂无常见问题",
      items: [],
    }));
    const faqContent = computed(() => {
      const next = {
        ...defaultFaq.value,
        ...(localizedContent.value.faq || {}),
      };
      next.title =
        typeof next.title === "string" && next.title.trim() ? next.title.trim() : defaultFaq.value.title;
      next.emptyText =
        typeof next.emptyText === "string" && next.emptyText.trim()
          ? next.emptyText.trim()
          : defaultFaq.value.emptyText;
      next.items = Array.isArray(next.items) ? next.items : [];
      return next;
    });
    const faqItems = computed(() => normalizeFaqItems(faqContent.value.items));

    state.content = computed(() => getContentRoot());
    state.ensureContentLoaded = ensureContentLoaded;
    state.announcement = announcement;
    state.formatNoticeItem = (value) => noticeSanitizer.tokenizeNoticeItem(value);
    state.changelog = changelog;
    state.aboutContent = aboutContent;
    state.faqContent = faqContent;
    state.faqItems = faqItems;
  };
})();

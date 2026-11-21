/**
 * Client half of the billing-hud bundle.
 *
 * One client module that contributes four things:
 *   1. the `priceBand` service — the shared Chinese statutory-holiday calendar
 *      behind DeepSeek's peak / off-peak token pricing;
 *   2. the composer cost readout (`conversation.composer.dock`, id `cost`);
 *   3. the sidebar balance row (`sidebar.footer.action`, id `account-balance`);
 *   4. the settings page (`settings.plugins.tab`, id `billing-hud`) that
 *      configures all of the above for the current browser.
 *
 * No credential is read, stored, or transmitted. The balance row only displays
 * the amounts the local session already exposes through `ctx.remote.account`,
 * and a user who turns it off stops every account-related request.
 *
 * Advanced runtime overrides (unchanged from the pre-settings version) still
 * win over the built-in defaults but lose to the settings page:
 *   `window.__DSH_PRICE_BAND__`       holidays: ['YYYY-MM-DD'], band: 'peak' | 'offPeak'
 *   `window.__DSH_TOKEN_COST__`       pricing overrides for the readout
 *   `window.__DSH_HOLIDAYS_OFFLINE__` true disables the yearly holiday fetch
 */
window.__ModuleLoader__.load({
  id: 'dsh-billing-hud',
  factory(require) {
    const React = require('react');
    const { Service } = require('@deepseek-ai/cordis');
    const h = React.createElement;

    const NS = 'dsh-billing-hud';

    // ── user settings ───────────────────────────────────────────────────────
    // Stored per browser in localStorage: installing the plugin never asks for
    // an account, and every value below has a working default, so the plugin is
    // useful before anyone opens the settings page.
    const SETTINGS_KEY = 'dsh.billing-hud.settings.v1';

    const DEFAULT_SETTINGS = {
      /** Render the composer cost readout. */
      showCost: true,
      /** Render the sidebar balance row. Off = no account request at all. */
      showBalance: true,
      /** Fetch the yearly statutory-holiday file; off = built-in 2026 table only. */
      fetchHolidays: true,
      /** 'auto' | 'peak' | 'offPeak' — pins the composer readout's band when set. */
      bandMode: 'auto',
      /** Currency symbol used by the cost readout. */
      currency: '¥',
      /** Balance polling interval; 15 s floor, 1 h ceiling. */
      balanceRefreshSeconds: 60,
      /** Sparse price-table override; null means the built-in table. */
      pricing: null,
    };

    function normalizeSettings(value) {
      const merged = Object.assign({}, DEFAULT_SETTINGS, value);
      merged.showCost = merged.showCost !== false;
      merged.showBalance = merged.showBalance !== false;
      merged.fetchHolidays = merged.fetchHolidays !== false;
      merged.bandMode = merged.bandMode === 'peak' || merged.bandMode === 'offPeak' ? merged.bandMode : 'auto';
      merged.currency = typeof merged.currency === 'string' && merged.currency.trim() !== ''
        ? merged.currency.trim().slice(0, 4)
        : DEFAULT_SETTINGS.currency;
      const seconds = Number(merged.balanceRefreshSeconds);
      merged.balanceRefreshSeconds = Number.isFinite(seconds) && seconds >= 15
        ? Math.min(Math.round(seconds), 3600)
        : DEFAULT_SETTINGS.balanceRefreshSeconds;
      merged.pricing = merged.pricing !== null && typeof merged.pricing === 'object' && !Array.isArray(merged.pricing)
        ? merged.pricing
        : null;
      return merged;
    }

    function readSettings() {
      try {
        if (typeof window === 'undefined') return Object.assign({}, DEFAULT_SETTINGS);
        const raw = window.localStorage.getItem(SETTINGS_KEY);
        if (typeof raw !== 'string' || raw === '') return Object.assign({}, DEFAULT_SETTINGS);
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object') return Object.assign({}, DEFAULT_SETTINGS);
        return normalizeSettings(parsed);
      } catch {
        return Object.assign({}, DEFAULT_SETTINGS);
      }
    }

    let settingsSnapshot = readSettings();
    const settingsListeners = new Set();

    function settingsGet() {
      return settingsSnapshot;
    }

    function settingsSubscribe(listener) {
      settingsListeners.add(listener);
      return () => {
        settingsListeners.delete(listener);
      };
    }

    function settingsWrite(next) {
      settingsSnapshot = normalizeSettings(Object.assign({}, settingsSnapshot, next));
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsSnapshot));
      } catch {
        /* private mode or quota: the in-memory value still applies for this page */
      }
      for (const listener of settingsListeners) listener();
      return settingsSnapshot;
    }

    /** Subscribe one component to the settings store. */
    function useSettings() {
      const [snapshot, setSnapshot] = React.useState(settingsGet);
      React.useEffect(() => settingsSubscribe(() => setSnapshot(settingsGet())), []);
      return snapshot;
    }

    // ── copy ────────────────────────────────────────────────────────────────
    const DICTIONARIES = {
      zh: {
        'cost.tooltip.title': '费用估算（{model}）',
        'cost.tooltip.band.peak': '当前按高峰时段单价',
        'cost.tooltip.band.offPeak': '当前按空闲时段单价',
        'cost.tooltip.cacheMiss': '输入（缓存未命中）{tokens} tok × {price}/M',
        'cost.tooltip.cacheRead': '输入（缓存命中）{tokens} tok × {price}/M',
        'cost.tooltip.output': '输出 {tokens} tok × {price}/M',
        'cost.tooltip.total': '合计 {amount}',
        'cost.tooltip.note': '按整条会话的 token 投影与当前模型单价估算',
        'cost.aria': '本会话费用估算 {amount}',
        'balance.label': '余额',
        'balance.loading': '读取中',
        'balance.failed': '读取失败',
        'balance.unknown': '—',
        'balance.aria': '当前账户余额 {amount}',
        'topUp': '充值',
        'topUp.aria': '前往 DeepSeek 开放平台充值',
        'tooltip.recharge': '充值余额：{amount}',
        'tooltip.bonus': '赠金：{amount}',
        'tooltip.failed': '余额读取失败，可在“设置 → 账号”中重试',
        'tooltip.empty': '平台未返回钱包余额',
        'tooltip.hint': '点击“充值”在浏览器中打开开放平台',
        'band.peak': '高峰',
        'band.offPeak': '空闲',
        'band.peak.tip': '高峰时段：周一至周五 9:00–12:00、14:00–18:00（北京时间，法定节假日除外），token 单价为 2 倍',
        'band.offPeak.tip': '空闲时段：高峰以外的时间，含周末与中国法定节假日全天，token 单价为一半',
        'settings.tab': '计费悬浮条',
        'settings.heading': '计费悬浮条',
        'settings.intro': '以下设置保存在本机浏览器（localStorage），只影响你自己的界面，不会同步到别处。',
        'settings.showCost': '显示输入框下方的会话花费',
        'settings.showCost.hint': '按本会话 token 投影和当前模型单价估算，悬停可看分行明细。',
        'settings.showBalance': '显示侧边栏的账户余额',
        'settings.showBalance.hint': '只读取本机已登录账号的余额；关闭后不再发起任何账户请求。',
        'settings.fetchHolidays': '按年拉取中国法定节假日',
        'settings.fetchHolidays.hint': '关闭后仅用内置的 2026 年区间判断高峰与空闲。',
        'settings.bandMode': '时段判定',
        'settings.bandMode.auto': '自动（北京时间 + 节假日）',
        'settings.bandMode.peak': '固定高峰',
        'settings.bandMode.offPeak': '固定空闲',
        'settings.currency': '货币符号',
        'settings.interval': '余额刷新间隔（秒）',
        'settings.interval.hint': '最小 15 秒，最大 3600 秒。',
        'settings.pricing': '单价表（JSON）',
        'settings.pricing.hint': '每百万 token 的价格。可只写要覆盖的模型：{"models":{"deepseek-flash":{"peak":{"output":8}}}}。留空 {} 用内置表。',
        'settings.pricing.apply': '应用单价表',
        'settings.pricing.reset': '恢复内置表',
        'settings.pricing.invalid': 'JSON 必须是一个对象',
        'settings.resetAll': '全部恢复默认',
        'settings.saved': '已保存',
      },
      en: {
        'cost.tooltip.title': 'Estimated cost ({model})',
        'cost.tooltip.band.peak': 'Priced at the peak-hour rate',
        'cost.tooltip.band.offPeak': 'Priced at the off-peak rate',
        'cost.tooltip.cacheMiss': 'Input (cache miss) {tokens} tok × {price}/M',
        'cost.tooltip.cacheRead': 'Input (cache hit) {tokens} tok × {price}/M',
        'cost.tooltip.output': 'Output {tokens} tok × {price}/M',
        'cost.tooltip.total': 'Total {amount}',
        'cost.tooltip.note': 'Estimated from this session’s token projection at the current model’s rate',
        'cost.aria': 'Estimated cost for this session {amount}',
        'balance.label': 'Balance',
        'balance.loading': 'loading',
        'balance.failed': 'unavailable',
        'balance.unknown': '—',
        'balance.aria': 'Account balance {amount}',
        'topUp': 'Top up',
        'topUp.aria': 'Top up on the DeepSeek platform',
        'tooltip.recharge': 'Topped-up balance: {amount}',
        'tooltip.bonus': 'Granted balance: {amount}',
        'tooltip.failed': 'The balance could not be read; retry from Settings → Account',
        'tooltip.empty': 'The platform returned no wallet balance',
        'tooltip.hint': 'Top up opens the platform in your browser',
        'band.peak': 'Peak',
        'band.offPeak': 'Off-peak',
        'band.peak.tip': 'Peak hours: weekdays 09:00–12:00 and 14:00–18:00 Beijing time, excluding Chinese statutory holidays. Token prices are 2× the off-peak rate.',
        'band.offPeak.tip': 'Off-peak: everything outside peak hours, including all weekend days and Chinese statutory holidays. Token prices are half the peak rate.',
        'settings.tab': 'Billing HUD',
        'settings.heading': 'Billing HUD',
        'settings.intro': 'These settings live in this browser (localStorage). They change your own interface only and are never synced anywhere.',
        'settings.showCost': 'Show the session cost under the composer',
        'settings.showCost.hint': 'Estimated from this session’s token projection at the current model rate; hover for the breakdown.',
        'settings.showBalance': 'Show the account balance in the sidebar',
        'settings.showBalance.hint': 'Reads the balance of the account signed in on this machine. Turning it off stops every account request.',
        'settings.fetchHolidays': 'Fetch Chinese statutory holidays yearly',
        'settings.fetchHolidays.hint': 'When off, only the built-in 2026 ranges decide peak and off-peak.',
        'settings.bandMode': 'Price band',
        'settings.bandMode.auto': 'Automatic (Beijing time + holidays)',
        'settings.bandMode.peak': 'Pin peak',
        'settings.bandMode.offPeak': 'Pin off-peak',
        'settings.currency': 'Currency symbol',
        'settings.interval': 'Balance refresh interval (seconds)',
        'settings.interval.hint': 'Between 15 and 3600 seconds.',
        'settings.pricing': 'Price table (JSON)',
        'settings.pricing.hint': 'Prices per million tokens. Override only what you need: {"models":{"deepseek-flash":{"peak":{"output":8}}}}. Enter {} to use the built-in table.',
        'settings.pricing.apply': 'Apply price table',
        'settings.pricing.reset': 'Reset to built-in',
        'settings.pricing.invalid': 'The JSON value must be an object',
        'settings.resetAll': 'Reset everything',
        'settings.saved': 'Saved',
      },
    };

    // ── the shared peak schedule ────────────────────────────────────────────
    // DeepSeek's peak window is Beijing time, Monday to Friday, 09:00–12:00 and
    // 14:00–18:00, EXCLUDING Chinese statutory holidays. Weekends and holidays
    // are off-peak all day, and off-peak unit prices are half of peak. The
    // calendar itself belongs to the service below; this local approximation is
    // what both readouts use while the service is unavailable.
    const PEAK_TIME_ZONE = 'Asia/Shanghai';
    const FALLBACK_PEAK_BANDS = [[9, 12], [14, 18]];

    function fallbackBand(now) {
      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: PEAK_TIME_ZONE,
          weekday: 'short',
          hour: '2-digit',
          hour12: false,
        }).formatToParts(now);
        let hour = NaN;
        let weekday = '';
        for (const part of parts) {
          if (part.type === 'hour') hour = Number(part.value) % 24;
          else if (part.type === 'weekday') weekday = part.value;
        }
        if (!Number.isFinite(hour)) return 'offPeak';
        if (weekday === 'Sat' || weekday === 'Sun') return 'offPeak';
        for (const band of FALLBACK_PEAK_BANDS) {
          if (hour >= band[0] && hour < band[1]) return 'peak';
        }
        return 'offPeak';
      } catch {
        return 'offPeak';
      }
    }

    // ── token pricing (composer readout) ────────────────────────────────────
    // ¥ per 1,000,000 tokens. DeepSeek publishes a peak and an off-peak column;
    // off-peak is exactly half of peak, so both are spelled out here rather than
    // derived. The settings page overrides any part of this table per browser; a
    // bare model id wins over `fallback`, and an exact `provider/model` key wins
    // over the bare id.
    const PRICING = {
      currency: '¥',
      unitTokens: 1000000,
      fallback: 'deepseek-flash',
      models: {
        'deepseek-flash': {
          peak: { cacheRead: 0.04, cacheMiss: 2, output: 8 },
          offPeak: { cacheRead: 0.02, cacheMiss: 1, output: 4 },
        },
        'deepseek-v4-pro': {
          peak: { cacheRead: 0.3, cacheMiss: 9, output: 27 },
          offPeak: { cacheRead: 0.15, cacheMiss: 4.5, output: 13.5 },
        },
      },
      // Legacy ids the provider still routes to a priced model.
      aliases: {
        'deepseek-v4-flash': 'deepseek-flash',
        'deepseek-v4-flash-vision-exp': 'deepseek-flash',
        'deepseek-v4.1-flash': 'deepseek-flash',
        'deepseek-v4.1-flash-1017': 'deepseek-flash',
        'deepseek-v4-pro-0813': 'deepseek-v4-pro',
      },
    };

    function mergePricing(base, override) {
      if (override === null || typeof override !== 'object') return base;
      const merged = Object.assign({}, base, override);
      merged.models = Object.assign({}, base.models);
      if (override.models !== null && typeof override.models === 'object') {
        for (const key of Object.keys(override.models)) {
          merged.models[key] = Object.assign({}, base.models[key], override.models[key]);
        }
      }
      merged.aliases = Object.assign({}, base.aliases, override.aliases);
      merged.unitTokens = Number(merged.unitTokens) > 0 ? Number(merged.unitTokens) : base.unitTokens;
      return merged;
    }

    /** Built-in table plus the legacy dev override (`window.__DSH_TOKEN_COST__`). */
    const BASE_PRICING = mergePricing(
      Object.assign({ timeZone: PEAK_TIME_ZONE }, PRICING),
      typeof window === 'undefined' ? undefined : window.__DSH_TOKEN_COST__,
    );

    /** The table a render uses: built-in/dev table, then the settings-page override. */
    function pricingOf(settings) {
      const override = settings === null || settings === undefined ? null : settings.pricing;
      return override === null || override === undefined ? BASE_PRICING : mergePricing(BASE_PRICING, override);
    }

    function priceFor(pricing, model, provider) {
      const models = pricing.models;
      const aliases = pricing.aliases || {};
      if (typeof model === 'string' && model !== '') {
        if (typeof provider === 'string' && provider !== '') {
          const scoped = models[provider + '/' + model];
          if (scoped !== undefined) return { key: provider + '/' + model, entry: scoped };
        }
        const direct = models[model];
        if (direct !== undefined) return { key: model, entry: direct };
        const alias = aliases[model];
        if (typeof alias === 'string' && models[alias] !== undefined) return { key: alias, entry: models[alias] };
      }
      const fallback = models[pricing.fallback];
      if (fallback === undefined) return null;
      return { key: pricing.fallback, entry: fallback };
    }

    function tokens(value) {
      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? n : 0;
    }

    function formatCount(value) {
      try {
        return Math.round(value).toLocaleString('en-US');
      } catch {
        return String(Math.round(value));
      }
    }

    function formatMoney(value, currency) {
      const symbol = typeof currency === 'string' && currency !== '' ? currency : PRICING.currency;
      if (!Number.isFinite(value) || value <= 0) return symbol + '0';
      if (value < 0.01) return symbol + value.toFixed(4);
      if (value < 1) return symbol + value.toFixed(3);
      return symbol + value.toFixed(2);
    }

    /**
     * Split one session's four billing buckets against one band's unit prices.
     * Cache-write tokens are billed as cache-miss input: DeepSeek prices writing
     * the cache at the cache-miss input rate.
     */
    function priceUsage(usage, model, provider, band, pricing) {
      const resolved = priceFor(pricing, model, provider);
      if (resolved === null) return null;
      const rates = resolved.entry[band];
      if (rates === null || typeof rates !== 'object') return null;
      const cacheRead = tokens(usage.cacheReadTokens);
      const cacheMiss = tokens(usage.uncachedInputTokens) + tokens(usage.cacheWriteTokens);
      const output = tokens(usage.outputTokens);
      const unit = pricing.unitTokens;
      const cost = (cacheRead * Number(rates.cacheRead || 0)
        + cacheMiss * Number(rates.cacheMiss || 0)
        + output * Number(rates.output || 0)) / unit;
      return {
        total: cacheRead + cacheMiss + output,
        cost,
        band,
        rates,
        cacheRead,
        cacheMiss,
        output,
        model: resolved.key,
      };
    }

    // ── wallet formatting (sidebar balance row) ─────────────────────────────
    // Mirrors Platform Web's currency rules: two decimals with digit grouping,
    // positive amounts truncated to cents, sub-cent shown as "<¥0.01".
    const SYMBOLS = { CNY: '¥', USD: '$' };

    function symbolOf(currency) {
      return SYMBOLS[currency] !== undefined ? SYMBOLS[currency] : String(currency) + ' ';
    }

    function addCommas(value) {
      const parts = value.split('.');
      return Number(parts[0]).toLocaleString('en-US') + '.' + parts[1];
    }

    function formatAmount(amount, symbol) {
      const value = Number(amount);
      if (!Number.isFinite(value)) return null;
      if (value === 0) return symbol + '0.00';
      if (value < 0) {
        return '-' + symbol + (value > -0.01 ? '0.01' : addCommas(Math.abs(value).toFixed(2)));
      }
      if (value < 0.01) return '<' + symbol + '0.01';
      const truncated = Math.floor(value * 100) / 100;
      return symbol + addCommas(truncated.toFixed(2));
    }

    function positive(wallets) {
      if (!Array.isArray(wallets)) return [];
      return wallets.filter((wallet) => Number(wallet.balance) > 0);
    }

    function joinWallets(wallets) {
      const parts = [];
      for (const wallet of wallets) {
        const text = formatAmount(wallet.balance, symbolOf(wallet.currency));
        if (text !== null) parts.push(text);
      }
      return parts.join(' ');
    }

    function sumAll(wallets) {
      const totals = new Map();
      for (const wallet of wallets) {
        const value = Number(wallet.balance);
        if (!Number.isFinite(value)) continue;
        const key = String(wallet.currency);
        totals.set(key, (totals.get(key) || 0) + value);
      }
      return Array.from(totals, ([currency, balance]) => ({ currency, balance: String(balance) }));
    }

    // ── the priceBand service ───────────────────────────────────────────────
    // One calendar shared by every plugin that needs DeepSeek's peak / off-peak
    // token pricing: the built-in Chinese statutory-holiday fallback, the yearly
    // automatic refresh from a machine-readable mirror of the State Council
    // notice, and the localStorage cache — so consumers hold no calendar code
    // and cannot disagree with each other.
    const SERVICE_NAME = 'priceBand';
    const PEAK_BANDS = [[9, 12], [14, 18]];
    const DAY_MS = 86400000;

    // Offline fallback: the official 2026 ranges. Only holidays that land on a
    // weekday change the answer (a weekend inside a span is already off-peak),
    // but each full span is listed so the table reads like the notice.
    // Source: 国办发明电〔2025〕7号《国务院办公厅关于2026年部分节假日安排的通知》.
    const HOLIDAY_SPANS = [
      ['2026-01-01', '2026-01-03'], // 元旦
      ['2026-02-15', '2026-02-23'], // 春节
      ['2026-04-04', '2026-04-06'], // 清明
      ['2026-05-01', '2026-05-05'], // 劳动节
      ['2026-06-19', '2026-06-21'], // 端午
      ['2026-09-25', '2026-09-27'], // 中秋
      ['2026-10-01', '2026-10-07'], // 国庆
    ];

    // Mirrors: jsDelivr first (reachable from mainland China), then GitHub raw.
    // Both serve github.com/NateScarlet/holiday-cn, generated from the 国务院
    // 办公厅 notice; CORS is open and `days[].isOffDay` marks each date. A year
    // whose file exists but is still empty (the notice is not out yet) is
    // ignored, and the fallback table keeps answering.
    const HOLIDAY_SOURCES = [
      'https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/',
      'https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/',
    ];
    const HOLIDAY_CACHE_KEY = 'dsh.holiday-calendar.v2';
    const HOLIDAY_CACHE_TTL_MS = 86400000;
    const HOLIDAY_TICK_MS = 12 * 3600000;
    const HOLIDAY_TIMEOUT_MS = 6000;
    const MAX_OFF_DAYS_PER_YEAR = 60;
    const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

    /** Expand inclusive `YYYY-MM-DD` spans into a date set. */
    function expandSpans(spans) {
      const dates = new Set();
      for (const span of spans) {
        const start = Date.parse(span[0] + 'T00:00:00Z');
        const end = Date.parse(span[1] + 'T00:00:00Z');
        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
        for (let at = start; at <= end; at += DAY_MS) {
          dates.add(new Date(at).toISOString().slice(0, 10));
        }
      }
      return dates;
    }

    /** Beijing wall-clock date, hour, and weekday for one instant. */
    function beijingClock(now) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: PEAK_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        hour12: false,
      }).formatToParts(now);
      const pick = (type) => {
        for (const part of parts) if (part.type === type) return part.value;
        return '';
      };
      return {
        date: pick('year') + '-' + pick('month') + '-' + pick('day'),
        hour: Number(pick('hour')) % 24,
        weekday: pick('weekday'),
      };
    }

    /** The deployment's runtime override: `window.__DSH_PRICE_BAND__`. */
    function readOverrides() {
      if (typeof window === 'undefined') return {};
      const value = window.__DSH_PRICE_BAND__;
      return value !== null && typeof value === 'object' ? value : {};
    }

    function sortedYears(dates) {
      return Array.from(new Set(Array.from(dates, (date) => date.slice(0, 4)))).sort();
    }

    function readHolidayCache() {
      try {
        const raw = window.localStorage.getItem(HOLIDAY_CACHE_KEY);
        if (typeof raw !== 'string' || raw === '') return null;
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object') return null;
        if (typeof parsed.fetchedAt !== 'number' || !Number.isFinite(parsed.fetchedAt)) return null;
        if (parsed.years === null || typeof parsed.years !== 'object') return null;
        return parsed;
      } catch {
        return null;
      }
    }

    function writeHolidayCache(value) {
      try {
        window.localStorage.setItem(HOLIDAY_CACHE_KEY, JSON.stringify(value));
      } catch {
        /* private mode or quota: keep the in-memory table only */
      }
    }

    function isFetchDisabled() {
      if (typeof window === 'undefined') return true;
      if (window.__DSH_HOLIDAYS_OFFLINE__ === true) return true;
      try {
        return window.localStorage.getItem(HOLIDAY_CACHE_KEY + '.offline') === '1';
      } catch {
        return false;
      }
    }

    /** Fetch one year from the first mirror that answers with usable data. */
    async function fetchOffDays(year) {
      for (const base of HOLIDAY_SOURCES) {
        const dates = await fetchOffDaysFrom(base, year);
        if (dates !== null) return dates;
      }
      return null;
    }

    async function fetchOffDaysFrom(base, year) {
      const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
      const timer = setTimeout(() => {
        if (controller !== undefined) controller.abort();
      }, HOLIDAY_TIMEOUT_MS);
      try {
        const response = await fetch(base + year + '.json', {
          ...(controller === undefined ? {} : { signal: controller.signal }),
          cache: 'no-store',
          credentials: 'omit',
        });
        if (!response.ok) return null;
        const body = await response.json();
        if (body === null || typeof body !== 'object' || !Array.isArray(body.days)) return null;
        const prefix = String(year) + '-';
        const dates = [];
        for (const day of body.days) {
          if (day === null || typeof day !== 'object' || day.isOffDay !== true) continue;
          const date = day.date;
          if (typeof date !== 'string' || !DATE_PATTERN.test(date)) continue;
          if (!date.startsWith(prefix)) continue;
          if (!dates.includes(date)) dates.push(date);
          if (dates.length > MAX_OFF_DAYS_PER_YEAR) return null;
        }
        return dates.length > 0 ? dates : null;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }

    /**
     * The shared calendar. Cordis registers this instance as `ctx.priceBand` on
     * the providing fiber and removes it when that fiber unloads.
     */
    class PriceBandService extends Service {
      constructor(ctx) {
        super(ctx, SERVICE_NAME);
        this.fetchedDates = [];
        this.dates = this.buildSet();
        this.status = { status: 'idle', at: 0, dates: this.dates.size, years: sortedYears(this.dates) };
        this.listeners = new Set();
        ctx.effect(() => {
          void this.refresh();
          const tick = setInterval(() => {
            void this.refresh();
          }, HOLIDAY_TICK_MS);
          // Turning the yearly fetch on or off re-evaluates the calendar at once.
          const unsubscribe = settingsSubscribe(() => {
            void this.refresh();
          });
          return () => {
            clearInterval(tick);
            unsubscribe();
          };
        }, 'billing-hud: calendar refresh');
      }

      buildSet() {
        const dates = expandSpans(HOLIDAY_SPANS);
        const overrides = readOverrides();
        if (Array.isArray(overrides.holidays)) {
          for (const date of overrides.holidays) {
            if (typeof date === 'string' && DATE_PATTERN.test(date)) dates.add(date);
          }
        }
        for (const date of this.fetchedDates) {
          if (typeof date === 'string') dates.add(date);
        }
        return dates;
      }

      /**
       * @param now - the instant to classify.
       * @returns `'peak'` inside a weekday peak window, `'offPeak'` on weekends,
       * Chinese statutory holidays, and the remaining hours.
       */
      resolveBand(now) {
        const overrides = readOverrides();
        if (overrides.band === 'peak' || overrides.band === 'offPeak') return overrides.band;
        try {
          const clock = beijingClock(now === undefined ? new Date() : now);
          if (!Number.isFinite(clock.hour)) return 'offPeak';
          if (clock.weekday === 'Sat' || clock.weekday === 'Sun') return 'offPeak';
          if (this.dates.has(clock.date)) return 'offPeak';
          for (const band of PEAK_BANDS) {
            if (clock.hour >= band[0] && clock.hour < band[1]) return 'peak';
          }
          return 'offPeak';
        } catch {
          return 'offPeak';
        }
      }

      /** @returns whether one `YYYY-MM-DD` counts as a Chinese statutory holiday. */
      isHoliday(date) {
        return this.dates.has(date);
      }

      /** @returns the refresh status published for diagnostics. */
      getSnapshot() {
        return this.status;
      }

      /** @param listener - called after every refresh that changes the status. */
      subscribe(listener) {
        this.listeners.add(listener);
        return () => {
          this.listeners.delete(listener);
        };
      }

      publish(next) {
        this.status = next;
        if (typeof window !== 'undefined') window.__DSH_HOLIDAY_TABLE__ = next;
        for (const listener of this.listeners) listener();
      }

      /**
       * Refresh the calendar when the settings allow it, the cache is older
       * than a day, or it does not cover the current year; then union it over
       * the fallback spans.
       * @returns `'cache' | 'fetched' | 'offline' | 'disabled' | 'error'`.
       */
      async refresh() {
        try {
          if (!readSettings().fetchHolidays) {
            this.publish({ status: 'disabled', at: Date.now(), dates: this.dates.size, years: sortedYears(this.dates) });
            return 'disabled';
          }
          if (typeof fetch !== 'function' || isFetchDisabled()) {
            const status = isFetchDisabled() ? 'disabled' : 'offline';
            this.publish({ status, at: Date.now(), dates: this.dates.size, years: sortedYears(this.dates) });
            return status;
          }
          const now = Date.now();
          const currentYear = Number(beijingClock(new Date(now)).date.slice(0, 4));
          const fresh = (cached) => cached !== null
            && now - cached.fetchedAt < HOLIDAY_CACHE_TTL_MS
            && cached.years[String(currentYear)] !== undefined;
          const cached = readHolidayCache();
          if (fresh(cached)) {
            this.adopt(cached.years, 'cache');
            return 'cache';
          }
          // A sibling consumer may be refreshing at the same moment; give its
          // write a chance to land before spending a request.
          await new Promise((resolve) => {
            setTimeout(resolve, 120 + Math.random() * 680);
          });
          const late = readHolidayCache();
          if (fresh(late)) {
            this.adopt(late.years, 'cache');
            return 'cache';
          }
          const years = cached === null ? {} : Object.assign({}, cached.years);
          const wanted = [currentYear, currentYear + 1];
          const results = await Promise.all(wanted.map((year) => fetchOffDays(year)));
          let updated = false;
          for (let index = 0; index < wanted.length; index++) {
            const dates = results[index];
            if (dates === null) continue;
            years[String(wanted[index])] = dates;
            updated = true;
          }
          if (updated) writeHolidayCache({ fetchedAt: Date.now(), years });
          this.adopt(years, updated ? 'fetched' : 'offline');
          return updated ? 'fetched' : 'offline';
        } catch {
          this.publish({ status: 'error', at: Date.now(), dates: this.dates.size, years: sortedYears(this.dates) });
          return 'error';
        }
      }

      adopt(years, status) {
        const flat = [];
        for (const key of Object.keys(years)) {
          const list = years[key];
          if (!Array.isArray(list)) continue;
          for (const date of list) {
            if (typeof date === 'string') flat.push(date);
          }
        }
        this.fetchedDates = flat;
        this.dates = this.buildSet();
        this.publish({ status, at: Date.now(), dates: this.dates.size, years: sortedYears(this.dates) });
      }
    }

    // ── composer cost readout ───────────────────────────────────────────────
    /**
     * A banknote, not a currency glyph: the amount already carries its own
     * symbol (`¥1.40`), and a second ¥ beside it reads as a duplicate.
     */
    function CostIcon() {
      return h('svg', {
        viewBox: '0 0 16 16',
        width: 14,
        height: 14,
        'aria-hidden': true,
        focusable: 'false',
        style: { flex: 'none' },
      }, h('g', {
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.3,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      },
        h('rect', { x: 1.7, y: 4.3, width: 12.6, height: 7.4, rx: 1.5 }),
        h('circle', { cx: 8, cy: 8, r: 1.7 }),
        h('path', { d: 'M4.4 6.9v2.2' }),
        h('path', { d: 'M11.6 6.9v2.2' }),
      ));
    }

    /**
     * One composer-dock control. Copy of the host pill metrics: 12px text, 1px
     * vertical / 8px horizontal padding, 6px gap, tabular figures, tertiary
     * label colour from the host theme.
     */
    function CostReadout(props) {
      const settings = useSettings();
      const useProjection = props.useProjection;
      const translate = typeof props.translate === 'function' ? props.translate : null;
      const usage = typeof useProjection === 'function' ? useProjection('tokenUsage') : undefined;
      const selection = typeof useProjection === 'function' ? useProjection('modelSelection') : undefined;

      const tr = (key, params) => {
        if (translate !== null) {
          try {
            return translate(key, params);
          } catch {
            /* fall through to the key */
          }
        }
        return key;
      };

      if (settings.showCost === false) return null;
      if (usage === undefined || usage === null) return null;
      if (tokens(usage.uncachedInputTokens) + tokens(usage.cacheReadTokens)
        + tokens(usage.cacheWriteTokens) + tokens(usage.outputTokens) === 0) return null;

      // `modelSelection` publishes the routed choice as `lastUsed` (what already
      // ran) and `next` (the pending route). Tokens already spent were billed on
      // the former, so it wins; a brand-new session may only have `next`.
      let choice = null;
      if (selection !== null && typeof selection === 'object') {
        const candidates = [selection.lastUsed, selection.next, selection.current];
        for (const candidate of candidates) {
          if (candidate !== undefined && candidate !== null && typeof candidate === 'object') {
            choice = candidate;
            break;
          }
        }
      }
      const model = choice !== null && typeof choice.model === 'string' ? choice.model : undefined;
      const provider = choice !== null && typeof choice.provider === 'string' ? choice.provider : undefined;

      const pricing = pricingOf(settings);
      const band = typeof props.bandOf === 'function' ? props.bandOf(new Date(), settings) : fallbackBand(new Date());
      const priced = priceUsage(usage, model, provider, band, pricing);
      if (priced === null) return null;

      const money = formatMoney(priced.cost, settings.currency);
      const lines = [
        tr('cost.tooltip.title', { model: priced.model }),
        tr(priced.band === 'peak' ? 'cost.tooltip.band.peak' : 'cost.tooltip.band.offPeak'),
        tr('cost.tooltip.cacheMiss', {
          tokens: formatCount(priced.cacheMiss),
          price: String(priced.rates.cacheMiss),
        }),
      ];
      if (priced.cacheRead > 0) {
        lines.push(tr('cost.tooltip.cacheRead', {
          tokens: formatCount(priced.cacheRead),
          price: String(priced.rates.cacheRead),
        }));
      }
      lines.push(tr('cost.tooltip.output', {
        tokens: formatCount(priced.output),
        price: String(priced.rates.output),
      }));
      lines.push(tr('cost.tooltip.total', { amount: money }));
      lines.push(tr('cost.tooltip.note'));
      const tooltip = lines.join('\n');
      const ariaLabel = tr('cost.aria', { amount: money });

      return h('span', {
        style: {
          display: 'inline-flex',
          minWidth: 0,
          fontSize: 'calc(var(--dsh-content-font-size-secondary, 13px) - 1px)',
          lineHeight: 'calc(20px + var(--dsh-content-font-delta-secondary, 0px))',
        },
        'data-composer-stat': 'cost',
        'data-token-cost-total': priced.total,
        'data-token-cost-band': priced.band,
        'data-token-cost-model': priced.model,
      }, h('span', {
        title: tooltip,
        'aria-label': ariaLabel,
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '1px 8px',
          borderRadius: 'var(--dsw-radius-sm)',
          color: 'var(--dsw-alias-label-tertiary)',
          font: 'inherit',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 'inherit',
          whiteSpace: 'nowrap',
          maxWidth: '100%',
        },
      },
        CostIcon(),
        h('span', {
          style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' },
        }, money),
      ));
    }

    // ── sidebar balance row ─────────────────────────────────────────────────
    /** A window can take focus repeatedly; keep the Platform reads coarse. */
    const FOCUS_THROTTLE_MS = 15000;
    /** How often the poll loop checks whether the configured interval elapsed. */
    const POLL_TICK_MS = 10000;

    const TOPUP_CSS = [
      '.dsh-billing-hud-topup:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsh-billing-hud-topup:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
    ].join('');

    // ── small observable ────────────────────────────────────────────────────
    function createStore(initial) {
      let snapshot = initial;
      const listeners = new Set();
      const set = (next) => {
        snapshot = next;
        for (const listener of listeners) listener();
      };
      return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        update(part) {
          set(Object.assign({}, snapshot, part));
        },
        read: () => snapshot,
      };
    }

    function WalletIcon() {
      return h('svg', {
        viewBox: '0 0 16 16',
        width: 14,
        height: 14,
        'aria-hidden': true,
        focusable: 'false',
        style: { flex: 'none' },
      }, h('g', {
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.3,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      },
        h('path', { d: 'M2.4 5.6a1.4 1.4 0 0 1 1.4-1.4h7.4a1.4 1.4 0 0 1 1.4 1.4v.6H3.8' }),
        h('path', { d: 'M2.4 5.6v5.2a1.4 1.4 0 0 0 1.4 1.4h8.4a1.4 1.4 0 0 0 1.4-1.4V7.4a1.4 1.4 0 0 0-1.4-1.4H3.8' }),
        h('path', { d: 'M11 9.3h.9' }),
      ));
    }

    /**
     * Sidebar footer row: the signed-in account's remaining balance with a top-up
     * action on the right, sitting directly above the account avatar. Renders
     * nothing when no credential is stored, when the settings switch it off, and
     * while the sidebar is collapsed to its icon rail (`wide === false`).
     */
    function AccountBalance(props) {
      const settings = useSettings();
      const useBalance = props.useBalance;
      const translate = typeof props.translate === 'function' ? props.translate : null;
      const state = typeof useBalance === 'function' ? useBalance((value) => value) : undefined;

      const tr = (key, params) => {
        if (translate !== null) {
          try {
            return translate(key, params);
          } catch {
            /* fall through to the key */
          }
        }
        return key;
      };

      if (props.wide === false) return null;
      if (settings.showBalance === false) return null;
      if (state === undefined || state === null) return null;
      const view = state.view;
      if (view === undefined || view === null || view.status !== 'credential-stored') return null;

      const wallets = state.wallets;
      let amountText;
      if (wallets === undefined) amountText = tr('balance.loading');
      else if (wallets === null || state.failed) amountText = tr('balance.failed');
      else if (wallets.length === 0) amountText = tr('balance.unknown');
      else amountText = joinWallets(wallets);
      const known = wallets !== undefined && wallets !== null && !state.failed && wallets.length > 0;

      const lines = [];
      if (known) {
        lines.push(tr('tooltip.recharge', { amount: amountText }));
        const bonus = positive(state.bonusWallets);
        if (bonus.length > 0) lines.push(tr('tooltip.bonus', { amount: joinWallets(bonus) }));
      } else if (state.failed) {
        lines.push(tr('tooltip.failed'));
      } else if (wallets === undefined) {
        lines.push(tr('balance.loading'));
      } else {
        lines.push(tr('tooltip.empty'));
      }
      lines.push(tr('tooltip.hint'));
      const tooltip = lines.join('\n');

      const topUpUrl = view.links !== undefined && view.links !== null && typeof view.links.topUpUrl === 'string'
        ? view.links.topUpUrl
        : null;

      const readout = [
        h(WalletIcon, { key: 'icon' }),
        h('span', {
          key: 'amount',
          title: tooltip,
          'aria-label': tr('balance.aria', { amount: amountText }),
          style: {
            color: known ? 'var(--dsw-alias-label-secondary)' : 'var(--dsw-alias-label-tertiary)',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          },
        }, tr('balance.label') + ' ' + amountText),
      ];

      // The current token-price band, immediately left of the top-up action:
      // a state dot plus Peak / Off-peak.
      const band = typeof props.bandOf === 'function' ? props.bandOf(new Date()) : fallbackBand(new Date());
      const trailing = [
        h('span', {
          key: 'band',
          'data-price-band': band,
          title: tr(band === 'peak' ? 'band.peak.tip' : 'band.offPeak.tip'),
          'aria-label': tr(band === 'peak' ? 'band.peak.tip' : 'band.offPeak.tip'),
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            color: 'var(--dsw-alias-label-tertiary)',
            whiteSpace: 'nowrap',
            flex: 'none',
            cursor: 'default',
          },
        }, [
          h('span', {
            key: 'dot',
            'aria-hidden': true,
            style: {
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              flex: 'none',
              background: band === 'peak'
                ? 'var(--dsw-alias-state-warn-primary)'
                : 'var(--dsw-alias-state-success-primary)',
            },
          }),
          h('span', { key: 'label' }, tr(band === 'peak' ? 'band.peak' : 'band.offPeak')),
        ]),
      ];

      if (topUpUrl !== null) {
        trailing.push(h('a', {
          key: 'topup',
          className: 'dsh-billing-hud-topup',
          href: topUpUrl,
          target: '_blank',
          rel: 'noreferrer',
          title: tr('topUp.aria'),
          'aria-label': tr('topUp.aria'),
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
            height: '22px',
            padding: '0 9px',
            border: '.5px solid var(--dsw-alias-border-l3)',
            borderRadius: 'var(--dsw-radius-md)',
            color: 'var(--dsw-alias-label-primary)',
            fontSize: '12px',
            lineHeight: '18px',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            flex: 'none',
          },
        }, tr('topUp')));
      }

      const row = [
        h('style', { key: 'css', dangerouslySetInnerHTML: { __html: TOPUP_CSS } }),
        h('span', {
          key: 'readout',
          style: { display: 'inline-flex', alignItems: 'center', gap: '5px', minWidth: 0 },
        }, readout),
        h('span', {
          key: 'trailing',
          style: { display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 'none' },
        }, trailing),
      ];

      return h('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          boxSizing: 'border-box',
          width: '100%',
          height: '28px',
          padding: '0 2px',
          fontSize: '12px',
          lineHeight: '18px',
          minWidth: 0,
        },
        'data-account-balance': known ? 'ready' : state.failed ? 'failed' : wallets === undefined ? 'loading' : 'empty',
        'data-account-balance-amount': amountText,
        'data-account-balance-row': '',
      }, row);
    }

    // ── settings page ───────────────────────────────────────────────────────
    const FIELD_STYLE = { display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '16px', maxWidth: '560px' };
    const LABEL_STYLE = { fontSize: '12px', color: 'var(--dsw-alias-label-primary)' };
    const HINT_STYLE = { fontSize: '11px', lineHeight: '16px', color: 'var(--dsw-alias-label-tertiary)' };
    const INPUT_STYLE = {
      boxSizing: 'border-box',
      height: '26px',
      padding: '0 8px',
      border: '.5px solid var(--dsw-alias-border-l3)',
      borderRadius: 'var(--dsw-radius-sm)',
      background: 'var(--dsw-alias-bg-primary)',
      color: 'var(--dsw-alias-label-primary)',
      fontSize: '12px',
    };
    const BUTTON_STYLE = {
      height: '26px',
      padding: '0 10px',
      border: '.5px solid var(--dsw-alias-border-l3)',
      borderRadius: 'var(--dsw-radius-sm)',
      background: 'transparent',
      color: 'var(--dsw-alias-label-primary)',
      fontSize: '12px',
      cursor: 'pointer',
    };

    function ToggleRow(props) {
      const id = 'billing-hud-' + props.name;
      return h('div', { style: FIELD_STYLE },
        h('label', {
          htmlFor: id,
          style: { display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: 'var(--dsw-alias-label-primary)' },
        },
          h('input', {
            id,
            type: 'checkbox',
            checked: props.checked,
            onChange: (event) => props.onChange(event.target.checked),
          }),
          h('span', null, props.label),
        ),
        h('div', { style: HINT_STYLE }, props.hint),
      );
    }

    function BillingHudSettings(props) {
      const settings = useSettings();
      const translate = typeof props.translate === 'function' ? props.translate : null;
      const tr = (key, params) => {
        if (translate !== null) {
          try {
            return translate(key, params);
          } catch {
            /* fall through to the key */
          }
        }
        return key;
      };

      const [pricingText, setPricingText] = React.useState(() => JSON.stringify(settings.pricing === null ? {} : settings.pricing, null, 2));
      const [error, setError] = React.useState('');
      const [savedAt, setSavedAt] = React.useState(0);

      React.useEffect(() => {
        if (savedAt === 0) return undefined;
        const timer = setTimeout(() => setSavedAt(0), 1600);
        return () => clearTimeout(timer);
      }, [savedAt]);

      const save = (patch) => {
        settingsWrite(patch);
        setSavedAt(Date.now());
      };

      const applyPricing = () => {
        const text = pricingText.trim();
        if (text === '') {
          setError('');
          save({ pricing: null });
          return;
        }
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (cause) {
          setError(String(cause && cause.message ? cause.message : cause));
          return;
        }
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          setError(tr('settings.pricing.invalid'));
          return;
        }
        setError('');
        save({ pricing: parsed });
      };

      const resetPricing = () => {
        setPricingText('{}');
        setError('');
        save({ pricing: null });
      };

      return h('div', { style: { padding: '4px 0 12px', display: 'flex', flexDirection: 'column' } },
        h('h3', { style: { margin: '0 0 4px', fontSize: '13px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } }, tr('settings.heading')),
        h('p', { style: { ...HINT_STYLE, margin: '0 0 18px' } }, tr('settings.intro')),

        h(ToggleRow, {
          name: 'show-cost',
          checked: settings.showCost,
          label: tr('settings.showCost'),
          hint: tr('settings.showCost.hint'),
          onChange: (checked) => save({ showCost: checked }),
        }),

        h(ToggleRow, {
          name: 'show-balance',
          checked: settings.showBalance,
          label: tr('settings.showBalance'),
          hint: tr('settings.showBalance.hint'),
          onChange: (checked) => save({ showBalance: checked }),
        }),

        h(ToggleRow, {
          name: 'fetch-holidays',
          checked: settings.fetchHolidays,
          label: tr('settings.fetchHolidays'),
          hint: tr('settings.fetchHolidays.hint'),
          onChange: (checked) => save({ fetchHolidays: checked }),
        }),

        h('div', { style: FIELD_STYLE },
          h('label', { htmlFor: 'billing-hud-band', style: LABEL_STYLE }, tr('settings.bandMode')),
          h('select', {
            id: 'billing-hud-band',
            value: settings.bandMode,
            onChange: (event) => save({ bandMode: event.target.value }),
            style: { ...INPUT_STYLE, height: '28px' },
          },
            h('option', { value: 'auto' }, tr('settings.bandMode.auto')),
            h('option', { value: 'peak' }, tr('settings.bandMode.peak')),
            h('option', { value: 'offPeak' }, tr('settings.bandMode.offPeak')),
          ),
        ),

        h('div', { style: FIELD_STYLE },
          h('label', { htmlFor: 'billing-hud-currency', style: LABEL_STYLE }, tr('settings.currency')),
          h('input', {
            id: 'billing-hud-currency',
            type: 'text',
            value: settings.currency,
            maxLength: 4,
            onChange: (event) => save({ currency: event.target.value }),
            style: { ...INPUT_STYLE, width: '80px' },
          }),
        ),

        h('div', { style: FIELD_STYLE },
          h('label', { htmlFor: 'billing-hud-interval', style: LABEL_STYLE }, tr('settings.interval')),
          h('input', {
            id: 'billing-hud-interval',
            type: 'number',
            min: 15,
            max: 3600,
            step: 5,
            value: settings.balanceRefreshSeconds,
            onChange: (event) => save({ balanceRefreshSeconds: Number(event.target.value) }),
            style: { ...INPUT_STYLE, width: '110px' },
          }),
          h('div', { style: HINT_STYLE }, tr('settings.interval.hint')),
        ),

        h('div', { style: { ...FIELD_STYLE, maxWidth: '640px' } },
          h('label', { htmlFor: 'billing-hud-pricing', style: LABEL_STYLE }, tr('settings.pricing')),
          h('textarea', {
            id: 'billing-hud-pricing',
            value: pricingText,
            spellCheck: false,
            rows: 10,
            onChange: (event) => setPricingText(event.target.value),
            style: {
              ...INPUT_STYLE,
              height: 'auto',
              padding: '8px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: '11px',
              lineHeight: '16px',
              resize: 'vertical',
            },
          }),
          h('div', { style: HINT_STYLE }, tr('settings.pricing.hint')),
          error !== '' ? h('div', { style: { ...HINT_STYLE, color: 'var(--dsw-alias-state-error-primary)' } }, error) : null,
          h('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
            h('button', { type: 'button', onClick: applyPricing, style: BUTTON_STYLE }, tr('settings.pricing.apply')),
            h('button', { type: 'button', onClick: resetPricing, style: BUTTON_STYLE }, tr('settings.pricing.reset')),
          ),
        ),

        h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
          h('button', {
            type: 'button',
            onClick: () => {
              settingsWrite(normalizeSettings({}));
              setPricingText('{}');
              setError('');
              setSavedAt(Date.now());
            },
            style: BUTTON_STYLE,
          }, tr('settings.resetAll')),
          savedAt !== 0
            ? h('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-state-success-primary)' } }, tr('settings.saved'))
            : null,
        ),
      );
    }

    // ── General-section rows ────────────────────────────────────────────────
    // One row per display switch, inside Settings → General, so the most common
    // decisions do not require opening the plugin's own tab. The General seat
    // projects no label and passes no props, so a row draws its own internals.
    function GeneralToggleRow(props) {
      const settings = useSettings();
      const translate = typeof props.translate === 'function' ? props.translate : null;
      const tr = (key, params) => {
        if (translate !== null) {
          try {
            return translate(key, params);
          } catch {
            /* fall through to the key */
          }
        }
        return key;
      };
      const field = props.field;
      const checked = settings[field] !== false;
      return h('div', {
        style: {
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '14px',
          padding: '10px 0',
        },
      },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 } },
          h('span', { style: LABEL_STYLE }, tr(props.labelKey)),
          h('span', { style: HINT_STYLE }, tr(props.hintKey)),
        ),
        h('input', {
          type: 'checkbox',
          checked,
          'aria-label': tr(props.labelKey),
          onChange: (event) => {
            settingsWrite({ [field]: event.target.checked });
          },
          style: { marginTop: '2px', flex: 'none', cursor: 'pointer' },
        }),
      );
    }

    // ── plugin ──────────────────────────────────────────────────────────────
    return {
      inject: ['slots', 'locale', 'remote', 'remote.account'],
      apply(ctx) {
        // Constructing the service registers it on this plugin's fiber; cordis
        // removes it when the bundle unloads, which is what makes
        // `ctx.get('priceBand')` an honest availability check.
        new PriceBandService(ctx);

        ctx.effect(() => ctx.locale.register(NS, {
          zh: DICTIONARIES.zh,
          en: DICTIONARIES.en,
        }), 'billing-hud: dictionaries');
        const t = ctx.locale.bind(NS);

        /** The shared calendar; `bandMode` in the settings still pins one band for the readout. */
        const costBandOf = (now, settings) => {
          const mode = settings !== null && settings !== undefined && typeof settings.bandMode === 'string'
            ? settings.bandMode
            : readSettings().bandMode;
          if (mode === 'peak' || mode === 'offPeak') return mode;
          const service = ctx.get('priceBand');
          if (service !== undefined && service !== null && typeof service.resolveBand === 'function') {
            try {
              return service.resolveBand(now);
            } catch {
              /* fall through to the local approximation */
            }
          }
          return fallbackBand(now);
        };

        /** The same calendar for the sidebar row, which has no pinning switch. */
        const accountBandOf = (now) => {
          const service = ctx.get('priceBand');
          if (service !== undefined && service !== null && typeof service.resolveBand === 'function') {
            try {
              return service.resolveBand(now);
            } catch {
              /* fall through to the local approximation */
            }
          }
          return fallbackBand(now);
        };

        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'cost',
          order: 2,
          locale: NS,
          inject: () => ({ translate: t, bandOf: costBandOf }),
        }, CostReadout));

        const store = createStore({
          view: undefined,
          wallets: undefined,
          bonusWallets: [],
          failed: false,
        });

        /** The calling UI's Platform identity, read at call time. */
        const clientMetadata = () => {
          let version = '0.0.0';
          const boot = globalThis.__DSH_BOOT__;
          if (boot !== undefined && boot !== null && boot.release !== undefined && boot.release !== null
            && typeof boot.release.version === 'string' && boot.release.version !== '') {
            version = boot.release.version;
          }
          return {
            version,
            locale: ctx.locale.getSnapshot().active,
            timezoneOffsetSeconds: -(new Date()).getTimezoneOffset() * 60,
          };
        };

        let reading = false;
        let lastRead = 0;
        let disposed = false;

        /** The configured interval, never below the focus throttle. */
        const minGapMs = () => Math.max(FOCUS_THROTTLE_MS, settingsGet().balanceRefreshSeconds * 1000);

        /** Read sign-in state, then the wallets that state allows. */
        const read = async (options) => {
          if (disposed || reading) return;
          if (settingsGet().showBalance === false) return;
          const forced = options !== undefined && options.forced === true;
          const now = Date.now();
          if (!forced && now - lastRead < minGapMs()) return;
          lastRead = now;
          reading = true;
          try {
            const stateResult = await ctx.remote.account.getState();
            if (disposed) return;
            if (!stateResult.ok) {
              store.update({ failed: true });
              return;
            }
            const view = stateResult.value;
            if (view === null || typeof view !== 'object') {
              store.update({ failed: true });
              return;
            }
            if (view.status !== 'credential-stored') {
              store.update({ view, wallets: undefined, bonusWallets: [], failed: false });
              return;
            }
            store.update({ view, failed: false });
            const balanceResult = await ctx.remote.account.getBalance(clientMetadata());
            if (disposed) return;
            if (!balanceResult.ok) {
              store.update({ wallets: null, bonusWallets: [], failed: true });
              return;
            }
            const balance = balanceResult.value;
            if (balance === null || typeof balance !== 'object') {
              store.update({ wallets: null, bonusWallets: [], failed: false });
              return;
            }
            if (balance.status !== 'ready') {
              store.update({ wallets: null, bonusWallets: [], failed: true });
              return;
            }
            store.update({
              wallets: sumAll(balance.value),
              bonusWallets: balance.bonusWallets,
              failed: false,
            });
          } catch {
            if (!disposed) store.update({ failed: true });
          } finally {
            reading = false;
          }
        };

        ctx.effect(() => {
          disposed = false;
          void read({ forced: true });
          const timer = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            void read();
          }, POLL_TICK_MS);
          const onFocus = () => {
            void read();
          };
          window.addEventListener('focus', onFocus);
          // Re-enabling the row, or shortening the interval, picks up at once.
          const unsubscribe = settingsSubscribe(() => {
            void read();
          });
          return () => {
            disposed = true;
            clearInterval(timer);
            window.removeEventListener('focus', onFocus);
            unsubscribe();
          };
        }, 'billing-hud: wallet reads');

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'account-balance',
          locale: NS,
          inject: () => ({ hooks: { balance: store }, translate: t, bandOf: accountBandOf }),
        }, AccountBalance));

        ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
          name: 'settings.plugins.tab',
          id: 'billing-hud',
          order: 40,
          locale: NS,
          label: () => t('settings.tab'),
          inject: () => ({ translate: t }),
        }, BillingHudSettings));

        // The two display switches also live in Settings → General, one row each.
        ctx.slots.inject('settings.general.item', () => ctx.slots.register({
          name: 'settings.general.item',
          id: 'billing-hud-cost',
          order: 18,
          locale: NS,
          inject: () => ({
            translate: t,
            field: 'showCost',
            labelKey: 'settings.showCost',
            hintKey: 'settings.showCost.hint',
          }),
        }, GeneralToggleRow));

        ctx.slots.inject('settings.general.item', () => ctx.slots.register({
          name: 'settings.general.item',
          id: 'billing-hud-balance',
          order: 19,
          locale: NS,
          inject: () => ({
            translate: t,
            field: 'showBalance',
            labelKey: 'settings.showBalance',
            hintKey: 'settings.showBalance.hint',
          }),
        }, GeneralToggleRow));
      },
    };
  },
});

/**
 * 社交（第三方）登录接入
 *
 * === 为什么这里没有「点一下就登录」的现成逻辑 ===
 * 本仓当前**没有任何第三方登录的后端实现**（`api/auth.ts` 里没有相关端点）。
 * 所以这个 composable 只做两件事：算出「这次要显示哪几个 provider」，
 * 以及把用户的选择交给真正能处理它的地方 —— 配置好的授权端点，或父应用。
 * 没有后端却渲染一排点了没反应的图标，比不显示更糟。
 *
 * === provider 列表从哪来（优先级由高到低）===
 *   1. URL `?social=wechat,qq`                  单次会话 / 联调最方便
 *   2. 父应用注入 `window.__MAUTH_SOCIAL_PROVIDERS__`   iframe 嵌入方统一下发
 *   3. 构建期 `VITE_SOCIAL_PROVIDERS`
 * 都没有 → 空数组，组件不渲染任何 DOM（于是默认外观零变化，视觉回归结论继续成立）。
 *
 * 三个来源都只做**精确匹配白名单**：`__evil__`、`wx`、`wechat/../x`、空串一律丢弃。
 * provider id 最终会被拼进跳转 URL，不校验就等于让 URL 决定去哪儿。
 *
 * === 授权端点（跳转目标）===
 * 只接受**站内相对路径**（`/` 开头且不是 `//`），可来自父应用注入或构建期 env。
 * 刻意不支持 `https://…` 与协议相对 `//host/x`：端点一旦能由外部指定，
 * 「把用户送去任意外域」就从漏洞变成了配置问题 —— 而配置总会被写错。
 *
 * === 「上次登录」===
 * 来源：URL `?lastLogin=`（后端回跳 / 父应用下发）> localStorage（本地近似）。
 * 只靠 localStorage 不够准（换设备就没了），所以外部注入排前面，localStorage 兜底；
 * 写入走 `rememberProvider()`，由第三方回调真正落地后再调用 —— 点一下不算登录成功。
 *
 * @author yijiu2025
 */
import { computed, ref } from 'vue';
import { postToParent } from '@/utils/parent';

type SocialProviderId = 'wechat' | 'alipay' | 'qq' | 'weibo' | 'github' | 'apple';

/** provider 白名单：不在这里的 id 一律不渲染、不跳转 */
const PROVIDER_IDS = ['wechat', 'alipay', 'qq', 'weibo', 'github', 'apple'] as const;

/** 一次最多显示几个：再多会挤成两行，也避免被 URL 塞进一长串 */
const MAX_PROVIDERS = 6;

/** URL 参数名 */
const LIST_PARAM = 'social';
const LAST_PARAM = 'lastLogin';

/** localStorage 键：只在拿不到外部注入时当兜底 */
const LAST_STORAGE_KEY = 'mauth-last-provider';

/** 读父应用注入的全局通道（只认字符串，其余形态一律忽略） */
function readInjected(key: string): string {
  const value = (window as unknown as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

/** 当前页查询参数（现读：SPA 内换页后参数会变，不做缓存） */
function searchParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

function isProviderId(value: string): value is SocialProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

/**
 * 从逗号分隔的串里挑出合法的 provider id
 *
 * 保持配置给定的原序（不重排），重复项只留第一个。
 */
function parseProviderIds(raw: string): SocialProviderId[] {
  const out: SocialProviderId[] = [];
  for (const piece of raw.split(',')) {
    const id = piece.trim().toLowerCase();
    if (!id || !isProviderId(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= MAX_PROVIDERS) break;
  }
  return out;
}

/**
 * 授权端点是否可用
 *
 * 只放行站内相对路径：`/oauth/social` 可以；`//evil.com`（协议相对，浏览器当成
 * 外域绝对地址）、`https://…`、`javascript:`、`data:` 全部拒绝。
 */
function isSafeEndpoint(value: string): boolean {
  const v = value.trim();
  return v.startsWith('/') && !v.startsWith('//');
}

/** 上次登录方式：外部注入优先，localStorage 兜底 */
function resolveLastProvider(params: URLSearchParams): SocialProviderId | null {
  const fromUrl = (params.get(LAST_PARAM) || '').trim().toLowerCase();
  if (isProviderId(fromUrl)) return fromUrl;
  try {
    const cached = (localStorage.getItem(LAST_STORAGE_KEY) || '').trim().toLowerCase();
    if (isProviderId(cached)) return cached;
  } catch {
    /* 隐私模式 / 存储被禁用：读不到就不显示徽标，不阻断登录 */
  }
  return null;
}

/**
 * 第三方授权完成后应回到的地址
 *
 * 用当前页 URL 剥掉只用于「本次渲染」的参数（social / lastLogin），
 * 保留 client_id / redirect_uri / state 等 OAuth 上下文 —— 回调后要接着走原流程。
 */
function callbackUrl(): string {
  const url = new URL(window.location.href);
  url.searchParams.delete(LIST_PARAM);
  url.searchParams.delete(LAST_PARAM);
  return url.toString();
}

/**
 * 在当前页面启用社交登录
 *
 * 用法：移动端登录页 setup 中调用，把 providers / lastProvider 交给 MauthSocialRow，
 * 把用户点击结果交给 `startLogin`。
 */
function useSocialLogin() {
  const params = searchParams();

  /** 本次要显示的 provider（空数组 = 整行不渲染） */
  const providers = ref<SocialProviderId[]>(
    parseProviderIds(
      params.get(LIST_PARAM) ||
        readInjected('__MAUTH_SOCIAL_PROVIDERS__') ||
        import.meta.env.VITE_SOCIAL_PROVIDERS ||
        ''
    )
  );

  /** 上次登录用的 provider（命中时该图标上方显示「上次登录」） */
  const lastProvider = ref<SocialProviderId | null>(resolveLastProvider(params));

  /** 授权端点：父应用注入 > 构建期 env，且必须通过站内路径校验 */
  const endpoint = computed(() => {
    const candidate = readInjected('__MAUTH_SOCIAL_ENDPOINT__') || import.meta.env.VITE_SOCIAL_ENDPOINT || '';
    return isSafeEndpoint(candidate) ? candidate.trim() : '';
  });

  /** 是否具备跳转能力（UI 可据此提示，而不是让用户点了没反应） */
  const configured = computed(() => endpoint.value.length > 0);

  /**
   * 发起第三方登录
   *
   * @returns 'redirected' 已跳转 / 'notified' 已通知父应用 / 'unconfigured' 没配端点
   */
  function startLogin(id: SocialProviderId): 'redirected' | 'notified' | 'unconfigured' {
    // 再校验一次：调用方可能从外部传入未登记的 id
    if (!isProviderId(id)) return 'unconfigured';

    const query = new URLSearchParams({ provider: id });
    const clientId = params.get('client_id') || params.get('appName') || '';
    if (clientId) query.set('client_id', clientId);
    const back = callbackUrl();
    if (back) query.set('redirect_uri', back);

    if (endpoint.value) {
      const sep = endpoint.value.includes('?') ? '&' : '?';
      window.location.href = `${endpoint.value}${sep}${query.toString()}`;
      return 'redirected';
    }

    // 没有端点：iframe 里交给父应用（父应用自己知道该跳去哪儿）。
    // postToParent 内部会校验父 origin 白名单，未授权的父窗口收不到 —— 那是父侧的配置问题。
    if (window.parent && window.parent !== window) {
      postToParent({ type: 'SOCIAL_LOGIN', provider: id, clientId, redirectUri: back });
      return 'notified';
    }

    // 全屏直连又没配端点：明确告知，而不是静默什么都不做
    return 'unconfigured';
  }

  /** 记住本次使用的 provider（第三方回调落地后调用），供下次显示「上次登录」 */
  function rememberProvider(id: SocialProviderId): void {
    if (!isProviderId(id)) return;
    try {
      localStorage.setItem(LAST_STORAGE_KEY, id);
    } catch {
      /* 存储不可用只影响徽标，不影响登录 */
    }
  }

  return { providers, lastProvider, endpoint, configured, startLogin, rememberProvider };
}

export { useSocialLogin };
export type { SocialProviderId };

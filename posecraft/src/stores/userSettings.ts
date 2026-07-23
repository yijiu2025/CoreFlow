/**
 * 用户个性设置（UI 偏好）
 *
 * 策略：
 * 1. 未登录 / 接口失败：使用本地缓存
 * 2. 已登录：每次改动先写缓存，再异步同步后端
 * 3. 登录成功后：一次性从后端拉取全部，合并到本地（后端优先）
 *
 * 默认值作为兜底，确保首次进页面 / 新账号总有合理初始值
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useCache } from '@/composables/useCache';
import { useAuthStore } from './auth';
import { settingsApi } from '@/api/settings';

const cache = useCache('localStorage', 'posecraft_settings_');

/**
 * 默认值：作为兜底，key 一旦定义长期保持稳定
 *
 * 注意：saveLoginInfo 仍由 authStore 管理（已有独立同步机制），
 * 不在此处重复定义，避免双源冲突。
 */
export const DEFAULT_SETTINGS = {
  showTemplate: true, // 骨骼线图层默认显示
  theme: 'auto' // auto / light / dark
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;

export const useUserSettings = defineStore('userSettings', () => {
  // 响应式状态（脱敏缓存副本）
  const settings = ref<Record<SettingKey, any>>({ ...DEFAULT_SETTINGS });

  // 是否已经从后端拉取过一次（登录后）
  const syncedFromServer = ref(false);

  /** 初始化：挂载时从本地缓存恢复 */
  function hydrateFromCache() {
    const keys = Object.keys(DEFAULT_SETTINGS) as SettingKey[];
    for (const key of keys) {
      const cached = cache.get<any>(key);
      if (cached !== null && cached !== undefined) {
        settings.value[key] = cached;
      }
    }
  }

  /** 单个字段同步到后端（静默失败，缓存已先行写入） */
  async function syncFieldToServer(field: SettingKey, value: any) {
    const auth = useAuthStore();
    if (!auth.isLoggedIn) return;
    try {
      await settingsApi.setField(field, value);
    } catch (err) {
      console.warn(`[userSettings] 同步字段 ${field} 失败，下次登录重试:`, err);
    }
  }

  /** 更新单个字段：先写缓存 → 改响应式 → 异步同步后端 */
  function setSetting<K extends SettingKey>(field: K, value: (typeof DEFAULT_SETTINGS)[K]) {
    settings.value[field] = value;
    cache.set(field, value);
    syncFieldToServer(field, value);
  }

  /**
   * 登录后调用：一次性从后端拉取全部字段，合并到本地（后端优先）
   * 将合并后的结果回写到本地缓存与响应式状态
   */
  async function pullFromServer() {
    const auth = useAuthStore();
    if (!auth.isLoggedIn) return;

    try {
      const res: any = await settingsApi.getAll();
      const serverSettings = (res?.data || res || {}) as Record<string, any>;
      const keys = Object.keys(DEFAULT_SETTINGS) as SettingKey[];

      for (const key of keys) {
        if (serverSettings[key] !== undefined) {
          // 服务端有值 → 覆盖本地
          settings.value[key] = serverSettings[key];
          cache.set(key, serverSettings[key]);
        } else {
          // 服务端没有（新账号 / 未设置过）→ 把本地缓存的值推上去
          const cached = cache.get<any>(key);
          const initialValue = cached !== null ? cached : settings.value[key];
          await syncFieldToServer(key, initialValue);
          settings.value[key] = initialValue;
          cache.set(key, initialValue);
        }
      }
      syncedFromServer.value = true;
    } catch (err) {
      // 网络失败，保留缓存 / 默认值
      console.warn('[userSettings] 拉取设置失败，使用缓存:', err);
    }
  }

  /**
   * 监听登录状态变化：
   * - 登录完成 → 从后端拉取，合并到本地
   * - 登出      → 保留缓存，标记为未同步（下次登录再拉）
   */
  function bindAuthWatcher() {
    const auth = useAuthStore();
    let lastUid: string | null = null;

    auth.$subscribe((_mutation, state) => {
      const currentUid = state.user?.uid || state.user?.id || null;
      if (state.isLoggedIn && currentUid !== lastUid) {
        lastUid = currentUid;
        pullFromServer();
      } else if (!state.isLoggedIn) {
        lastUid = null;
        syncedFromServer.value = false;
      }
    });
  }

  /** 初始化入口：缓存优先恢复 + 启动登录状态监听 */
  function init() {
    hydrateFromCache();
    bindAuthWatcher();
  }

  return {
    settings,
    syncedFromServer,
    setSetting,
    pullFromServer,
    hydrateFromCache,
    bindAuthWatcher,
    init
  };
});

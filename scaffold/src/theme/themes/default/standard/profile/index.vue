<script setup lang="ts">
/**
 * 珍珠玻璃 · 个人设置版式
 *
 * 版式只负责"长什么样"：昵称/头像、界面风格、主色、登录设备四块都由容器与两个 store
 * 支撑（`views/settings/Profile.vue`），契约见 `theme/views/profile.ts`。
 * 这里不落库、不判权限，点了就调 `ctx` 上的回调。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { Check, ChevronRight, Layers, LogOut, MonitorSmartphone, PowerOff, Trash2 } from 'lucide-vue-next';
import type { ProfileViewContext } from '@/theme/views/profile';

const props = defineProps<{ ctx: ProfileViewContext }>();

/*
 * 把 ctx 平铺回模板原来的名字 —— 搬迁前模板用的是这些名字，逐字保留就不用逐行改。
 * 解构出来的是**同一个 Ref**（不是快照），响应性与 `.value` 写法都不变。
 */
const {
  userName,
  nickname,
  avatar,
  avatarBroken,
  profileState,
  profileError,
  fileInput,
  uploading,
  avatarError,
  devices,
  devicesLoading,
  devicesError,
  deviceNotice,
  kicking,
  kickingAll,
  showRevoked,
  pruning,
  activeDevices,
  revokedDevices,
  visibleDevices,
  onPickAvatar,
  clearAvatar,
  isRevoked,
  deviceKind,
  uaSummary,
  when,
  kickDevice,
  kickOthers,
  pruneRevoked
} = props.ctx;
</script>

<template>
  <div class="profile">
    <!--
      页头四个类与 `components/business/PersonalPage.vue` 完全一致：
      版式归主题，但标题层级与间距必须与另外三个个人页对齐，否则切换页面会"跳一下"。
    -->
    <header class="page__head">
      <div class="profile__heading">
        <h1 class="page__title">个人资料</h1>
        <p class="page__sub">头像与昵称；昵称会显示在顶栏、操作记录与通知收件人里</p>
      </div>
    </header>

    <section class="panel">
      <header class="panel__head">
        <span class="panel__title">头像与昵称</span>
      </header>

      <div class="panel__body">
        <div class="identity">
          <span class="identity__avatar">
            <!--
              加载失败（文件被清理 / 反向代理漏配）时回落到首字母，
              不要留一个裂图占位符 —— 那看起来像页面坏了，而不像"没设置头像"。
            -->
            <img v-if="avatar && !avatarBroken" :src="avatar" alt="" @error="avatarBroken = true" />
            <span v-else>{{ (nickname || userName || 'U').slice(0, 1).toUpperCase() }}</span>
          </span>
          <div class="identity__fields">
            <label class="field">
              <span class="field__label">昵称（留空 = 用账号名）</span>
              <input v-model="nickname" class="input" maxlength="64" :placeholder="userName || ''" />
            </label>
            <div class="field">
              <span class="field__label">头像</span>
              <div class="avatar-actions">
                <button class="btn btn--sm" type="button" :disabled="uploading" @click="fileInput?.click()">
                  {{ uploading ? '上传中…' : '上传图片' }}
                </button>
                <button v-if="avatar" class="btn btn--ghost btn--sm" type="button" @click="clearAvatar">移除</button>
                <span class="avatar-hint">JPG / PNG / WebP，≤ 2MB</span>
              </div>
              <input
                ref="fileInput"
                class="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                @change="onPickAvatar"
              />
              <p v-if="avatarError" class="status--error avatar-hint">{{ avatarError }}</p>
            </div>
          </div>
        </div>
        <p class="status" aria-live="polite">
          <template v-if="profileState === 'saving'">保存中…</template>
          <template v-else-if="profileState === 'saved'">已保存</template>
          <template v-else-if="profileState === 'error'">
            <span class="status--error">保存失败：{{ profileError }}</span>
          </template>
        </p>
      </div>
    </section>

    <!-- 外观与主题：三档（背景 / 颜色 / 版式）收进了独立页面，这里只留入口。
         为什么不留在本页：三档各有自己的长列表（壁纸 / 主题色 / 配色 / 版式），
         平铺在这里会把"个人资料"整页顶得非常长；而它们其实是同一件事的三个维度。 -->
    <!--
      入口本身做成一行（图标 + 标题 + 说明 + 箭头），整行可点。

      原来是一张空面板：标题独占一条带分隔线的头，正文里一句说明 + 一个 28px 的小按钮，
      右侧 2/3 全空 —— 一个跳转入口长得像"还没写完的表单"。一行式既省纵向空间，
      也让"能点"这件事由整行 + 箭头 + hover 明说，不必再靠按钮文案。
    -->
    <router-link class="panel look-card" to="/settings/theme">
      <span class="look-card__ico"><Layers :size="17" /></span>
      <span class="look-card__text">
        <b>外观与主题</b>
        <small>背景、颜色、版式三档，选完即记住，刷新与换页都不会丢</small>
      </span>
      <ChevronRight :size="16" class="look-card__chev" />
    </router-link>

    <!-- 登录设备：本人自助踢下线（管理员踢别人在用户管理 → 详情 → 设备） -->
    <section class="panel">
      <header class="panel__head">
        <span class="panel__title">登录设备</span>
        <span class="panel__sub">
          在线 {{ activeDevices.length }} 台 · 共 {{ devices.length }} 条记录（含已下线）
        </span>
        <button
          class="btn btn--ghost btn--sm panel__action"
          type="button"
          :disabled="kickingAll || devicesLoading"
          @click="kickOthers"
        >
          <LogOut :size="14" /> {{ kickingAll ? '处理中…' : '退出其他所有设备' }}
        </button>
      </header>

      <div class="panel__body">
        <p class="hint">
          同一设备在同一应用里只算一台。设备码用于识别设备（已打码）；「当前设备」就是你正在用的这一台，
          对它下线等于立即退出登录。
        </p>

        <div v-if="devicesLoading && devices.length === 0" class="empty">设备列表加载中…</div>
        <p v-else-if="devicesError" class="tag tag--off">{{ devicesError }}</p>
        <p v-else-if="!devices.length" class="hint">还没有任何设备会话记录。</p>
        <p v-else-if="!visibleDevices.length" class="hint">
          当前没有在线设备。下面是 {{ revokedDevices.length }} 条已下线记录，可展开查看或清理。
        </p>

        <ul v-if="visibleDevices.length" class="dev-list">
          <li v-for="row in visibleDevices" :key="row.id" class="dev" :class="{ 'is-current': row.isCurrent }">
            <MonitorSmartphone :size="18" class="dev__icon" />
            <div class="dev__body">
              <div class="dev__head">
                <span class="dev__kind">{{ deviceKind(row) }}</span>
                <span class="mono dev__code">{{ row.deviceId || '（无设备码）' }}</span>
                <!-- 当前设备必然活跃，不再叠一个「活跃」绿标签（两个同色标签并排只是噪音） -->
                <span v-if="row.isCurrent" class="tag tag--ok">当前设备</span>
                <!-- 三态：已下线 / 已过期（记录还在、会话已到 TTL）/ 活跃 -->
                <span v-else :class="['tag', isRevoked(row) ? 'tag--off' : row.stale ? 'tag--info' : 'tag--ok']">
                  {{ isRevoked(row) ? '已下线' : row.stale ? '已过期' : '活跃' }}
                </span>
              </div>
              <div class="dev__meta">
                <span class="mono">{{ row.ip || '—' }}</span>
                <span class="mono">{{ row.appId }}</span>
                <span class="dev__ua" :title="row.userAgent || ''">{{ uaSummary(row.userAgent) }}</span>
                <span class="mono">最后活跃 {{ when(row.lastActive) }}</span>
              </div>
            </div>
            <!-- 已失效的行没有会话可踢，留按钮只会点出一个 kicked=0 -->
            <button
              v-if="!isRevoked(row)"
              class="btn btn--ghost btn--sm"
              type="button"
              :disabled="kicking !== null"
              :title="row.isCurrent ? '当前设备：下线会立即退出登录' : `让设备 ${row.deviceId} 下线`"
              @click="kickDevice(row)"
            >
              <PowerOff :size="13" /> {{ kicking === row.id ? '处理中…' : row.isCurrent ? '退出本机' : '下线' }}
            </button>
          </li>
        </ul>

        <!--
          已下线是历史记录：默认收起来 —— 几十条灰行会把真正在线的设备埋掉，
          截图里 33 条记录里只有几条是有用的。需要留档时可展开，确认无用就清理。
        -->
        <div v-if="revokedDevices.length" class="dev-tools">
          <button class="btn btn--ghost btn--sm" type="button" @click="showRevoked = !showRevoked">
            {{ showRevoked ? '只看在线设备' : `显示已下线记录（${revokedDevices.length}）` }}
          </button>
          <button
            class="btn btn--ghost btn--sm dev-tools__prune"
            type="button"
            :disabled="pruning"
            title="只删除历史记录，不会退出任何正在登录的设备"
            @click="pruneRevoked"
          >
            <Trash2 :size="13" /> {{ pruning ? '清理中…' : '清理已下线记录' }}
          </button>
        </div>

        <p v-if="deviceNotice" class="dev__notice">{{ deviceNotice }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.profile {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.profile__heading {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--mauth-text-faint);
}

/*
 * 外观与主题入口
 *
 * 复用 `.panel`（底色 / 描边 / 圆角 / 阴影与上下两张卡同源），只加"一行 + 可点"的部分：
 * 整行是 `<a>`，所以 hover 整个卡片都在回应，而不是只有右边一个小按钮。
 */
.look-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  color: inherit;
  text-decoration: none;
  transition:
    border-color 0.16s var(--ease),
    box-shadow 0.16s var(--ease);
}

.look-card:hover {
  border-color: var(--mauth-border-strong);
  box-shadow: var(--e2);
}

/* 键盘聚焦：`.panel` 有 overflow: hidden，光靠浏览器默认 outline 会被裁掉一圈 */
.look-card:focus-visible {
  outline: 2px solid var(--mauth-focus);
  outline-offset: -2px;
}

/* 图标底片：与设置页里各档的图标同一处理（主色淡化底 + 主色线条） */
.look-card__ico {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
}

.look-card__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.look-card__text b {
  font-size: 14px;
  font-weight: 620;
  letter-spacing: -0.01em;
}

.look-card__text small {
  color: var(--mauth-text-soft);
  font-size: 12px;
  line-height: 1.5;
}

/* 箭头：hover 时右移 2px，指向"点进去" */
.look-card__chev {
  flex: none;
  color: var(--mauth-text-faint);
  transition:
    color 0.16s var(--ease),
    transform 0.16s var(--ease);
}

.look-card:hover .look-card__chev {
  color: var(--mauth-text-soft);
  transform: translateX(2px);
}

/* 面板头右侧的操作键：标题/副标题在左，动作靠右 */
.panel__action {
  margin-left: auto;
}

/* 设备列表：一台设备一行，右侧是操作 —— 与用户详情抽屉的设备页同一视觉语言 */
.dev-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dev {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
}

/* 当前设备：主色描边 + 极浅底。不用左侧竖线（与详情摘要同一取舍：装饰条是噪音） */
.dev.is-current {
  border-color: color-mix(in srgb, var(--mauth-primary) 45%, var(--mauth-border));
  background: color-mix(in srgb, var(--mauth-primary) 3%, transparent);
}

.dev__icon {
  flex: none;
  color: var(--mauth-text-faint);
}

.dev__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dev__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.dev__kind {
  font-size: 12px;
  font-weight: 650;
  color: var(--mauth-text);
}

.dev__code {
  font-size: 12px;
  color: var(--mauth-text);
  overflow: hidden;
  text-overflow: ellipsis;
}

.dev__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.dev__ua {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 操作结果用主色一次性提示，不用红色 —— 踢下线是正常运维动作 */
.dev__notice {
  margin: 10px 0 0;
  padding: 8px 10px;
  border-radius: var(--mauth-radius-xs);
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
  font-size: 12px;
}

/* 已下线记录的操作行：与在线列表用虚线隔开，表达"这下面是历史" */
.dev-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--mauth-border);
}

/* 清理是不可逆的，靠右并只在悬停时泛红 —— 常红会让人对红色麻木 */
.dev-tools__prune {
  margin-left: auto;
  color: var(--mauth-text-soft);
}

.dev-tools__prune:hover:not(:disabled) {
  color: var(--mauth-danger);
  border-color: color-mix(in srgb, var(--mauth-danger) 34%, transparent);
  background: var(--mauth-danger-soft);
}

/* 窄屏：面板头允许换行，"退出其他所有设备" 落回标题下方，不把标题挤成两段 */
@media (max-width: 640px) {
  .panel__head {
    flex-wrap: wrap;
  }

  .panel__action {
    margin-left: 0;
  }
}

/* 个人资料：头像预览 + 两个字段 */
.identity {
  display: flex;
  align-items: center;
  gap: 16px;
}

.identity__avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
  font-size: 20px;
  font-weight: 650;
}

.identity__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.identity__fields {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
}

.avatar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.avatar-hint {
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

/* 隐藏的文件选择框：仍可被 click() 触发，但不占位（display:none 在部分浏览器会拒绝打开选择器） */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
</style>

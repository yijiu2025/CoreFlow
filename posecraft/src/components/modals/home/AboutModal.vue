<!--
 * 关于弹窗
 *
 * 展示应用品牌信息、联系方式、技术栈信息。
 * 桌面端左右分栏布局，移动端上下排列。
 *
 * @author Claude
 * @since 2026-07-19
 -->
<template>
  <div class="modal-overlay animate-fade-in" @click.self="$emit('close')">
    <div class="about-modal-card" :class="{ 'dark-mode': isDark }">
      <!-- 头部 -->
      <div class="modal-header">
        <div class="header-title-group">
          <Info :size="18" />
          <h3>关于</h3>
        </div>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>

      <!-- 内容 -->
      <div class="modal-body">
        <!-- 左：品牌区 -->
        <div class="brand-panel">
          <div class="brand-sticky">
            <div class="app-logo">
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="2" y="4" width="20" height="16" rx="3" />
                <circle cx="12" cy="12" r="2.5" fill="white" />
                <circle cx="12" cy="9" r="1.5" stroke-width="1.2" />
                <line x1="12" y1="10.5" x2="12" y2="14" stroke-width="1.2" />
                <line x1="12" y1="12" x2="9.5" y2="10" stroke-width="1" />
                <line x1="12" y1="12" x2="14.5" y2="10" stroke-width="1" />
                <line x1="12" y1="14" x2="10" y2="16.5" stroke-width="1" />
                <line x1="12" y1="14" x2="14" y2="16.5" stroke-width="1" />
              </svg>
            </div>
            <div class="app-name">PoseCraft</div>
            <div class="app-desc">AI 智能姿势分析与图片编辑平台</div>
            <div class="version-badge">v1.0.0</div>
            <div class="brand-divider"></div>
            <div class="tech-list">
              <div class="tech-row">
                <span class="tech-key">运行环境</span>
                <span class="tech-val">{{ runtimeEnv }}</span>
              </div>
              <div class="tech-row">
                <span class="tech-key">前端框架</span>
                <span class="tech-val">Vue 3 + TypeScript</span>
              </div>
              <div class="tech-row">
                <span class="tech-key">构建工具</span>
                <span class="tech-val">Vite {{ buildTime }}</span>
              </div>
              <div class="tech-row">
                <span class="tech-key">图标库</span>
                <span class="tech-val">Lucide</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 右：联系方式 -->
        <div class="contact-panel">
          <div class="section-title">联系方式</div>

          <div class="contact-card">
            <div class="contact-icon"><Mail :size="18" /></div>
            <div class="contact-body">
              <span class="contact-label">邮箱</span>
              <a :href="'mailto:' + contactEmail" class="contact-link">{{ contactEmail }}</a>
            </div>
          </div>

          <div class="contact-card">
            <div class="contact-icon"><MessageCircle :size="18" /></div>
            <div class="contact-body">
              <span class="contact-label">公众号</span>
              <span class="contact-text">{{ officialAccount }}</span>
            </div>
          </div>

          <div class="contact-card">
            <div class="contact-icon"><Users :size="18" /></div>
            <div class="contact-body">
              <span class="contact-label">QQ群</span>
              <span class="contact-text">{{ qqGroup }}</span>
            </div>
          </div>

          <div class="qrcode-box">
            <img :src="qrCodeSrc" alt="公众号二维码" class="qrcode-img" @error="onQrError" />
            <span class="qrcode-hint">微信扫码关注「{{ officialAccount }}」</span>
          </div>

          <div class="copyright">&copy; {{ year }} PoseCraft</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useThemeStore } from '@/stores/theme';
import { Info, Mail, MessageCircle, Users } from 'lucide-vue-next';

const themeStore = useThemeStore();
const isDark = computed(() => themeStore.isDark);

defineEmits(['close']);

const contactEmail = 'qirlyh@163.com';
const officialAccount = '柒染靓月';
const qqGroup = '770605918';
const qrCodeSrc = '/posecraft/src/assets/imgs/qrcode.jpg';
const runtimeEnv = import.meta.env.MODE === 'production' ? '生产环境' : '开发环境';
const buildTime = import.meta.env.VITE_BUILD_TIME || '5.x';
const year = new Date().getFullYear();

const onQrError = (e: Event) => {
  const img = e.target as HTMLElement;
  img.style.display = 'none';
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.about-modal-card {
  width: 100%;
  max-width: 640px;
  background: #ffffff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 25px 60px -16px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(0, 0, 0, 0.05);
  animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.dark-mode.about-modal-card {
  background: #18181b;
  border-color: #27272a;
  box-shadow: 0 25px 60px -16px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid #f1f5f9;
}

.dark-mode .modal-header {
  border-color: #27272a;
}

.header-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #6366f1;
}

.header-title-group h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: inherit;
}

.close-btn {
  font-size: 24px;
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
  transition: color 0.15s;
}

.close-btn:hover {
  color: #ff2442;
}

/* 内容：左右分栏 */
.modal-body {
  display: flex;
  min-height: 340px;
}

@media (max-width: 600px) {
  .modal-body {
    flex-direction: column;
  }
  .about-modal-card {
    max-width: 420px;
  }
}

/* 左侧品牌区 */
.brand-panel {
  width: 220px;
  flex-shrink: 0;
  padding: 32px 20px;
  background: linear-gradient(180deg, #f8faff, #f5f3ff);
  display: flex;
  align-items: center;
  justify-content: center;
}

.dark-mode .brand-panel {
  background: linear-gradient(180deg, #1e1e2a, #1a1a24);
}

.brand-sticky {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.app-logo {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: linear-gradient(135deg, #6366f1, #ec4899);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 30px rgba(99, 102, 241, 0.3);
}

.app-name {
  font-size: 22px;
  font-weight: 850;
  letter-spacing: -0.5px;
  background: linear-gradient(135deg, #6366f1, #ec4899);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-top: 4px;
}

.app-desc {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 500;
  line-height: 1.5;
}

.dark-mode .app-desc {
  color: #71717a;
}

.version-badge {
  font-size: 11px;
  font-weight: 700;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.1);
  padding: 4px 14px;
  border-radius: 99px;
}

.dark-mode .version-badge {
  background: rgba(99, 102, 241, 0.2);
}

.brand-divider {
  width: 40px;
  height: 2px;
  background: linear-gradient(to right, #6366f1, #ec4899);
  border-radius: 2px;
  margin: 6px 0;
}

.tech-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.tech-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.tech-key {
  font-size: 10.5px;
  color: #94a3b8;
  font-weight: 600;
}

.tech-val {
  font-size: 11px;
  font-weight: 600;
  color: inherit;
}

.dark-mode .tech-val {
  color: #e4e4e7;
}

/* 右侧联系方式区 */
.contact-panel {
  flex: 1;
  padding: 28px 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.dark-mode .section-title {
  color: #71717a;
}

.contact-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: #f8fafc;
  border-radius: 12px;
  border: 1px solid #f1f5f9;
  transition: border-color 0.15s;
}

.dark-mode .contact-card {
  background: #1c1c1e;
  border-color: #27272a;
}

.contact-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.contact-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.contact-label {
  font-size: 10.5px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.contact-link {
  font-size: 13.5px;
  font-weight: 600;
  color: #6366f1;
  text-decoration: none;
  word-break: break-all;
}

.contact-link:hover {
  text-decoration: underline;
}

.contact-text {
  font-size: 13.5px;
  font-weight: 600;
  color: inherit;
  word-break: break-all;
}

/* 二维码 */
.qrcode-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: #f8fafc;
  border-radius: 12px;
  border: 1px solid #f1f5f9;
  margin-top: 4px;
}

.dark-mode .qrcode-box {
  background: #1c1c1e;
  border-color: #27272a;
}

.qrcode-img {
  width: 120px;
  height: 120px;
  border-radius: 8px;
  object-fit: contain;
}

.qrcode-hint {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
}

/* 版权 */
.copyright {
  text-align: center;
  font-size: 11px;
  color: #cbd5e1;
  padding-top: 4px;
}

.dark-mode .copyright {
  color: #52525b;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>

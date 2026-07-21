<!--
  App 根组件
  
  @author <作者>
  @since 2026-07-20
-->
<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="app-container">
    <aside class="sidebar">
      <div class="logo">
        <h1>Stick</h1>
        <p>股票分析</p>
      </div>
      <nav class="menu">
        <router-link to="/dashboard" class="menu-item">
          <span class="icon">📊</span>
          <span>工作台</span>
        </router-link>
        <router-link to="/stocks" class="menu-item">
          <span class="icon">📈</span>
          <span>股票列表</span>
        </router-link>
        <router-link to="/positions" class="menu-item">
          <span class="icon">💰</span>
          <span>我的持仓</span>
        </router-link>
        <router-link to="/trades" class="menu-item">
          <span class="icon">🔄</span>
          <span>交易记录</span>
        </router-link>
        <router-link to="/analysis" class="menu-item">
          <span class="icon">🤖</span>
          <span>AI 分析</span>
        </router-link>
        <router-link to="/journal" class="menu-item">
          <span class="icon">📝</span>
          <span>交易日志</span>
        </router-link>
      </nav>
    </aside>
    <main class="main-content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 240px;
  background: #1a1a2e;
  color: white;
  padding: 20px 0;
}

.logo {
  padding: 0 20px 20px;
  border-bottom: 1px solid #333;
}

.logo h1 {
  margin: 0;
  font-size: 24px;
}

.logo p {
  margin: 5px 0 0;
  font-size: 12px;
  color: #888;
}

.menu {
  padding: 20px 0;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  color: #ccc;
  text-decoration: none;
  transition: all 0.2s;
}

.menu-item:hover {
  background: #16213e;
  color: white;
}

.menu-item.router-link-active {
  background: #0f3460;
  color: #e94560;
}

.icon {
  margin-right: 10px;
}

.main-content {
  flex: 1;
  background: #f5f5f5;
  padding: 20px;
}
</style>

<!--
  仪表盘页面
  
  @author <作者>
  @since 2026-07-20
-->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getDashboard } from '../api/dashboard'
import type { DashboardData } from '../types'

const dashboard = ref<DashboardData | null>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await getDashboard()
    dashboard.value = res.data
  } catch (error) {
    console.error('获取仪表盘数据失败:', error)
  } finally {
    loading.value = false
  }
})

const formatMoney = (value: number) => {
  return value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
</script>

<template>
  <div class="dashboard">
    <h2>工作台</h2>
    
    <div v-if="loading" class="loading">加载中...</div>
    
    <div v-else-if="dashboard" class="stats-grid">
      <div class="stat-card">
        <div class="stat-title">总资产</div>
        <div class="stat-value">¥{{ formatMoney(dashboard.totalAsset) }}</div>
        <div class="stat-profit" :class="{ positive: dashboard.totalProfit >= 0 }">
          盈亏: ¥{{ formatMoney(dashboard.totalProfit) }}
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-title">今日盈亏</div>
        <div class="stat-value">¥{{ formatMoney(dashboard.todayProfit) }}</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-title">持仓数量</div>
        <div class="stat-value">{{ dashboard.positionCount }} 只</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-title">本月交易</div>
        <div class="stat-value">{{ dashboard.monthTradeCount }} 次</div>
      </div>
    </div>
    
    <div v-if="dashboard && dashboard.positions.length > 0" class="positions-section">
      <h3>持仓列表</h3>
      <div class="positions-list">
        <div v-for="pos in dashboard.positions" :key="pos.id" class="position-card">
          <div class="stock-info">
            <div class="stock-name">{{ pos.stock?.name }}</div>
            <div class="stock-code">{{ pos.stock?.code }}</div>
          </div>
          <div class="position-details">
            <div>现价: ¥{{ pos.currentPrice?.toFixed(2) }}</div>
            <div>盈亏: <span :class="{ positive: pos.profit! >= 0 }">¥{{ pos.profit?.toFixed(2) }}</span></div>
            <div>收益率: <span :class="{ positive: pos.profitRate! >= 0 }">{{ pos.profitRate }}%</span></div>
          </div>
        </div>
      </div>
    </div>
    
    <div v-else class="empty-state">
      <p>暂无持仓</p>
      <router-link to="/positions" class="btn">添加持仓</router-link>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  max-width: 1200px;
  margin: 0 auto;
}

h2 {
  margin-bottom: 20px;
  color: #333;
}

.loading {
  text-align: center;
  padding: 40px;
  color: #666;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 30px;
}

.stat-card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.stat-title {
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: #333;
}

.stat-profit {
  font-size: 14px;
  color: #999;
  margin-top: 8px;
}

.stat-profit.positive {
  color: #e94560;
}

.positions-section h3 {
  margin-bottom: 15px;
  color: #333;
}

.positions-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 15px;
}

.position-card {
  background: white;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: space-between;
}

.stock-name {
  font-weight: bold;
  color: #333;
}

.stock-code {
  font-size: 12px;
  color: #999;
}

.position-details {
  text-align: right;
  font-size: 14px;
  color: #666;
}

.positive {
  color: #e94560;
}

.empty-state {
  text-align: center;
  padding: 60px;
  background: white;
  border-radius: 8px;
}

.btn {
  display: inline-block;
  padding: 10px 20px;
  background: #e94560;
  color: white;
  text-decoration: none;
  border-radius: 4px;
  margin-top: 15px;
}

.btn:hover {
  background: #d63851;
}
</style>

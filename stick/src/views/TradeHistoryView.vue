<!--
  交易记录页面
  
  @author <作者>
  @since 2026-07-20
-->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getTrades } from '../api/trade'
import type { Trade } from '../types'

const trades = ref<Trade[]>([])
const loading = ref(true)
const typeFilter = ref<number | undefined>(undefined)

const loadTrades = async () => {
  loading.value = true
  try {
    const res = await getTrades({ type: typeFilter.value })
    trades.value = res.data
  } catch (error) {
    console.error('获取交易记录失败:', error)
  } finally {
    loading.value = false
  }
}

onMounted(loadTrades)
</script>

<template>
  <div class="trade-history">
    <h2>交易记录</h2>
    
    <div class="filters">
      <button :class="{ active: !typeFilter }" @click="typeFilter = undefined; loadTrades()">全部</button>
      <button :class="{ active: typeFilter === 1 }" @click="typeFilter = 1; loadTrades()">买入</button>
      <button :class="{ active: typeFilter === 2 }" @click="typeFilter = 2; loadTrades()">卖出</button>
    </div>
    
    <div v-if="loading" class="loading">加载中...</div>
    
    <div v-else-if="trades.length === 0" class="empty-state">
      <p>暂无交易记录</p>
    </div>
    
    <div v-else class="trades-list">
      <div v-for="trade in trades" :key="trade.id" class="trade-card">
        <div class="trade-header">
          <span class="stock-name">{{ trade.stock?.name }}</span>
          <span :class="['trade-type', trade.type === 1 ? 'buy' : 'sell']">
            {{ trade.type === 1 ? '买入' : '卖出' }}
          </span>
        </div>
        <div class="trade-details">
          <div>价格: ¥{{ trade.price?.toFixed(2) }}</div>
          <div>数量: {{ trade.quantity }} 股</div>
          <div>金额: ¥{{ trade.amount?.toFixed(2) }}</div>
          <div>日期: {{ trade.tradeDate }}</div>
        </div>
        <div v-if="trade.note" class="trade-note">备注: {{ trade.note }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trade-history {
  max-width: 800px;
  margin: 0 auto;
}

h2 { margin-bottom: 20px; color: #333; }

.filters {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.filters button {
  padding: 8px 16px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
}

.filters button.active {
  background: #e94560;
  color: white;
  border-color: #e94560;
}

.trades-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.trade-card {
  background: white;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.trade-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.stock-name { font-weight: bold; }

.trade-type {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.trade-type.buy { background: #e94560; color: white; }
.trade-type.sell { background: #4CAF50; color: white; }

.trade-details {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  font-size: 14px;
  color: #666;
}

.trade-note {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #eee;
  font-size: 14px;
  color: #999;
}

.empty-state {
  text-align: center;
  padding: 40px;
  background: white;
  border-radius: 8px;
  color: #666;
}
</style>

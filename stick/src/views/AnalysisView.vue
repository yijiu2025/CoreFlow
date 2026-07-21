<!--
  AI 分析页面
  
  @author <作者>
  @since 2026-07-20
-->
<script setup lang="ts">
import { ref } from 'vue'
import { getAnalysis, triggerAnalysis } from '../api/analysis'
import type { Analysis } from '../types'

const stockCode = ref('')
const analysis = ref<Analysis | null>(null)
const loading = ref(false)
const analyzing = ref(false)

const handleSearch = async () => {
  if (!stockCode.value) return
  
  loading.value = true
  try {
    const res = await getAnalysis(stockCode.value)
    analysis.value = res.data
  } catch (error) {
    console.error('获取分析失败:', error)
    analysis.value = null
  } finally {
    loading.value = false
  }
}

const handleAnalyze = async () => {
  if (!stockCode.value) return
  
  analyzing.value = true
  try {
    const res = await triggerAnalysis(stockCode.value)
    analysis.value = res.data
  } catch (error) {
    console.error('分析失败:', error)
  } finally {
    analyzing.value = false
  }
}

const getSuggestionText = (suggestion: number) => {
  const map: Record<number, string> = {
    1: '强烈买入',
    2: '买入',
    3: '持有',
    4: '卖出',
    5: '强烈卖出'
  }
  return map[suggestion] || '未知'
}

const getSuggestionClass = (suggestion: number) => {
  if (suggestion <= 2) return 'buy'
  if (suggestion >= 4) return 'sell'
  return 'hold'
}
</script>

<template>
  <div class="analysis-view">
    <h2>AI 分析</h2>
    
    <div class="search-bar">
      <input v-model="stockCode" placeholder="输入股票代码（如 600519）" @keyup.enter="handleSearch" />
      <button @click="handleSearch" :disabled="loading">查询</button>
      <button @click="handleAnalyze" :disabled="analyzing" class="btn-primary">
        {{ analyzing ? '分析中...' : '开始分析' }}
      </button>
    </div>
    
    <div v-if="loading || analyzing" class="loading">
      {{ analyzing ? 'AI 分析中...' : '加载中...' }}
    </div>
    
    <div v-else-if="analysis" class="analysis-result">
      <div class="stock-info">
        <h3>{{ analysis.stock?.name }} ({{ analysis.stock?.code }})</h3>
        <div class="current-price">当前价格: ¥{{ analysis.currentPrice?.toFixed(2) }}</div>
      </div>
      
      <div class="indicators">
        <h4>技术指标</h4>
        <div class="indicator-grid">
          <div class="indicator-item">
            <div class="label">MA5</div>
            <div class="value">{{ analysis.ma5?.toFixed(2) }}</div>
          </div>
          <div class="indicator-item">
            <div class="label">MA10</div>
            <div class="value">{{ analysis.ma10?.toFixed(2) }}</div>
          </div>
          <div class="indicator-item">
            <div class="label">MA20</div>
            <div class="value">{{ analysis.ma20?.toFixed(2) }}</div>
          </div>
          <div class="indicator-item">
            <div class="label">MACD</div>
            <div class="value">{{ analysis.macd?.toFixed(4) }}</div>
          </div>
          <div class="indicator-item">
            <div class="label">RSI</div>
            <div class="value">{{ analysis.rsi?.toFixed(2) }}</div>
          </div>
        </div>
      </div>
      
      <div class="suggestion">
        <h4>AI 建议</h4>
        <div :class="['suggestion-badge', getSuggestionClass(analysis.suggestion)]">
          {{ getSuggestionText(analysis.suggestion) }}
        </div>
        <div class="reason">{{ analysis.reason }}</div>
        <div class="confidence">置信度: {{ (analysis.confidence * 100).toFixed(0) }}%</div>
      </div>
    </div>
    
    <div v-else class="empty-state">
      <p>请输入股票代码进行分析</p>
    </div>
  </div>
</template>

<style scoped>
.analysis-view {
  max-width: 800px;
  margin: 0 auto;
}

h2 { margin-bottom: 20px; color: #333; }

.search-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.search-bar input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.search-bar button {
  padding: 10px 20px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
}

.btn-primary {
  background: #e94560 !important;
  color: white !important;
  border-color: #e94560 !important;
}

.analysis-result {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.stock-info {
  margin-bottom: 20px;
}

.stock-info h3 { margin: 0 0 10px; }

.current-price {
  font-size: 24px;
  font-weight: bold;
  color: #e94560;
}

.indicators {
  margin-bottom: 20px;
}

.indicators h4 { margin-bottom: 15px; }

.indicator-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 15px;
}

.indicator-item {
  text-align: center;
  padding: 10px;
  background: #f5f5f5;
  border-radius: 4px;
}

.indicator-item .label {
  font-size: 12px;
  color: #666;
  margin-bottom: 5px;
}

.indicator-item .value {
  font-size: 16px;
  font-weight: bold;
}

.suggestion h4 { margin-bottom: 15px; }

.suggestion-badge {
  display: inline-block;
  padding: 8px 16px;
  border-radius: 4px;
  font-weight: bold;
  margin-bottom: 10px;
}

.suggestion-badge.buy { background: #e94560; color: white; }
.suggestion-badge.sell { background: #4CAF50; color: white; }
.suggestion-badge.hold { background: #FFC107; color: #333; }

.reason {
  margin-bottom: 10px;
  color: #666;
}

.confidence {
  font-size: 14px;
  color: #999;
}

.empty-state {
  text-align: center;
  padding: 60px;
  background: white;
  border-radius: 8px;
  color: #666;
}
</style>

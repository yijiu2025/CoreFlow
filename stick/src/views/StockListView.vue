<!--
  股票搜索与自选管理页面

  @author <作者>
  @since 2026-07-20
-->
<script setup lang="ts">
import { ref } from 'vue'
import { searchStocks, addWatch, removeWatch, getWatchlist } from '../api/stock'

const keyword = ref('')
const searchResults = ref<any[]>([])
const watchlist = ref<any[]>([])
const loading = ref(false)
const searched = ref(false)

const loadWatchlist = async () => {
  try {
    const res = await getWatchlist()
    watchlist.value = res.data || []
  } catch (error) {
    console.error('获取自选列表失败:', error)
  }
}

const handleSearch = async () => {
  if (!keyword.value.trim()) return
  loading.value = true
  searched.value = true
  try {
    const res = await searchStocks(keyword.value)
    searchResults.value = res.data || []
  } catch (error) {
    console.error('搜索股票失败:', error)
  } finally {
    loading.value = false
  }
}

const handleAddWatch = async (stock: any) => {
  try {
    await addWatch({ code: stock.code, name: stock.name, market: stock.market })
    loadWatchlist()
  } catch (error) {
    console.error('添加自选失败:', error)
  }
}

const handleRemoveWatch = async (code: string) => {
  try {
    await removeWatch(code)
    loadWatchlist()
  } catch (error) {
    console.error('删除自选失败:', error)
  }
}

// 加载时获取自选列表
import { onMounted } from 'vue'
onMounted(loadWatchlist)
</script>

<template>
  <div class="stock-list">
    <div class="header">
      <h2>股票搜索</h2>
      <div class="search-box">
        <input v-model="keyword" placeholder="输入股票代码或名称搜索..." @keyup.enter="handleSearch" />
        <button class="btn-primary" @click="handleSearch">搜索</button>
      </div>
    </div>

    <!-- 搜索结果 -->
    <div v-if="loading" class="loading">搜索中...</div>

    <div v-else-if="searched && searchResults.length === 0" class="empty-state">
      <p>未找到相关股票</p>
    </div>

    <div v-else-if="searchResults.length > 0" class="section">
      <h3>搜索结果</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>代码</th>
            <th>名称</th>
            <th>类型</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="stock in searchResults" :key="stock.code">
            <td>{{ stock.code }}</td>
            <td>{{ stock.name }}</td>
            <td>{{ stock.type || '-' }}</td>
            <td>
              <button class="btn-sm btn-primary" @click="handleAddWatch(stock)">添加自选</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 自选列表 -->
    <div class="section">
      <h3>我的自选</h3>
      <div v-if="watchlist.length === 0" class="empty-state">
        <p>暂无自选，搜索并添加股票</p>
      </div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>代码</th>
            <th>名称</th>
            <th>现价</th>
            <th>涨跌幅</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="stock in watchlist" :key="stock.code">
            <td>{{ stock.code }}</td>
            <td>{{ stock.name }}</td>
            <td>{{ stock.quote?.currentPrice || '-' }}</td>
            <td :class="stock.quote?.changePercent > 0 ? 'up' : stock.quote?.changePercent < 0 ? 'down' : ''">
              {{ stock.quote?.changePercent != null ? stock.quote.changePercent + '%' : '-' }}
            </td>
            <td>
              <button class="btn-sm btn-danger" @click="handleRemoveWatch(stock.code)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.stock-list {
  max-width: 1000px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

h2 { margin: 0; color: #333; }
h3 { margin: 0 0 12px 0; color: #555; }

.search-box {
  display: flex;
  gap: 8px;
}

.search-box input {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  width: 300px;
}

.section {
  margin-bottom: 32px;
}

.data-table {
  width: 100%;
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

th, td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

th { background: #f5f5f5; font-weight: 600; }

.up { color: #e94560; }
.down { color: #1aad19; }

.btn-primary {
  padding: 8px 16px;
  background: #e94560;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.btn-sm { padding: 4px 8px; font-size: 12px; border-radius: 4px; cursor: pointer; border: none; }

.btn-danger { background: #ff4444; color: white; }

.loading {
  text-align: center;
  padding: 40px;
  color: #666;
}

.empty-state {
  text-align: center;
  padding: 40px;
  background: white;
  border-radius: 8px;
  color: #666;
}
</style>
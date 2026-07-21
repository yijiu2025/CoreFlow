<!--
  持仓管理页面
  
  @author <作者>
  @since 2026-07-20
-->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getPositions, addPosition, deletePosition } from '../api/position'
import type { Position } from '../types'

const positions = ref<Position[]>([])
const loading = ref(true)
const showAddModal = ref(false)

const newPosition = ref({
  stockCode: '',
  price: 0,
  quantity: 0,
  tradeDate: new Date().toISOString().split('T')[0]
})

const loadPositions = async () => {
  loading.value = true
  try {
    const res = await getPositions()
    positions.value = res.data
  } catch (error) {
    console.error('获取持仓失败:', error)
  } finally {
    loading.value = false
  }
}

const handleAdd = async () => {
  try {
    await addPosition(newPosition.value)
    showAddModal.value = false
    loadPositions()
  } catch (error) {
    console.error('添加持仓失败:', error)
  }
}

const handleDelete = async (id: number) => {
  if (confirm('确定要删除这个持仓吗？')) {
    try {
      await deletePosition(id)
      loadPositions()
    } catch (error) {
      console.error('删除持仓失败:', error)
    }
  }
}

onMounted(loadPositions)
</script>

<template>
  <div class="position-view">
    <div class="header">
      <h2>我的持仓</h2>
      <button class="btn-primary" @click="showAddModal = true">添加持仓</button>
    </div>
    
    <div v-if="loading" class="loading">加载中...</div>
    
    <div v-else-if="positions.length === 0" class="empty-state">
      <p>暂无持仓</p>
    </div>
    
    <div v-else class="positions-grid">
      <div v-for="pos in positions" :key="pos.id" class="position-card">
        <div class="card-header">
          <div>
            <div class="stock-name">{{ pos.stock?.name }}</div>
            <div class="stock-code">{{ pos.stock?.code }}</div>
          </div>
          <button class="btn-delete" @click="handleDelete(pos.id)">删除</button>
        </div>
        <div class="card-body">
          <div class="info-row">
            <span>持有数量</span>
            <span>{{ pos.quantity }} 股</span>
          </div>
          <div class="info-row">
            <span>平均成本</span>
            <span>¥{{ pos.avgCost?.toFixed(2) }}</span>
          </div>
          <div class="info-row">
            <span>总成本</span>
            <span>¥{{ pos.totalCost?.toFixed(2) }}</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 添加持仓弹窗 -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
      <div class="modal">
        <h3>添加持仓</h3>
        <form @submit.prevent="handleAdd">
          <div class="form-group">
            <label>股票代码</label>
            <input v-model="newPosition.stockCode" required placeholder="如 600519" />
          </div>
          <div class="form-group">
            <label>买入价格</label>
            <input v-model.number="newPosition.price" type="number" step="0.01" required />
          </div>
          <div class="form-group">
            <label>买入数量</label>
            <input v-model.number="newPosition.quantity" type="number" required />
          </div>
          <div class="form-group">
            <label>买入日期</label>
            <input v-model="newPosition.tradeDate" type="date" required />
          </div>
          <div class="modal-actions">
            <button type="button" @click="showAddModal = false">取消</button>
            <button type="submit" class="btn-primary">确认添加</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.position-view {
  max-width: 1000px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

h2 { margin: 0; color: #333; }

.btn-primary {
  padding: 8px 16px;
  background: #e94560;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.positions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 15px;
}

.position-card {
  background: white;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 15px;
}

.stock-name { font-weight: bold; color: #333; }
.stock-code { font-size: 12px; color: #999; }

.btn-delete {
  padding: 4px 8px;
  background: #ff4444;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #eee;
}

.info-row:last-child { border-bottom: none; }

.empty-state {
  text-align: center;
  padding: 40px;
  background: white;
  border-radius: 8px;
  color: #666;
}

.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal {
  background: white;
  border-radius: 8px;
  padding: 20px;
  width: 400px;
}

.form-group { margin-bottom: 15px; }
.form-group label { display: block; margin-bottom: 5px; }
.form-group input { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
</style>

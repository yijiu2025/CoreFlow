<!--
  交易日志页面
  
  @author <作者>
  @since 2026-07-20
-->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getJournals, addJournal, deleteJournal } from '../api/journal'
import type { Journal } from '../types'

const journals = ref<Journal[]>([])
const loading = ref(true)
const showAddModal = ref(false)

const newJournal = ref({
  stockCode: '',
  title: '',
  content: '',
  lesson: '',
  mood: 2
})

const loadJournals = async () => {
  loading.value = true
  try {
    const res = await getJournals()
    journals.value = res.data
  } catch (error) {
    console.error('获取日志失败:', error)
  } finally {
    loading.value = false
  }
}

const handleAdd = async () => {
  try {
    await addJournal(newJournal.value)
    showAddModal.value = false
    newJournal.value = { stockCode: '', title: '', content: '', lesson: '', mood: 2 }
    loadJournals()
  } catch (error) {
    console.error('添加日志失败:', error)
  }
}

const handleDelete = async (id: number) => {
  if (confirm('确定要删除这条日志吗？')) {
    try {
      await deleteJournal(id)
      loadJournals()
    } catch (error) {
      console.error('删除日志失败:', error)
    }
  }
}

const getMoodText = (mood: number) => {
  const map: Record<number, string> = { 1: '乐观', 2: '中性', 3: '悲观' }
  return map[mood] || '中性'
}

const getMoodClass = (mood: number) => {
  if (mood === 1) return 'optimistic'
  if (mood === 3) return 'pessimistic'
  return 'neutral'
}

onMounted(loadJournals)
</script>

<template>
  <div class="journal-view">
    <div class="header">
      <h2>交易日志</h2>
      <button class="btn-primary" @click="showAddModal = true">添加日志</button>
    </div>
    
    <div v-if="loading" class="loading">加载中...</div>
    
    <div v-else-if="journals.length === 0" class="empty-state">
      <p>暂无日志</p>
    </div>
    
    <div v-else class="journals-list">
      <div v-for="journal in journals" :key="journal.id" class="journal-card">
        <div class="card-header">
          <div>
            <div class="title">{{ journal.title }}</div>
            <div class="stock" v-if="journal.stock">{{ journal.stock.name }}</div>
          </div>
          <div class="actions">
            <span :class="['mood-badge', getMoodClass(journal.mood)]">
              {{ getMoodText(journal.mood) }}
            </span>
            <button class="btn-delete" @click="handleDelete(journal.id)">删除</button>
          </div>
        </div>
        <div class="content" v-if="journal.content">{{ journal.content }}</div>
        <div class="lesson" v-if="journal.lesson">
          <strong>经验:</strong> {{ journal.lesson }}
        </div>
        <div class="date">{{ journal.createdAt }}</div>
      </div>
    </div>
    
    <!-- 添加日志弹窗 -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
      <div class="modal">
        <h3>添加日志</h3>
        <form @submit.prevent="handleAdd">
          <div class="form-group">
            <label>股票代码（可选）</label>
            <input v-model="newJournal.stockCode" placeholder="如 600519" />
          </div>
          <div class="form-group">
            <label>标题</label>
            <input v-model="newJournal.title" required />
          </div>
          <div class="form-group">
            <label>内容</label>
            <textarea v-model="newJournal.content" rows="3"></textarea>
          </div>
          <div class="form-group">
            <label>经验总结</label>
            <textarea v-model="newJournal.lesson" rows="2"></textarea>
          </div>
          <div class="form-group">
            <label>交易心态</label>
            <select v-model.number="newJournal.mood">
              <option :value="1">乐观</option>
              <option :value="2">中性</option>
              <option :value="3">悲观</option>
            </select>
          </div>
          <div class="modal-actions">
            <button type="button" @click="showAddModal = false">取消</button>
            <button type="submit" class="btn-primary">确认保存</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.journal-view {
  max-width: 800px;
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

.journals-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.journal-card {
  background: white;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
}

.title { font-weight: bold; color: #333; }
.stock { font-size: 12px; color: #999; }

.actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.mood-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.mood-badge.optimistic { background: #E8F5E9; color: #4CAF50; }
.mood-badge.neutral { background: #FFF3E0; color: #FF9800; }
.mood-badge.pessimistic { background: #FFEBEE; color: #F44336; }

.btn-delete {
  padding: 4px 8px;
  background: #ff4444;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.content {
  margin-bottom: 10px;
  color: #666;
}

.lesson {
  padding: 10px;
  background: #f5f5f5;
  border-radius: 4px;
  margin-bottom: 10px;
  font-size: 14px;
}

.date {
  font-size: 12px;
  color: #999;
}

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
  width: 500px;
}

.form-group { margin-bottom: 15px; }
.form-group label { display: block; margin-bottom: 5px; }
.form-group input, .form-group textarea, .form-group select {
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
</style>

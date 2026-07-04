<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const loading = ref(false)
const list = ref([])
const total = ref(0)
const query = ref({
  page: 1,
  pageSize: 20,
  status: 2, // 默认查待审核
  keyword: ''
})

const fetchList = async () => {
  loading.value = true
  try {
    const res = await axios.get('/posecraft/v1/admin/works', { params: query.value })
    if (res.data.code === 200) {
      list.value = res.data.data
      total.value = res.data.total
    } else {
      ElMessage.error(res.data.message || '获取列表失败')
    }
  } catch (err: any) {
    ElMessage.error(err.message || '获取列表失败')
  } finally {
    loading.value = false
  }
}

const handleAudit = async (id: number, status: number) => {
  const actionText = status === 1 ? '通过' : '驳回'
  try {
    await ElMessageBox.confirm(`确定要${actionText}该作品吗？`, '审核确认', {
      type: status === 1 ? 'success' : 'warning'
    })
    
    const res = await axios.put(`/posecraft/v1/admin/works/${id}/audit`, { status })
    if (res.data.code === 200) {
      ElMessage.success('审核成功')
      fetchList()
    } else {
      ElMessage.error(res.data.message || '审核失败')
    }
  } catch (e) {
    if (e !== 'cancel') {
      console.error(e)
    }
  }
}

const handleSizeChange = (val: number) => {
  query.value.pageSize = val
  fetchList()
}

const handleCurrentChange = (val: number) => {
  query.value.page = val
  fetchList()
}

onMounted(() => {
  fetchList()
})
</script>

<template>
  <div class="p-6 h-full flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <el-radio-group v-model="query.status" @change="fetchList">
        <el-radio-button :value="2">待审核</el-radio-button>
        <el-radio-button :value="1">已公开</el-radio-button>
        <el-radio-button :value="-2">已驳回</el-radio-button>
        <el-radio-button :value="0">私密</el-radio-button>
      </el-radio-group>
      
      <div class="flex gap-2">
        <el-input v-model="query.keyword" placeholder="搜索标题/描述" clearable @keyup.enter="fetchList" class="w-64">
          <template #append>
            <el-button @click="fetchList"><el-icon><Search /></el-icon></el-button>
          </template>
        </el-input>
      </div>
    </div>

    <el-table :data="list" v-loading="loading" border class="w-full flex-1" height="100%">
      <el-table-column prop="id" label="ID" width="80" align="center" />
      <el-table-column label="预览图" width="120" align="center">
        <template #default="{ row }">
          <el-image
            class="w-16 h-16 rounded cursor-pointer"
            :src="row.thumbnail_url"
            :preview-src-list="[row.thumbnail_url, row.image_url].filter(Boolean)"
            fit="cover"
            preview-teleported
          />
        </template>
      </el-table-column>
      <el-table-column prop="title" label="标题" min-width="150" show-overflow-tooltip />
      <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
      <el-table-column prop="user_id" label="作者ID" width="100" align="center" />
      <el-table-column prop="created_at" label="创建时间" width="170" align="center" />
      
      <el-table-column label="操作" width="160" fixed="right" align="center">
        <template #default="{ row }">
          <div class="flex items-center justify-center gap-2" v-if="row.status === 2">
            <el-button type="success" size="small" plain @click="handleAudit(row.id, 1)">通过</el-button>
            <el-button type="danger" size="small" plain @click="handleAudit(row.id, -2)">驳回</el-button>
          </div>
          <el-tag v-else-if="row.status === 1" type="success">已通过</el-tag>
          <el-tag v-else-if="row.status === -2" type="danger">已驳回</el-tag>
          <el-tag v-else type="info">已处理</el-tag>
        </template>
      </el-table-column>
    </el-table>

    <div class="flex justify-end pt-4">
      <el-pagination
        v-model:current-page="query.page"
        v-model:page-size="query.pageSize"
        :page-sizes="[10, 20, 50, 100]"
        background
        layout="total, sizes, prev, pager, next, jumper"
        :total="total"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      />
    </div>
  </div>
</template>

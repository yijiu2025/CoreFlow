<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Close } from '@element-plus/icons-vue'
import { channelApi } from '../api/channel'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const dialogVisible = ref(false)
const dialogTitle = ref('')
const saving = ref(false)
const form = ref<any>({})
const query = ref({ page: 1, pageSize: 20 })

// 频道类型选项
const typeOptions = [
  { value: 'content', label: '内容列表' },
  { value: 'iframe', label: '内嵌 iframe' },
  { value: 'route', label: 'SPA 路由' },
  { value: 'external', label: '外部跳转' }
]

// 预设图标选项（emoji — 前端直接渲染）
const iconOptions = [
  { value: '🔥', label: '🔥 热门' },
  { value: '👤', label: '👤 人物' },
  { value: '💡', label: '💡 创意' },
  { value: '📷', label: '📷 摄影' },
  { value: '🏆', label: '🏆 运动' },
  { value: '📐', label: '📐 构图' },
  { value: '🔧', label: '🔧 技巧' },
  { value: '✨', label: '✨ 精选' },
  { value: '🎨', label: '🎨 艺术' },
  { value: '🌟', label: '🌟 推荐' },
  { value: '💎', label: '💎 精品' },
  { value: '🎯', label: '🎯 目标' },
  { value: '🏠', label: '🏠 生活' },
  { value: '🐱', label: '🐱 宠物' },
  { value: '🌸', label: '🌸 花卉' },
  { value: '🍳', label: '🍳 美食' },
  { value: '✈️', label: '✈️ 旅行' },
  { value: '🎵', label: '🎵 音乐' },
  { value: '📚', label: '📚 学习' },
  { value: '❤️', label: '❤️ 喜欢' }
]

const fetchList = async () => {
  loading.value = true
  try {
    const res = await channelApi.list(query.value)
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

const resetForm = () => {
  form.value = {
    value: '',
    label: '',
    icon: '',
    type: 'content',
    url: '',
    route: '',
    category: '',
    has_banner: false,
    sort_order: 0,
    enabled: true,
    start_at: null,
    end_at: null
  }
}

const handleCreate = () => {
  resetForm()
  dialogTitle.value = '新建频道'
  dialogVisible.value = true
}

const handleEdit = (row: any) => {
  form.value = {
    ...row,
    start_at: row.start_at ? new Date(row.start_at) : null,
    end_at: row.end_at ? new Date(row.end_at) : null
  }
  dialogTitle.value = '编辑频道'
  dialogVisible.value = true
}

const handleSave = async () => {
  if (!form.value.value || !form.value.label) {
    ElMessage.warning('标识和名称不能为空')
    return
  }
  saving.value = true
  try {
    const data = { ...form.value }
    if (data.start_at) data.start_at = new Date(data.start_at).toISOString()
    if (data.end_at) data.end_at = new Date(data.end_at).toISOString()

    if (data.id) {
      await channelApi.update(data.id, data)
      ElMessage.success('更新成功')
    } else {
      await channelApi.create(data)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    fetchList()
  } catch (err: any) {
    ElMessage.error(err.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const handleDelete = async (id: number) => {
  try {
    await ElMessageBox.confirm('确定要删除该频道吗？', '删除确认', { type: 'warning' })
    await channelApi.remove(id)
    ElMessage.success('删除成功')
    fetchList()
  } catch (e) {
    if (e !== 'cancel') console.error(e)
  }
}

const handleToggleEnabled = async (row: any) => {
  try {
    await channelApi.update(row.id, { enabled: row.enabled })
    ElMessage.success('已更新')
  } catch (err: any) {
    ElMessage.error(err.message || '更新失败')
    row.enabled = !row.enabled
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

const fmtTime = (v: string | null) => v ? new Date(v).toLocaleString() : '—'

const typeLabel = (v: string) => typeOptions.find(o => o.value === v)?.label || v

onMounted(() => { fetchList() })
</script>

<template>
  <div class="p-6 h-full flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-gray-800">频道管理</h2>
      <el-button type="primary" @click="handleCreate">+ 新建频道</el-button>
    </div>

    <el-table :data="list" v-loading="loading" border class="w-full flex-1" height="100%">
      <el-table-column prop="id" label="ID" width="70" align="center" />
      <el-table-column prop="value" label="标识" width="120" show-overflow-tooltip />
      <el-table-column prop="label" label="名称" width="100" />
      <el-table-column label="图标" width="70" align="center">
        <template #default="{ row }">
          <span style="font-size: 20px; line-height: 1;">{{ row.icon || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="100" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="row.type === 'content' ? 'success' : row.type === 'iframe' ? 'warning' : row.type === 'route' ? 'primary' : 'info'">
            {{ typeLabel(row.type) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="category" label="分类" width="80" align="center" show-overflow-tooltip />
      <el-table-column label="Banner" width="70" align="center">
        <template #default="{ row }">
          <el-icon v-if="row.has_banner" class="text-green-500"><Check /></el-icon>
          <el-icon v-else class="text-gray-300"><Close /></el-icon>
        </template>
      </el-table-column>
      <el-table-column label="启用" width="70" align="center">
        <template #default="{ row }">
          <el-switch v-model="row.enabled" @change="handleToggleEnabled(row)" />
        </template>
      </el-table-column>
      <el-table-column prop="sort_order" label="排序" width="70" align="center" />
      <el-table-column label="路由/URL" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">{{ row.route || row.url || '—' }}</template>
      </el-table-column>
      <el-table-column label="开始时间" width="150" align="center">
        <template #default="{ row }">{{ fmtTime(row.start_at) }}</template>
      </el-table-column>
      <el-table-column label="结束时间" width="150" align="center">
        <template #default="{ row }">{{ fmtTime(row.end_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right" align="center">
        <template #default="{ row }">
          <el-button type="primary" link size="small" @click="handleEdit(row)">编辑</el-button>
          <el-button type="danger" link size="small" @click="handleDelete(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="flex justify-end pt-2">
      <el-pagination
        v-model:current-page="query.page"
        v-model:page-size="query.pageSize"
        :page-sizes="[10, 20, 50]"
        background
        layout="total, sizes, prev, pager, next, jumper"
        :total="total"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      />
    </div>

    <!-- 新建/编辑 Dialog -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="600px" destroy-on-close>
      <el-form :model="form" label-width="100px">
        <el-form-item label="标识" required>
          <el-input v-model="form.value" placeholder="如 recommend, pose（唯一）" />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="form.label" placeholder="如 推荐、姿势" />
        </el-form-item>
        <el-form-item label="图标">
          <el-select v-model="form.icon" placeholder="选择图标" clearable filterable style="width: 100%">
            <el-option
              v-for="opt in iconOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            >
              <span style="font-size: 16px; margin-right: 8px;">{{ opt.value }}</span>
              <span class="text-gray-500">{{ opt.label }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="类型" required>
          <el-select v-model="form.type" style="width: 100%">
            <el-option v-for="opt in typeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标路由">
          <el-input v-model="form.route" placeholder="SPA 路由，如 /explore?tab=scenery（type=route 时填）" />
        </el-form-item>
        <el-form-item label="外部 URL">
          <el-input v-model="form.url" placeholder="外部链接或 iframe src（type=iframe/external 时填）" />
        </el-form-item>
        <el-form-item label="作品分类">
          <el-input v-model="form.category" placeholder="筛选作品分类，如 pose, creative（type=content 时填，留空=不筛选）" />
        </el-form-item>
        <el-form-item label="展示 Banner">
          <el-switch v-model="form.has_banner" />
        </el-form-item>
        <el-form-item label="排序权重">
          <el-input-number v-model="form.sort_order" :min="0" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item label="开始时间">
          <el-date-picker
            v-model="form.start_at"
            type="datetime"
            placeholder="不限"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="结束时间">
          <el-date-picker
            v-model="form.end_at"
            type="datetime"
            placeholder="不限"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

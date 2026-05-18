<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import request from '@/utils/request'
import dayjs from 'dayjs'

interface User {
  uid: number
  username: string
  email: string
  status: number
  avatar: string
  max_level: number
  roles: string | null
}

const users = ref<User[]>([])
const keyword = ref('')
const loading = ref(false)

// 模态框与授权状态
const isAuthModalOpen = ref(false)
const selectedUser = ref<User | null>(null)
const assignableRoles = ref<any[]>([])
const authForm = reactive({
  appId: 'GLOBAL',
  roleId: ''
})

const fetchUsers = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/v1/iam/users', {
      params: { keyword: keyword.value }
    })
    if (res.success) {
      users.value = res.data
    }
  } finally {
    loading.value = false
  }
}

// 提取当前管理员能分配的角色
const fetchAssignableRoles = async () => {
  try {
    const res: any = await request.get('/admin/v1/iam/roles', {
      params: { appId: authForm.appId }
    })
    if (res.success) {
      assignableRoles.value = res.data
    }
  } catch (error) {
    console.error(error)
  }
}

const handleSearch = () => {
  fetchUsers()
}

const openAuthModal = (user: User) => {
  selectedUser.value = user
  authForm.roleId = ''
  isAuthModalOpen.value = true
  fetchAssignableRoles()
}

// 提交角色分配
const submitAuth = async () => {
  if (!authForm.roleId) return alert('请先选择一个角色')
  
  try {
    const res: any = await request.post('/admin/v1/iam/roles/assign', {
      targetUid: selectedUser.value?.uid,
      roleId: authForm.roleId,
      appId: authForm.appId
    })
    if (res.success) {
      alert('授权成功！')
      isAuthModalOpen.value = false
      fetchUsers() // 刷新列表
    }
  } catch (error: any) {
    alert(error.message || '授权失败')
  }
}

onMounted(() => {
  fetchUsers()
})
</script>

<template>
  <div class="p-8">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold tracking-tight">用户权限管理</h1>
    </div>

    <!-- 工具栏 -->
    <div class="flex items-center space-x-4 mb-6">
      <div class="relative flex-1 max-w-sm">
        <input 
          v-model="keyword" 
          @keyup.enter="handleSearch"
          type="text" 
          placeholder="搜索用户名或邮箱..." 
          class="w-full px-4 py-2 border rounded-md bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
      </div>
      <button 
        @click="handleSearch" 
        class="px-4 py-2 bg-slate-900 dark:bg-slate-50 text-white dark:text-slate-900 rounded-md shadow hover:opacity-90 transition-opacity disabled:opacity-50"
        :disabled="loading"
      >
        {{ loading ? '搜索中...' : '搜索' }}
      </button>
    </div>

    <!-- 数据表格 -->
    <div class="border rounded-xl bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-slate-50 dark:bg-slate-950/50 text-slate-500 text-sm">
            <th class="px-6 py-4 font-medium border-b">UID</th>
            <th class="px-6 py-4 font-medium border-b">用户名</th>
            <th class="px-6 py-4 font-medium border-b">最高职级 (Level)</th>
            <th class="px-6 py-4 font-medium border-b">已绑角色</th>
            <th class="px-6 py-4 font-medium border-b">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr v-if="users.length === 0">
            <td colspan="5" class="px-6 py-12 text-center text-slate-400">暂无数据 / 无权查看</td>
          </tr>
          <tr v-for="user in users" :key="user.uid" class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <td class="px-6 py-4 text-sm">{{ user.uid }}</td>
            <td class="px-6 py-4">
              <div class="font-medium text-slate-900 dark:text-slate-50">{{ user.username }}</div>
              <div class="text-xs text-slate-500">{{ user.email }}</div>
            </td>
            <td class="px-6 py-4">
              <span class="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                :class="user.max_level >= 80 ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'">
                Level {{ user.max_level }}
              </span>
            </td>
            <td class="px-6 py-4 text-sm text-slate-500 max-w-[200px] truncate" :title="user.roles || '无角色'">
              {{ user.roles || '无角色' }}
            </td>
            <td class="px-6 py-4">
              <button 
                @click="openAuthModal(user)"
                class="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              >
                授权管理
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 授权弹窗 -->
    <div v-if="isAuthModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div class="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-xl w-full max-w-md border">
        <h2 class="text-xl font-bold mb-2">授权管理</h2>
        <p class="text-sm text-slate-500 mb-6">正在为目标用户 <span class="text-primary font-medium">{{ selectedUser?.username }}</span> 配置权限。</p>
        
        <!-- 表单区域 -->
        <div class="space-y-4 mb-8">
           <div>
              <label class="block text-sm font-medium mb-1">选择应用域 (Scope)</label>
              <select v-model="authForm.appId" @change="fetchAssignableRoles" class="w-full px-3 py-2 border rounded-md bg-transparent focus:ring-2 focus:ring-primary/50">
                <option value="GLOBAL">全局系统 (GLOBAL)</option>
                <!-- 未来可以增加接口拉取应用列表 -->
                <option value="xianyu-web">闲鱼前端应用</option>
              </select>
           </div>
           <div>
              <label class="block text-sm font-medium mb-1">分配可用角色 (受您的级别限制)</label>
              <select v-model="authForm.roleId" class="w-full px-3 py-2 border rounded-md bg-transparent focus:ring-2 focus:ring-primary/50">
                <option value="" disabled>-- 请选择角色 --</option>
                <option v-for="role in assignableRoles" :key="role.id" :value="role.id">
                  [Level {{ role.rank_level }}] {{ role.name }}
                </option>
              </select>
           </div>
        </div>

        <div class="flex justify-end space-x-3">
          <button @click="isAuthModalOpen = false" class="px-4 py-2 text-sm border rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">取消</button>
          <button @click="submitAuth" class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity">确认分配</button>
        </div>
      </div>
    </div>
  </div>
</template>

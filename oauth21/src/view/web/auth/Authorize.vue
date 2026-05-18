<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const appInfo = ref({
  name: (route.query.appName as string) || '外部应用',
  icon: '',
  description: '该应用申请访问您的基础资料及权限。'
})

const scopes = ref([
  { id: 'profile', name: '公开个人信息', desc: '包含您的用户名、头像、昵称等', required: true },
  { id: 'email', name: '电子邮箱地址', desc: '用于向您发送系统通知' },
  { id: 'groups', name: '所属组织与角色', desc: '读取您在系统中的部门及分组信息' }
])

// 确认授权
const handleApprove = async () => {
  // TODO: 调用后端 API 记录授权关系并获取 Code
  console.log('User approved the request')
  // 模拟回调
  const redirectUri = route.query.redirect_uri as string
  if (redirectUri) {
    window.location.href = `${redirectUri}?code=mock_auth_code`
  }
}

// 拒绝授权
const handleDeny = () => {
  router.back()
}

onMounted(() => {
  setTimeout(() => { loading.value = false }, 800)
})
</script>

<template>
  <div class="authorize-viewport">
    <div class="authorize-card glass-effect animate-slide-up">
      <div v-if="loading" class="flex flex-col items-center justify-center h-[400px]">
        <div class="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        <p class="mt-4 text-sm text-slate-400">正在获取授权信息...</p>
      </div>

      <div v-else class="p-10">
        <!-- 应用 Header -->
        <div class="flex flex-col items-center text-center mb-10">
          <div class="w-20 h-20 rounded-2xl bg-gradient-to-tr from-primary to-indigo-600 p-[2px] shadow-xl shadow-primary/20 mb-6">
            <div class="w-full h-full bg-white dark:bg-slate-900 rounded-[14px] flex items-center justify-center text-3xl">
              {{ appInfo.name.charAt(0).toUpperCase() }}
            </div>
          </div>
          <h2 class="text-2xl font-bold dark:text-white mb-2">{{ appInfo.name }} 申请授权</h2>
          <p class="text-slate-400 text-xs px-10">{{ appInfo.description }}</p>
        </div>

        <!-- 权限列表 -->
        <div class="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6 mb-10 border border-slate-100 dark:border-slate-800">
          <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">该应用将获得以下权限</p>
          <div class="space-y-5">
            <div v-for="scope in scopes" :key="scope.id" class="flex items-start gap-4">
              <div class="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mt-0.5 shrink-0">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="4"><path d="M20 6L9 17l-5-5"/></svg>
              </div>
              <div>
                <p class="text-sm font-bold dark:text-slate-200">{{ scope.name }}</p>
                <p class="text-[11px] text-slate-400 leading-tight mt-1">{{ scope.desc }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="flex flex-col gap-3">
          <button @click="handleApprove" class="w-full h-12 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/25 hover:scale-[1.02] active:scale-[0.98] transition-all">
            允许授权并继续
          </button>
          <button @click="handleDeny" class="w-full h-12 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-sm">
            取消
          </button>
        </div>

        <p class="mt-8 text-center text-[10px] text-slate-400">
          授权后即代表您同意该应用访问您的部分公开数据。您可以随时在安全中心撤销授权。
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.authorize-viewport {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
  font-family: 'Outfit', sans-serif;
}

.dark .authorize-viewport { background: #0f172a; }

.authorize-card {
  width: 100%;
  max-width: 440px;
  background: white;
  border-radius: 32px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.08);
}

.dark .authorize-card { background: #1e293b; border: 1px solid #334155; }

.animate-slide-up {
  animation: slide-up 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slide-up {
  from { opacity: 0; transform: translateY(30px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>

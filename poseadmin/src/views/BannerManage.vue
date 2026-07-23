<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { bannerApi } from '../api/banner';

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const dialogVisible = ref(false);
const dialogTitle = ref('');
const saving = ref(false);
const form = ref<any>({});
const query = ref({ page: 1, pageSize: 20 });

const fetchList = async () => {
  loading.value = true;
  try {
    const res = await bannerApi.list(query.value);
    if (res.data.code === 200) {
      list.value = res.data.data;
      total.value = res.data.total;
    } else {
      ElMessage.error(res.data.message || '获取列表失败');
    }
  } catch (err: any) {
    ElMessage.error(err.message || '获取列表失败');
  } finally {
    loading.value = false;
  }
};

const resetForm = () => {
  form.value = {
    title: '',
    description: '',
    badge_text: '',
    button_text: '',
    image_url: '',
    link_url: '',
    sort_order: 0,
    enabled: true,
    start_at: null,
    end_at: null
  };
};

const handleCreate = () => {
  resetForm();
  dialogTitle.value = '新建 Banner';
  dialogVisible.value = true;
};

const handleEdit = (row: any) => {
  form.value = {
    ...row,
    start_at: row.start_at ? new Date(row.start_at) : null,
    end_at: row.end_at ? new Date(row.end_at) : null
  };
  dialogTitle.value = '编辑 Banner';
  dialogVisible.value = true;
};

const handleSave = async () => {
  if (!form.value.title) {
    ElMessage.warning('标题不能为空');
    return;
  }
  saving.value = true;
  try {
    const data = { ...form.value };
    if (data.start_at) data.start_at = new Date(data.start_at).toISOString();
    if (data.end_at) data.end_at = new Date(data.end_at).toISOString();

    if (data.id) {
      await bannerApi.update(data.id, data);
      ElMessage.success('更新成功');
    } else {
      await bannerApi.create(data);
      ElMessage.success('创建成功');
    }
    dialogVisible.value = false;
    fetchList();
  } catch (err: any) {
    ElMessage.error(err.message || '保存失败');
  } finally {
    saving.value = false;
  }
};

const handleDelete = async (id: number) => {
  try {
    await ElMessageBox.confirm('确定要删除该 Banner 吗？', '删除确认', { type: 'warning' });
    await bannerApi.remove(id);
    ElMessage.success('删除成功');
    fetchList();
  } catch (e) {
    if (e !== 'cancel') console.error(e);
  }
};

const handleToggleEnabled = async (row: any) => {
  try {
    await bannerApi.update(row.id, { enabled: row.enabled });
    ElMessage.success('已更新');
  } catch (err: any) {
    ElMessage.error(err.message || '更新失败');
    row.enabled = !row.enabled; // 回滚
  }
};

const handleSizeChange = (val: number) => {
  query.value.pageSize = val;
  fetchList();
};

const handleCurrentChange = (val: number) => {
  query.value.page = val;
  fetchList();
};

const fmtTime = (v: string | null) => (v ? new Date(v).toLocaleString() : '—');

onMounted(() => {
  fetchList();
});
</script>

<template>
  <div class="p-6 h-full flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-gray-800">Banner 管理</h2>
      <el-button type="primary" @click="handleCreate">+ 新建 Banner</el-button>
    </div>

    <el-table :data="list" v-loading="loading" border class="w-full flex-1" height="100%">
      <el-table-column prop="id" label="ID" width="70" align="center" />
      <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
      <el-table-column prop="badge_text" label="Badge" width="100" show-overflow-tooltip />
      <el-table-column prop="button_text" label="按钮" width="100" show-overflow-tooltip />
      <el-table-column label="背景图" width="90" align="center">
        <template #default="{ row }">
          <el-image
            v-if="row.image_url"
            class="w-12 h-12 rounded"
            :src="row.image_url"
            :preview-src-list="[row.image_url]"
            fit="cover"
            preview-teleported
          />
          <span v-else class="text-gray-400 text-xs">无</span>
        </template>
      </el-table-column>
      <el-table-column label="启用" width="70" align="center">
        <template #default="{ row }">
          <el-switch v-model="row.enabled" @change="handleToggleEnabled(row)" />
        </template>
      </el-table-column>
      <el-table-column prop="sort_order" label="排序" width="70" align="center" />
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
        <el-form-item label="标题" required>
          <el-input v-model="form.title" placeholder="Banner 大标题" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="描述文本" />
        </el-form-item>
        <el-form-item label="Badge 文案">
          <el-input v-model="form.badge_text" placeholder="如：每日精选" />
        </el-form-item>
        <el-form-item label="按钮文案">
          <el-input v-model="form.button_text" placeholder="如：立即探索" />
        </el-form-item>
        <el-form-item label="背景图 URL">
          <el-input v-model="form.image_url" placeholder="如 /posecraft/banner.jpg" />
        </el-form-item>
        <el-form-item label="跳转 URL">
          <el-input v-model="form.link_url" placeholder="按钮点击跳转地址（可空）" />
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

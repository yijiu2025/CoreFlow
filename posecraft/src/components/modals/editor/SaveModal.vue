<template>
  <transition name="modal">
    <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
      <div class="save-modal glass-panel">
        <div class="modal-header">
          <h3><Palette :size="16" /> 发布作品</h3>
          <button class="close-btn" @click="emit('close')">×</button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label>作品标题</label>
            <input v-model="name" placeholder="给你的作品起个好听的名字..." class="modal-input" />
          </div>

          <div class="form-group">
            <label>详情描述</label>
            <textarea v-model="description" placeholder="记录下灵感或拍照贴士吧..." class="modal-textarea"></textarea>
          </div>

          <div class="form-group">
            <label>作品分类</label>
            <div style="display: flex; gap: 8px">
              <select v-model="category" class="modal-input" style="flex: 1">
                <option value="pose">姿势 (Pose)</option>
                <option value="creative">创意 (Creative)</option>
                <option value="sports">运动 (Sports)</option>
                <option value="composition">构图 (Composition)</option>
                <option value="technique">技巧 (Technique)</option>
                <option value="custom">自定义 (Custom)</option>
              </select>
              <input
                v-if="category === 'custom'"
                v-model="customCategory"
                placeholder="输入自定义分类"
                class="modal-input"
                style="flex: 1"
              />
            </div>
          </div>

          <!-- 发布地址（自动采集，不可修改）-->
          <div class="form-group">
            <label>发布地址</label>
            <div class="input-with-btn">
              <input :value="publicationAddress || '定位中...'" class="modal-input" readonly />
              <button class="loc-action-btn" :class="{ loading: isLocating }" @click="refreshPublicationLocation">
                <Loader2 v-if="isLocating" class="spin" :size="16" />
                <MapPin v-else :size="16" />
              </button>
            </div>
            <div v-if="publicationAddress" class="coords-badge">
              <MapPin :size="11" /> {{ publicationSource === 'gps' ? 'GPS定位' : 'IP定位' }} ·
              {{ pubLat && pubLng ? pubLat.toFixed(4) + ', ' + pubLng.toFixed(4) : '' }}
            </div>
          </div>

          <!-- 作品地址（EXIF GPS 或 手动选择）-->
          <div class="form-group">
            <label>作品地址</label>
            <div class="input-with-btn">
              <input v-model="locationName" placeholder="命名这个拍摄位..." class="modal-input" />
              <button class="loc-action-btn" :class="{ loading: isLocating }" @click="getCurrentLocation">
                <Loader2 v-if="isLocating" class="spin" :size="16" />
                <MapPin v-else :size="16" />
              </button>
              <button class="loc-action-btn" @click="showMapModal = true"><Map :size="16" /></button>
            </div>

            <div v-if="workAddressSource === 'exif' && locationCoords" class="coords-badge">
              <Camera :size="11" /> 来自照片 EXIF · {{ locationCoords.lat.toFixed(5) }},
              {{ locationCoords.lng.toFixed(5) }}
            </div>
            <div v-else-if="locationCoords" class="coords-badge">
              实时坐标: {{ locationCoords.lat.toFixed(5) }}, {{ locationCoords.lng.toFixed(5) }}
            </div>

            <div v-if="nearbyPlaces.length > 0" class="location-suggestions animate-fade-in">
              <div
                v-for="p in nearbyPlaces"
                :key="p.name"
                class="suggestion-item"
                :class="{ active: locationName === p.name }"
                @click="selectNearby(p)"
              >
                <span class="sug-icon"><Icon :name="getCategoryIcon(p.category)" :size="14" /></span>
                <span class="sug-name">{{ p.name }}</span>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label>分类标签 (回车添加)</label>
            <div class="modal-tags">
              <span v-for="(tag, i) in tags" :key="i" class="tag-pill">
                {{ tag }} <span class="tag-x" @click="removeTag(tag)">×</span>
              </span>
              <input v-model="newTag" @keyup.enter="addTag" placeholder="+ 标签" class="modal-tag-input" />
            </div>
          </div>

          <!-- 相机拍摄参数 (EXIF 参数卡片) -->
          <div v-if="initialExif" class="exif-card">
            <div class="exif-card-header">
              <span class="exif-icon"><Aperture :size="14" /></span>
              <span class="exif-title">背景图拍摄及元数据参数</span>
            </div>
            <div class="exif-grid">
              <div class="exif-item" v-if="initialExif.make || initialExif.model">
                <span class="exif-label">拍摄设备</span>
                <span class="exif-value">{{ initialExif.make }} {{ initialExif.model }}</span>
              </div>
              <div class="exif-item" v-if="initialExif.width && initialExif.height">
                <span class="exif-label">图片尺寸</span>
                <span class="exif-value">
                  {{ initialExif.width }} × {{ initialExif.height }}
                  <span class="res-badge" v-if="initialExif.resolutionLabel">{{ initialExif.resolutionLabel }}</span>
                </span>
              </div>
              <div class="exif-item" v-if="initialExif.bitDepth">
                <span class="exif-label">颜色深度 (位深)</span>
                <span class="exif-value">{{ initialExif.bitDepth }}</span>
              </div>
              <div class="exif-item" v-if="initialExif.fNumber">
                <span class="exif-label">光圈</span>
                <span class="exif-value">f/{{ initialExif.fNumber }}</span>
              </div>
              <div class="exif-item" v-if="initialExif.exposureTime">
                <span class="exif-label">快门时间</span>
                <span class="exif-value">{{ formatShutterSpeed(initialExif.exposureTime) }}</span>
              </div>
              <div class="exif-item" v-if="initialExif.iso">
                <span class="exif-label">感光度</span>
                <span class="exif-value">ISO {{ initialExif.iso }}</span>
              </div>
              <div class="exif-item" v-if="initialExif.focalLength">
                <span class="exif-label">相机焦距</span>
                <span class="exif-value">{{ initialExif.focalLength }}mm</span>
              </div>
              <div class="exif-item" v-if="initialExif.focalLength35mm">
                <span class="exif-label">等效焦距</span>
                <span class="exif-value">{{ initialExif.focalLength35mm }}mm</span>
              </div>
              <div class="exif-item" v-if="initialExif.dateTime" style="grid-column: span 2">
                <span class="exif-label">拍摄时间</span>
                <span class="exif-value">{{ formatDate(initialExif.dateTime) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="modal-btn secondary" @click="emit('close')">取消</button>
          <button class="modal-btn primary" @click="confirmSave">确认发布</button>
        </div>
      </div>

      <!-- 地图选点子弹窗 -->
      <MapModal
        :isOpen="showMapModal"
        :initialCoords="locationCoords"
        @close="showMapModal = false"
        @confirm="onMapConfirm"
      />
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import MapModal from './MapModal.vue';
import { useLocation } from '@/composables/useLocation';
import { Palette, Loader2, MapPin, Map, Camera, Aperture } from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  initialName: string;
  initialCoords: { lat: number; lng: number } | null;
  initialExif: any;
}>();

const emit = defineEmits(['close', 'save']);

const name = ref('');
const description = ref('');
const category = ref('pose');
const customCategory = ref('');
const locationName = ref('');
const locationCoords = ref<{ lat: number; lng: number } | null>(null);
const workAddressSource = ref<'exif' | 'manual' | ''>('');
const tags = ref<string[]>([]);
const newTag = ref('');
const isLocating = ref(false);
const currentIP = ref('');
const nearbyPlaces = ref<any[]>([]);
const showMapModal = ref(false);

// 发布地址（自动采集，不可修改）
const publicationAddress = ref('');
const pubLat = ref<number | null>(null);
const pubLng = ref<number | null>(null);
const publicationSource = ref<'gps' | 'ip' | ''>('');

const { autoLocate, getIPLocation } = useLocation();

/** 刷新发布地址 */
const refreshPublicationLocation = async () => {
  isLocating.value = true;
  const result = await autoLocate();
  if (result) {
    // 前端只展示区域级别（国家/省份/城市），不暴露精确位置
    publicationAddress.value = result.region || result.address;
    pubLat.value = result.lat;
    pubLng.value = result.lng;
    publicationSource.value = result.source;
  }
  isLocating.value = false;
};

watch(
  () => props.isOpen,
  val => {
    if (val) {
      name.value = props.initialName;
      // 作品地址：有 EXIF 自动填入，否则手动选
      if (props.initialCoords) {
        locationCoords.value = props.initialCoords;
        workAddressSource.value = 'exif';
        handlePositionChange(props.initialCoords.lat, props.initialCoords.lng);
      } else {
        workAddressSource.value = 'manual';
        fetchCurrentIP();
      }
      // 发布地址：自动采集
      refreshPublicationLocation();
    }
  }
);

const getCategoryIcon = (cat: string) => {
  const map: any = {
    park: 'tree-pine',
    cafe: 'coffee',
    tourism: 'aperture',
    attraction: 'ferris-wheel',
    viewpoint: 'telescope',
    museum: 'landmark',
    hotel: 'hotel',
    current: 'map-pin'
  };
  return map[cat.toLowerCase()] || 'map-pin';
};

const addTag = () => {
  const val = newTag.value.trim().replace(/[ ,，]/g, '');
  if (val && !tags.value.includes(val)) tags.value.push(val);
  newTag.value = '';
};

const removeTag = (tag: string) => {
  tags.value = tags.value.filter(t => t !== tag);
};

const fetchCurrentIP = async () => {
  try {
    const res = await fetch('https://ipapi.co/json/');
    if (res.ok) {
      const data = await res.json();
      currentIP.value = data.ip;
      if (!locationCoords.value && data.latitude) {
        locationCoords.value = { lat: data.latitude, lng: data.longitude };
      }
    }
  } catch (err) {
    console.warn('IP fetch failed in SaveModal:', err);
  }
};

const fetchNearbyPOIs = async (lat: number, lng: number) => {
  const query = `[out:json][timeout:10];(node["tourism"~"viewpoint|attraction"](around:1000,${lat},${lng});node["leisure"~"park|garden"](around:1000,${lat},${lng});node["amenity"~"cafe|restaurant"](around:1000,${lat},${lng}););out center 15;`;
  const queryUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(queryUrl);
    const contentType = res.headers.get('content-type');
    if (!res.ok || !contentType || !contentType.includes('application/json')) {
      throw new Error('Overpass Server Busy');
    }
    const data = await res.json();
    const overpassResults = data.elements.map((e: any) => ({
      name: e.tags.name || '未命名地点',
      category: e.tags.tourism || e.tags.leisure || e.tags.amenity || '地标'
    }));
    updateSuggestions(overpassResults);
  } catch (err) {
    console.warn('Overpass 繁忙，自动切换至 Photon 备份接口');
    fetchPhotonBackup(lat, lng);
  }
};

const fetchPhotonBackup = async (lat: number, lng: number) => {
  try {
    const res = await fetch(`https://photon.komoot.io/reverse/?lat=${lat}&lon=${lng}&limit=15`);
    const data = await res.json();
    const backup = data.features
      .map((f: any) => ({
        name: f.properties.name,
        category: f.properties.type || 'poi'
      }))
      .filter((item: any) => item.name);
    updateSuggestions(backup);
  } catch (e) {
    console.error('所有地理接口均不可用');
  }
};

const updateSuggestions = (newItems: any[]) => {
  const combined = [...nearbyPlaces.value, ...newItems];
  // 按 name 去重：后入项覆盖先入项（用普通对象，兼容性最好）
  const deduped: Record<string, any> = {};
  for (const item of combined) {
    if (item?.name != null) deduped[item.name] = item;
  }
  nearbyPlaces.value = Object.values(deduped);
};

const selectNearby = (place: any) => {
  locationName.value = place.name;
  nearbyPlaces.value = [];
};

const handlePositionChange = async (lat: number, lng: number) => {
  locationCoords.value = { lat, lng };
  nearbyPlaces.value = [];
  await reverseGeocode(lat, lng);
  await fetchNearbyPOIs(lat, lng);
};

const getCurrentLocation = () => {
  if (isLocating.value) return;
  isLocating.value = true;
  navigator.geolocation.getCurrentPosition(
    async pos => {
      const { latitude, longitude } = pos.coords;
      await handlePositionChange(latitude, longitude);
      isLocating.value = false;
    },
    err => {
      console.error('定位失败:', err);
      isLocating.value = false;
    },
    { enableHighAccuracy: true, timeout: 5000 }
  );
};

const reverseGeocode = async (lat: number, lng: number) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        headers: { 'Accept-Language': 'zh-CN,zh;q=0.9' }
      }
    );
    const data = await res.json();
    const photonRes = await fetch(`https://photon.komoot.io/reverse/?lat=${lat}&lon=${lng}&limit=5`);
    let suggestions: any[] = [];
    if (data && data.display_name) {
      const shortName = data.name || data.address.road || data.address.suburb || '当前位置';
      suggestions.push({ name: shortName, category: 'current' });
    }
    if (photonRes.ok) {
      const photonData = await photonRes.json();
      photonData.features?.forEach((f: any) => {
        const name = f.properties.name;
        if (name && !suggestions.find(s => s.name === name)) {
          suggestions.push({
            name: name,
            category: f.properties.type || 'poi'
          });
        }
      });
    }
    nearbyPlaces.value = suggestions;
    if (suggestions.length > 0) {
      locationName.value = suggestions[0].name;
    }
  } catch (err) {
    console.error('地址解析失败:', err);
    nearbyPlaces.value = [];
  }
};

const onMapConfirm = (coords: { lat: number; lng: number }) => {
  handlePositionChange(coords.lat, coords.lng);
};

const formatShutterSpeed = (shutter: number) => {
  if (!shutter) return '-';
  if (shutter >= 1) return shutter.toFixed(1) + 's';
  return `1/${Math.round(1 / shutter)}s`;
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('zh-CN', { hour12: false });
  } catch (e) {
    return dateStr;
  }
};

const confirmSave = () => {
  const finalCategory = category.value === 'custom' ? customCategory.value.trim() || 'pose' : category.value;

  emit('save', {
    name: name.value,
    description: description.value,
    category: finalCategory,
    // 发布地址（只存区域级别：国家/省份/城市）
    publication_address: publicationAddress.value || null,
    publication_lat: pubLat.value,
    publication_lng: pubLng.value,
    publication_source: publicationSource.value || null,
    // 作品地址（EXIF 或手动，只存区域级别）
    locationName: locationName.value,
    coords: locationCoords.value,
    work_address: locationName.value || null,
    work_lat: locationCoords.value?.lat || null,
    work_lng: locationCoords.value?.lng || null,
    work_address_source: workAddressSource.value || null,
    ip: currentIP.value,
    tags: tags.value,
    exifInfo: props.initialExif
  });
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(5, 5, 10, 0.75);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}
.save-modal {
  width: 100%;
  max-width: 460px;
  background: rgba(20, 20, 35, 0.85);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(25px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: modalScaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes modalScaleUp {
  from {
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
.modal-header {
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #818cf8;
}
.close-btn {
  background: none;
  border: none;
  font-size: 22px;
  color: #64748b;
  cursor: pointer;
  transition: color 0.2s;
}
.close-btn:hover {
  color: #f87171;
}
.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 55vh;
  overflow-y: auto;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.form-group label {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.modal-input,
.modal-textarea {
  background: rgba(10, 10, 15, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  transition: all 0.2s;
}
.modal-input:focus,
.modal-textarea:focus {
  border-color: #6366f1;
  outline: none;
  background: rgba(10, 10, 15, 0.8);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}
.modal-textarea {
  height: 80px;
  resize: none;
}
.input-with-btn {
  display: flex;
  gap: 8px;
}
.input-with-btn .modal-input {
  flex: 1;
}
.loc-action-btn {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  width: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  color: #e2e8f0;
}
.loc-action-btn:hover {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.3);
}
.loc-action-btn.loading {
  opacity: 0.6;
  cursor: wait;
}
.location-suggestions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 120px;
  overflow-y: auto;
  background: rgba(10, 10, 15, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 4px;
}
.suggestion-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.suggestion-item:hover {
  background: rgba(255, 255, 255, 0.06);
}
.suggestion-item.active {
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
}
.sug-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.sug-name {
  font-size: 12px;
  font-weight: 500;
}
.coords-badge {
  font-size: 11px;
  color: #818cf8;
  font-family: monospace;
}
.modal-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 10px;
  background: rgba(10, 10, 15, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  min-height: 42px;
  align-items: center;
}
.tag-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.25);
  color: #818cf8;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 6px;
  font-weight: 500;
}
.tag-x {
  cursor: pointer;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  transition: color 0.15s;
}
.tag-x:hover {
  color: #f87171;
}
.modal-tag-input {
  background: none;
  border: none;
  color: #e2e8f0;
  font-size: 12px;
  outline: none;
  flex: 1;
  min-width: 60px;
  padding: 2px;
}
.modal-footer {
  padding: 16px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(10, 10, 15, 0.2);
  align-items: center;
}
.modal-btn {
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}
.modal-btn.primary {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #ffffff;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
}
.modal-btn.primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
}
.modal-btn.secondary {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.08);
  color: #94a3b8;
}
.modal-btn.secondary:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
}
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

/* ── EXIF 参数展示 ── */
.exif-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}
.exif-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #818cf8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.exif-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
}
.exif-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.exif-label {
  font-size: 9px;
  color: #64748b;
  font-weight: 500;
  text-transform: uppercase;
}
.exif-value {
  font-size: 12px;
  color: #cbd5e1;
  font-weight: 600;
  display: flex;
  align-items: center;
}
.res-badge {
  background: rgba(99, 102, 241, 0.2);
  border: 1px solid rgba(99, 102, 241, 0.4);
  color: #818cf8;
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 4px;
  margin-left: 6px;
  font-weight: 700;
  text-transform: uppercase;
}
</style>

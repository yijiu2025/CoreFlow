<template>
  <transition name="modal">
    <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
      <div class="map-modal-frame glass-panel">
        <div class="map-modal-header">
          <h3><MapPin :size="16" /> 选择拍摄地</h3>
          <button class="close-btn" @click="emit('close')">×</button>
        </div>

        <div class="map-body">
          <div id="map-container" class="map-view-canvas"></div>
        </div>

        <div class="modal-footer">
          <span v-if="selectedCoords" class="map-coords-hint">
            选中坐标: {{ selectedCoords.lat.toFixed(6) }}, {{ selectedCoords.lng.toFixed(6) }}
          </span>
          <span v-else class="map-coords-hint">在地图上点击以选取位置</span>
          <div style="display: flex; gap: 8px">
            <button class="modal-btn secondary" @click="emit('close')">取消</button>
            <button class="modal-btn primary" @click="confirmSelection">确定位置</button>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { MapPin } from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  initialCoords: { lat: number; lng: number } | null;
}>();

const emit = defineEmits(['close', 'confirm']);

const selectedCoords = ref<{ lat: number; lng: number } | null>(null);
let mapInstance: any = null;
let markerInstance: any = null;

watch(
  () => props.isOpen,
  val => {
    if (val) {
      selectedCoords.value = props.initialCoords ? { ...props.initialCoords } : null;
      nextTick(() => {
        setTimeout(initMap, 300);
      });
    } else {
      destroyMap();
    }
  }
);

const destroyMap = () => {
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
    markerInstance = null;
  }
};

const initMap = () => {
  if (mapInstance) {
    mapInstance.invalidateSize();
    return;
  }

  if (!document.getElementById('leaflet-css')) {
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }

  if (!(window as any).L) {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
      setupLeaflet();
    };
    document.head.appendChild(script);
  } else {
    setupLeaflet();
  }
};

const setupLeaflet = () => {
  const L = (window as any).L;
  const lat = selectedCoords.value?.lat || 31.2304;
  const lng = selectedCoords.value?.lng || 121.4737;

  mapInstance = L.map('map-container', { zoomControl: false }).setView([lat, lng], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapInstance);

  markerInstance = L.marker([lat, lng], { draggable: true }).addTo(mapInstance);

  // If no initial coordinates were set, record default center
  if (!selectedCoords.value) {
    selectedCoords.value = { lat, lng };
  }

  mapInstance.on('click', (e: any) => {
    const { lat, lng } = e.latlng;
    markerInstance.setLatLng(e.latlng);
    selectedCoords.value = { lat, lng };
  });

  markerInstance.on('dragend', () => {
    const { lat, lng } = markerInstance.getLatLng();
    selectedCoords.value = { lat, lng };
  });

  // Force map to render correctly
  setTimeout(() => {
    if (mapInstance) mapInstance.invalidateSize();
  }, 100);
};

const confirmSelection = () => {
  if (selectedCoords.value) {
    emit('confirm', selectedCoords.value);
  }
  emit('close');
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
  z-index: 10000;
  padding: 20px;
}
.map-modal-frame {
  width: 100%;
  max-width: 600px;
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
.map-modal-header {
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.map-modal-header h3 {
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
.map-body {
  height: 380px;
  background: #07070a;
  position: relative;
}
.map-view-canvas {
  width: 100%;
  height: 100%;
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
.map-coords-hint {
  font-size: 12px;
  color: #94a3b8;
  margin-right: auto;
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
</style>

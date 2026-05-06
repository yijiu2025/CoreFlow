<template>
  <div v-if="visible" class="fixed inset-0 h-screen flex items-center justify-center p-6"
    :class="zIndex">
    <!-- Backdrop: 毛玻璃效果 -->
    <div class="absolute inset-0 transition-opacity ease-out"
      :class="[backdropClass, backdropDuration, entered ? 'opacity-100' : 'opacity-0']"
      @click="closable && $emit('update:modelValue', false)"></div>

    <!-- Modal Window: 进入/离开动画 -->
    <transition
      :enter-active-class="transitionActive"
      :enter-from-class="transitionFrom"
      :enter-to-class="transitionTo"
      :leave-active-class="transitionActive"
      :leave-from-class="transitionTo"
      :leave-to-class="transitionFrom"
      @after-leave="visible = false">
      <div v-if="entered" class="w-full flex flex-col overflow-hidden relative z-10 border transition-colors duration-500"
        :class="[
          sizeClass,
          'rounded-[32px] shadow-[0_30px_100px_rgba(0,0,0,0.3)]',
          isDark ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'
        ]">

        <!-- Header -->
        <div class="px-8 py-4 border-b flex items-center justify-between transition-colors duration-500"
          :class="isDark ? 'border-white/5 bg-slate-900/50' : 'border-slate-100 bg-slate-50/50'">
          <div class="flex items-center gap-4">
            <div v-if="showDots" class="flex gap-1.5 mr-4">
              <div @click="$emit('update:modelValue', false)"
                class="w-3 h-3 rounded-full bg-red-400 hover:bg-red-500 cursor-pointer transition-colors shadow-inner"></div>
              <div class="w-3 h-3 rounded-full bg-amber-300 shadow-inner opacity-50"></div>
              <div class="w-3 h-3 rounded-full bg-green-400 shadow-inner opacity-50"></div>
            </div>
            <slot name="header" />
          </div>

          <div class="flex items-center gap-4">
            <slot name="header-actions" />
            <button @click="$emit('update:modelValue', false)"
              class="p-2 rounded-lg hover:bg-slate-50/10 transition-colors">
              <X class="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-hidden h-full">
          <slot />
        </div>

        <!-- Footer (optional) -->
        <div v-if="$slots.footer" class="px-8 py-4 border-t flex items-center justify-between transition-colors duration-500"
          :class="isDark ? 'bg-slate-900 border-white/5' : 'bg-slate-50 border-slate-100'">
          <slot name="footer" />
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  isDark: { type: Boolean, default: false },
  size: { type: String, default: '6xl' },
  showDots: { type: Boolean, default: true },
  closable: { type: Boolean, default: true },
  zIndex: { type: String, default: 'z-[3000]' },
  backdropClass: { type: String, default: 'bg-black/30 backdrop-blur-md' },
  transition: { type: String, default: 'scale' }
})

defineEmits(['update:modelValue'])

const entered = ref(false)
const visible = ref(false)

watch(() => props.modelValue, (val) => {
  if (val) {
    visible.value = true
    entered.value = true
  } else {
    entered.value = false
  }
}, { immediate: true })

const sizeClass = {
  'sm': 'max-w-sm h-auto',
  'md': 'max-w-2xl h-auto',
  'lg': 'max-w-4xl h-full max-h-[min(850px,90vh)]',
  'xl': 'max-w-5xl h-full max-h-[min(850px,90vh)]',
  '6xl': 'max-w-6xl h-full max-h-[min(850px,90vh)]',
  'full': 'max-w-[95vw] h-full max-h-[95vh]'
}[props.size] || 'max-w-6xl h-full max-h-[min(850px,90vh)]'

const transitions = {
  scale: {
    active: 'transition duration-500 ease-out',
    from: 'opacity-0 scale-90',
    to: 'opacity-100 scale-100'
  },
  slide: {
    active: 'transition duration-700 ease-out',
    from: 'opacity-0 translate-y-12',
    to: 'opacity-100 translate-y-0'
  },
  fade: {
    active: 'transition duration-500 ease-out',
    from: 'opacity-0',
    to: 'opacity-100'
  }
}

const t = transitions[props.transition] || transitions.scale
const transitionActive = t.active
const transitionFrom = t.from
const transitionTo = t.to

const backdropDuration = props.transition === 'slide' ? 'duration-700' : 'duration-500'
</script>

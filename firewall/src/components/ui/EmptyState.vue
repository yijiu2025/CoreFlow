<template>
  <div class="flex flex-col items-center justify-center py-10 opacity-20">
    <slot name="icon">
      <component :is="icon" class="w-8 h-8 mb-2" />
    </slot>
    <span class="text-[10px] font-bold tracking-widest">{{ message }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps({
  icon: { type: [Object, Function], default: null },
  message: { type: String, default: '' }
})
</script>

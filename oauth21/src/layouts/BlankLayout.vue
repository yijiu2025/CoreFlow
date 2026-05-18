<template>
  <div class="min-h-screen flex items-center justify-center transition-colors duration-300">
    <router-view v-slot="{ Component }">
      <transition name="fade-scale" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </div>
</template>

<style scoped>
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-scale-enter-from {
  opacity: 0;
  transform: scale(0.95) translateY(10px);
}

.fade-scale-leave-to {
  opacity: 0;
  transform: scale(1.05) translateY(-10px);
}
</style>

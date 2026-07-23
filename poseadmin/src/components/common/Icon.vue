<!--
 * 通用图标映射组件（poseadmin）
 *
 * 数据驱动的 SVG 图标渲染：通过 name 映射到 lucide-vue-next 组件。
 * 同时收录 emoji 兼容键，保证后端旧数据也能正常渲染。
 *
 * @author Claude
 * @since 2026-07-19
 -->
<template>
  <component :is="comp" v-if="comp" :size="size" :class="props.class" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  Flame,
  User,
  Lightbulb,
  Camera,
  Trophy,
  Ruler,
  Wrench,
  Sparkles,
  Gem,
  Star,
  Target,
  Home,
  Cat,
  Flower2,
  UtensilsCrossed,
  Plane,
  Music,
  BookHeart,
  Heart,
  Search,
  MapPin,
  HelpCircle,
  Settings,
  Sun,
  Moon,
  Palette,
  Award
} from 'lucide-vue-next';

const iconMap: Record<string, any> = {
  flame: Flame,
  user: User,
  lightbulb: Lightbulb,
  camera: Camera,
  trophy: Trophy,
  ruler: Ruler,
  wrench: Wrench,
  sparkles: Sparkles,
  gem: Gem,
  star: Star,
  target: Target,
  home: Home,
  cat: Cat,
  'flower-2': Flower2,
  flower2: Flower2,
  utensils: UtensilsCrossed,
  plane: Plane,
  music: Music,
  'book-heart': BookHeart,
  bookheart: BookHeart,
  heart: Heart,
  search: Search,
  'map-pin': MapPin,
  award: Award,
  palette: Palette,
  '🔥': Flame,
  '👤': User,
  '💡': Lightbulb,
  '📷': Camera,
  '🏆': Trophy,
  '📐': Ruler,
  '🔧': Wrench,
  '✨': Sparkles,
  '💎': Gem,
  '🌟': Star,
  '🎯': Target,
  '🏠': Home,
  '🐱': Cat,
  '🌸': Flower2,
  '🍳': UtensilsCrossed,
  '✈️': Plane,
  '🎵': Music,
  '📚': BookHeart,
  '❤️': Heart,
  '🎨': Palette
};

const props = defineProps<{
  name: string;
  size?: number;
  class?: string;
}>();

const comp = computed(() => iconMap[props.name]);
</script>

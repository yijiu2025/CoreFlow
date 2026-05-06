<template>
  <div>
    <label v-if="label" class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block flex items-center gap-2"
      :class="isDark ? 'text-slate-500' : 'text-slate-400'">
      <slot name="label-icon" />
      {{ label }}
    </label>
    <textarea v-if="type === 'textarea'"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
      :rows="rows"
      :placeholder="placeholder"
      class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border"
      :class="inputClass"
      v-bind="$attrs" />
    <input v-else
      :value="modelValue"
      @input="$emit('update:modelValue', type === 'number' ? Number($event.target.value) : $event.target.value)"
      :type="type"
      :step="step"
      :placeholder="placeholder"
      class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border"
      :class="inputClass"
      v-bind="$attrs" />
    <p v-if="hint" class="text-[10px] mt-1" :class="isDark ? 'text-slate-600' : 'text-slate-400'">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  label: { type: String, default: '' },
  type: { type: String, default: 'text' },
  placeholder: { type: String, default: '' },
  hint: { type: String, default: '' },
  rows: { type: Number, default: 3 },
  step: { type: String, default: undefined },
  isDark: { type: Boolean, default: false },
  variant: { type: String, default: 'default' }
})

defineEmits(['update:modelValue'])

const variantStyles = {
  default: {
    dark: 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50 placeholder-slate-600',
    light: 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10'
  },
  mono: {
    dark: 'bg-slate-950/50 border-white/5 text-cyan-100 focus:border-cyan-500/30 font-mono',
    light: 'bg-slate-50 border-slate-200 text-slate-700 focus:border-indigo-500/30 focus:bg-white font-mono'
  },
  flat: {
    dark: 'bg-transparent border-transparent text-white focus:border-indigo-500/50',
    light: 'bg-transparent border-transparent text-slate-900 focus:border-indigo-500'
  }
}

const inputClass = props.isDark
  ? variantStyles[props.variant]?.dark || variantStyles.default.dark
  : variantStyles[props.variant]?.light || variantStyles.default.light
</script>

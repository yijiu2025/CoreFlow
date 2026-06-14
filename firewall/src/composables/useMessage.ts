/**
 * 全局消息提示
 * 替代原生 alert()，支持 success/error/info 类型
 */

import { ref } from 'vue'

interface Message {
  id: number
  type: 'success' | 'error' | 'info'
  text: string
}

const messages = ref<Message[]>([])
let nextId = 0

function addMessage(type: Message['type'], text: string, duration = 3000) {
  const id = nextId++
  messages.value.push({ id, type, text })
  setTimeout(() => {
    messages.value = messages.value.filter(m => m.id !== id)
  }, duration)
}

export function useMessage() {
  return {
    messages,
    success: (text: string) => addMessage('success', text),
    error: (text: string) => addMessage('error', text, 5000),
    info: (text: string) => addMessage('info', text)
  }
}

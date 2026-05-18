import { createI18n } from 'vue-i18n'

const i18n = createI18n({
  legacy: false,
  locale: 'zh_cn',
  fallbackLocale: 'en',
  messages: {
    zh_cn: {
      message: {
        hello: '你好'
      }
    },
    en: {
      message: {
        hello: 'hello'
      }
    }
  }
})

export default i18n

/**
 * 登录页页面域声明（page: login）
 *
 * 登录页有独立配色（`themes/pearl/<设备>/login/colors/`）：它整体是深色画布 +
 * 独立品牌区，与后台壳的色彩语气不同，因此单独占一个页面域而不是复用 console。
 *
 * 同样只做声明、不契约版式（单套设计），详见 `views/console.ts` 文件头。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { defineThemePage } from 'skinsuite/vue';

defineThemePage({ page: 'login' });

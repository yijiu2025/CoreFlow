<script lang="ts">
/**
 * tablet（平板）登录版式 —— 复用 standard 版式（桌面卡片，视觉一致）
 *
 * === 为什么是 re-export ===
 * tablet 与 standard 都是「桌面双栏卡片 + 扫码面板」，视觉上同一套。版式 id ≡ 包名
 * （`data-mauth-view="default"`），所以 tablet 版式与 standard 版式**同属 default 包**，
 * 只是住在不同设备目录（`themes/default/tablet/` vs `themes/default/standard/`）——
 * 设备目录决定**主题作用域**（配色从哪找），不决定版式视觉。
 *
 * 于是 tablet 版式无需复制 ~650 行：直接 re-export standard 版式。将来若要给平板
 * 单独调尺寸/圆角，再替换成本目录自己的实现即可（目录名仍是 tablet，其余接线不变）。
 *
 * @author yijiu2025
 * @since 2026-09-27
 */
import StandardLoginView from '@/theme/themes/default/standard/login/index.vue';
export default StandardLoginView;
</script>

<template>
  <div class="min-h-screen flex items-center justify-center transition-colors duration-300">
    <!--
      ⚠️ 改动这段过渡前请先读完（注释里不要写尖括号，见下方说明）：

      本项目的路由组件**全部**是 () => import() 懒加载。因此这里**绝不能**给 transition 加
      mode="out-in"：out-in 会等「旧页面离场动画结束」才挂载新页面，而此刻新页面的异步 chunk
      通常还没解析完，动态组件只能渲染出一个注释占位节点，且该占位不会在 chunk 到位后补上新页面
      → 整页空白。用户侧看到的现象是「点了链接/按钮没反应」（历史上被误判为点击无效）。

      现在的写法是：只做“入场淡入”，离场不加过渡（新页面立刻挂载，不等任何东西）。
      新页面挂载后即使 chunk 还在路上，异步组件解析完成时也会就位并淡入。

      备选方案与实测结论（省得下次再试）：
      · 保留 out-in、外面套 Suspense 兜底 → 实测仍白屏（本机 Vue 3.5.32 + vue-router 5），
        且控制台会打印 Suspense 实验特性警告。不要再用这条路。

      ⚠️ 写本文件注释时禁止出现 HTML 注释的结束标记（描述占位节点时直接写「注释占位」即可）：
      SFC 解析器会把它当成注释结束，后面的标签会被判为未闭合，编译直接失败。

      同类问题在本仓库出现过多次（旧的登录/注册分发器），修法相同：不要用 out-in 包异步组件。
      验收方式：浏览器里真实跨路由点击（含首次未加载的 chunk），不要只看构建是否通过。
    -->
    <router-view v-slot="{ Component }">
      <transition name="fade-scale" appear>
        <component :is="Component" />
      </transition>
    </router-view>
  </div>
</template>

<style scoped>
/* 只做入场淡入：离场不做过渡，避免与懒加载组件组合出空白/布局跳动 */
.fade-scale-enter-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

.fade-scale-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

@media (prefers-reduced-motion: reduce) {
  .fade-scale-enter-active {
    transition: none;
  }
}
</style>

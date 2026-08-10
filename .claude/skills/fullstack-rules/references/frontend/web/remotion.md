# Remotion 视频生成

> **Remotion** 是一个用 React 以编程方式制作视频的框架。核心理念是 **"React Code is the source of truth"** — 代码是唯一事实来源，支持代理驱动、交互式编辑和编程式制作三种工作流。
>
> 官方文档：https://remotion.dev | GitHub：https://github.com/remotion-dev/remotion

---

## 安装

```bash
npx create-video@latest
```

---

## 项目结构

```
src/
├── Root.tsx           # 注册 Composition（registerRoot）
├── Root.tsx 中引用的各个视频组件
└── ...
```

---

## 核心 API

### registerRoot

注册项目根组件，**只能调用一次**，应放在独立文件中（避免 React Fast Refresh 重新执行）：

```tsx
import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
```

### Composition

在 `Root.tsx` 中定义视频合成，注册可渲染的组件：

```tsx
export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="MyVideo"
        component={MyVideo}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
```

**参数：**

| 属性 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 合成唯一标识 |
| `component` | `ReactNode` | 渲染的 React 组件 |
| `durationInFrames` | `number` | 总帧数 |
| `fps` | `number` | 帧率 |
| `width` | `number` | 画布宽度（像素） |
| `height` | `number` | 画布高度（像素） |

### useCurrentFrame()

获取当前帧号，从 0 开始。用于随时间改变内容：

```tsx
const MyVideo = () => {
  const frame = useCurrentFrame();
  return <div style={{ opacity: frame / 100 }}>Hello</div>;
};
```

若组件位于 `<Sequence from={n}>` 内，返回的是**相对父组件的帧号**（即 `frame - n`）。

### useVideoConfig()

获取视频属性：

```tsx
const { fps, durationInFrames, width, height } = useVideoConfig();
```

### Sequence

控制子组件在时间轴上的显示窗口：

```tsx
<Sequence from={30} durationInFrames={45}>
  <Subtitle />
</Sequence>
```

- `from`：起始帧（默认 0），子组件 `useCurrentFrame()` 从 0 重新计数
- `durationInFrames`：显示时长（默认 `Infinity`），超过后子组件卸载
- **嵌套时帧偏移累加**：`<Sequence from={30}><Sequence from={60}>...</Sequence></Sequence>` → 子组件从第 90 帧开始
- `name`：在 Studio 时间线中显示标签
- `layout`：默认为 `"absolute-fill"`（自动绝对定位），设为 `"none"` 可自定义布局

### AbsoluteFill

绝对定位填充组件，占满父容器：

```tsx
<AbsoluteFill style={{ backgroundColor: 'red' }} />
```

### spring 动画

物理弹簧动画，返回 0-1 之间的插值：

```tsx
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';

const scale = spring({
  frame: useCurrentFrame(),
  fps: useVideoConfig().fps,
  config: { damping: 12, stiffness: 100 }
});

return <div style={{ transform: `scale(${scale})` }} />;
```

### interpolate

值映射 / 插值函数：

```tsx
import { interpolate, useCurrentFrame } from 'remotion';

const opacity = interpolate(useCurrentFrame(), [0, 30], [0, 1]);
// 帧 0→30，透明度从 0→1 线性变化
```

支持 `extrapolateLeft`、`extrapolateRight` 控制边界行为。

### 媒体组件

```tsx
import { Video, Audio, Img } from 'remotion';

<Video src={require('./video.mp4')} />           // 播放视频
<Audio src={require('./audio.mp3')} />            // 播放音频
<Img src={require('./image.png')} />               // 显示图片（相对于 <img> 有优化）
```

---

## 渲染

### 命令行渲染

```bash
npx remotion render src/index.ts MyVideo out/video.mp4
```

### 参数传递

```tsx
// 定义参数接口
interface MyVideoProps {
  title: string;
}

// 传入参数
<Composition
  id="MyVideo"
  component={MyVideo}
  durationInFrames={150}
  fps={30}
  width={1920}
  height={1080}
  defaultProps={{ title: 'Hello' }}
/>

// 渲染时覆盖
npx remotion render src/index.ts MyVideo out/video.mp4 --props='{"title":"World"}'
```

### 服务端渲染

```tsx
import { renderMedia } from '@remotion/renderer';

await renderMedia({
  composition: { id: 'MyVideo', ... },
  serveUrl: '/path/to/bundle',
  codec: 'h264',
  outputLocation: 'out/video.mp4',
});
```

---

## 适用场景

| 场景 | 说明 |
|------|------|
| 数据驱动视频 | 批量生成个性化视频（报表、欢迎视频、营销素材） |
| 视频编辑器 | 构建在线视频编辑工具（拖拽 + 代码同步） |
| 自动化流水线 | CI/CD 中自动渲染视频（如每次发布生成演示视频） |
| 设计系统 | 为团队创建可复用的动画资产库 |

---

## 注意事项

1. **许可证**：Remotion 采用特殊许可证，部分商业场景需要获取公司许可证
2. **React 生态**：Remotion 基于 React，当前项目使用 Vue，需在独立项目中使用
3. **性能**：复杂动画建议使用 `spring` + `interpolate` 而非逐帧计算
4. **调试**：使用 Remotion Studio 进行交互式调试（`npx remotion studio`）
5. **批量渲染**：使用 Remotion Lambda 可在无服务器架构上并行渲染
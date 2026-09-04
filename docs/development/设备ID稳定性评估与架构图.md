# 设备 ID 稳定性评估与架构图

> 配套文档：[设备ID全链路梳理.md](./设备ID全链路梳理.md)（链路细节与已知问题清单）。
> 本文聚焦一个问题：**device_id 是否足够稳定、什么情况下会变、如何进一步收敛变动**。
> 评估基线：`12fa5a8`（共享包完整开发后）。

## 一、稳定性评估结论

**结论：设计上"一次生成、终身复用"的稳定性目标基本达成，但存在 4 个会让 ID 变动的场景，其中 2 个可工程收敛。**

### 1.1 稳定性达标的部分 ✅

| 保障 | 实现位置 | 说明 |
| --- | --- | --- |
| 持久化 | `device-id.js` localStorage（key `cf_device_id`） | 不随登出/换账号清除，跨账号复用 |
| 内存缓存 | `getStableDeviceId` 模块级 `cachedId` | 每请求读内存而非存储，杜绝读路径漂移 |
| 缓存一致性 | `invalidateCachedDeviceId` 写后失效 | 服务端下发新 ID 后下一请求即生效（12fa5a8 修复） |
| 存量自查 | `validateDeviceIdFormat` 与后端逐条对齐 | 非法/过期 ID 本地即重生，不会带着坏 ID 反复请求 |
| 服务端收敛 | `auth/index.js:258` 校验不一致时回写 `X-Device-Id` | 客户端 ID 无效只损失一轮往返，之后稳定（防死循环注释在案） |
| 随机质量 | `crypto.getRandomValues` + 拒绝采样 | 6 字符 Base62 ≈ 35.7bit 熵 + 毫秒时间戳，碰撞概率 < 10^-15 |
| 变更审计 | `session_tokens` 以 token 为锚点更新 device_id | ID 变更不新增设备行、不留 orphan |

### 1.2 ID 会变动的场景（按影响排序）

| # | 场景 | 是否可避免 | 现状 |
| --- | --- | --- | --- |
| S1 | 用户清除浏览器数据 / localStorage 被清 | 不可（存储本质） | 重生新 ID，后端按新设备处理；httpOnly `device_id` cookie 有机会兜底，但见 1.3-① |
| S2 | Safari ITP 7 天清除脚本可写存储 | 部分可 | 同 S1，且 Safari 用户**最多每 7 天换一次身份**，是移动端最大的不稳定源，见 1.3-① |
| S3 | 隐私模式 / 存储被禁 | 不可 | 会话内临时 ID，刷新即变（已知限制 P2.8，console.warn 告警） |
| S4 | 365 天有效期到期 | 设计使然 | 到期重生 = 换设备身份，旧设备行成孤儿（P2.7 清理任务覆盖中） |
| S5 | 跨浏览器 / 跨设备 / 跨 origin | 设计使然 | 每 origin 一份独立 ID（见 1.3-②），同物理设备在系统内有 N 个身份 |

### 1.3 可完善点（评估产出，未实施）

① **S1/S2：cookie 兜底被"抢先重生"架空（建议优先做，纯后端小改）**

链路上 httpOnly `device_id` cookie 由服务端 Set-Cookie 写入（`device.js:126`），
**不受 ITP 7 天清除影响**（ITP 只清脚本可写存储）。但当前时序是：

- localStorage 被清 → 前端 `getStableDeviceId()` **立即生成新 ID**（本地校验通过的有效 ID）
- 请求头 `x-device-id` 携带新 ID，**优先级高于 cookie**（`device.js:85`）
- 后端校验新 ID 合法 → 直接采纳 → cookie 被覆盖 → **旧设备身份永久丢失**

cookie 兜底机制实际永远不会生效。**建议**：`getDeviceId` 中当 header ID 的
`createdAt` 距今极近（如 < 10s，表明是刚生成的）且 cookie 中存在**合法**的
不同 ID 时，优先采纳 cookie ID 并回写 `X-Device-Id` 让前端同步回 localStorage。
一次小改可让 Safari 7 天清除、手动清缓存两种场景都保持身份连续。

② **S5：跨 origin 身份分裂（架构级，建议规划）**

localStorage 按 origin 隔离：oauth21（顶层）、posecraft（iframe 内）各自持有一份
device_id，后端把同一物理设备记为多个设备。现有 `SSO_READY` iframe 握手通道
（全链路梳理 §2.3）是现成的归一载体：**登录成功后由 oauth21 域通过 postMessage
下发权威 device_id，子应用收到后 `setDeviceId` 覆盖本地**，即可三端同 ID。
注意需同时打通"子应用收到的 ID 要过 `validateDeviceIdFormat` + 平台段与自身 UA
一致性"两道校验，防握手消息被伪造。

③ **时钟偏差的替换轮次（低成本优化）**

本机时钟超前服务器时，本地生成的 ID 对后端是"未来时间"被拒 → 服务端生成替换
ID 回写，一轮收敛后稳定（12fa5a8 后前端对存量 ID 同规则自愈）。建议后端
`validateDeviceId` 对未来时间给 ±5 分钟容差，消除微小偏差下的一次性替换往返。

④ **多标签页首访竞态（可不做）**

两标签页同时首访各自生成 ID，后写覆盖先写，storage 事件已同步，仅浪费一轮
收敛。`initDeviceSync` 监听 + 写后失效缓存已把影响降到最小，不值得加复杂度。

## 二、架构图

### 2.1 全链路架构（分层）

```mermaid
flowchart TB
    subgraph clients["前端（多端多 origin）"]
        A1["oauth21（顶层域）"]
        A2["posecraft（iframe 子域）"]
        A3["firewall"]
        A4["phonecopy（Capacitor 壳，间接接入）"]
    end

    subgraph pkg["@nodeservers/shared-device（共享包）"]
        B1["device-id<br/>生成 / 严格校验 / 内存缓存"]
        B2["storage<br/>localStorage 安全封装<br/>隐私模式内存降级"]
        B3["device-sync<br/>响应头同步 / 缓存失效 / 跨标签页"]
        B4["device-fingerprint<br/>canvas+WebGL 指纹（默认关）"]
        B5["sha256 / base62-timestamp<br/>前后端共享算法唯一事实源"]
    end

    subgraph transport["传输通道"]
        H1["请求头 x-device-id"]
        H2["响应头 X-Device-Id / X-Device-Id-Updated"]
        H3["httpOnly cookie device_id（服务端写入，兜底）"]
    end

    subgraph backend["后端（每请求）"]
        C1["auth 插件<br/>getDeviceId 校验/规范化"]
        C2["device-id-service<br/>validateDeviceId"]
        C3["computeDeviceFingerprint<br/>deviceId+uid+UA 哈希"]
        C4["detectSessionRisk<br/>基准比对 / 人机验证"]
    end

    subgraph store["存储"]
        D1["Redis session<br/>deviceFingerprint 基准"]
        D2["MySQL session_tokens<br/>device_id / device_fingerprint"]
    end

    A1 & A2 & A3 --> pkg
    B1 --> B2
    B3 --> B1
    B4 --> B5
    B1 -- "每请求注入" --> H1
    H1 --> C1 --> C2
    C1 --> C3 --> C4
    C4 <--> D1
    C3 -.写.-> D2
    C1 -- "不一致时回写" --> H2 --> B3
    backend -. Set-Cookie .-> H3
    H3 -. 请求自动携带 .-> C1
```

### 2.2 请求注入流程（每请求）

```mermaid
sequenceDiagram
    participant App as 前端应用
    participant DI as device-id
    participant ST as storage
    participant BE as 后端 auth 插件

    App->>App: 启动时 initDeviceSync()（注册 storage 监听）
    App->>DI: getStableDeviceId()（请求拦截器，每请求）
    alt 内存缓存命中
        DI-->>App: cachedId（最快路径）
    else 缓存为空
        DI->>ST: 读 cf_device_id
        alt 存量 ID 通过 validateDeviceIdFormat
            ST-->>DI: 有效 ID → 写入内存缓存
        else 非法 / 过期 / 未来时间
            DI->>ST: 删除旧值
            DI->>DI: 生成新 ID（时间戳混淆 + 6 位随机）
            DI->>ST: 写入 + 写入内存缓存
        end
    end
    App->>BE: 请求头 x-device-id: {id}（可选 X-Device-Fp）
    BE->>BE: verifyAndNormalizeDeviceId 校验
    Note over BE: 有效 → 直接采用；<br/>无效 → 服务端生成并回写（见 2.3）
```

### 2.3 响应同步与自愈收敛流程

```mermaid
flowchart TD
    A["后端 getDeviceId 取得设备 ID"] --> B{"header/cookie 的 ID<br/>通过 validateDeviceId？"}
    B -- "通过" --> C["采用客户端 ID"]
    B -- "不通过（老格式/损坏/过期/未来时间）" --> D["服务端生成新 ID<br/>generateServerSideDeviceId"]
    C --> E{"ID ≠ 客户端上报？"}
    D --> E
    E -- "一致" --> F["正常放行，不回写"]
    E -- "不一致" --> G["回写 X-Device-Id 响应头<br/>+ Set-Cookie device_id"]
    G --> H["前端 device-sync 读响应头"]
    H --> I["parseDeviceId 校验 + setDeviceId 入口校验"]
    I --> J["写 localStorage + invalidateCachedDeviceId"]
    J --> K["下一个请求立即携带新 ID，收敛完成"]
    F --> L["computeDeviceFingerprint 与基准比对"]
    K --> L
    L --> M{"指纹突变？"}
    M -- "info（IP 变等）" --> N["不拦截，响应体带风险信息"]
    M -- "warn + 高风险写操作" --> O["403 + __risk__ → 前端弹人机验证<br/>验证通过更新基准"]
    M -- "safe" --> P["放行"]
```

### 2.4 设备 ID 生命周期状态图

```mermaid
stateDiagram-v2
    [*] --> Persistent: 首访生成（本地时钟+随机后缀）
    Persistent --> Persistent: 每请求复用（内存缓存直读）
    Persistent --> SelfHeal: 存量自查失败<br/>（损坏/老格式/过期/未来时间）
    SelfHeal --> Persistent: 本地重生并写回
    Persistent --> ServerReplaced: 服务端校验拒绝<br/>（时钟偏差/格式漂移）
    ServerReplaced --> Persistent: 回写 X-Device-Id<br/>前端同步（一轮收敛）
    Persistent --> Cleared: 用户清存储 / ITP 7 天清除
    Cleared --> Persistent: 重生（⚠️ 身份变更，cookie 兜底待完善 见 1.3-①）
    Persistent --> Expired: 超 365 天有效期
    Expired --> Persistent: 重生为新设备身份
    Persistent --> SessionOnly: 隐私模式（存储不可用）
    SessionOnly --> Persistent: 会话结束丢弃
```

## 三、一句话总结

**设备 ID 的稳定性由"持久化 + 内存缓存 + 双端同规则校验 + 一轮收敛的自愈"四层
保障，正常使用下终身不变；剩余的变动源集中在存储被清（S1/S2/S3）与设计性过期
（S4），其中 cookie 兜底被抢先重生架空（1.3-①）是当前性价比最高的完善点。**

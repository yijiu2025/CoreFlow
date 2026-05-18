# MySQL 物理表分区 (Table Partitioning) 工业级落地指南

对于系统审计日志（如 `sys_session_logs`）、账单流水等随时间呈线性增长的**海量时间序列数据**，传统的 `DELETE` 清理方式是极具破坏性的（会导致大量的锁表、产生大量磁盘碎片、极慢的事务吞吐，且不会立刻释放操作系统磁盘空间）。

我们采用 **MySQL 物理表分区 (Range Partitioning by Date)** 来实现“毫秒级数据退役与销毁”。

---

## 1. 核心架构约束：联合主键的设计

在 MySQL 中，有一个铁律约束：
> **“分区表中的每一个唯一键（包括主键），都必须包含分区函数中的所有列。”**

因此，我们不能只用 `id` 作为主键，而是把 `id` 和分区时间字段 `created_at` 组合成了 **联合主键 (Composite Primary Key)**：
```javascript
id: {
  type: DataTypes.BIGINT,
  primaryKey: true,
  autoIncrement: true
},
created_at: {
  type: DataTypes.DATE,
  primaryKey: true,
  allowNull: false
}
```
*注：即使是联合主键，`id` 依然可以保持 `auto_increment` 自增特性，完全不影响原有的插入逻辑。*

---

## 2. 物理分区初始化 SQL DDL

当您首次部署或进行数据库结构设计时，推荐执行以下 DDL 进行建表和分区初始化（以 2026 年按月分区为例）：

```sql
CREATE TABLE `sys_session_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `created_at` datetime NOT NULL COMMENT '创建时间 (物理分区依据字段)',
  `user_id` bigint DEFAULT NULL COMMENT '用户内部ID',
  `event` varchar(50) NOT NULL COMMENT '事件类型: LOGIN, LOGOUT, KICK, FORBIDDEN',
  `app_id` varchar(50) DEFAULT NULL COMMENT '关联应用ID',
  `ip` varchar(50) DEFAULT NULL,
  `location` varchar(100) DEFAULT NULL,
  `user_agent` text,
  `details` json DEFAULT NULL COMMENT '详情 JSON',
  PRIMARY KEY (`id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE (TO_DAYS(created_at)) (
  -- 历史保留分区
  PARTITION p_history VALUES LESS THAN (TO_DAYS('2026-04-01')),
  -- 2026 年各月份分区
  PARTITION p_2026_04 VALUES LESS THAN (TO_DAYS('2026-05-01')),
  PARTITION p_2026_05 VALUES LESS THAN (TO_DAYS('2026-06-01')),
  PARTITION p_2026_06 VALUES LESS THAN (TO_DAYS('2026-07-01')),
  PARTITION p_2026_07 VALUES LESS THAN (TO_DAYS('2026-08-01')),
  -- 兜底分区，防止未来数据溢出
  PARTITION p_future VALUES LESS THAN MAXVALUE
);
```

---

## 3. 运维实操：毫秒级清理老旧日志

假设现在已经是 2026 年 7 月，我们需要清理 2026 年 4 月份之前（即 `2026-04-01` 之前）的所有历史日志。

### ❌ 严禁使用的旧方法
```sql
DELETE FROM sys_session_logs WHERE created_at < '2026-04-01'; -- 极度危险！高并发下锁死整张表，磁盘空间不释放
```

### ✅ 毫秒级物理销毁方法
只需执行以下 DDL：
```sql
ALTER TABLE sys_session_logs DROP PARTITION p_history;
```

#### 为什么性能如此恐怖？
*   **0% 锁表开销**：不产生任何事务行锁，秒级释放。
*   **物理文件删除**：在 Linux 底层，MySQL 会直接把对应的物理数据文件 `p_history.ibd` 彻底删除，**瞬间 100% 释放磁盘空间**。
*   **0 内存抖动**：不会将数据加载到 InnoDB Buffer Pool 内存，对高并发生产环境没有任何性能波及。

---

## 4. 自动扩容：如何增加未来的分区？

在每个月结束前，运维人员或定时任务（Cron）可以通过 `REORGANIZE PARTITION` 拆分 `p_future`，从而动态追加未来的月份分区：

```sql
ALTER TABLE sys_session_logs REORGANIZE PARTITION p_future INTO (
  PARTITION p_2026_08 VALUES LESS THAN (TO_DAYS('2026-09-01')),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);
```

通过这一套标准的分区设计，整个系统的审计大盘可以在承载数亿条日志的情况下，实现极速吞吐与优雅退役，是高并发架构不可或缺的一环！

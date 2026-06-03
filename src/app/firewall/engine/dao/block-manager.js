/**
 * 封禁与白名单管理模块
 *
 * 提供 IP 和指纹（fingerprint）双维度的封禁、白名单 CRUD 操作。
 * 采用 Redis + 内存双写策略：Redis 为主存储，内存为降级备份。
 * 同时提供全局封禁状态检查能力。
 *
 * 存储结构：
 *   - IP 封禁：   fw:block:{ip}      → JSON 元数据（带 TTL）
 *   - IP 封禁索引：fw:blocked:ips     → Hash（ip → JSON）
 *   - IP 白名单：  fw:whitelist:{ip}  → '1'（带 TTL）
 *   - IP 白名单索引：fw:whitelisted:ips → Hash（ip → JSON）
 *   - 指纹封禁：   fw:block:fp:{fp}   → JSON 元数据（带 TTL）
 *   - 指纹封禁索引：fw:blocked:fps     → Hash（fp → JSON）
 *   - 指纹白名单：  fw:whitelist:fp:{fp} → '1'（带 TTL）
 *   - 指纹白名单索引：fw:whitelisted:fps → Hash（fp → JSON）
 */
import { safeRedis } from '../../../../redis/safe-redis.js';
import {
  getConfig,
  KEY,
  HASH_BLOCKED,
  HASH_WHITELIST,
  HASH_BLOCKED_FP,
  HASH_WHITELIST_FP,
  memoryBlocks,
  memoryWhitelist,
  memoryBlocksFp,
  memoryWhitelistFp,
  getBlockStatus
} from '../../util/shared.js';

// ============== IP 封禁操作 ==============

/**
 * 设置 IP 封禁
 * 双写 Redis：SET fw:block:{ip}（带 TTL）+ HSET fw:blocked:ips
 * Redis 不可用时降级写入内存 Map
 *
 * @param {object|null} redisClient Redis 客户端，null 表示降级模式
 * @param {string} ip 要封禁的 IP 地址
 * @param {object} metadata 封禁元数据
 * @param {string} metadata.status 封禁状态标识，如 'BLOCKED'、'SCANNER'、'CHALLENGE'
 * @param {string} [metadata.source='auto'] 封禁来源：'auto'（自动检测）| 'manual'（手动）
 * @param {boolean} [metadata.permanent=false] 是否永久封禁
 * @param {number} metadata.expiresAt 封禁过期时间戳（毫秒），permanent=true 时忽略
 */
export async function setBlock(redisClient, ip, metadata) {
  const value = JSON.stringify(metadata);

  // 无 Redis 时直接写内存
  if (!redisClient) {
    memoryBlocks.set(ip, {
      status: metadata.status,
      source: metadata.source || 'auto',
      permanent: metadata.permanent || false,
      expiresAt: metadata.permanent ? Infinity : metadata.expiresAt,
    });
    return;
  }

  try {
    // 永久封禁不设 TTL，临时封禁根据 expiresAt 计算剩余秒数
    if (metadata.permanent) {
      await redisClient.set(KEY.block(ip), value);
    } else {
      const ttlSeconds = Math.max(1, Math.ceil((metadata.expiresAt - Date.now()) / 1000));
      await redisClient.set(KEY.block(ip), value, { EX: ttlSeconds });
    }
    // 同步写入 Hash 索引，用于批量查询所有封禁
    await redisClient.hset(HASH_BLOCKED, ip, value);
  } catch (err) {
    // Redis 写入失败，降级到内存
    console.error('[Firewall] setBlock Redis 失败，降级到内存:', err.message);
    memoryBlocks.set(ip, {
      status: metadata.status,
      source: metadata.source || 'auto',
      permanent: metadata.permanent || false,
      expiresAt: metadata.permanent ? Infinity : metadata.expiresAt,
    });
  }
}

/**
 * 移除 IP 封禁
 * 同时清理内存缓存和 Redis 存储（SET + Hash 两处）
 *
 * @param {object|null} redisClient Redis 客户端
 * @param {string} ip 要解封的 IP 地址
 */
export async function removeBlock(redisClient, ip) {
  memoryBlocks.delete(ip);
  if (!redisClient) return;
  try {
    await redisClient.del(KEY.block(ip));
    await redisClient.hdel(HASH_BLOCKED, ip);
  } catch (err) {
    console.error('[Firewall] removeBlock Redis 失败:', err.message);
  }
}

// ============== IP 白名单操作 ==============

/**
 * 设置 IP 白名单
 * 白名单内的 IP 跳过所有封禁检查，用于保护可信来源。
 * 双写 Redis：SET fw:whitelist:{ip}（带 TTL）+ HSET fw:whitelisted:ips
 *
 * @param {object|null} redisClient Redis 客户端
 * @param {string} ip 要加入白名单的 IP 地址
 * @param {number} durationSeconds 白名单持续时间（秒）
 */
export async function setWhitelist(redisClient, ip, durationSeconds) {
  const metadata = { expiresAt: Date.now() + durationSeconds * 1000 };
  const value = JSON.stringify(metadata);

  // 内存缓存始终更新（保证降级时可用）
  memoryWhitelist.set(ip, { expiresAt: metadata.expiresAt });

  if (!redisClient) return;
  try {
    await redisClient.set(KEY.whitelist(ip), '1', { EX: durationSeconds });
    await redisClient.hset(HASH_WHITELIST, ip, value);
  } catch (err) {
    console.error('[Firewall] setWhitelist Redis 失败:', err.message);
  }
}

/**
 * 移除 IP 白名单
 *
 * @param {object|null} redisClient Redis 客户端
 * @param {string} ip 要移除白名单的 IP 地址
 */
export async function removeWhitelist(redisClient, ip) {
  memoryWhitelist.delete(ip);
  if (!redisClient) return;
  try {
    await redisClient.del(KEY.whitelist(ip));
    await redisClient.hdel(HASH_WHITELIST, ip);
  } catch (err) {
    console.error('[Firewall] removeWhitelist Redis 失败:', err.message);
  }
}

// ============== 指纹封禁操作 ==============

/**
 * 设置指纹封禁
 * 指纹维度的封禁，用于识别并拦截特定设备/浏览器组合。
 * 同一攻击者更换 IP 后，指纹仍可追踪。
 * 双写 Redis：SET fw:block:fp:{fingerprint} + HSET fw:blocked:fps
 *
 * @param {object|null} redisClient Redis 客户端
 * @param {string} fingerprint 设备指纹（SHA256 哈希的前 16 位）
 * @param {object} metadata 封禁元数据，同 setBlock
 */
export async function setBlockFp(redisClient, fingerprint, metadata) {
  const value = JSON.stringify(metadata);
  if (!redisClient) {
    memoryBlocksFp.set(fingerprint, {
      status: metadata.status,
      source: metadata.source || 'manual',
      permanent: metadata.permanent || false,
      expiresAt: metadata.permanent ? Infinity : metadata.expiresAt,
    });
    return;
  }
  try {
    if (metadata.permanent) {
      await redisClient.set(KEY.blockFp(fingerprint), value);
    } else {
      const ttlSeconds = Math.max(1, Math.ceil((metadata.expiresAt - Date.now()) / 1000));
      await redisClient.set(KEY.blockFp(fingerprint), value, { EX: ttlSeconds });
    }
    await redisClient.hset(HASH_BLOCKED_FP, fingerprint, value);
  } catch (err) {
    console.error('[Firewall] setBlockFp Redis 失败，降级到内存:', err.message);
    memoryBlocksFp.set(fingerprint, {
      status: metadata.status,
      source: metadata.source || 'manual',
      permanent: metadata.permanent || false,
      expiresAt: metadata.permanent ? Infinity : metadata.expiresAt,
    });
  }
}

/**
 * 移除指纹封禁
 *
 * @param {object|null} redisClient Redis 客户端
 * @param {string} fingerprint 设备指纹
 */
export async function removeBlockFp(redisClient, fingerprint) {
  memoryBlocksFp.delete(fingerprint);
  if (!redisClient) return;
  try {
    await redisClient.del(KEY.blockFp(fingerprint));
    await redisClient.hdel(HASH_BLOCKED_FP, fingerprint);
  } catch (err) {
    console.error('[Firewall] removeBlockFp Redis 失败:', err.message);
  }
}

// ============== 指纹白名单操作 ==============

/**
 * 设置指纹白名单
 * 指纹白名单优先级最高，命中后直接放行，不再检查 IP 封禁。
 *
 * @param {object|null} redisClient Redis 客户端
 * @param {string} fingerprint 设备指纹
 * @param {number} durationSeconds 白名单持续时间（秒）
 */
export async function setWhitelistFp(redisClient, fingerprint, durationSeconds) {
  const metadata = { expiresAt: Date.now() + durationSeconds * 1000 };
  const value = JSON.stringify(metadata);
  memoryWhitelistFp.set(fingerprint, { expiresAt: metadata.expiresAt });
  if (!redisClient) return;
  try {
    await redisClient.set(KEY.whitelistFp(fingerprint), '1', { EX: durationSeconds });
    await redisClient.hset(HASH_WHITELIST_FP, fingerprint, value);
  } catch (err) {
    console.error('[Firewall] setWhitelistFp Redis 失败:', err.message);
  }
}

/**
 * 移除指纹白名单
 *
 * @param {object|null} redisClient Redis 客户端
 * @param {string} fingerprint 设备指纹
 */
export async function removeWhitelistFp(redisClient, fingerprint) {
  memoryWhitelistFp.delete(fingerprint);
  if (!redisClient) return;
  try {
    await redisClient.del(KEY.whitelistFp(fingerprint));
    await redisClient.hdel(HASH_WHITELIST_FP, fingerprint);
  } catch (err) {
    console.error('[Firewall] removeWhitelistFp Redis 失败:', err.message);
  }
}

// ============== 列表查询 ==============

/**
 * 获取所有活跃封禁记录（IP + 指纹）
 * 合并 Redis Hash 和内存 Map 中的数据，自动清理过期条目。
 * 返回结果按剩余时间排序：即将过期的在前，永久封禁在后。
 *
 * @param {object|null} redisClient Redis 客户端
 * @returns {Promise<Array>} 封禁记录列表，每项包含 ip/fingerprint、type、remainingSeconds 等字段
 */
export async function getActiveBlocks(redisClient) {
  const blockMap = new Map();

  // ——— 从 Redis Hash 读取 ———
  if (redisClient) {
    try {
      // 读取 IP 封禁索引
      const hashEntries = await redisClient.hgetall(HASH_BLOCKED);
      if (hashEntries) {
        for (const [ip, json] of Object.entries(hashEntries)) {
          try {
            const meta = JSON.parse(json);
            // 计算剩余秒数，永久封禁返回 null
            const remainingSeconds = meta.permanent
              ? null
              : Math.max(0, Math.ceil((meta.expiresAt - Date.now()) / 1000));
            // 已过期的条目从 Hash 中清除
            if (!meta.permanent && remainingSeconds <= 0) {
              await redisClient.hdel(HASH_BLOCKED, ip).catch(() => {});
              continue;
            }
            blockMap.set(`ip:${ip}`, { ip, type: 'ip', ...meta, remainingSeconds });
          } catch {
            /* 跳过格式异常的条目 */
          }
        }
      }
      // 读取指纹封禁索引
      const fpEntries = await redisClient.hgetall(HASH_BLOCKED_FP);
      if (fpEntries) {
        for (const [fp, json] of Object.entries(fpEntries)) {
          try {
            const meta = JSON.parse(json);
            const remainingSeconds = meta.permanent
              ? null
              : Math.max(0, Math.ceil((meta.expiresAt - Date.now()) / 1000));
            if (!meta.permanent && remainingSeconds <= 0) {
              await redisClient.hdel(HASH_BLOCKED_FP, fp).catch(() => {});
              continue;
            }
            blockMap.set(`fp:${fp}`, { fingerprint: fp, type: 'fingerprint', ...meta, remainingSeconds });
          } catch {
            /* 跳过 */
          }
        }
      }
    } catch (err) {
      console.error('[Firewall] getActiveBlocks Redis 失败:', err.message);
    }
  }

  // ——— 合并内存封禁（Redis 中没有的条目） ———
  const now = Date.now();
  for (const [ip, meta] of memoryBlocks) {
    const key = `ip:${ip}`;
    if (blockMap.has(key)) continue; // Redis 已有，跳过
    if (!meta.permanent && now > meta.expiresAt) continue; // 已过期，跳过
    const remainingSeconds = meta.permanent ? null : Math.max(0, Math.ceil((meta.expiresAt - now) / 1000));
    blockMap.set(key, { ip, type: 'ip', ...meta, remainingSeconds });
  }
  for (const [fp, meta] of memoryBlocksFp) {
    const key = `fp:${fp}`;
    if (blockMap.has(key)) continue;
    if (!meta.permanent && now > meta.expiresAt) continue;
    const remainingSeconds = meta.permanent ? null : Math.max(0, Math.ceil((meta.expiresAt - now) / 1000));
    blockMap.set(key, { fingerprint: fp, type: 'fingerprint', ...meta, remainingSeconds });
  }

  // 排序：临时封禁在前（按剩余时间升序），永久封禁在后
  return [...blockMap.values()].sort((a, b) => {
    if (a.permanent && !b.permanent) return 1;
    if (!a.permanent && b.permanent) return -1;
    return (a.remainingSeconds || Infinity) - (b.remainingSeconds || Infinity);
  });
}

/**
 * 获取所有活跃白名单记录（IP + 指纹）
 * 合并 Redis Hash 和内存 Map 中的数据，自动清理过期条目。
 * 返回结果按剩余时间升序排序。
 *
 * @param {object|null} redisClient Redis 客户端
 * @returns {Promise<Array>} 白名单记录列表，每项包含 ip/fingerprint、type、remainingSeconds
 */
export async function getActiveWhitelist(redisClient) {
  const wlMap = new Map();

  // ——— 从 Redis Hash 读取 ———
  if (redisClient) {
    try {
      const hashEntries = await redisClient.hgetall(HASH_WHITELIST);
      if (hashEntries) {
        for (const [ip, json] of Object.entries(hashEntries)) {
          try {
            const meta = JSON.parse(json);
            const remainingSeconds = Math.max(0, Math.ceil((meta.expiresAt - Date.now()) / 1000));
            if (remainingSeconds <= 0) {
              await redisClient.hdel(HASH_WHITELIST, ip).catch(() => {});
              continue;
            }
            wlMap.set(`ip:${ip}`, { ip, type: 'ip', remainingSeconds });
          } catch {
            /* 跳过 */
          }
        }
      }
      const fpEntries = await redisClient.hgetall(HASH_WHITELIST_FP);
      if (fpEntries) {
        for (const [fp, json] of Object.entries(fpEntries)) {
          try {
            const meta = JSON.parse(json);
            const remainingSeconds = Math.max(0, Math.ceil((meta.expiresAt - Date.now()) / 1000));
            if (remainingSeconds <= 0) {
              await redisClient.hdel(HASH_WHITELIST_FP, fp).catch(() => {});
              continue;
            }
            wlMap.set(`fp:${fp}`, { fingerprint: fp, type: 'fingerprint', remainingSeconds });
          } catch {
            /* 跳过 */
          }
        }
      }
    } catch (err) {
      console.error('[Firewall] getActiveWhitelist Redis 失败:', err.message);
    }
  }

  // ——— 合并内存白名单 ———
  const now = Date.now();
  for (const [ip, meta] of memoryWhitelist) {
    const key = `ip:${ip}`;
    if (wlMap.has(key)) continue;
    if (now > meta.expiresAt) continue;
    wlMap.set(key, { ip, type: 'ip', remainingSeconds: Math.max(0, Math.ceil((meta.expiresAt - now) / 1000)) });
  }
  for (const [fp, meta] of memoryWhitelistFp) {
    const key = `fp:${fp}`;
    if (wlMap.has(key)) continue;
    if (now > meta.expiresAt) continue;
    wlMap.set(key, { fingerprint: fp, type: 'fingerprint', remainingSeconds: Math.max(0, Math.ceil((meta.expiresAt - now) / 1000)) });
  }

  return [...wlMap.values()].sort((a, b) => a.remainingSeconds - b.remainingSeconds);
}

// ============== 全局封禁检查 ==============

/**
 * 全局封禁状态检查（请求入口处调用）
 *
 * 检查优先级（从高到低）：
 *   1. 指纹白名单 → 命中则直接放行
 *   2. IP 白名单   → 命中则直接放行
 *   3. 指纹封禁   → 命中则拒绝（403/429）
 *   4. IP 封禁     → 命中则拒绝（403/429）
 *   5. 手动黑名单  → 仅内存模式下的兜底检查
 *
 * 指纹优先的设计意图：同一攻击者可能更换 IP，但指纹难以伪造。
 *
 * @param {object|null} redisClient Redis 客户端
 * @param {string} ip 客户端 IP 地址
 * @param {string} [fingerprint] 设备指纹（可选）
 * @throws {Error} 被封禁时抛出异常，包含 statusCode 和 Retry-After 头
 */
export const checkGlobalBlock = async (redisClient, ip, fingerprint) => {
  const now = Date.now();

  // ——— 第 1 步：白名单检查（指纹优先） ———
  // 指纹白名单命中 → 直接放行，不再检查任何封禁
  if (fingerprint) {
    if (redisClient) {
      try {
        const fpWl = await redisClient.get(KEY.whitelistFp(fingerprint));
        if (fpWl) return; // 指纹白名单命中，放行
      } catch {
        /* 忽略 Redis 错误，继续检查 */
      }
    } else {
      const memFpWl = memoryWhitelistFp.get(fingerprint);
      if (memFpWl) {
        if (now <= memFpWl.expiresAt) return; // 未过期，放行
        memoryWhitelistFp.delete(fingerprint); // 已过期，清除
      }
    }
  }

  // IP 白名单命中 → 直接放行
  if (redisClient) {
    try {
      const wl = await redisClient.get(KEY.whitelist(ip));
      if (wl) return;
    } catch {
      /* 忽略 */
    }
  } else {
    const memWl = memoryWhitelist.get(ip);
    if (memWl) {
      if (now <= memWl.expiresAt) return;
      memoryWhitelist.delete(ip);
    }
  }

  // ——— 第 2 步：封禁检查（指纹优先） ———
  // 指纹封禁检查
  if (fingerprint) {
    if (redisClient) {
      const fpStatus = await getBlockStatus(redisClient, KEY.blockFp(fingerprint));
      if (fpStatus) {
        // 获取剩余 TTL，永久封禁（TTL=-1）默认给 24 小时
        let ttl = await safeRedis(redisClient, (r) => r.ttl(KEY.blockFp(fingerprint))) || 60;
        if (ttl === -1) ttl = 86400;
        const err = new Error(fpStatus === 'SCANNER' ? 'Scanner blocked' : 'Access temporary denied');
        err.statusCode = fpStatus === 'SCANNER' ? 403 : 429;
        err.headers = { 'Retry-After': String(ttl) };
        throw err;
      }
    } else {
      const memFpBlock = memoryBlocksFp.get(fingerprint);
      if (memFpBlock) {
        // 检查是否已过期
        if (!memFpBlock.permanent && now > memFpBlock.expiresAt) {
          memoryBlocksFp.delete(fingerprint);
        } else {
          const ttl = memFpBlock.permanent
            ? 86400
            : Math.max(1, Math.ceil((memFpBlock.expiresAt - now) / 1000));
          const err = new Error(memFpBlock.status === 'SCANNER' ? 'Scanner blocked' : 'Access temporary denied');
          err.statusCode = memFpBlock.status === 'SCANNER' ? 403 : 429;
          err.headers = { 'Retry-After': String(ttl) };
          throw err;
        }
      }
    }
  }

  // IP 封禁检查
  const blockKey = KEY.block(ip);

  if (!redisClient) {
    // 内存模式：检查内存封禁 + 手动黑名单兜底
    const memBlock = memoryBlocks.get(ip);
    if (memBlock) {
      if (!memBlock.permanent && now > memBlock.expiresAt) {
        memoryBlocks.delete(ip);
      } else {
        const ttl = memBlock.permanent
          ? 86400
          : Math.max(1, Math.ceil((memBlock.expiresAt - now) / 1000));
        const err = new Error(memBlock.status === 'SCANNER' ? 'Scanner blocked' : 'Access temporary denied');
        err.statusCode = memBlock.status === 'SCANNER' ? 403 : 429;
        err.headers = { 'Retry-After': String(ttl) };
        throw err;
      }
    }
    // 最终兜底：检查配置文件中的手动黑名单（无 Redis 时使用）
    const settings = getConfig().defense;
    if (settings.manualBlacklistIps?.includes(ip)) {
      const err = new Error('Manually blocked');
      err.statusCode = 403;
      err.headers = { 'Retry-After': '86400' };
      throw err;
    }
    return; // 全部检查通过，放行
  }

  // Redis 模式：查询封禁状态
  const status = await getBlockStatus(redisClient, blockKey);

  if (status) {
    let ttl = await safeRedis(redisClient, (r) => r.ttl(blockKey)) || 60;
    if (ttl === -1) ttl = 86400;
    const err = new Error(status === 'SCANNER' ? 'Scanner blocked' : 'Access temporary denied');
    err.statusCode = status === 'SCANNER' ? 403 : 429;
    err.headers = { 'Retry-After': String(ttl) };
    throw err;
  }
};

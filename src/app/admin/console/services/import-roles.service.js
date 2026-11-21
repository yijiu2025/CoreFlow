/**
 * 批量导入时的角色索引
 *
 * CSV 里人写的是**名字**（"普通用户"），不是 `posecraft_user` 这种编码 —— 让用户
 * 先去查编码等于把导入变成一道数据库题。所以服务端同时用 code 与 name 建索引。
 *
 * 🔴 名字会重名，而且一定重名：`posecraft_user` / `retroweb_user` / `user_normal`
 *    三个角色的 `name` 都是「普通用户」。旧实现 `roleMap.set(name, id)` 是**后写覆盖前写**，
 *    于是 CSV 里写「普通用户」会静默授成另一个应用的角色 —— 不报错、审计里也只是一条
 *    正常的授予流水，但用户在 posecraft 里没有任何权限，看起来像"导入没生效"。
 *
 * 所以重名键单独记下来：命中即判该行失败，并提示改用编码。宁可让用户改一列 CSV，
 * 也不能静默授错角色。
 *
 * 纯函数、不查库 —— 角色表由调用方一次性读出来（500 行导入不能逐行查）。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import crypto from 'node:crypto';

/**
 * 建索引：code / name（小写去空白）→ 角色 id
 *
 * @param {Array<{id: number, code?: string, name?: string}>} roles 角色表
 * @returns {{byKey: Map<string, number>, ambiguous: Set<string>}} 索引与重名键集合
 */
function buildRoleLookup(roles) {
  const byKey = new Map();
  const ambiguous = new Set();

  for (const role of roles || []) {
    const id = Number(role?.id);
    if (!Number.isInteger(id) || id <= 0) continue;

    for (const raw of [role.code, role.name]) {
      const key = String(raw ?? '')
        .trim()
        .toLowerCase();
      if (!key) continue;

      const previous = byKey.get(key);
      if (previous === undefined) byKey.set(key, id);
      else if (previous !== id) ambiguous.add(key);
    }
  }

  return { byKey, ambiguous };
}

/**
 * 解析一行里的角色（编码或名称，已由前端拆成数组）
 *
 * @param {{byKey: Map<string, number>, ambiguous: Set<string>}} lookup 索引
 * @param {string[]} rawList 原始角色名/编码
 * @returns {{roleIds: number[], unknown: string[], ambiguous: string[]}} 解析结果
 */
function resolveImportRoles(lookup, rawList) {
  const roleIds = [];
  const unknown = [];
  const ambiguous = [];

  for (const raw of rawList || []) {
    const label = String(raw ?? '').trim();
    const key = label.toLowerCase();
    if (!key) continue;

    if (lookup.ambiguous.has(key)) {
      ambiguous.push(label);
      continue;
    }

    const id = lookup.byKey.get(key);
    if (id === undefined) {
      unknown.push(label);
      continue;
    }
    // 同一行重复写同一个角色（编码 + 名称）时只授一次
    if (!roleIds.includes(id)) roleIds.push(id);
  }

  return { roleIds, unknown, ambiguous };
}

/**
 * 一批导入内容的指纹（二次验证的 `targetKey`）
 *
 * 🔴 二次验证必须绑到**内容**上：只绑 `challengeId` 等于没绑 —— 拿"验证了 1 个账号"
 *    的凭据去导 500 个账号，凭据就只是走个过场。签发与执行两处都用**服务端**从 rows
 *    派生的同一份指纹比对，前端改过任何一个字段都得重新验证。
 *
 * 刻意**不含密码**：改密码不扩大破坏半径（账号集 / 角色 / 部门才决定影响面），
 * 而把明文密码塞进哈希输入会让"两次输入同一个密码"变成必须重验的理由。
 * 角色顺序不参与（同一组角色换个顺序不该让凭据作废）。
 *
 * @param {object[]} rows 导入行
 * @returns {string} 32 位十六进制指纹
 */
function importFingerprint(rows) {
  const normalized = (Array.isArray(rows) ? rows : []).map(row => [
    String(row?.username ?? '').trim(),
    String(row?.email ?? '')
      .trim()
      .toLowerCase(),
    String(row?.dept ?? '').trim(),
    Array.from(
      new Set(
        (row?.roles ?? []).map(role =>
          String(role ?? '')
            .trim()
            .toLowerCase()
        )
      )
    )
      .sort()
      .join('|')
  ]);

  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 32);
}

export { buildRoleLookup, resolveImportRoles, importFingerprint };

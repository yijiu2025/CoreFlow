# 私钥信封加密（✅ 已落地）

JWT 签名私钥不再以明文 PEM 存数据库。落库前用 AES-256-GCM 加密，解密用的主密钥（KEK）
只存在于进程环境里，**永不入库**。

## 为什么

私钥是「能以任意用户身份签发 token」的根凭证。明文存储时，任何一个能拿到
数据库的途径（备份文件、只读副本、SQL 注入、误发的 dump）就直接等于拿到签发能力。
信封加密把「拖库」和「拿到私钥」拆成两件事：攻击者需要同时拿到 DB 与部署环境里的 KEK。

> ⚠️ 这**不是** KMS/HSM。KEK 仍在进程环境，能读 `/proc/<pid>/environ` 或拿到部署密钥的人
> 可以解密。它解决的是数据库侧泄露，不解决主机被完全控制。需要更强语义时替换
> `src/framework/keys/envelope.js` 的 `seal()`/`open()` 实现即可（唯一出入口）。

## 配置

四个变量（见 `.env.example`）：

| 变量 | 说明 |
| --- | --- |
| `KEY_ENCRYPTION_KEY` | 当前 KEK，32 字节（64 位 hex 或 44 字符 base64）。**留空 = 继续明文存储** |
| `KEY_ENCRYPTION_KEY_ID` | 当前 KEK 的标识，默认 `k1`。密文里会记录它 |
| `KEY_ENCRYPTION_KEY_PREVIOUS` | 轮转期间保留的旧 KEK（只解密） |
| `KEY_ENCRYPTION_KEY_PREVIOUS_ID` | 旧 KEK 标识，默认 `k0` |
| `KEY_ENCRYPTION_REQUIRED` | `true` 时缺 KEK 直接拒绝启动（生产建议开启） |

生成密钥：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 上线顺序

1. 把 KEK 下发到**所有**实例（多实例必须一致，否则 A 能解、B 不能解）；
2. 部署新代码（此时新写入的私钥已是密文，旧的明文行仍可读）；
3. 跑迁移脚本把历史明文转成密文：

```bash
node scripts/migrate-key-encryption.js --dry-run   # 先看有多少行要迁
node scripts/migrate-key-encryption.js             # 执行
node scripts/migrate-key-encryption.js --verify    # 校验：全部密文且都能解密
```

4. 确认 `--verify` 通过后，可把 `KEY_ENCRYPTION_REQUIRED=true` 打开，防止以后误配成明文。

迁移脚本幂等：已是密文的行跳过，每行一条带原值条件的 UPDATE，不会覆盖迁移期间的新写入。

## 存储格式

```
enc:v1:<keyId>:<base64(iv[12] || tag[16] || ciphertext)>
```

- 前缀让明文旧行与密文新行在同一列共存，滚动升级不会中断签发；
- `keyId` 支持 KEK 轮转（新旧并存）；
- AAD 绑定该行的 `name`（kid）：密文不能跨行搬用，否则有 DB 写权限的人可以把
  A 行密文复制到 B 行，让服务冒用 A 的身份签名。

轮转 KEK：把当前值挪到 `KEY_ENCRYPTION_KEY_PREVIOUS`、`KEY_ENCRYPTION_KEY_ID` 换新 ID、
配新的 `KEY_ENCRYPTION_KEY`，重启即可（旧密文靠 PREVIOUS 解开）。之后可另写脚本重封，
或等旧密钥自然退役。

## 失败语义

- 密文被改 / AAD 不匹配 / 找不到对应 KEK → **抛错**，绝不把密文当 PEM 传给签名环节；
- 未配置 KEK 时启动只告警（保持现存明文部署可用），`KEY_ENCRYPTION_REQUIRED=true` 时才拒绝启动；
- 迁移脚本发现「已加密但解不开」直接判失败——这种情况说明 KEK 配错，此时报「迁移成功」最危险。

## 测试

- `src/__tests__/keys-envelope.test.js`：往返、随机 IV、防篡改、AAD 绑定、KEK 轮转、
  历史明文兼容、配置非法、启动自检、仓库层「落库即密文 / 读出即 PEM」。
- `src/__tests__/keys.test.js`：密钥生命周期与 JWT 签验端到端（不受加密影响）。

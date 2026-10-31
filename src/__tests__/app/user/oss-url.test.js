/**
 * OSS 公网 URL → object key 的判据
 *
 * 守的是 CodeQL `js/incomplete-url-substring-sanitization` 指出的那条：
 * 旧实现用 `url.includes('aliyuncs.com')` 判断"是不是我们的 OSS 地址"，
 * 于是 `https://evil.com/?x=aliyuncs.com` 也命中 —— 随后的 `startsWith(prefix)` 虽然挡住了
 * 实际删除，但**判据本身是错的**（下次有人放宽一处就会真的删到别人的对象）。
 *
 * 现在只接受「scheme=https + hostname 精确等于 <bucket>.<region>.aliyuncs.com + key 非空」。
 *
 * @author yijiu2025
 * @since 2026-10-31
 */
import { describe, it, expect } from '@jest/globals';
import { toOssKey } from '../../../app/user/services/oss.service.js';

const HOST = 'my-bucket.oss-cn-hangzhou.aliyuncs.com';

describe('toOssKey：只认精确的 OSS host', () => {
  it('正常公网地址 → 取出 key', () => {
    expect(toOssKey(`https://${HOST}/avatars/a.jpg`, HOST)).toBe('avatars/a.jpg');
  });

  it('hostname 大小写不敏感', () => {
    expect(toOssKey(`https://${HOST.toUpperCase()}/avatars/a.jpg`, HOST)).toBe('avatars/a.jpg');
  });

  it('百分号编码的 key 会被解码', () => {
    expect(toOssKey(`https://${HOST}/avatars/%E5%A4%B4%E5%83%8F.jpg`, HOST)).toBe('avatars/头像.jpg');
  });

  it('🔴 把 aliyuncs.com 塞进 query 的伪造地址 → 拒绝', () => {
    expect(toOssKey('https://evil.com/?x=aliyuncs.com', HOST)).toBeNull();
    expect(toOssKey(`https://evil.com/avatars/a.jpg?host=${HOST}`, HOST)).toBeNull();
  });

  it('🔴 把 aliyuncs.com 塞进 path 的伪造地址 → 拒绝', () => {
    expect(toOssKey('https://evil.com/aliyuncs.com/avatars/a.jpg', HOST)).toBeNull();
  });

  it('🔴 前缀伪装域名（aliyuncs.com.evil.com）→ 拒绝', () => {
    expect(toOssKey(`https://${HOST}.evil.com/avatars/a.jpg`, HOST)).toBeNull();
  });

  it('🔴 其它 bucket / 其它 region → 拒绝', () => {
    expect(toOssKey('https://other-bucket.oss-cn-hangzhou.aliyuncs.com/a.jpg', HOST)).toBeNull();
    expect(toOssKey('https://my-bucket.oss-cn-beijing.aliyuncs.com/a.jpg', HOST)).toBeNull();
  });

  it('非 https（含 http / file / 无协议）→ 拒绝', () => {
    expect(toOssKey(`http://${HOST}/avatars/a.jpg`, HOST)).toBeNull();
    expect(toOssKey(`file://${HOST}/avatars/a.jpg`, HOST)).toBeNull();
    expect(toOssKey(`${HOST}/avatars/a.jpg`, HOST)).toBeNull();
    expect(toOssKey('not a url', HOST)).toBeNull();
  });

  it('根路径（无 key）→ 拒绝', () => {
    expect(toOssKey(`https://${HOST}/`, HOST)).toBeNull();
    expect(toOssKey(`https://${HOST}`, HOST)).toBeNull();
  });

  it('本地相对地址不会被误判成 OSS', () => {
    expect(toOssKey('/uploads/avatars/a.jpg', HOST)).toBeNull();
  });
});

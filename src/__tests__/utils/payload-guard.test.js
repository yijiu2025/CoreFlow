/**
 * 载荷形状守卫：把「网页」当二进制保存的回归测试
 *
 * 背景（真实事故）：一批 TF.js 的 `.bin` 权重文件实际是保存下来的 Kaggle 页面
 * （5401 字节 HTML，内含 Kaggle 自己的公开 Google API key），
 * 导致 Security 挂了一条 `google_api_key` 告警 + 模型加载静默失效。
 * 根因是下载逻辑只看 HTTP 状态码。
 *
 * @author yijiu2025
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { looksLikeHtml, assertNotHtmlPayload } from '../../utils/payload-guard.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** 真实事故里那份 Kaggle 页面的开头（结构一致，key 已打码） */
const KAGGLE_PAGE = [
  '\r\n',
  '\r\n',
  '<!DOCTYPE html>\r\n',
  '<html lang="en">\r\n',
  '<head>\r\n',
  '  <title>Find Pre-trained Models | Kaggle</title>\r\n',
  '      window.kaggleStackdriverConfig = {\r\n',
  "        key: 'AIza-DEMO-NOT-A-REAL-KEY',\r\n",
  "        projectId: 'kaggle-161607'\r\n",
  '      }\r\n'
].join('');

describe('looksLikeHtml：只看开头字节，不看 content-type', () => {
  it('识别真事故里的那份 Kaggle 页面（带前导空行与 CRLF）', () => {
    expect(looksLikeHtml(KAGGLE_PAGE)).toBe(true);
    expect(looksLikeHtml(Buffer.from(KAGGLE_PAGE, 'utf8'))).toBe(true);
  });

  it('识别其它常见文档起点', () => {
    for (const head of ['<html>', '  <!doctype HTML>', '\uFEFF<!DOCTYPE html>', '<head>', '<script src=x>']) {
      expect(looksLikeHtml(head)).toBe(true);
    }
  });

  it('不误伤二进制权重 / JSON / 纯文本', () => {
    // 权重文件常见开头：TF.js 的 .bin 是真二进制，几乎不可能以 '<' 开头
    expect(looksLikeHtml(Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0xff, 0xfe]))).toBe(false);
    expect(looksLikeHtml(Buffer.alloc(64, 0))).toBe(false);
    expect(looksLikeHtml('{"modelTopology":{}}')).toBe(false);
    expect(looksLikeHtml('')).toBe(false);
    expect(looksLikeHtml(null)).toBe(false);
    expect(looksLikeHtml(undefined)).toBe(false);
  });

  it('只看前 256 字节：二进制里偶然出现的 "<html>" 不会让整份载荷被误判', () => {
    const bin = Buffer.concat([Buffer.alloc(300, 0xab), Buffer.from('<html>', 'utf8')]);
    expect(looksLikeHtml(bin)).toBe(false);
  });
});

describe('assertNotHtmlPayload：命中即抛，交给调用方中止写入', () => {
  it('HTML 载荷抛错，且错误信息里带定位标签', () => {
    expect(() => assertNotHtmlPayload(Buffer.from(KAGGLE_PAGE), 'movenet/group1-shard1of2.bin')).toThrow(
      /group1-shard1of2\.bin.*网页/
    );
  });

  it('正常载荷静默通过（返回 undefined，不产生副作用）', () => {
    expect(assertNotHtmlPayload(Buffer.from([0x00, 0x01, 0x02]), 'x.bin')).toBeUndefined();
  });
});

describe('下载脚本确实接上了守卫（防"守卫写得对但没人调用"）', () => {
  const script = readFileSync(path.join(ROOT, 'scripts/download-models.js'), 'utf8');

  it('写文件前调用 assertNotHtmlPayload', () => {
    const call = script.indexOf('assertNotHtmlPayload(buffer');
    const write = script.indexOf('fs.writeFileSync(dest, buffer)');
    expect(call).toBeGreaterThanOrEqual(0);
    expect(write).toBeGreaterThan(call);
  });

  it('保留 content-type 作为第一道闸门', () => {
    expect(script).toMatch(/contentType\.includes\('text\/html'\)/);
  });

  it('import 时才不触发真实下载（否则跑单测会去拉 9GB 模型）', () => {
    expect(script).toMatch(/if \(isDirectRun\) \{/);
    expect(script).not.toMatch(/^main\(\)\.catch/m);
  });
});

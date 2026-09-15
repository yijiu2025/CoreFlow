/**
 * 地理位置过滤与信誉检查
 * 基于 GeoIP 的地域围栏：IDC 限频、境外敏感路径拦截
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import geoip from 'geoip-lite';
import { getConfig } from '../../util/shared.js';
import { checkRateLimit } from './rate-limiter.js';
import { createLogger } from '../../../../framework/log/index.js';

const log = createLogger('app.firewall.engine.detectors.geo-filter');

/**
 * 基于地理位置和网络类型的信誉检查
 *
 * 开关语义：`enableGeoFilter` 为 false 时**整段跳过**。此前该键没有任何读取点，
 * 运维在面板上关掉「地理围栏」后，IDC/境外限频照旧生效（排障时会产生严重误判）。
 */
const checkGeoReputation = async (ip, url) => {
  const settings = getConfig().defense;

  if (!settings.enableGeoFilter) return;

  const internalPrefixes = settings.internalIpPrefixes || ['127.', '10.', '192.168.', '::1'];
  if (internalPrefixes.some(p => ip.startsWith(p))) return;

  const geo = geoip.lookup(ip);
  const isOverseas = geo && geo.country !== 'CN';

  const idcPrefixes = settings.idcIpPrefixes || ['100.104.', '47.88.', '162.14.'];
  const isIDC = idcPrefixes.some(p => ip.startsWith(p));

  const geoRules = settings.geoRules || { sensitivePaths: [], internalPaths: [] };

  if (isIDC) {
    await checkRateLimit(`IDC:${ip}`, {
      limit: settings.idcLimit || 60,
      window: 60,
      blockTime: 3600
    });
  }

  // 注意：这里比的是 **URL 路径前缀**（如 `/internal/`），与上面的
  // `internalIpPrefixes`（IP 前缀）是两个完全不同的概念 —— 配置键沿用历史名字
  // `geoRules.internalPrefixes` 以保持与磁盘配置兼容，局部变量改名以免误读。
  const internalUrlPaths = geoRules.internalPrefixes || [];
  const isInternalPath = internalUrlPaths.some(p => url.startsWith(p));
  if (isOverseas && isInternalPath) {
    await checkRateLimit(`OVERSEAS:${ip}`, {
      limit: geoRules.overseasInternalLimit || 30,
      window: 60,
      blockTime: 1800
    });
  }

  const isSensitive = (geoRules.sensitivePaths || []).some(p => url.includes(p));
  if (isOverseas && isSensitive) {
    await checkRateLimit(`OVERSEAS_SENS:${ip}`, {
      limit: geoRules.overseasLimit || 10,
      window: geoRules.overseasWindow || 60,
      blockTime: geoRules.overseasBlockTime || 3600
    });
  }
};

/**
 * 将 IP 解析为地理位置信息
 *
 * 内网判定复用配置里的 `defense.internalIpPrefixes`：该列表已完整列出
 * `172.16.` ~ `172.31.`（RFC1918 的 172.16.0.0/12）。
 * 旧实现在这里硬编码了 `'172.'`，会把**任何** 172.x 都当成内网 ——
 * 例如 Google 的 172.217.x.x 会被标注成「内部网络」，严重误导排障。
 */
function resolveGeoInfo(ip) {
  if (!ip) return { region: '未知', city: '未知' };

  const internalPrefixes = getConfig().defense?.internalIpPrefixes || ['127.', '10.', '192.168.', '::1'];
  if (internalPrefixes.some(p => ip.startsWith(p))) {
    return { region: '内部网络', city: '局域网' };
  }

  try {
    const geo = geoip.lookup(ip);
    if (geo) {
      return {
        region: geo.region || geo.country || '未知',
        city: geo.city || '未知'
      };
    }
  } catch (err) {
    log.error('[Firewall] GeoIP 解析异常:', err);
  }

  return { region: '未知', city: '未知' };
}

export { checkGeoReputation, resolveGeoInfo };

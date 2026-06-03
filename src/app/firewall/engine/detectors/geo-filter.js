/**
 * 地理位置过滤与信誉检查
 * 基于 GeoIP 的地域围栏：IDC 限频、境外敏感路径拦截
 */
import geoip from 'geoip-lite';
import { getConfig } from '../../util/shared.js';
import { checkRateLimit } from './rate-limiter.js';

/**
 * 基于地理位置和网络类型的信誉检查
 */
export const checkGeoReputation = async (redisClient, ip, url) => {
  const settings = getConfig().defense;

  const internalPrefixes = settings.internalIpPrefixes || ['127.', '10.', '192.168.', '::1'];
  if (internalPrefixes.some(p => ip.startsWith(p))) return;

  const geo = geoip.lookup(ip);
  const isOverseas = geo && geo.country !== 'CN';

  const idcPrefixes = settings.idcIpPrefixes || ['100.104.', '47.88.', '162.14.'];
  const isIDC = idcPrefixes.some(p => ip.startsWith(p));

  const geoRules = settings.geoRules || { sensitivePaths: [], internalPrefixes: [] };

  if (isIDC) {
    await checkRateLimit(redisClient, `IDC:${ip}`, {
      limit: settings.idcLimit || 60,
      window: 60,
      blockTime: 3600,
    });
  }

  const isInternal = geoRules.internalPrefixes.some(p => url.startsWith(p));
  if (isOverseas && isInternal) {
    await checkRateLimit(redisClient, `OVERSEAS:${ip}`, {
      limit: geoRules.overseasInternalLimit || 30,
      window: 60,
      blockTime: 1800,
    });
  }

  const isSensitive = geoRules.sensitivePaths.some(p => url.includes(p));
  if (isOverseas && isSensitive) {
    await checkRateLimit(redisClient, `OVERSEAS_SENS:${ip}`, {
      limit: geoRules.overseasLimit || 10,
      window: geoRules.overseasWindow || 60,
      blockTime: geoRules.overseasBlockTime || 3600,
    });
  }
};

/**
 * 将 IP 解析为地理位置信息
 */
export function resolveGeoInfo(ip) {
  if (!ip) return { region: '未知', city: '未知' };

  const internalPrefixes = ['127.', '10.', '192.168.', '::1', '172.'];
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
    console.error('[Firewall] GeoIP 解析异常:', err.message);
  }

  return { region: '未知', city: '未知' };
}

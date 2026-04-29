/**
 * 地理位置解析工具
 * 使用 geoip-lite 库解析 IP 地址的地理位置信息。
 */
import geoip from 'geoip-lite';

/**
 * 获取 IP 的地理位置信息
 * @param {string} ip 待查询的 IP 地址
 * @returns {Object} 地理位置对象
 */
export const getIpInfo = (ip) => {
  // 本地测试时 127.0.0.1 查不到结果，处理一下
  if (ip === '127.0.0.1' || ip === '::1') return { region: '本地', city: '本地' };

  const geo = geoip.lookup(ip);
  if (!geo) return { region: '未知', city: '未知' };

  return {
    country: geo.country,
    region: geo.region,
    city: geo.city,
    ll: geo.ll // 经纬度
  };
};

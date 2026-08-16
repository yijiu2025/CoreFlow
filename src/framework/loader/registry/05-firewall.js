/**
 * Loader：防火墙插件加载（五层拦截管道）
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { initFirewall } from '../../../app/firewall/index.js';

export default async app => {
  await app.register(initFirewall);
};

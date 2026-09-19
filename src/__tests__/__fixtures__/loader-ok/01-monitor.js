/**
 * 测试夹具：可降级加载器失败
 * `01-monitor.js` 在 OPTIONAL_LOADERS 名单内 → 失败应只记录、不阻塞启动。
 */
const register = async () => {
  throw new Error('monitor boom');
};

export default register;

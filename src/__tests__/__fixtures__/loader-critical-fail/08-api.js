/**
 * 测试夹具：关键加载器失败
 * `08-api.js` 未列入可降级名单（缺路由 = 全站 404）→ 失败必须终止启动。
 */
const register = async () => {
  throw new Error('api boom');
};

export default register;

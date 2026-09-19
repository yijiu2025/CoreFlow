/**
 * 测试夹具：未声明的加载器失败
 * 文件名不在任何名单里 → 按"默认关键"处理，失败必须终止启动。
 * 这条断言保护的是「新增加载器忘了声明时不会被静默放过」。
 */
const register = async () => {
  throw new Error('unknown loader boom');
};

export default register;

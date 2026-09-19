/**
 * 测试夹具：正常的加载器（默认导出 register 函数，不抛错）
 * 文件名刻意用 00-globals.js —— 未列入可降级名单，属"关键"，
 * 但它成功执行，用于验证「关键 ≠ 一律失败」。
 */
const register = async () => {};

export default register;

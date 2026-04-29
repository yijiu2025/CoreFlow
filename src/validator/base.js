/**
 * 校验规则类
 */
export class Rule {
  constructor(name, message, ...params) {
    this.name = name;
    this.message = message;
    this.params = params;
  }
}

/**
 * 这是一个简单的校验器基类，模拟 LinValidator 的 API
 */
export class BaseValidator {
  constructor() {
    this.data = {};
    this.errors = [];
  }

  /**
   * 核心验证方法
   * @param {Object} ctx Koa 上下文
   */
  async validate(ctx) {
    this.data = {
      body: ctx.request.body || {},
      query: ctx.query || {},
      path: ctx.params || {},
      header: ctx.header || {}
    };

    // 1. 自动处理声明式的 Rule 规则
    const props = Object.getOwnPropertyNames(this);
    for (const prop of props) {
      const rules = this[prop];
      if (Array.isArray(rules) && rules[0] instanceof Rule) {
        // 尝试从 body, query, path 中获取值
        const value = this.data.body[prop] ?? this.data.query[prop] ?? this.data.path[prop];
        for (const rule of rules) {
          const isValid = this._checkRule(value, rule);
          if (isValid === 'skip') break; // 如果是可选字段且为空，跳过该字段后续校验
          if (!isValid) {
            this.addError(rule.message);
            break; // 一个字段只要一个错误
          }
        }
      }
    }

    // 2. 执行自定义的 check 逻辑
    await this.check(this.data);

    if (this.errors.length > 0) {
      const error = new Error(this.errors[0]);
      error.status = 400;
      throw error;
    }

    return this;
  }

  /**
   * 内部规则校验引擎
   */
  _checkRule(value, rule) {
    const { name, params } = rule;

    // 允许非空校验
    if (name === 'isNotEmpty') {
      return value !== undefined && value !== null && value !== '';
    }

    // 可选校验：如果值为空则跳过后续校验
    if (name === 'isOptional') {
      if (value === undefined || value === null || value === '') return 'skip';
      return true;
    }

    // 长度校验
    if (name === 'isLength') {
      const str = String(value || '');
      const [min, max] = params;
      return str.length >= min && str.length <= max;
    }

    // 邮箱校验
    if (name === 'isEmail') {
      return /^\S+@\S+\.\S+$/.test(String(value || ''));
    }

    return true;
  }

  /**
   * 获取验证后的数据
   */
  get(path) {
    const parts = path.split('.');
    let value = this.data;
    for (const part of parts) {
      value = value?.[part];
    }
    return value;
  }

  addError(msg) {
    this.errors.push(msg);
  }

  async check(data) {}
}

export default BaseValidator;

class Result {
  constructor(code, message, data = null) {
    this.code = code;
    this.message = message;
    this.data = data;
    this.timestamp = Date.now();
  }

  static success(message = '操作成功', data = null) {
    return new Result(200, message, data);
  }

  static fail(message = '操作失败', code = 400, data = null) {
    return new Result(code, message, data);
  }

  // 针对 SSO 的快捷返回
  static unauth(message = '身份验证失败') {
    return new Result(401, message);
  }

  static forbidden(message = '权限不足') {
    return new Result(403, message);
  }
}

export default Result;

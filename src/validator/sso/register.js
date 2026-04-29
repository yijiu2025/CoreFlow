import { BaseValidator, Rule } from '../base.js';

/**
 * 模拟解密函数
 */
const decryptWithPrivateKey = (val) => val;

class RegisterValidator extends BaseValidator {
  constructor() {
    super();
    this.username = [new Rule('isNotEmpty', '用户名不可为空'), new Rule('isLength', '用户名长度必须在5~20之间', 5, 20)];
    this.email = [new Rule('isOptional'), new Rule('isEmail', '电子邮箱不符合规范')];
    this.password = [new Rule('isNotEmpty', '密码不可为空')];
    this.verification_code = [new Rule('isNotEmpty', '验证码不可为空')];
    this.session_id = [new Rule('isNotEmpty', '图形验证码id不能为空')];
  }

  async check(data) {
    // 额外的解密后复杂度校验
    const decPassword = decryptWithPrivateKey(data.body.password);
    if (decPassword && !/^[A-Za-z0-9]{8,20}$/.test(decPassword)) {
      this.addError('密码长度必须在8~20位之间，只能包含字符和数字');
    }
  }
}

class LoginValidator extends BaseValidator {
  async check(data) {
    const { username, password, email, verification_code } = data.body;
    const isUsernameLogin = username && password;
    const isEmailLogin = email && verification_code;

    if (!isUsernameLogin && !isEmailLogin) return this.addError('登录参数不完整');
    if (isUsernameLogin && isEmailLogin) return this.addError('不能同时使用两种登录方式');

    if (isUsernameLogin && (username.length < 2 || username.length > 20)) {
      this.addError('用户名长度必须在2~20之间');
    }
  }
}

class UpdateInfoValidator extends BaseValidator {
  constructor() {
    super();
    this.email = [new Rule('isOptional'), new Rule('isEmail', '邮箱格式不正确')];
    this.nickname = [new Rule('isOptional'), new Rule('isLength', '昵称长度必须在2~24之间', 2, 24)];
    this.username = [new Rule('isOptional'), new Rule('isLength', '用户名长度必须在2~24之间', 2, 24)];
  }
}

class ChangePasswordValidator extends BaseValidator {
  constructor() {
    super();
    this.email = [new Rule('isEmail', '请输入正确的邮箱')];
    this.new_password = [new Rule('isNotEmpty', '新密码不可为空')];
    this.verification_code = [new Rule('isNotEmpty', '验证码不可为空')];
    this.session_id = [new Rule('isNotEmpty', '图形验证码id不能为空')];
  }
}

class UserNameValidator extends BaseValidator {
  constructor() {
    super();
    this.username = [new Rule('isNotEmpty', '用户名不可为空'), new Rule('isLength', '用户名长度必须在5~20之间', 5, 20)];
  }
}

class VerifyEmailCodeValidator extends BaseValidator {
  constructor() {
    super();
    this.email = [new Rule('isEmail', '邮箱格式不正确')];
    this.verification_code = [new Rule('isNotEmpty', '验证码不可为空')];
    this.session_id = [new Rule('isNotEmpty', '图形验证码id不能为空')];
  }
}

class SendVerificationCodeValidator extends BaseValidator {
  constructor() {
    super();
    this.email = [new Rule('isEmail', '邮箱格式不正确')];
    this.type = [new Rule('isNotEmpty', '验证类型不能为空')];
    this.session_id = [new Rule('isNotEmpty', '图形验证码id不能为空')];
  }
}

export {
  UserNameValidator,
  VerifyEmailCodeValidator,
  ChangePasswordValidator,
  UpdateInfoValidator,
  LoginValidator,
  RegisterValidator,
  SendVerificationCodeValidator as sendVerificationCodeValidator
};

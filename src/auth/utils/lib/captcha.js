import sharp from 'sharp';
import svgCaptcha from 'svg-captcha';

import { v4 as uuidv4 } from 'uuid';

// 使用Map数据结构在内存中存储验证码信息
// 存储结构: 键为UUID标识符，值为包含验证码文本、验证状态和过期时间的对象
const captchaStore = new Map();

/**
 * 定期清理过期的验证码，防止内存泄漏
 * 每小时执行一次清理操作
 */
setInterval(
  () => {
    const now = Date.now();
    for (const [tag, info] of captchaStore.entries()) {
      if (now > info.expired) {
        captchaStore.delete(tag);
      }
    }
  },
  60 * 60 * 1000
);

/**
 * 验证用户输入的验证码是否正确，并将验证状态标记为已验证
 * @param {string} captcha 用户输入的验证码文本
 * @param {string} tag 验证码唯一标识符
 * @returns {boolean} 验证结果，正确返回true，否则返回false
 */
function verifyCaptcha(captcha, tag) {
  // 参数校验
  if (!captcha || !tag) {
    return false;
  }

  const info = captchaStore.get(tag);
  // 检查验证码是否存在
  if (!info) {
    return false;
  }

  // 检查验证码是否过期
  if (Date.now() > info.expired) {
    captchaStore.delete(tag);
    return false;
  }

  // 忽略大小写比较验证码文本
  if (info.text.toLowerCase() !== captcha.toLowerCase()) {
    return false;
  }

  // 标记验证码为已验证状态
  info.verified = true;
  return true;
}

/**
 * 检查指定标识符的验证码是否已经通过验证
 * @param {string} tag 验证码唯一标识符
 * @returns {boolean} 已验证返回true，否则返回false
 */
function checkCaptchaVerified(tag) {
  // 参数校验
  if (!tag) {
    return false;
  }

  const info = captchaStore.get(tag);
  // 检查验证码是否存在
  if (!info) {
    return false;
  }

  // 检查验证码是否过期
  if (Date.now() > info.expired) {
    return false;
  }

  // 返回验证状态
  return info.verified === true;
}

/**
 * 从存储中移除验证码标识符 (注册成功后使用)
 * @param {string} tag 需要移除的验证码标识符
 */
// function removeCaptcha(tag) {
//   captchaStore.delete(tag);
// }

/**
 * 生成新的验证码图片和唯一标识符
 * @returns {Promise<Object>} 包含验证码图片(base64)、标识符和文本的对象
 */
async function generateCaptcha() {
  // 创建SVG格式的验证码
  const captcha = svgCaptcha.create({
    size: 4, // 验证码长度为4个字符
    fontSize: 45, // 字体大小
    noise: Math.floor(Math.random() * 5), // 随机添加0-4条干扰线
    width: 80, // 图片宽度
    height: 40, // 图片高度
    color: true, // 启用彩色字符
    background: '#fff' // 白色背景
  });

  const { data, text } = captcha;
  // 将SVG转换为PNG格式并编码为base64
  const str = await sharp(Buffer.from(data)).png().toBuffer();
  const image = 'data:image/png;base64,' + str.toString('base64');

  // 生成唯一的验证码标识符
  const tag = uuidv4();

  // 设置验证码10分钟后过期
  const expired = Date.now() + 10 * 60 * 1000;

  // 存储验证码信息到内存
  captchaStore.set(tag, {
    text,
    verified: false,
    expired
  });

  // 设置15分钟后自动清理内存（比过期时间多5分钟）
  setTimeout(
    () => {
      captchaStore.delete(tag);
    },
    15 * 60 * 1000
  );

  return {
    image,
    tag,
    text
  };
}

export { generateCaptcha, verifyCaptcha, checkCaptchaVerified };

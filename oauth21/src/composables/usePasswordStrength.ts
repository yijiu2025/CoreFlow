/**
 * 密码强度检测 composable
 *
 * 实时评估密码强度：长度 + 字符种类 + 常见模式
 * 返回 level/percent/color/label 供 UI 展示（颜色条 + 文字）
 *
 * 评级：
 * - 0 分：极弱（仅数字 / 短）
 * - 1 分：弱
 * - 2 分：中
 * - 3 分：强
 * - 4 分：极强
 *
 * 与 forgot-password/ResetByCode.vue 的内联实现对齐抽取
 * （之前会话审查标记该处独立实现可抽）
 *
 * @author yijiu2025
 * @since 2026-08-29
 */
import { computed, type ComputedRef } from 'vue';

export type PasswordLevel = 'weak' | 'medium' | 'strong';

export interface PasswordStrength {
  level: PasswordLevel;
  score: number;        // 0-4
  percent: number;      // 0-100 进度条宽度
  color: string;        // 进度条颜色
  label: string;        // 文字（已 i18n 化）
}

export function usePasswordStrength(password: () => string, t?: (key: string) => string): ComputedRef<PasswordStrength> {
  return computed<PasswordStrength>(() => {
    const pwd = password() || '';
    let score = 0;

    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++; // 长度加分
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++; // 大小写
    if (/\d/.test(pwd)) score++; // 数字
    if (/[^A-Za-z0-9]/.test(pwd)) score++; // 特殊字符

    // 归一化到 0-2（weak/medium/strong）
    const level: PasswordLevel = score <= 1 ? 'weak' : score <= 3 ? 'medium' : 'strong';
    const scoreNormalized = score <= 1 ? 1 : score <= 3 ? 2 : 3; // 1/2/3
    const percent = Math.min(100, Math.round((scoreNormalized / 3) * 100));
    const color =
      level === 'weak' ? '#f43f5e' :
      level === 'medium' ? '#eab308' :
      '#10b981';
    const label = t
      ? t(`register.password_strength_${level}`)
      : (level === 'weak' ? '弱' : level === 'medium' ? '中' : '强');

    return { level, score, percent, color, label };
  });
}

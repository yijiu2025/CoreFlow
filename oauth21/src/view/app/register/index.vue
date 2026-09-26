<script setup lang="ts">
/**
 * 移动端全屏注册（/m/register）—— **业务容器**
 *
 * 路由：mobileRoutes 全屏直达；同时是 /register 在窄屏 / 真机下的自动形态
 * （分发逻辑见 view/web/register/index.vue）
 *
 * === 分层（2026-09-23 架构调整；2026-09-24 版式改随主题包走）===
 * 本文件只负责"注册这件事"：状态、表单校验、接口调用、验证码流程、倒计时、路由跳转。
 * **页面长什么样不在这里**，而在**当前主题包**里的版式组件里：
 *
 *    本容器 ──传 ctx──▶ theme/themes/<包>/register/<版式>/index.vue
 *                 ▲
 *                 └── 契约定在 theme/views/register.ts（各包共用这一份，版式只读它）
 *
 * 于是「换一套 UI」= 在包里加一个版式目录，本文件零改动。选择优先级见
 * `theme/views/register.ts`（`?view=` > 主题包声明 > 环境变量 > 基础版式）。
 * **内置包**（`default`）的 base 由本文件**静态引入**：正常访问不产生额外请求，首帧即正确；
 * 其它包 / 其它版式都是惰性 chunk，由路由守卫提前预热。
 *
 * === 什么该留在这里 ===
 * 任何"点了会发生什么"：校验规则、请求、成功/失败处理、去哪一页。
 * 判断标准：把它挪进版式后，会不会出现第二份规则？会 —— 就留在这里。
 * 反向的：密码明文开关、折叠展开这类纯展示状态，留在版式里（各版式各管各的）。
 *
 * === 浮层 ===
 * 图形验证码 / 协议文档 / 全局提示都由本容器渲染（它们由业务状态驱动，
 * 且都是 `position: fixed`，渲染位置不影响呈现）—— 版式因此完全不必知道
 * "有验证码弹窗这回事"，也不会因为某个版式忘了放挂载点而丢功能。
 *
 * 视觉：基础版式与手机端登录页共用同一套样式体系（assets/styles/mobile-auth.scss
 * 的 mauth-* 类），样式只有那一处来源。
 *
 * 表单：三步堆栈（1 用户名+邮箱码 → 2 密码 → 3 协议+提交），安卓 Activity 式 slide 切换
 *
 * @author yijiu2025
 */
import { authApi } from '@/api/auth';
import { useForm } from 'vee-validate';
import { z } from 'zod';
import { toTypedSchema } from '@vee-validate/zod';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { computed, markRaw, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue';
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue';
import AgreementModals from '@/components/common/AgreementModals.vue';
import MessageToast from '@/components/common/MessageToast.vue';
import { useMessage } from '@/composables/useMessage';
import { useCountdown } from '@/composables/useCountdown';
import { useCaptchaFlow } from '@/composables/useCaptchaFlow';
import { useButtonLock } from '@/composables/useButtonLock';
import { rsaEncrypt, getCachedKid } from '@/utils/crypto';
import { useCaptcha } from '@/composables/useCaptcha';
import { useKeyboardAvoid } from '@/composables/useKeyboardAvoid';
import { useThemeStore } from '@/stores/theme';
/**
 * 静态引入**内置包**的基础版式 —— 首屏零请求的那条路径
 *
 * 路径里的 `default` 必须写死：静态 import 在编译期就要定下来，而"当前是哪个包"
 * 是运行时才知道的（URL / 后端下发 / localStorage）。运行时的那份判定在
 * `registerViews.builtinPackage`，两者必须是同一个包 —— 改了 `theme/index.ts` 的
 * `DEFAULT_THEME_PACKAGE` 就要同步改这里，守卫会盯住这一点。
 */
import BaseRegisterView from '@/theme/themes/default/mobile/register/index.vue';
import { pickRegisterViewId, registerViews } from '@/theme/views/register';
import { readDeviceParam } from '@/theme/views/params';
import type { RegisterDirection, RegisterTranslate, RegisterViewContext } from '@/theme/views/register';
import type { Component, Ref } from 'vue';

/** 步骤总数。契约里的 `totalSteps` 与进度百分比都算它，别在两处各写一个 3 */
const TOTAL_STEPS = 3;

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();

// 键盘弹出时把聚焦的输入框滚进可视区（iOS 键盘只覆盖视口、不缩视口高度）
useKeyboardAvoid();

// 语言跟随父应用透传（与手机端登录页同一口径）
watch(
  () => route.query.lang as string,
  newLang => {
    if (newLang) locale.value = newLang;
  },
  { immediate: true }
);

// 人机验证（reCAPTCHA）：开关由后端配置决定，开启才按需加载 SDK
const { isEnabled: recaptchaEnabled, load: loadCaptcha, getToken: getCaptchaToken, dispose } = useCaptcha('register');
const { error: showError, success: showSuccess } = useMessage();
onMounted(() => {
  if (recaptchaEnabled) loadCaptcha();
  // v2.20.1：注册页挂载后预热 login dispatcher chunk，避免「立即登录」切换闪屏
  void import('@/view/web/login/index.vue').catch(() => {});
});
onUnmounted(() => dispose());

// 分步堆栈（安卓 Activity 风格：1 账号+验证码 → 2 密码 → 3 协议+提交）
const step = ref<1 | 2 | 3>(1);
// 页面切换方向：next 前进 / prev 后退 —— 由版式翻译成具体的转场动画名
const direction = ref<RegisterDirection>('next');

// 分步副标题（显式映射，避免动态拼 key 漏键时把 key 名显示给用户）
const stepSub = computed(() => {
  if (step.value === 1) return t('register.mobile_sub_1');
  if (step.value === 2) return t('register.mobile_sub_2');
  return t('register.mobile_sub_3');
});

/**
 * 注册表单校验
 *
 * ⚠️ 字段必须是 username：后端 userDao.createUser 只读 request.body.username，
 * 拿不到就**静默回退成 email**（见 src/app/user/dao/user.js:55）。
 * 本页历史上叫 nickname，用户填的用户名根本没生效、账号实际以邮箱当用户名。
 */
const registerSchema = z
  .object({
    username: z
      .string({ required_error: t('register.username_min') })
      .min(5, t('register.username_min'))
      .regex(/^[A-Za-z0-9_]+$/, t('register.username_pattern')),
    email: z.string({ required_error: t('register.email_invalid') }).email(t('register.email_invalid')),
    code: z
      .string({ required_error: t('register.code_min') })
      .regex(/^\d{6}$/, t('register.code_min')),
    password: z
      .string({ required_error: t('register.password_min') })
      .min(8, t('register.password_min'))
      .max(128, t('register.password_max'))
      .regex(/^(?=.*[a-z])/, t('register.password_lowercase'))
      .regex(/^(?=.*[A-Z])/, t('register.password_uppercase'))
      .regex(/^(?=.*\d)/, t('register.password_digit')),
    confirmPassword: z
      .string({ required_error: t('register.confirm_required') })
      .min(1, t('register.confirm_required'))
  })
  .refine((data: { password: string; confirmPassword: string }) => data.password === data.confirmPassword, {
    message: t('register.password_mismatch'),
    path: ['confirmPassword']
  });

const { values, errors, defineField, handleSubmit, validateField, setFieldError } = useForm({
  validationSchema: toTypedSchema(registerSchema)
});

// 五个字段的 vee-validate 绑定：值 ref + 原生事件绑定（顺序与视觉顺序一致）
const [username, usernameProps] = defineField('username');
const [email, emailProps] = defineField('email');
const [code, codeProps] = defineField('code');
const [password, passwordProps] = defineField('password');
const [confirmPassword, confirmPasswordProps] = defineField('confirmPassword');

const agreed = ref(false);
const isEmailDuplicate = ref(false);
const isEmailChecking = ref(false); // 邮箱查重请求进行中：防 blur 后未返回就点下一步的竞态
const codeSent = ref(false); // 邮箱码是否已发出：未发出前验证码框与"下一步"都禁用
const { active: isCountingDown, remaining: countdown, start: startCountdown } = useCountdown(60);
// 防双击：提交期间禁用按钮（避免重复注册请求）
const submitLock = useButtonLock();
const submitting = computed(() => submitLock.locked.value);
// 图形验证码流程：弹窗 → 通过 → 拿 captchaKey + 标记已发码 + 启动倒计时
const { captchaKey, showCaptcha, openCaptcha: openRegCaptcha, onCaptchaSuccess } = useCaptchaFlow<'register'>(() => {
  codeSent.value = true;
  startCountdown(60);
});
const docType = ref<'service' | 'privacy' | null>(null);

// 邮箱查重：发码前校验，已注册则拦截
const checkEmail = async () => {
  if (!values.email || errors.value.email) {
    isEmailDuplicate.value = false;
    return;
  }
  isEmailChecking.value = true;
  try {
    // request.ts 拦截器已解包 AxiosResponse.data，类型断言拿 isDuplicate 字段
    const res = (await authApi.checkEmail(values.email)) as unknown as { isDuplicate?: boolean };
    isEmailDuplicate.value = !!res?.isDuplicate;
  } catch {
    // 查重失败不阻断注册流程（后端注册时有唯一约束兜底）
    isEmailDuplicate.value = false;
  } finally {
    isEmailChecking.value = false;
  }
};

// 发送验证码前先查重：邮箱已注册则拦截
const sendCode = async () => {
  if (!values.email || errors.value.email) return;
  await checkEmail();
  if (isEmailDuplicate.value) {
    showError(t('register.email_duplicate'));
    return;
  }
  openRegCaptcha('register');
};

// 前进到下一步（先校验当前步骤的字段，不通过就停在原地）
const handleNextStep = async (target: 2 | 3) => {
  let ok: boolean;
  if (target === 2) {
    if (isEmailChecking.value) return; // 查重未返回，先不放行（否则重复邮箱能溜过去）
    // 逐字段校验：顺序与视觉顺序一致，用户先看到最上面那个错
    const r1 = await validateField('username');
    const r2 = await validateField('email');
    const r3 = await validateField('code');
    ok = r1.valid && r2.valid && r3.valid && !isEmailDuplicate.value;
  } else {
    const r4 = await validateField('password');
    const r5 = await validateField('confirmPassword');
    ok = r4.valid && r5.valid;
    /* ⚠️ 「两次密码一致」是 schema 的 **object 级 refine**，而 validateField 只跑字段级
       规则，refine 不参与 —— 不补这一句，两次不一致会一路走到第 3 步：点「完成注册」时
       handleSubmit 才拦下，而错误标在第 2 步的字段上、用户根本看不到，表现为"点了没反应"。
       用 setFieldError 把错误标回确认框（与移动端重置密码页同一处坑、同一修法）。 */
    if (ok && values.password !== values.confirmPassword) {
      setFieldError('confirmPassword', t('register.password_mismatch'));
      ok = false;
    }
  }
  if (ok) {
    direction.value = 'next';
    step.value = target;
  }
};

// 去登录页（透传 OAuth 上下文，登录后才能回到授权页）
// v2.20.1: import() 目标 dispatcher chunk 与 push 并行，避开切换闪屏（见 App.vue 同名注释）
const goLogin = () => {
  const query: Record<string, string> = {};
  for (const key of ['appName', 'client_id', 'redirect_uri', 'scope', 'state', 'lang', 'redirect']) {
    const v = route.query[key];
    if (typeof v === 'string') query[key] = v;
  }
  void import('@/view/web/login/index.vue').catch(() => {});
  router.push({ path: '/m/login', query });
};

// 后退到上一步（安卓返回键风格；第 1 步再后退即回登录页）
const handleBack = () => {
  if (step.value === 1) {
    goLogin();
    return;
  }
  direction.value = 'prev';
  step.value = (step.value - 1) as 1 | 2 | 3;
};

const handleRegister = handleSubmit(async data => {
  if (!agreed.value) {
    showError(t('register.agree_required'));
    return;
  }
  if (isEmailChecking.value) return; // 查重未返回前不放行
  if (submitLock.locked.value) return; // 防双击
  submitLock.lock();
  try {
    // 排除 confirmPassword（`_` 前缀 = 有意不使用）：它只用于本地一致性校验，不发往后端
    const { confirmPassword: _confirmPassword, ...submitData } = data;
    const encryptedPassword = await rsaEncrypt(submitData.password);
    const recaptchaToken = recaptchaEnabled ? await getCaptchaToken() : null;
    await authApi.register({
      ...submitData,
      password: encryptedPassword,
      kid: getCachedKid(),
      captchaKey: captchaKey.value,
      ...(recaptchaToken ? { recaptchaToken } : {})
    });
    showSuccess(t('register.success'));
    router.push('/m/login');
  } catch (err: unknown) {
    showError(err instanceof Error ? err.message : t('register.register_failed'));
  } finally {
    submitLock.unlock();
  }
});

/* ============================================================================
   版式（UI）加载 + 契约组装
   ========================================================================== */

const themeStore = useThemeStore();

/**
 * 本容器的**设备身份**：文件位置即身份（`view/app/` 下都是移动端）。
 *
 * 取常量而不是运行时判定，是为了让"这个页面属于哪种设备"只有一个答案 ——
 * 再跑一次视口判定就会出现"URL 说是移动端路由、视口却已变宽"这类自相矛盾的状态。
 * 视口判定的口径仍然只在 `utils/device.ts` 有一份（路由分发用它）。
 */
const THEME_DEVICE = 'mobile' as const;

/**
 * 用哪套版式：`?view=` > 主题包声明（theme/themes/<包>/index.ts 的 views.register）
 * > VITE_REGISTER_VIEW > 当前包名（一个主题包 = 一种版式）。解析细节与安全边界见 registry.ts。
 *
 * 做成 computed 而不是 setup 里取一次，是因为主题是**运行时**才定的：
 * 后端下发的换配色配置在 App.vue 的 onMounted 之后才到（可能晚于本页 setup），
 * 取一次就会漏掉"主题包声明了版式"这种情况。
 *
 * `pkg` 决定**在哪个包里找**：版式跟随主题包，同一个 `?view=compact` 在不同包里
 * 指向不同实现，所以包变了就要重新解析（依赖 `packageId` 让 computed 自动重算）。
 */
const viewId = computed(() =>
  pickRegisterViewId({
    url: readDeviceParam(route.query, 'view', THEME_DEVICE),
    theme: themeStore.viewFor('register'),
    pkg: themeStore.packageId,
    device: THEME_DEVICE
  })
);

/**
 * 告诉 store「当前是哪一页、哪套版式」
 *
 * 🔴 配色挂在**版式**下（`themes/<包>/<设备>/<页面>/[<版式>/]colors/<颜色>/`），
 *    所以"该注入哪套颜色的 token"必须知道这两个值 —— 不知道就会落到
 *    `DEFAULT_THEME_PAGE` + `base`，表现为「页面里选的颜色不生效」。
 *
 * watch 而不是 setup 里取一次：版式可能在运行时变（`?view=` 或主题包声明），
 * 变了就要让 store 重算 token。`immediate` 保证首帧之前就把值交出去。
 */
watch(viewId, id => themeStore.setActivePageView('register', id), { immediate: true });

/**
 * 当前渲染的版式组件
 *
 * 默认是**内置包的基础版式**：它由本文件静态引入，首帧直接正确（不会先白屏再闪一下）。
 * 变体、以及非内置包的版式都是动态 chunk，加载完成后接管；路由守卫已提前预热
 * （preloadRegisterView），因此绝大多数情况下这一步在同一 tick 内完成 —— 用户看不到切换。
 * `markRaw`：组件对象不该被 reactive 代理（无谓的深层代理开销）。
 *
 * `viewEpoch` 用于丢弃过期结果：版式 A→B→A 连续变化时，先发出的 A 可能后返回，
 * 不加序号会用过期组件覆盖当前（与主题附加样式同一类坑）。
 *
 * ⚠️ 必须**同时**盯住主题包：版式只在当前包内查找，换了包但解析出的 id 字符串没变
 *    （两边都是 `base`）时，渲染的组件其实换了一整套 —— 只盯 id 会漏掉这一整类切换。
 */
const activeView = shallowRef<Component>(BaseRegisterView);
let viewEpoch = 0;
watch(
  [viewId, () => themeStore.packageId],
  ([id, pkg]) => {
    const epoch = ++viewEpoch;
    void registerViews.load(id, pkg, THEME_DEVICE).then(loaded => {
      if (epoch !== viewEpoch) return;
      // null = 用静态引入的内置包基础版式（首屏零请求那条路径）
      activeView.value = loaded ? markRaw(loaded) : BaseRegisterView;
    });
  },
  { immediate: true }
);

/** 契约里字段绑定的**内部构造形态**：值与错误都是 ref，交给 reactive 自动解包成契约里的标量 */
interface FieldSource {
  value: Ref<string>;
  attrs: Ref<Record<string, unknown>>;
  invalid: Ref<boolean>;
  error: Ref<string | undefined>;
}

/**
 * 把一个字段打成交给版式的"绑定三件套"
 *
 * - `value` 包一层可写 computed：vee-validate 给的值 ref 是 `string | undefined`
 *   （一次都没填过就是 undefined），而契约承诺版式拿到的一定是字符串 —— 读时兜底成
 *   `''`，写时原样回填进表单（`v-model` 仍写回同一个 ref，校验/取值链路不变）。
 * - `attrs` **整个 ref 原样存下来**，不提前取 `.value`：vee-validate 里它是 `computed`，
 *   取值时可能产出新对象，提前取会拿到过期快照。交给 reactive 在读取时自动解包，
 *   版式侧 `v-bind="ctx.fields.x.attrs"` 拿到的就是当前那副原生事件绑定。
 */
function bindField(
  value: Ref<string | undefined>,
  attrs: Ref<Record<string, unknown>>,
  invalid: Ref<boolean>,
  error: Ref<string | undefined>
): FieldSource {
  return {
    value: computed({
      get: () => value.value ?? '',
      set: next => {
        value.value = next;
      }
    }),
    attrs,
    invalid,
    error
  };
}

/**
 * 编译期契约自检
 *
 * 容器组装的 ctx 必须**结构上满足** `theme/views/register.ts` 声明的契约：
 * 少一个字段、类型对不上，都会在这行报错。这样"版式契约"才是真的有约束力，
 * 而不是一份会过期的文档。
 */
function assertRegisterContract(ctx: RegisterViewContext): RegisterViewContext {
  return ctx;
}

/** 翻译函数：只把「key + （命名参数 | 兜底文案）」这一子集交给版式（版式因此不依赖 i18n 内部类型） */
const translate: RegisterTranslate = (key, params) => {
  if (params === undefined) return t(key);
  return typeof params === 'string' ? t(key, params) : t(key, params as never);
};

/**
 * 交给版式的上下文
 *
 * reactive + 嵌套 ref：契约里声明的是**标量**（`step: number`、`fields.x.value: string`），
 * 而这些标量在容器里都是 ref —— `reactive` 会自动解包，版式侧写 `ctx.step`、
 * `v-model="ctx.fields.email.value"` 即可，不必到处 `.value`。
 */
const ctx = assertRegisterContract(
  reactive({
    t: translate,
    appName: computed(() => String(route.query.appName ?? '')),

    step: computed(() => step.value),
    totalSteps: TOTAL_STEPS,
    direction: computed(() => direction.value),
    subtitle: computed(() => stepSub.value),
    progress: computed(() => (step.value / TOTAL_STEPS) * 100),

    fields: {
      username: bindField(
        username,
        usernameProps,
        computed(() => !!errors.value.username),
        computed(() => errors.value.username)
      ),
      // 邮箱的错误口径与其它字段不同：查重命中也要算错误态（改造前的模板就是这么写的）
      email: bindField(
        email,
        emailProps,
        computed(() => !!errors.value.email || isEmailDuplicate.value),
        computed(() => (isEmailDuplicate.value ? t('register.email_duplicate') : errors.value.email))
      ),
      code: bindField(code, codeProps, computed(() => !!errors.value.code), computed(() => errors.value.code)),
      password: bindField(
        password,
        passwordProps,
        computed(() => !!errors.value.password),
        computed(() => errors.value.password)
      ),
      confirmPassword: bindField(
        confirmPassword,
        confirmPasswordProps,
        computed(() => !!errors.value.confirmPassword),
        computed(() => errors.value.confirmPassword)
      )
    } satisfies Record<string, FieldSource>,

    agreed,
    emailDuplicate: computed(() => isEmailDuplicate.value),
    codeSent: computed(() => codeSent.value),
    countingDown: computed(() => isCountingDown.value),
    countdown: computed(() => countdown.value),
    submitting: computed(() => submitting.value),
    // 改造前按钮写的是 `:disabled="!agreed || submitting"`，这里把口径收进容器，
    // 版式直接用 —— 免得每套 UI 各写一遍、写漏一处就能提交未勾协议的注册
    canSubmit: computed(() => agreed.value && !submitting.value),

    actions: {
      nextStep: handleNextStep,
      back: handleBack,
      goLogin,
      sendCode,
      checkEmail,
      submit: handleRegister,
      openAgreement: (doc: 'service' | 'privacy') => {
        docType.value = doc;
      }
    }
  })
);
</script>

<template>
  <!-- 业务容器只做两件事：把 ctx 交给当前版式；渲染与版式无关的业务浮层 -->
  <component :is="activeView" :ctx="ctx" />

  <!-- 业务浮层：三者都是 `position: fixed`（Toast 还 Teleport 到 body），
       渲染位置不影响呈现，故统一由容器渲染。 -->
  <GraphicCaptcha
    :is-open="showCaptcha"
    :email="values.email"
    :send-email="true"
    type="register"
    @close="showCaptcha = false"
    @success="onCaptchaSuccess"
  />
  <AgreementModals v-model:type="docType" />
  <MessageToast />
</template>

<script setup lang="ts">
import { agreementConfig } from './agreementConfig';
const {
  PRIVACY_EFFECTIVE_DATE,
  PRIVACY_UPDATE_DATE,
  PRIVACY_VERSION,
  OPERATOR,
  CONTACT_ADDRESS,
  CREDIT_CODE,
  DPO_EMAIL,
  CONTACT_EMAIL,
  CONTACT_PHONE,
  RESPONSE_DAYS,
  DELETE_AFTER_DELETE_DAYS,
  LOG_RETENTION,
  ORDER_RETENTION
} = agreementConfig;
</script>

<template>
  <p class="text-xs text-slate-400">
    发布及生效日期：{{ PRIVACY_EFFECTIVE_DATE }}｜最新更新日期：{{ PRIVACY_UPDATE_DATE }}｜版本：{{ PRIVACY_VERSION }}
  </p>

  <div class="mt-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
    本政策帮助我们向您说明：我们如何收集和使用您的个人信息、如何使用 Cookie、如何委托处理/共享/转让/公开披露您的个人信息、如何存储和保护您的个人信息、您享有哪些权利以及如何行使、我们如何保护未成年人个人信息、本政策如何更新，以及如何联系我们。请您在使用本平台服务前，仔细阅读并充分理解本政策，特别是加粗标注的条款。本政策与《用户服务协议》配套构成您与我们之间的完整约定。
  </div>

  <h3 class="font-bold text-slate-800 dark:text-slate-200 pt-2">一、我们是谁与政策适用范围</h3>
  <p><strong class="text-slate-700 dark:text-slate-200">1.1 个人信息处理者：</strong>{{ OPERATOR }}，统一社会信用代码{{ CREDIT_CODE }}，注册地址{{ CONTACT_ADDRESS }}。</p>
  <p><strong class="text-slate-700 dark:text-slate-200">1.2 适用范围：</strong>本政策适用于您通过网站、移动客户端等方式使用本平台提供的身份认证、应用授权、协作管理及相关服务时，我们对您个人信息的处理活动。</p>
  <p><strong class="text-slate-700 dark:text-slate-200">1.3</strong> 本政策不适用于其他第三方（包括接入本平台的其他用户、第三方应用）对您信息的处理规则，该等情形请以其自身的隐私政策为准。</p>

  <h3 class="font-bold text-slate-800 dark:text-slate-200">二、我们如何收集和使用您的个人信息</h3>
  <p>我们遵循合法、正当、必要和诚信原则，仅出于下述业务功能收集您的个人信息。若您不提供相关信息，可能无法使用对应功能，但不影响您使用其他功能。</p>
  <p><strong class="text-slate-700 dark:text-slate-200">2.1 为您提供服务而必要收集的信息</strong></p>
  <div class="overflow-x-auto my-1">
    <table class="w-full text-[11px] border border-slate-200 dark:border-slate-700 border-collapse">
      <thead class="bg-slate-50 dark:bg-slate-800/60">
        <tr>
          <th class="border border-slate-200 dark:border-slate-700 px-2 py-1 text-left font-semibold text-slate-600 dark:text-slate-300">业务功能</th>
          <th class="border border-slate-200 dark:border-slate-700 px-2 py-1 text-left font-semibold text-slate-600 dark:text-slate-300">收集的个人信息种类</th>
          <th class="border border-slate-200 dark:border-slate-700 px-2 py-1 text-left font-semibold text-slate-600 dark:text-slate-300">使用目的</th>
          <th class="border border-slate-200 dark:border-slate-700 px-2 py-1 text-left font-semibold text-slate-600 dark:text-slate-300">收集方式</th>
        </tr>
      </thead>
      <tbody class="text-slate-500 dark:text-slate-400">
        <tr>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">账号注册与登录</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">手机号码、电子邮箱、用户名、密码（加密存储）</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">创建账号、身份验证、登录</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">您主动填写</td>
        </tr>
        <tr>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">身份认证与实名</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">姓名、身份证号码、人脸识别信息（如功能涉及）</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">完成身份认证，保障账号安全</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">您主动提交，并经您单独同意</td>
        </tr>
        <tr>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">应用授权管理</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">授权的应用列表、授权范围、授权时间</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">记录并管理您对第三方应用的授权</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">系统自动记录</td>
        </tr>
        <tr>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">协作管理与文件共享</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">您上传的文件、共享对象、协作操作记录</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">实现数据与文件的共享、协作功能</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">您主动上传、系统自动记录</td>
        </tr>
        <tr>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">消息通知</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">设备标识符、通知设置</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">向您推送服务通知、安全提醒</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">系统自动收集</td>
        </tr>
        <tr>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">支付与自动续费</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">订单信息、支付渠道标识</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">完成收费服务订购与续费</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">支付渠道回传</td>
        </tr>
        <tr>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">客服与反馈</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">您提交的咨询、投诉内容及联系方式</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">处理您的请求</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">您主动提交</td>
        </tr>
      </tbody>
    </table>
  </div>
  <p><strong class="text-slate-700 dark:text-slate-200">2.2 为保障系统安全稳定运行而自动收集的信息：</strong>包括 IP 地址、设备型号、操作系统版本、设备标识符、访问时间、操作日志、崩溃信息，用于故障排查、防欺诈与安全审计。</p>
  <p><strong class="text-slate-700 dark:text-slate-200">2.3 敏感个人信息的处理：</strong>当我们处理您的生物识别信息（如人脸）、身份证件号码、金融账户等敏感个人信息时，我们会向您告知处理的必要性以及对个人权益的影响，并在您单独同意后处理；您有权随时拒绝或撤回。</p>
  <p><strong class="text-slate-700 dark:text-slate-200">2.4</strong> 我们不会以欺诈、诱骗、误导的方式收集您的信息，不会收集与提供服务无关的个人信息；不会因您拒绝提供非必要信息而拒绝您使用基础服务。</p>

  <h3 class="font-bold text-slate-800 dark:text-slate-200">三、我们如何使用 Cookie 和同类技术</h3>
  <p><strong class="text-slate-700 dark:text-slate-200">3.1</strong> 我们使用 Cookie、本地存储等同类技术来记录您的登录状态、偏好设置（如语言）、进行安全校验和统计分析，以提供更流畅的交互体验。</p>
  <p><strong class="text-slate-700 dark:text-slate-200">3.2</strong> 您可以通过浏览器设置清除或阻止 Cookie，或通过系统权限管理关闭相关授权；但关闭后可能影响部分功能的正常使用。</p>

  <h3 class="font-bold text-slate-800 dark:text-slate-200">四、我们如何委托处理、共享、转让与公开披露个人信息</h3>
  <p><strong class="text-slate-700 dark:text-slate-200">4.1 委托处理：</strong>我们可能委托具备资质的合作方（如云服务提供商）在必要范围内处理您的信息，我们会与其签署协议约定处理目的、期限、方式、种类、保护措施并对其监督。</p>
  <p><strong class="text-slate-700 dark:text-slate-200">4.2 共享（含第三方 SDK）：</strong>未经您的单独同意，我们不会向任何第三方共享您的个人信息，但以下情形除外：（1）为实现服务功能所必需接入的第三方 SDK；（2）取得您的单独同意；（3）法律法规规定的其他情形。当我们向第三方提供您的个人信息时，将向您告知接收方的名称、联系方式、处理目的、处理方式和个人信息的种类，并在您单独同意后进行。目前我们接入的第三方 SDK 及共享情况如下（我们将持续更新此清单）：</p>
  <div class="overflow-x-auto my-1">
    <table class="w-full text-[11px] border border-slate-200 dark:border-slate-700 border-collapse">
      <thead class="bg-slate-50 dark:bg-slate-800/60">
        <tr>
          <th class="border border-slate-200 dark:border-slate-700 px-2 py-1 text-left font-semibold text-slate-600 dark:text-slate-300">第三方名称</th>
          <th class="border border-slate-200 dark:border-slate-700 px-2 py-1 text-left font-semibold text-slate-600 dark:text-slate-300">SDK/服务名称</th>
          <th class="border border-slate-200 dark:border-slate-700 px-2 py-1 text-left font-semibold text-slate-600 dark:text-slate-300">共享的个人信息</th>
          <th class="border border-slate-200 dark:border-slate-700 px-2 py-1 text-left font-semibold text-slate-600 dark:text-slate-300">使用目的</th>
          <th class="border border-slate-200 dark:border-slate-700 px-2 py-1 text-left font-semibold text-slate-600 dark:text-slate-300">处理规则链接</th>
        </tr>
      </thead>
      <tbody class="text-slate-500 dark:text-slate-400">
        <tr>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">【第三方主体全称】</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">【如：推送 SDK、统计 SDK、支付 SDK】</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">【如：设备标识符、IP 地址】</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">【如：消息推送、数据统计】</td>
          <td class="border border-slate-200 dark:border-slate-700 px-2 py-1">【链接】</td>
        </tr>
      </tbody>
    </table>
    <p class="text-[10px] text-slate-400 dark:text-slate-500 mt-1">注：实际接入 SDK 后请在此逐行补全真实信息，并随接入变化及时更新。</p>
  </div>
  <p><strong class="text-slate-700 dark:text-slate-200">4.3 转让：</strong>除取得您的单独同意外，我们不会转让您的个人信息。因合并、收购、破产清算等原因需要转移个人信息的，我们将向您告知接收方的名称和联系方式，并要求接收方继续履行本政策项下的义务；接收方变更原先处理目的、处理方式的，将依法重新取得您的同意。</p>
  <p><strong class="text-slate-700 dark:text-slate-200">4.4 公开披露：</strong>仅在取得您的单独同意或依据法律法规、司法机关强制性要求时，我们才会公开披露您的个人信息。</p>

  <h3 class="font-bold text-slate-800 dark:text-slate-200">五、我们如何存储和保护您的个人信息</h3>
  <p><strong class="text-slate-700 dark:text-slate-200">5.1 存储地点：</strong>我们在中华人民共和国境内运营中收集和产生的个人信息，存储于境内；确需向境外提供的，我们将依法取得您的单独同意，并通过国家网信部门安全评估、专业机构认证或签署标准合同等法定方式实现。</p>
  <p><strong class="text-slate-700 dark:text-slate-200">5.2 存储期限：</strong>除法律法规另有规定外，我们仅在为实现处理目的所必需的最短时间内存您的个人信息：</p>
  <ul class="list-disc pl-5 text-slate-500 dark:text-slate-400">
    <li>账号信息：于账号存续期间保存，账号注销后{{ DELETE_AFTER_DELETE_DAYS }}内删除或匿名化；</li>
    <li>日志信息：保存{{ LOG_RETENTION }}；</li>
    <li>交易与订单信息：依《电子商务法》等规定保存不少于{{ ORDER_RETENTION }}。</li>
  </ul>
  <p><strong class="text-slate-700 dark:text-slate-200">5.3 安全措施：</strong>我们采取加密传输与存储、访问控制、安全审计、数据备份、去标识化等技术和管理措施，防止个人信息被未经授权访问、披露、丢失。</p>
  <p><strong class="text-slate-700 dark:text-slate-200">5.4 安全事件通知：</strong>发生或可能发生个人信息泄露、篡改、丢失的，我们将立即启动应急预案、采取补救措施，并按规定告知您事件的基本情况、可能造成的危害、已采取的措施及您可采取的减轻危害的措施，同时向履行个人信息保护职责的部门报告。</p>

  <h3 class="font-bold text-slate-800 dark:text-slate-200">六、您的权利</h3>
  <p>在符合法律法规的前提下，您对自己的个人信息享有以下权利，可通过【账号设置—隐私中心】或本政策第九条的渠道行使：</p>
  <p><strong class="text-slate-700 dark:text-slate-200">6.1 查阅与复制：</strong>您有权查阅、复制您的个人信息，我们将在{{ RESPONSE_DAYS }}内响应。</p>
  <p><strong class="text-slate-700 dark:text-slate-200">6.2 可携带：</strong>符合法定条件的，您有权请求将您的个人信息转移至您指定的处理者，我们将提供转移途径。</p>
  <p><strong class="text-slate-700 dark:text-slate-200">6.3 更正与补充：</strong>发现信息不准确或不完整的，您有权要求更正、补充，我们核实后及时处理。</p>
  <p><strong class="text-slate-700 dark:text-slate-200">6.4 删除：</strong>在处理目的已实现、您撤回同意、我们停止提供服务或违法处理等法定情形下，您有权请求删除您的个人信息，我们将依法主动删除或依申请删除。</p>
  <p><strong class="text-slate-700 dark:text-slate-200">6.5 撤回同意：</strong>您有权随时撤回此前作出的同意，我们提供便捷的撤回方式（如【账号设置—隐私—授权管理】）。撤回同意不影响撤回前基于您同意已进行的处理活动的效力。</p>
  <p><strong class="text-slate-700 dark:text-slate-200">6.6 注销账号：</strong>您可随时申请注销账号，注销后我们将停止为您提供服务并依法删除或匿名化处理您的个人信息，法律法规要求留存的除外。</p>
  <p><strong class="text-slate-700 dark:text-slate-200">6.7 解释说明：</strong>您有权要求我们对本政策及处理规则进行解释说明。</p>
  <p><strong class="text-slate-700 dark:text-slate-200">6.8 拒绝自动化决策：</strong>如我们利用您的个人信息进行自动化决策（如个性化展示），我们将保证透明度和结果公平公正，不实行不合理差别待遇，并向您提供不针对个人特征的选项或便捷的拒绝方式。</p>
  <p><strong class="text-slate-700 dark:text-slate-200">6.9 投诉举报与近亲属权利：</strong>您有权就个人信息处理向我们投诉、举报；自然人死亡的，其近亲属为自身合法、正当利益，可依法对死者相关信息行使查阅、复制、更正、删除等权利（死者生前另有安排的除外）。</p>
  <p><strong class="text-slate-700 dark:text-slate-200">6.10</strong> 拒绝请求的，我们将说明理由；您可依法向网信部门投诉或向人民法院提起诉讼。</p>

  <h3 class="font-bold text-slate-800 dark:text-slate-200">七、未成年人个人信息保护</h3>
  <p><strong class="text-slate-700 dark:text-slate-200">7.1</strong> 我们高度重视未成年人个人信息保护。若您是已满 14 周岁未满 18 周岁的未成年人，请在监护人陪同下仔细阅读本政策并在取得监护人同意后使用本服务。</p>
  <p><strong class="text-slate-700 dark:text-slate-200">7.2</strong> 对于不满 14 周岁的儿童，我们不会主动收集其个人信息；确有必要收集的，我们将取得其父母或其他监护人的同意，并遵循专门的儿童个人信息处理规则，告知处理目的、方式、种类及对权益的影响。监护人有权拒绝、撤回同意，并要求更正、删除儿童的个人信息。</p>
  <p><strong class="text-slate-700 dark:text-slate-200">7.3</strong> 监护人发现未成年人未经同意使用本服务或处理其个人信息的，可通过本政策第九条的渠道通知我们，我们将在核实后采取删除等必要措施。</p>

  <h3 class="font-bold text-slate-800 dark:text-slate-200">八、本政策如何更新</h3>
  <p><strong class="text-slate-700 dark:text-slate-200">8.1</strong> 我们可能适时更新本政策，并通过站内公告、弹窗等显著方式向您展示变更内容。</p>
  <p><strong class="text-slate-700 dark:text-slate-200">8.2</strong> 涉及个人信息处理目的、方式、种类发生变更或对您的权益有重大影响的实质性变更，我们将再次征得您的同意；您不同意变更的，可停止使用服务并注销账号。</p>
  <p><strong class="text-slate-700 dark:text-slate-200">8.3</strong> 本政策各版本在【政策历史版本页面】留存，供您查阅。</p>

  <h3 class="font-bold text-slate-800 dark:text-slate-200">九、如何联系我们</h3>
  <div class="mt-1 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
    <p>运营主体：<strong class="text-slate-600 dark:text-slate-300">{{ OPERATOR }}</strong></p>
    <p>注册地址：{{ CONTACT_ADDRESS }}</p>
    <p>个人信息保护负责人联系邮箱：{{ DPO_EMAIL }}</p>
    <p>客服邮箱：{{ CONTACT_EMAIL }}</p>
    <p>客服电话：{{ CONTACT_PHONE }}</p>
  </div>
  <p class="mt-2">我们将在{{ RESPONSE_DAYS }}内回复您的请求、意见或投诉。若您对我们的处理结果不满意，还可向网信部门投诉或向人民法院提起诉讼。</p>
</template>

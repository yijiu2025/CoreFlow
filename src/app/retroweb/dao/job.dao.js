/**
 * RetroWeb 算法任务（job）服务
 *
 * Node 侧权威记录：提交先落库（queued），转发给 Python 拿 provider_job_id；
 * 轮询问 Python，Python 返回 404 / 不可达时标 `stale`（结果丢失，需重跑）。
 *
 * 🔴 对外契约与 Python **完全一致**（这是 S3 前端零改动的关键）：
 *    · 提交返回 `{ ok, job_id }`，`job_id` = 上游 provider_job_id（字符串）；
 *    · 轮询 `GET /jobs/:job_id` **原样透传上游 JobSnapshot**（含 logs/log_seq/stages）；
 *    · 取消 `POST /jobs/:job_id/cancel` 透传上游。
 *    前端 `retroApi.createJob/getJob/cancelJob` 因此只切 baseURL，逻辑一行不改。
 *    唯一的增量是 stale：上游 404 时返回 `{ state:'stale', ... }`，前端据此提示重跑。
 *
 * 🔴 `stale` 专门为 Python 的"job 存内存、重启即失"设计（见 Job 模型头注释）：
 *    不是 failed，是"上游不认这个 job 了"，前端提示"服务重启导致结果丢失，请重跑"。
 *
 * @since 2026-10-09
 */
import { getModel } from '../../../framework/db/index.js';
import { forwardJson, UpstreamUnavailableError } from '../services/upstream.service.js';

class JobDao {
  getModel() {
    return getModel('retroweb.Job');
  }

  /**
   * 提交：落库（queued）→ 原样转发 Python → 记 provider_job_id → 返回 {ok, job_id}
   */
  async submit(userId, { taskId = null, kind, params }) {
    const Job = this.getModel();

    const job = await Job.create({
      user_id: userId,
      task_id: taskId,
      kind,
      params_json: params ?? null,
      status: 'queued'
    });

    try {
      const { ok, status, data } = await forwardJson('POST', '/jobs', {
        kind,
        ...(params ?? {})
      });
      if (!ok) {
        await job.update({
          status: 'failed',
          error_text: data?.error || `上游返回 ${status}`,
          finished_at: new Date()
        });
        return { ok: false, error: data?.error || `上游返回 ${status}` };
      }

      const providerJobId = data?.job_id ?? null;
      await job.update({
        provider_job_id: providerJobId,
        status: 'running'
      });
      // 🔴 对外 job_id 用 provider_job_id（前端继续用它轮询，契约不变）
      return { ok: true, job_id: providerJobId };
    } catch (e) {
      await job.update({
        status: 'failed',
        error_text: e instanceof UpstreamUnavailableError ? e.message : '无法连接算法服务',
        finished_at: new Date()
      });
      return { ok: false, error: e.message };
    }
  }

  /**
   * 轮询：原样透传上游 JobSnapshot；上游 404 ⇒ 返回 stale 快照。
   *
   * @param {string} jobId 上游 provider_job_id（前端持有的字符串）
   * @param {number} since 增量日志 seq
   * @returns {Promise<object>} 上游快照（或 stale 标记快照）
   */
  async poll(jobId, since = 0) {
    const Job = this.getModel();
    const job = await Job.findOne({ where: { provider_job_id: jobId } });
    if (!job) {
      return { ok: false, error: 'job 不存在', state: 'stale' };
    }

    // 已标 stale：直接回 stale（不再问上游）
    if (job.status === 'stale') {
      return { ok: false, error: job.error_text || '结果已丢失', state: 'stale' };
    }

    try {
      const { ok, status, data } = await forwardJson('GET', `/jobs/${jobId}`, undefined, { since });

      if (status === 404) {
        // 🔴 Python 不认这个 job（重启 / 过期）⇒ 标 stale 并回明确快照
        await job.update({ status: 'stale', finished_at: new Date() });
        return { ok: false, state: 'stale', error: '服务重启导致结果丢失，请重跑' };
      }

      if (!ok) {
        // 上游暂时出错：保持 running，原样透传错误快照
        return data ?? { ok: false, error: `上游返回 ${status}` };
      }

      // 透传上游快照，同时把终态落库
      const state = data?.state;
      if (state === 'succeeded' || state === 'done') {
        await job.update({ status: 'done', result_json: data?.result ?? null, finished_at: new Date() });
      } else if (state === 'failed' || state === 'cancelled') {
        await job.update({
          status: 'failed',
          error_text: data?.error || '算法任务失败',
          finished_at: new Date()
        });
      }
      return data;
    } catch {
      // 网络错误：保持 running（可重试），回一个可重试的错误快照
      return { ok: false, error: '算法服务暂时不可达，请稍后重试', transient: true };
    }
  }

  /** 取消：透传上游 cancel，本地标终态 */
  async cancel(jobId) {
    const Job = this.getModel();
    const job = await Job.findOne({ where: { provider_job_id: jobId } });
    if (!job) return false;
    try {
      await forwardJson('POST', `/jobs/${jobId}/cancel`, {});
    } catch {
      /* 上游取消失败不影响本地标终态 */
    }
    await job.update({ status: 'failed', error_text: '已取消', finished_at: new Date() });
    return true;
  }
}

const jobDao = new JobDao();

export default jobDao;

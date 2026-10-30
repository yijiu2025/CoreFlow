import { createLogger } from '../log/index.js';

const log = createLogger('framework.auth.session');

/**
 * 执行跨 Redis/DB 的 Saga。当前步骤也登记补偿，因为其内部可能已部分写入再抛错；
 * 所有补偿必须幂等。补偿本身失败会显式报错，不能把部分成功伪装成完整创建/轮转。
 */
async function runSessionSaga(steps, operation) {
  const completed = [];
  try {
    for (const step of steps) {
      completed.push(step);
      await step.execute();
    }
  } catch (error) {
    const compensationErrors = [];
    for (const step of completed.reverse()) {
      if (!step.compensate) continue;
      try {
        await step.compensate();
      } catch (compensationError) {
        compensationErrors.push(compensationError);
      }
    }
    if (compensationErrors.length > 0) {
      log.error('[Session] %s 补偿失败，需按告警清理残态:', operation, compensationErrors);
      const sagaError = new Error('SESSION_COMPENSATION_FAILED', { cause: error });
      sagaError.code = 'SESSION_COMPENSATION_FAILED';
      sagaError.compensationErrors = compensationErrors;
      throw sagaError;
    }
    throw error;
  }
}

/** 将同一次会话变更的所有 DB 写入放进一个事务，避免审计/设备裁剪失败留下半提交。 */
async function withSessionTransaction(Model, work) {
  if (!Model?.sequelize?.transaction) {
    throw new Error('SESSION_DB_TRANSACTION_UNAVAILABLE');
  }
  return Model.sequelize.transaction(work);
}

export { runSessionSaga, withSessionTransaction };

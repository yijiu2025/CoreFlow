/**
 * 本地旧头像删除安全契约：只能删除 public/user 内的文件（URL 形如 /user/avatars/xxx.jpg）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { deleteFile } from '../app/user/services/oss.service.js';

// 强制走本地存储分支，避免测试机环境变量启用 OSS。
delete process.env.OSS_ACCESS_KEY_ID;
delete process.env.OSS_ACCESS_KEY_SECRET;
delete process.env.OSS_BUCKET;

afterEach(() => {
  jest.restoreAllMocks();
});

describe('deleteFile 本地路径边界', () => {
  it.each(['/user/../../outside.txt', '/user/../user-evil/old.jpg'])(
    '拒绝删除上传目录外的路径：%s',
    async oldAvatar => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      await deleteFile(oldAvatar);

      expect(fs.unlinkSync).not.toHaveBeenCalled();
    }
  );

  it('仍删除上传目录内的合法旧头像', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

    await deleteFile('/user/avatars/old.jpg');

    const expectedPath = fileURLToPath(new URL('../../public/user/avatars/old.jpg', import.meta.url));
    expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
    expect(fs.unlinkSync).toHaveBeenCalledWith(path.resolve(expectedPath));
  });
});

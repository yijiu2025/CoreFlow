/**
 * 用户资料 API
 * - GET  /user/v1/profile   获取当前用户资料
 * - PUT  /user/v1/update    更新昵称/简介
 * - POST /user/v1/avatar    上传头像（multipart/form-data）
 */
import service from '@/utils/request'

export const userApi = {
  /** 获取当前用户个人资料 */
  getProfile: () => service.get('/user/v1/profile'),

  /**
   * 更新资料（昵称 / 简介）
   * @param data { username?, bio? }
   */
  updateProfile: (data: { username?: string; bio?: string }) =>
    service.put('/user/v1/update', data),

  /**
   * 上传头像
   * @param file File 对象
   * @returns { avatar: string } 新头像 URL
   */
  uploadAvatar: (file: File) => {
    const form = new FormData()
    form.append('avatar', file)
    return service.post('/user/v1/avatar', form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    } as any)
  }
}

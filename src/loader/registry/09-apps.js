/* eslint-disable no-console */
/**
 * 应用扫描加载器（合并原 09-pbac + 10-seed-clients + 11-apps）
 *
 * 扫描 src/app/ 下的每个应用文件夹，统一执行：
 * 1. 读取 config.js 获取应用元数据
 * 2. 加载 permission/index.js 权限常量
 * 3. 加载 permission/roles.js 角色定义
 * 4. 同步 PBAC 角色到数据库
 * 5. 注册 OAuth 客户端（config.oauth_client）
 * 6. 调用 init 函数注册应用插件
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { sequelize } from '../../db/index.js';
import { C } from '../../utils/colors.js';
import { roleRegistry } from '../../utils/PbacRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async (app) => {
  const appsDir = path.resolve(__dirname, '../../app');

  if (!fs.existsSync(appsDir)) {
    console.log(`ℹ️ [Apps] ${C.cyan}src/app/ 目录不存在，跳过应用加载${C.reset}`);
    return;
  }

  const entries = fs.readdirSync(appsDir, { withFileTypes: true });
  const appDirs = entries.filter((e) => e.isDirectory());
  let loadedCount = 0;

  // ============== 阶段 1：扫描应用，加载配置/权限/角色/OAuth 客户端 ==============

  for (const dir of appDirs) {
    const appPath = path.join(appsDir, dir.name);

    // 1. 加载应用配置（config.js）
    let appConfig = null;
    const configPath = path.join(appPath, 'config.js');
    if (fs.existsSync(configPath)) {
      try {
        const fileUrl = pathToFileURL(configPath).href;
        const mod = await import(fileUrl);
        appConfig = mod.default || mod;
        console.log(`📦 [Apps] ${C.cyan}加载应用: ${appConfig.name || dir.name}${C.reset}`);
      } catch (err) {
        console.error(`❌ [Apps] ${C.red}加载配置失败 [${dir.name}]: ${err.message}${C.reset}`);
      }
    }

    // 2. 加载权限定义（permission/index.js）
    const permIndexPath = path.join(appPath, 'permission', 'index.js');
    if (fs.existsSync(permIndexPath)) {
      try {
        const fileUrl = pathToFileURL(permIndexPath).href;
        await import(fileUrl);
        console.log(`📦 [Apps] ${C.cyan}权限定义已加载: ${dir.name}${C.reset}`);
      } catch (err) {
        console.error(`❌ [Apps] ${C.red}加载权限失败 [${dir.name}]: ${err.message}${C.reset}`);
      }
    }

    // 3. 加载角色定义（permission/roles.js）
    const permRolesPath = path.join(appPath, 'permission', 'roles.js');
    if (fs.existsSync(permRolesPath)) {
      try {
        const fileUrl = pathToFileURL(permRolesPath).href;
        await import(fileUrl);
        console.log(`📦 [Apps] ${C.cyan}角色定义已加载: ${dir.name}${C.reset}`);
      } catch (err) {
        console.error(`❌ [Apps] ${C.red}加载角色失败 [${dir.name}]: ${err.message}${C.reset}`);
      }
    }

    // 4. 注册 OAuth 客户端（config.oauth_client）
    if (appConfig?.oauth_client) {
      const { OauthClient } = sequelize.models;
      if (OauthClient) {
        try {
          const client = appConfig.oauth_client;
          const exist = await OauthClient.findByPk(client.client_id);

          if (!exist) {
            await OauthClient.create(client);
            console.log(`🌱 [Seed] ${C.cyan}OAuth 初始化客户端: ${client.client_id}${C.reset}`);
          } else {
            await exist.update({
              client_name: client.client_name,
              redirect_uris: client.redirect_uris,
              grant_types: client.grant_types,
              response_types: client.response_types,
              scope: client.scope,
              token_endpoint_auth_method: client.token_endpoint_auth_method,
              application_type: client.application_type
            });
            console.log(`🌱 [Seed] ${C.cyan}OAuth 同步更新客户端: ${client.client_id}${C.reset}`);
          }
        } catch (err) {
          console.error(`❌ [Seed] ${C.red}OAuth 客户端注册失败 [${dir.name}]: ${err.message}${C.reset}`);
        }
      }
    }

    // 5. 调用 init 函数注册应用插件（如 config.js 中定义了 init）
    if (appConfig?.init && typeof appConfig.init === 'function') {
      try {
        await app.register(appConfig.init);
      } catch (err) {
        console.error(`❌ [Apps] ${C.red}${appConfig.name || dir.name} 初始化失败: ${err.message}${C.reset}`);
      }
    }

    // 6. 打印应用加载完成
    const appName = appConfig?.name || dir.name;
    const hasPerm = fs.existsSync(permIndexPath);
    const hasRoles = fs.existsSync(permRolesPath);
    const hasOAuth = !!appConfig?.oauth_client;
    const hasInit = !!appConfig?.init;
    const parts = [];
    if (hasPerm) parts.push('权限');
    if (hasRoles) parts.push('角色');
    if (hasOAuth) parts.push('OAuth');
    if (hasInit) parts.push('插件');
    const detail = parts.length > 0 ? ` (${parts.join(' + ')})` : '';
    console.log(`✅ [Apps] ${C.green}${appName} 加载完成${detail}${C.reset}`);

    loadedCount++;
  }

  // ============== 阶段 2：同步 PBAC 角色到数据库 ==============

  const { Role } = sequelize.models;
  if (Role && roleRegistry.length > 0) {
    try {
      let successCount = 0;
      for (const roleDef of roleRegistry) {
        const [role, created] = await Role.findOrCreate({
          where: { code: roleDef.code, app_id: roleDef.app_id },
          defaults: roleDef
        });

        if (!created) {
          role.policy = roleDef.policy;
          await role.save();
        }
        successCount++;
      }
      console.log(`✅ [PBAC] ${C.green}集中注册器已将内存中的 ${successCount} 个角色同步至数据库${C.reset}`);
    } catch (error) {
      console.error(`❌ [PBAC] ${C.red}集中同步数据库失败: ${error.message}${C.reset}`);
    }
  } else {
    console.log(`ℹ️ [PBAC] ${C.cyan}暂无通过 defineRoles 注册的基础角色${C.reset}`);
  }

  console.log(`✅ [Apps] ${C.green}所有应用加载完毕 (${loadedCount} 个)${C.reset}`);
};

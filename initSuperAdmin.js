import 'dotenv/config';
import sequelize from './src/db/index.js';
import { User, Role, UserRole, UserIdentity } from './src/models/user/index.js';
import { QueryTypes } from 'sequelize';

async function initSuperAdmin() {
    const adminEmail = '241849626@qq.com';
    
    try {
        console.log('🔄 正在同步数据库表结构 (PBAC 极客版)...');
        await sequelize.sync({ alter: true });

        console.log(`🔍 正在为 ${adminEmail} 执行提权与数据迁移...`);

        // 1. 迁移旧数据 (兼容逻辑)
        let oldUsers = [];
        try {
            [oldUsers] = await sequelize.query(`SELECT * FROM \`users\` WHERE email = :email`, {
                replacements: { email: adminEmail },
                type: QueryTypes.SELECT
            });
        } catch (e) {
            // 如果旧表不存在，尝试查新表
            const user = await User.findOne({ where: { email: adminEmail } });
            if (user) oldUsers = [user];
        }

        if (oldUsers.length === 0) {
            console.log('❌ 找不到用户，请先在前端注册。');
            return;
        }

        const u = oldUsers[0];
        const crypto = await import('crypto');
        
        // 确保新表有此用户
        const [user] = await User.findOrCreate({
            where: { email: adminEmail },
            defaults: {
                id: u.id || u.uid, // 适配旧字段名
                uid: u.uid || crypto.randomUUID(),
                username: u.username || 'Admin',
                email: adminEmail,
                status: 1
            }
        });

        // 确保有身份信息
        await UserIdentity.findOrCreate({
            where: { user_id: user.id, identity_type: 'password' },
            defaults: {
                user_id: user.id,
                identity_type: 'password',
                identifier: adminEmail,
                credential: u.credential || '$2b$10$YourDefaultHash' 
            }
        });

        // 2. 创建或更新超级管理员角色 (PBAC 模式)
        const superPolicy = {
            Version: "2026-05-17",
            Statement: [
                {
                    Effect: "Allow",
                    Action: ["*"] // 拥有所有权限的通配符
                }
            ]
        };

        const [role] = await Role.findOrCreate({
            where: { code: 'super_admin', app_id: 'GLOBAL' },
            defaults: {
                code: 'super_admin',
                app_id: 'GLOBAL',
                name: '超级管理员',
                rank_level: 99,
                policy: superPolicy,
                description: '系统最高权限，拥有通配符策略'
            }
        });

        // 如果已存在，强制更新为通配符策略
        if (role.rank_level !== 99 || JSON.stringify(role.policy) !== JSON.stringify(superPolicy)) {
            role.rank_level = 99;
            role.policy = superPolicy;
            await role.save();
        }

        // 3. 授予超管角色
        await UserRole.findOrCreate({
            where: { user_id: user.id, role_id: role.id },
            defaults: {
                user_id: user.id,
                role_id: role.id,
                app_id: 'GLOBAL'
            }
        });

        console.log('✅ 极客版 PBAC 提权成功！');
        console.log(`- 用户 ID: ${user.id}`);
        console.log(`- 公开 UID: ${user.uid}`);
        console.log('- 角色: 超级管理员 (rank_level: 99)');
        console.log('- 策略: 通配符 Allow ALL');

    } catch (error) {
        console.error('❌ 提权失败:', error);
    } finally {
        await sequelize.close();
    }
}

initSuperAdmin();

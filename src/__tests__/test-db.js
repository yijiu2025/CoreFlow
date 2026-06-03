import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  console.log(`🔍 正在尝试连接数据库: ${process.env.DB_HOST}...`);

  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      connectTimeout: 5000
    });

    console.log('✅ 数据库连接成功！');

    const [rows] = await connection.execute('SELECT 1 + 1 AS result');
    console.log('📊 测试查询 (1+1) 结果:', rows[0].result);

    await connection.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ 数据库连接失败！');
    console.error('👉 错误原因:', err.message);

    if (err.code === 'ETIMEDOUT') {
      console.error(
        '💡 提示：连接超时，请检查：\n1. IP 地址是否正确\n2. 数据库服务器是否允许远程访问\n3. 防火墙端口 (3306) 是否开放'
      );
    } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('💡 提示：访问被拒绝，请检查用户名和密码。');
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.error(`💡 提示：数据库 [${process.env.DB_NAME}] 不存在，请手动创建它。`);
    }

    process.exit(1);
  }
}

testConnection();

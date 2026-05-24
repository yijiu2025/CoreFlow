import sequelize from './src/db/index.js';

async function main() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');
    const [results] = await sequelize.query('SHOW CREATE TABLE permissions');
    console.log('Create Table for permissions:', results[0]['Create Table']);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

main();

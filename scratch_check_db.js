import { Sequelize } from 'sequelize';

const sequelize = new Sequelize('coreflow', 'root', 'root', { // Wait, I need the actual credentials from .env
  host: 'localhost',
  dialect: 'mysql'
});

async function check() {
  try {
    const [results] = await sequelize.query('SELECT id, title, pose_data FROM posecraft_template LIMIT 1');
    if (results.length > 0) {
      console.log('Template ID:', results[0].id);
      console.log('Title:', results[0].title);
      console.log('Pose Data Type:', typeof results[0].pose_data);
      console.log('Pose Data:', JSON.stringify(results[0].pose_data, null, 2).substring(0, 500) + '...');
    } else {
      console.log('No templates found.');
    }
  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
}

check();

import 'dotenv/config';
import sequelize from './src/db/index.js';

async function check() {
  try {
    const [results] = await sequelize.query('SELECT id, title, pose_data FROM posecraft_template LIMIT 1');
    if (results.length > 0) {
      console.log('Template ID:', results[0].id);
      console.log('Title:', results[0].title);
      console.log('Pose Data Type:', typeof results[0].pose_data);
      if (typeof results[0].pose_data === 'string') {
        console.log('Pose Data (String):', results[0].pose_data.substring(0, 500) + '...');
      } else {
        console.log('Pose Data (Object):', JSON.stringify(results[0].pose_data, null, 2).substring(0, 500) + '...');
      }
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

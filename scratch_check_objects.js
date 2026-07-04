import 'dotenv/config';
import sequelize from './src/db/index.js';

async function check() {
  try {
    const [results] = await sequelize.query('SELECT id, title, pose_data FROM posecraft_template LIMIT 1');
    if (results.length > 0) {
      let data = results[0].pose_data;
      if (typeof data === 'string') data = JSON.parse(data);
      
      const objects = data.fabricData?.objects || [];
      console.log('Total objects:', objects.length);
      console.log('Object types:', objects.map(o => o.type));
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

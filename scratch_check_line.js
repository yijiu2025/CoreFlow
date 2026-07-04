import 'dotenv/config';
import sequelize from './src/db/index.js';

async function check() {
  try {
    const [results] = await sequelize.query('SELECT id, title, pose_data FROM posecraft_template LIMIT 1');
    if (results.length > 0) {
      let data = results[0].pose_data;
      if (typeof data === 'string') data = JSON.parse(data);
      
      const objects = data.fabricData?.objects || [];
      const line = objects.find(o => o.type === 'line');
      if (line) {
        console.log('First line object:', JSON.stringify(line, null, 2));
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
}

check();

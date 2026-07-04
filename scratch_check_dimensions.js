import 'dotenv/config';
import sequelize from './src/db/index.js';

async function check() {
  try {
    const [results] = await sequelize.query('SELECT id, title, pose_data FROM posecraft_template LIMIT 1');
    if (results.length > 0) {
      let data = results[0].pose_data;
      if (typeof data === 'string') data = JSON.parse(data);
      console.log('fabricData Width:', data.fabricData?.width);
      console.log('fabricData Height:', data.fabricData?.height);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
}

check();

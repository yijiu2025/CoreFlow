import axios from 'axios';

async function test() {
  try {
    const res = await axios.get('http://localhost:3000/posecraft/v1/templates/1');
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error(err.response?.data || err.message);
  }
}

test();

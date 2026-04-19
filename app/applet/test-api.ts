import axios from 'axios';

async function test() {
  try {
    const res = await axios.post('http://localhost:3000/api/analyze-name', {
      surname: "鄭",
      char1: "楷",
      char2: "安",
      stats1: {},
      stats2: {},
      contextData: [],
      userWish: "",
      excludeData: { excludedNames: [] }
    });
    console.log("SUCCESS:", res.data);
  } catch (err: any) {
    console.error("ERROR:", err.response?.data || err.message);
  }
}

test();

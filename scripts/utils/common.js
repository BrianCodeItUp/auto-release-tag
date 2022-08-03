const fs = require('fs').promises;

/**
 * 取得並 parse JSON
 * @param {string} json 檔路徑 
 * @returns {object}
 */
 async function getJSONData(path) {
  const json = await fs.readFile(path);
  const data = JSON.parse(json);
  return data;
}

module.exports = {
  getJSONData
}
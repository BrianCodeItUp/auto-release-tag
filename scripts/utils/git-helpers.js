const { log, colorWrapper } = require('./logger');
const exec = require('./exec')

/**
 * 確認該 branch 與 Remote branch 是否為同步的狀態
 * @param {string} branch 分支名稱
 */
 function checkBranchIsInSync (branch) {
  log.normal(`----> Checking ${colorWrapper('green', `"${branch}"`)} branch is in sync with remote branch...`)
  const diffMessage = exec(`git diff ${branch} origin/${branch}`);
  
  if (diffMessage) {
    log.error(`Found branch "${branch}" is not in sync with remote branch 😭`)
    throw Error(); 
  }
}

module.exports = {
  checkBranchIsInSync
}
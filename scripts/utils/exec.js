const shell = require('shelljs');
const { log } = require('./logger')

/**
 * 執行指令
 * @param {string} cmd terminal command
 */
function exec (cmd, { printExecutingCmd } = { printExecutingCmd: false }) {
  printExecutingCmd && log.normal(`Executing Command: ${cmd}`)
  const { code, stderr, stdout } = shell.exec(cmd)
  if (code !== 0)  {
    log.error(`Command: ${cmd} --> executed failed`, '\n', `Error: ${stderr}`)
    shell.exit(1);
  }

  printExecutingCmd && log.success(`Command: ${cmd} --> executed successfully`)
  return stdout
}

module.exports = exec;
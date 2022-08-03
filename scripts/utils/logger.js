const colors = require('chalk');

/**
 * 將要印出的訊息加上顏色
 * @param {string} color 印出的顏色;
 * @param {string | string[]} msg 訊息
 * @returns {string[]}
 */
 function colorWrapper (color, msg) {
  const newMsg = [];
  const addColor =  colors.bold[color];
  if (Array.isArray(msg)) {
    msg.forEach(value => {
      newMsg.push(addColor(value))
    })
    return newMsg;
  }

  return [addColor(msg)]
}

const log = {
  normal: (...msg) => console.log(...colorWrapper('blue', msg)),
  error: (...msg) => console.log(...colorWrapper('red', msg)),
  success: (...msg) => console.log(...colorWrapper('green', msg))
}

module.exports = {
  colorWrapper,
  log
}
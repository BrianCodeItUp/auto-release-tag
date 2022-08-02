const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const argv = yargs(hideBin(process.argv)).argv;
const path = require('path');
const fs = require('fs').promises;
// const { exec: execBase } = require('child_process');
const colors = require('chalk')
const shell = require('shelljs')

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

/**
 * 更新版號
 * 
 * NOTE: 
 * - 更新 major 時 minor 和 patch 版好歸零
 * - 更新 minor 時 patch 版號歸零
 * @param {string} currentVersion 當前版本
 * @param {string} releaseType 版本更新類型 ex: major | minor | patch
 * @returns {string} 更新過的版號
 */
function updateReleaseVersion(currentVersion, releaseType) {
    const RELEASE_TYPES = ['major', 'minor', 'patch'];
    const isReleaseTypeValid = RELEASE_TYPES.includes(releaseType);
    if (!isReleaseTypeValid) {
        throw Error('Release type should be major|minor|patch');
    }

    const isCurrentVersionValid = /\d.\d.\d/.test(currentVersion);
    if (!isCurrentVersionValid) {
        throw Error('Current Version format is not valid. It should be x.x.x');
    }

    const versionArr = currentVersion.split('.').map((str) => Number(str));
    const versionMap = {
        major: versionArr[0],
        minor: versionArr[1],
        patch: versionArr[2],
    };

    if (releaseType === 'patch') {
        const newPatchVersion = versionMap.patch + 1;
        return `${versionMap.major}.${versionMap.minor}.${newPatchVersion}`;
    }

    if (releaseType === 'minor') {
        const newMinorVersion = versionMap.minor + 1;
        return `${versionMap.major}.${newMinorVersion}.0`;
    }

    if (releaseType === 'major') {
        const newMajorVersion = versionMap.major + 1;
        return `${newMajorVersion}.0.0`;
    }
}

/**
 * 更新目前 AppVersion.json 檔中的各品牌版本
 */
async function updateAppVersion ({appVersion, releaseType, versionFilePath}) {
  const newAppVersion = {};
  for (let brand of Object.keys(appVersion)) {
      const currentVersion = appVersion[brand];
      const newVersion = updateReleaseVersion(currentVersion, releaseType);
      newAppVersion[brand] = newVersion;
  }

  await fs.writeFile(versionFilePath, JSON.stringify(newAppVersion, null, 2));
  exec('git add src/config/AppVersion.json');
  exec('git commit -m "chore: release new version"');
  exec('git push')
  return newAppVersion;
}

/**
 * 更新 branch
 * - uat: commit 更新的 AppVersion.json file
 * - stage: merge uat
 * - prod: merge prod
 */
async function updateBranch (env) {
  log.normal('Updating Branch')
  
  /** 同步 local 與 remote 分支 */
  exec(`git diff ${env} origin/${env}`, { printExecutingCmd: true })

  if (env === 'uat') {
    exec('git checkout uat');
    exec('git merge dev');
    exec('git push');
    return;
  }

  if (env === 'stage') {
    exec('git checkout stage');
    exec('git merge uat');
    exec('git push');
    return;
  }

  if (env === 'prod') {
    exec('git checkout prod');
    exec('git merge stage')
    exec('git push');
    return;
  }
}

/**
 * 創建且 push 各品牌 release tag
 */
async function createAndPushTags({ appVersion, env }) {
  for (let brand of Object.keys(appVersion)) {
    const currentVersion = appVersion[brand];
    const tag = `${env}-${brand}-${currentVersion}-jsbundle`;
    exec(`git tag ${tag}`); 
    exec(`git push origin ${tag}`);
  }
}

/**
 * 主邏輯:
 * 
 * uat: 更新 AppVersion.json，依照 AppVersion.json 檔中的版本，創建、push tags
 * stage: merge uat branch, 依照 AppVersion.json 檔中的版本，創建、push tags
 * prod: merge stage branch, 依照 AppVersion.json 檔中的版本，創建、push tags
 */
async function main() {
    const appVersionFilePath = path.join(process.cwd(), 'src', 'config', 'appVersion.json');
    const { type = '', env ='' } = argv
    const isReleaseTypeValid = ['major', 'minor', 'patch'].includes(type);

    const isEnvValid = ['prod', 'stage', 'uat', 'dev'].includes(env);

    if (env === 'uat' && !isReleaseTypeValid) {
        log.error('If you are trying to release uat. You must provide release type')
        throw Error(colorWrapper('red', 'Release Type is invalid. Please use \n\n"yarn release --env {uat|stage|prod} --type {major|minor|patch}" \n'));
    }

    if (!isEnvValid) {
      throw Error('No Env Type is invalid. Please use \n\n"yarn release --env {uat|stage|prod} --type {major|minor|patch}" \n')
    }

    try {
      let appVersion = await getJSONData(appVersionFilePath);
      /** 更新 branch */
      await updateBranch(env);

      /** uat 更新版號需要更新版號 */
      // if (env === 'uat') {
      //   appVersion = await updateAppVersion({ appVersion, releaseType: type, versionFilePath : appVersionFilePath });
      // }

      // await createAndPushTags({ appVersion, env });
    } catch (e) {
        log.error(e);
    }
}

main();

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

function exec (cmd) {
  log.normal(`Executing Command: ${cmd}`)
  const { code, stderr } = shell.exec(cmd)
  if (code !== 0)  {
    log.error(`Command: ${cmd} executed failed`, stderr)
    shell.exit(1);
  }

  log.success(`Command: ${cmd} executed successfully`)
}

async function getJSONData(path) {
    const json = await fs.readFile(path);
    const data = JSON.parse(json);
    return data;
}

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

async function updateAppVersion ({appVersion, releaseType, versionFilePath}) {
  const newAppVersion = {};
  for (let brand of Object.keys(appVersion)) {
      const currentVersion = appVersion[brand];
      const newVersion = updateReleaseVersion(currentVersion, releaseType);
      newAppVersion[brand] = newVersion;
  }

  await fs.writeFile(versionFilePath, JSON.stringify(newAppVersion, null, 2));
  return newAppVersion;
}


// async function createReleaseTag () {

// }

async function updateBranch (env) {
  if (env === 'uat') {
    exec('git add src/config/AppVersion.json');
    exec('git commit -m "chore: release new version"');
  }
}

async function main() {
    const appVersionFilePath = path.join(process.cwd(), 'src', 'config', 'appVersion.json');
    const { type = '', env ='' } = argv
    const isReleaseTypeValid = ['major', 'minor', 'patch'].includes(type);

    const isEnvValid = ['prod', 'stage', 'uat'].includes(env);

    if (!isReleaseTypeValid) {
        throw Error('Release Type is invalid. Please use \n\n"yarn release --type {major|minor|patch} --env {uat|stage|prod}" \n');
    }

    if (!isEnvValid) {
      throw Error('No Env Type is invalid. Please use \n\n"yarn release --type {major|minor|patch} --env {uat|stage|prod}" \n')
    }

    try {
      let appVersion = await getJSONData(appVersionFilePath);
      
      if (env === 'uat') {
        appVersion = await updateAppVersion({ appVersion, releaseType: type, versionFilePath : appVersionFilePath });
      }
      
      await updateBranch(env)
    
        
      
    } catch (e) {
        log.error(e);
    }
}

main();

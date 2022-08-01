const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const argv = yargs(hideBin(process.argv)).argv;
const path = require('path');
const fs = require('fs').promises;
const { exec: execBase } = require('child_process')


function exec (cmd) {
  return new Promise((resolve, reject) => {
    execBase(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }

      if (stderr) {
        reject(stderr)
        return;
      }
      if (stdout) {
        resolve(stdout);
        return;
      }
    })
  })
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
    await exec('git add src/config/AppVersion.json');
    await exec('git commit -m "chore: release new version"');
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
        console.error(e);
    }
}

main();

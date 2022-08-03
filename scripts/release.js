const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const argv = yargs(hideBin(process.argv)).argv;
const path = require('path');
const fs = require('fs').promises;
const { log, colorWrapper } = require('./utils/logger')
const { checkBranchIsInSync } = require('./utils/git-helpers')
const exec = require('./utils/exec')
const { getJSONData } = require('./utils/common')

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
  log.normal("Updating App Version...")
  const newAppVersion = {};
  for (let brand of Object.keys(appVersion)) {
      /** Skip aa */
      if (brand === 'aa') {
        continue;
      }
      const currentVersion = appVersion[brand];
      const newVersion = updateReleaseVersion(currentVersion, releaseType);
      newAppVersion[brand] = newVersion;
  }
  log.normal("----> Update AppVersion.json file...")
  await fs.writeFile(versionFilePath, JSON.stringify(newAppVersion, null, 2));
  log.normal("----> Add Release Commit...")
  exec('git add src/config/AppVersion.json');
  exec('git commit -m "chore: release new version"');
  exec('git push');
  log.success("Update App Version successfully 👍")
  return newAppVersion;
}

/**
 * 更新 branch
 * - uat: commit 更新的 AppVersion.json file
 * - stage: merge uat
 * - prod: merge prod
 */
async function updateBranch (env) {
  log.normal('Updating Branch...')
  
  const branchToMergeByEnv = {
    /** uat 要 merge dev 分支 */
    "uat": "dev",
    /** stage 要 merge uat 分支 */
    "stage": "uat",
    /** prod 要 merge stage 分支 */
    "prod": "stage"
  }
  const branchToMerge = branchToMergeByEnv[env]
  log.normal(`Merge ${colorWrapper('green', branchToMerge)} into ${colorWrapper('green', env)}`)
  /** 確認這次 Release 分支是否已與 remote 同步 */
  checkBranchIsInSync(env)
  /** 確認要 Merge 的分支是否已與 remote 同步 */
  checkBranchIsInSync(branchToMerge)

  log.normal('----> Start Merging branch...');
  exec(`git merge ${branchToMerge}`);
  exec('git push');
  log.success('Updating Branch successfully 👍')
}

/**
 * 創建且 push 各品牌 release tag
 */
async function createAndPushTags({ appVersion, env }) {
  log.normal('Create and Push release tags...')
  for (let brand of Object.keys(appVersion)) {
    /** Skip aa */
    if (brand === 'aa') {
      continue;
    }
    const currentVersion = appVersion[brand];
    const tag = `${env}-${brand}-${currentVersion}-jsbundle`;
    exec(`git tag ${tag}`); 
    exec(`git push origin ${tag}`);
  }
  log.success('Create and Push release tags successfully 👍')
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
    const isReleaseTypeValid = ['major', 'minor', 'patch', ''].includes(type);

    const isEnvValid = ['prod', 'stage', 'uat', 'dev'].includes(env);

    if (env === 'uat' && !isReleaseTypeValid) {
        log.error('If you are trying to release uat. You must provide release type')
        throw Error(colorWrapper('red', 'Release Type is invalid. Please use \n\n"yarn release --env {uat|stage|prod} --type {major|minor|patch}" \n'));
    }

    if (!isEnvValid) {
      throw Error('No Env Type is invalid. Please use \n\n"yarn release --env {uat|stage|prod} --type {major|minor|patch}" \n')
    }

    try {
      /** 需要先切換到要 release 的分支，因為 dev 不會壓版號 */
      exec(`git checkout ${env}`);
      let appVersion = await getJSONData(appVersionFilePath);
      /** 更新 branch */
      await updateBranch(env);

      /** uat 更新版號需要更新版號 */
      if (env === 'uat') {
        appVersion = await updateAppVersion({ appVersion, releaseType: type, versionFilePath : appVersionFilePath });
      }

      await createAndPushTags({ appVersion, env });
      log.success("\nRelease Version:", `\n\n${JSON.stringify(appVersion, null, 1)}`, "\n");
      log.success("Release version update successfully 🚀🚀🚀  \nCheck the gitlab CI pipeline on https://gitlab.paradise-soft.com.tw/nativeapp/ttmj-rn/-/pipelines");
    } catch (e) {
        log.error(e);
    }
}

main();

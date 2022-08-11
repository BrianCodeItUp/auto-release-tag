const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const path = require('path');
const fs = require('fs').promises;
const { log, colorWrapper } = require('./utils/logger');
const { checkBranchIsInSync } = require('./utils/git-helpers');
const exec = require('./utils/exec');

const argv = yargs(hideBin(process.argv)).argv;

/**
 * 更新版號
 *
 * NOTE:
 * - 更新 major 時 minor 和 patch 版號歸零
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
 *
 * @param {object}   appVersion  各品牌版本  ex: { ttmj: '7.3.11', 'tz': '0.4.1' }
 * @param {string}   releaseType 升版類型    ex: major | minor | patch
 * @param {string[]} brands      要升版的品牌 ex: ['3h', 'ttmj']
 */
async function updateAppVersion({ appVersion, releaseType, brands = [] }) {
    log.normal('Updating App Version...');
    const newAppVersion = {};
    for (let brand of Object.keys(appVersion)) {
        const currentVersion = appVersion[brand];

        const brandNameToCheck = brand === 'threeh' ? '3h' : brand;
        /** 若有給品牌參數，檢核是否為參數中的品牌，不是的話就使用原版本 */
        if (brands.length > 0 && !brands.includes(brandNameToCheck)) {
            newAppVersion[brand] = currentVersion;
            continue;
        }

        const newVersion = updateReleaseVersion(currentVersion, releaseType);
        newAppVersion[brand] = newVersion;
    }
    log.normal('----> Update AppVersion.json file...');
    const versionFilePath = path.join(process.cwd(), 'src', 'config', 'appVersion.json');
    await fs.writeFile(versionFilePath, JSON.stringify(newAppVersion, null, 2));
    log.normal('----> Add Release Commit...');
    exec('git add src/config/AppVersion.json');
    exec('git commit -m "chore: release new version"');
    exec('git push');
    log.success('Update App Version successfully 👍');
    return newAppVersion;
}

/**
 * 更新 branch
 * - uat: commit 更新的 AppVersion.json file
 * - stage: merge uat
 * - prod: merge prod
 */
async function updateBranch(env) {
    log.normal('Updating Branch...');

    const branchToMergeByEnv = {
        /** uat 要 merge dev 分支 */
        uat: 'dev',
        /** stage 要 merge uat 分支 */
        stage: 'uat',
        /** prod 要 merge stage 分支 */
        prod: 'stage',
    };
    const branchToMerge = branchToMergeByEnv[env];
    log.normal(`Merge ${colorWrapper('green', branchToMerge)} into ${colorWrapper('green', env)}`);
    /** 確認這次 Release 分支是否已與 remote 同步 */
    checkBranchIsInSync(env);
    /** 確認要 Merge 的分支是否已與 remote 同步 */
    checkBranchIsInSync(branchToMerge);

    log.normal('----> Start Merging branch...');
    exec(`git merge ${branchToMerge}`);
    exec('git push');
    log.success('Updating Branch successfully 👍');
}

/**
 * 創建且 push 各品牌 release tag
 * @param {object} appVersion 品牌版本 ex: { 3h: 'x.x.x', ttmj: 'x.x.x' }
 * @param {string} env        release 環境  ex: uat | stage | prod
 * @param {string} brands     指定發版品牌, 若為空則全發 ex: 'ttmj,3h,cdd,tyc'
 */
async function createAndPushTags({ appVersion, env, brands }) {
    log.normal('Create and Push release tags...');

    for (let brand of Object.keys(appVersion)) {
        const currentVersion = appVersion[brand];
        if (brand === 'threeh') {
            brand = '3h';
        }

        /** 若有給品牌參數，檢核是否為參數中的品牌，不是的話就略過 */
        if (brands.length > 0 && !brands.includes(brand)) {
            continue;
        }
        const tag = `${env}-${brand}-${currentVersion}-jsbundle`;
        exec(`git tag ${tag}`, { silent: false });
        exec(`git push origin ${tag}`);
    }
    log.success('Create and Push release tags successfully 👍');
}

/**
 * 主邏輯:
 *
 * uat: 更新 AppVersion.json，依照 AppVersion.json 檔中的版本，創建、push tags
 * stage: merge uat branch, 依照 AppVersion.json 檔中的版本，創建、push tags
 * prod: merge stage branch, 依照 AppVersion.json 檔中的版本，創建、push tags
 */
async function main(appVersion) {
    const { type = '', env = '', brand = '' } = argv;
    const isReleaseTypeValid = ['major', 'minor', 'patch'].includes(type);

    const isEnvValid = ['prod', 'stage', 'uat'].includes(env);

    if (env === 'uat' && !isReleaseTypeValid) {
        log.error('If you are trying to release uat. You must provide release type');
        throw Error(
            colorWrapper(
                'red',
                'Release Type is invalid. Please use \n\n"yarn release --env {uat|stage|prod} --type {major|minor|patch}" \n',
            ),
        );
    }

    if (!isEnvValid) {
        throw Error(
            'Env Type is invalid. Please use \n\n"yarn release --env {uat|stage|prod} --type {major|minor|patch}" \n',
        );
    }

    try {
        /** 需要先切換到要 release 的分支，因為 dev 不會壓版號 */
        exec(`git checkout ${env}`);
        const brandsToPublish = brand ? brand.split(',').map((str) => str.trim()) : [];
        const availableBrands = Object.keys(appVersion).map((brandName) => (brandName === 'threeh' ? '3h' : brandName));
        /** 如果有品牌參數，檢核品牌參數是否正確 */
        if (brandsToPublish.length > 0) {
            brandsToPublish.forEach((brandToPublish) => {
                const isBrandExist = availableBrands.includes(brandToPublish);
                if (!isBrandExist) {
                    throw Error(
                        `Brand "${brandToPublish}" is not exist in AppVersion.json. Available brands: ${availableBrands.join(
                            ' | ',
                        )}`,
                    );
                }
            });
        }

        /** 更新 branch */
        await updateBranch(env);

        /** 在 uat 發版時需要更新 release 版本*/
        if (env === 'uat') {
            await updateAppVersion({ appVersion, releaseType: type, brands: brandsToPublish });
        }

        delete require.cache[require.resolve('../src/config/AppVersion.json')];
        const newAppVersion = require('../src/config/AppVersion.json');
        await createAndPushTags({ appVersion: newAppVersion, env, brands: brandsToPublish });
        log.success('\nRelease Version:', `\n\n${JSON.stringify(newAppVersion, null, 1)}`, '\n');
        log.success(
            'Release version update successfully 🚀🚀🚀  \nCheck the gitlab CI pipeline on https://gitlab.paradise-soft.com.tw/nativeapp/ttmj-rn/-/pipelines',
        );
    } catch (e) {
        log.error(e);
    }
}

const appVersion = require('../src/config/AppVersion.json');
main(appVersion);

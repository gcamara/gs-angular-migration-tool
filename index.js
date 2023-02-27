'use strict';
const { exit } = require('process');
let { execSync } = require("child_process");
const fs = require('fs');

let toVersion = 12;
let verbose = false;
let startAfterInstall = false;

const importedSync = execSync;
execSync = async (command) => {
    if (verbose) {
        const ret = await importedSync(command, { stdio: 'inherit' });
        return ret;
    } else {
        await importedSync(command);
    }
}

function initLogger() {
    const log = (color, message) => {
        const colorString = `\x1b[${color}m%s\x1b[0m`;
        console.log(colorString, `[GS] - ${message.join(' ')}`);
    }

    return {
        error: (...msg) => log('31', msg),
        debug: (...msg) => log('33', msg),
        info: (...msg) => log('34', msg),
        success: (...msg) => log('32', msg)
    }
}

const log = initLogger();

function getClearVersion(dependency) {
    return dependency.replace('^', '').split('.')[0];
}

function getAngularDependencies(file) {
    const { dependencies, devDependencies } = JSON.parse(String(file));

    const basicAngularDeps = ['cli', 'core', 'cdk'];
    let angularDependenciesVersions = { };

    basicAngularDeps.forEach(dependency => {
        const name = `@angular/${dependency}`;
        const clearVersion =  getClearVersion((dependencies[name] || devDependencies[name]));
        angularDependenciesVersions = {
            ...angularDependenciesVersions,
            [name]: clearVersion
        };
    });

    return angularDependenciesVersions;
}

const extractTokens = () => {
    log.debug('Extracting options...');
    let options = [];

    process.argv.forEach(function (val, index, array) {
        if (val.indexOf('--to-version') > -1) {
            try {
                toVersion = Number(val.split('=')[1]);
            } catch (err) {
                toVersion = 12;
            }
        }
        
        verbose = verbose || val.indexOf('--verbose') > -1;
        startAfterInstall = startAfterInstall || val.indexOf('--start-after-install') > -1;
    });

    options.push(`--verbose=${verbose}`);
    options.push(`--to-version=${toVersion}`);
    options.push(`--start-after-install=${startAfterInstall}`);

    log.debug('Extracted options ', options.join(' '));
}

async function updatePrimeNG() {
    log.debug('Upgrading PrimeNG to', toVersion);
    const primeNgCmd = `npm i primeng@${toVersion} --force`;
    log.debug('Running', primeNgCmd);

    try {
        execSync(primeNgCmd);
        checkFilesToCommit();
    } catch (err) {
        log.error('Error while upgrading primeng', err);
    }
}

const start = async () => {
    log.debug('Upgrading Angular');
    extractTokens();

    try {
        const packageFile = fs.readFileSync(`./package.json`);
        const versions = getAngularDependencies(packageFile); 
        await updateAngularDependencies(versions);
        log.success('Angular upgraded to', toVersion);
        checkFilesToCommit();
        updatePrimeNG();

        if (startAfterInstall) {
            log.debug('Starting application...');
            execSync('npm start');
            log.success('Application started');
        } else {
            log.success('Upgrade finished.');
            exit(0);
        }

    } catch (err) {
        log.error('Error running upgrade', err);
        exit(err.code);
    }
}

function getBranchName() {
    return `team/ux/angular-v${toVersion}`;
}

async function checkFilesToCommit() {
    log.info('Checking if repo is empty...');
    execSync(`git checkout ${getBranchName()}`);

    const res = execSync(`git status --porcelain`);
    if (res && String(res)?.trim().length) {
        const verbBefore = verbose;
        log.debug('Repo is not empty, committing changes');
        verbose = false;
        execSync(`git add .`);
        execSync(`git commit -m "Angular v${toVersion} - Migration"`);
        log.success('Changes committed.');
        verbose = verbBefore;
    } else {
        log.success('Repo is empty, moving forward', res);
    }
}

function installPeerDependencies() {
    log.debug('Installing peer dependencies...');
    execSync('npm i --legacy-peer-deps');
    log.success('Peer deps updated.');
}

async function updateAngularDependencies(dependencies) {
    log.info(`Creating ${getBranchName()} branch`);

    try {
        execSync(`git checkout -b ${getBranchName()}`);
    } catch (err) {
        log.info('Branch already exists... moving forward');
        execSync(`git checkout ${getBranchName()}`);
    }

    installPeerDependencies();
    checkFilesToCommit();

    return new Promise(resolve => {
        const keys = Object.keys(dependencies);
        keys.forEach(dep => updateDependency(dependencies, dep));
        
        const onLastVersion = keys.filter(dep => {
            const version = dependencies[dep];
            return version === toVersion;
        }).length;


        log.debug(onLastVersion, 'dependencies updated to', toVersion);
        if (onLastVersion < keys.length) {
            resolve(updateAngularDependencies(dependencies));
        } else {
            resolve();
        }
    });
}

function updateDependency(dependencies, dependency) {
    const version = Number(dependencies[dependency]);
    log.info('Reading dependency', dependency, '-- Current version:', version, `${version === toVersion ? '--- Already updated. Skipping...' : ''}`);

    if (version + 1 <= toVersion) {
        const ngForceCommand = `ng update --force ${dependency}@${version+1}`;
        log.debug('Updating', dependency, 'to', version + 1);
        log.debug('Running', ngForceCommand);
        execSync(ngForceCommand);
        log.success('Success updating ', dependency, 'to', version + 1);
        
        installPeerDependencies();
        log.debug('Commiting changes...');
        execSync(`git add .`);
        try {
            execSync(`git commit -m "Angular v${toVersion} - Upgrading ${dependency} to ${version + 1}"`);
        } catch (err) { }
        log.success('Changes commited successfully.');
        dependencies[dependency] = version+1;
    }
}

start();
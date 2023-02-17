'use strict';
const { exit } = require('process');
let { execSync } = require("child_process");
const fs = require('fs');

let toVersion = 12;
let verbose = false;

const importedSync = execSync;
execSync = (command) => {
    importedSync(command, verbose ? { stdio: [0, 1, 2] } : null);
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

function getAngularDependencies(file) {
    const { dependencies, devDependencies } = JSON.parse(String(file));

    const basicAngularDeps = ['cli', 'core', 'cdk'];
    let angularDependenciesVersions = { };

    basicAngularDeps.forEach(dependency => {
        const name = `@angular/${dependency}`;
        const clearVersion =  (dependencies[name] || devDependencies[name]).replace('^', '').split('.')[0];
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
        
        if (val.indexOf('--verbose') > -1) {
            try {
                verbose = Boolean(val.split('=')[1]);
            } catch (err) {
                verbose = false;
            }
        }
    });

    options.push(`--verbose=${verbose}`);
    options.push(`--to-version=${toVersion}`);

    log.debug('Extracted options ', options.join(' '));
}

function updatePrimeNG() {
    log.debug('Upgrading PrimeNG to', toVersion);
    const primeNgCmd = `npm i primeng@${toVersion}`;
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
        exit(0);

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

    const res = String(execSync(`git status --porcelain`));
    if (res?.trim().length) {
        const verbBefore = verbose;
        log.debug('Repo is not empty, committing changes');
        verbose = false;
        execSync(`git add .`);
        execSync(`git commit -m "Angular v${toVersion} - Migration"`);
        log.success('Changes committed.');
        verbose = verbBefore;
    } else {
        log.success('Repo is empty, moving forward');
    }
}

async function updateAngularDependencies(dependencies) {
    log.info(`Creating ${getBranchName()} branch`);

    try {
        execSync(`git checkout -b ${getBranchName()}`);
    } catch (err) {
        log.info('Branch already exists... moving forward');
    }

    checkFilesToCommit();

    return new Promise(resolve => {
        let onLastVersion = 0;
        Object.keys(dependencies).forEach((dependency) => {
            const version = Number(dependencies[dependency]);
            log.info('Reading dependency', dependency, '-- Current version:', version);
    
            if (version + 1 <= toVersion) {
                const ngForceCommand = `ng update --force ${dependency}@${version+1}`;
                log.debug('Updating', dependency, 'to', version + 1);
                log.debug('Running', ngForceCommand);
                execSync(ngForceCommand);
                log.success('Success updating ', dependency, 'to', version + 1);
                
                log.debug('Commiting changes...');
                execSync(`git add .`);
                execSync(`git commit -m "Angular v${toVersion} - Upgrading ${dependency} to ${version + 1}"`);
                log.success('Changes commited successfully.');
            }

            if (version === toVersion) {
                onLastVersion++;
            }
        });
    
        if (onLastVersion < 3) {
            resolve(updateAngularDependencies(dependencies));
        }
    });
}

start();
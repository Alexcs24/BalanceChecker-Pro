require('dotenv').config();
const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs').promises;
const config = require('./config');
const { numWorkers, addressToCheck, blockchains, maxRetries, retryDelay, networkErrorRetryDelay, concurrencyLimit, minBalance } = config;

const apiKeys = {};
let totalKeysPerFile = 0;
let totalChecked = 0, totalNonZero = 0;
let totalErrors = 0;

async function loadApiKeysFromEnvFile(envFileName) {
    const envContent = await fs.readFile(path.join(__dirname, envFileName), 'utf8');
    return envContent.split('\n')
        .filter(line => line.trim() && !line.startsWith('#') && line.includes('ALCHEMY_API_KEY_'))
        .map(line => line.split('=')[1].trim());
}

async function initializeApiKeys() {
    await Promise.all(Object.keys(blockchains).map(async blockchain => {
        const keys = await loadApiKeysFromEnvFile(`./API_Keys/${blockchain}.env`);
        apiKeys[blockchain] = keys;
        totalKeysPerFile = Math.max(totalKeysPerFile, keys.length);
    }));
}

console.log(`Address to check: ${addressToCheck}`);

class WorkerPool {
    constructor(numWorkers) {
        this.workers = Array.from({ length: numWorkers }, (_, i) => this.createWorker(i));
        this.freeWorkers = [...this.workers];
        this.tasks = [];
    }

    createWorker(index) {
        const worker = new Worker(path.join(__dirname, 'worker.js'));
        worker.on('message', message => this.onMessage(worker, message));
        worker.on('error', err => this.onError(worker, err));
        worker.on('exit', code => this.onExit(worker, code, index));
        return worker;
    }

    onMessage(worker, message) {
        if (message.type === 'walletCheckResult') {
            totalChecked += Number(message.totalChecked);
            totalNonZero += Number(message.totalNonZero);
        } else if (message.type === 'error') {
            totalErrors += 1;
        }
        this.freeWorkers.push(worker);
        this.runNextTask();
    }

    onError(worker, err) {
        console.error(`Worker error: ${err}`);
        this.freeWorkers.push(worker);
        this.runNextTask();
    }

    onExit(worker, code, index) {
        console.log(`Worker exited with code ${code}`);
        this.workers[index] = this.createWorker(index);
        this.runNextTask();
    }

    runNextTask() {
        if (this.freeWorkers.length && this.tasks.length) {
            const worker = this.freeWorkers.pop();
            worker.postMessage(this.tasks.shift());
        }
    }

    addTask(task) {
        this.tasks.push(task);
        this.runNextTask();
    }
}

async function main() {
    await initializeApiKeys();

    const keysPerTypePerWorker = Math.floor(totalKeysPerFile / numWorkers);
    const pool = new WorkerPool(numWorkers);

    for (let i = 0; i < numWorkers; i++) {
        const workerApiKeys = {};
        Object.keys(apiKeys).forEach(blockchain => {
            const start = i * keysPerTypePerWorker;
            workerApiKeys[blockchain] = apiKeys[blockchain].slice(start, start + keysPerTypePerWorker);
        });

        pool.addTask({ blockchains, apiKeys: workerApiKeys, address: addressToCheck, maxRetries, retryDelay, networkErrorRetryDelay, concurrencyLimit, minBalance });
    }

    (async () => {
        const { default: logUpdate } = await import('log-update');
        const { default: chalk } = await import('chalk');
        const { default: boxen } = await import('boxen');

        console.clear();
        let lastCheckedCount = 0;

        function displayStats() {
            const checkedThisSecond = totalChecked - lastCheckedCount;
            const formattedLines = [
                chalk.blue(`Score: ${chalk.bold(checkedThisSecond.toLocaleString('en-US'))}`),
                chalk.green(`Result: ${chalk.bold(totalNonZero.toLocaleString('en-US'))}`),
                chalk.magenta(`Blockchains: ${chalk.bold(Object.keys(blockchains).length)}`),
                chalk.yellow(`Workers: ${chalk.bold(numWorkers)}`),
                chalk.cyan(`Keys per worker: ${chalk.bold(keysPerTypePerWorker * Object.keys(blockchains).length)}`),
                chalk.red(`Errors: ${chalk.bold(totalErrors)}`)
            ];

            logUpdate(boxen(formattedLines.join('\n'), {
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'blue',
                align: 'left'
            }));
            lastCheckedCount = totalChecked;
        }

        setInterval(displayStats, 1000);
    })();
}

main();

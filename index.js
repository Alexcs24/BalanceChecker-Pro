require('dotenv').config();
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');

function loadApiKeysFromEnvFile(envFileName) {
    const envPath = path.join(__dirname, envFileName);
    const envContent = fs.readFileSync(envPath, 'utf8');
    return envContent.split('\n').filter(line => {
        return line.trim() !== '' && !line.trim().startsWith('#') && line.includes('ALCHEMY_API_KEY_');
    }).map(line => line.split('=')[1].trim());
}

const ethereumApiKeys = loadApiKeysFromEnvFile('ethereum.env');
const arbitrumApiKeys = loadApiKeysFromEnvFile('arbitrum.env');
const polygonzkVMApiKeys = loadApiKeysFromEnvFile('polygon.env');

let totalChecked = 0;
let totalNonZero = 0;
let lastCheckedCount = 0;
let lastFiveAddresses = [];

const numWorkers = 20;
const keysPerTypePerWorker = 3;

for (let i = 0; i < numWorkers; i++) {
    setTimeout(() => {
        const worker = fork(path.join(__dirname, 'worker.js'));

        const startIndex = i * keysPerTypePerWorker;
        const endIndex = startIndex + keysPerTypePerWorker;

        const workerApiKeys = {
            ethereum: ethereumApiKeys.slice(startIndex, endIndex),
            arbitrum: arbitrumApiKeys.slice(startIndex, endIndex),
            polygonZKVM: polygonzkVMApiKeys.slice(startIndex, endIndex),
        };

        worker.send({ apiKeys: workerApiKeys });

        worker.on('message', (message) => {
            if (message.type === 'walletCheckResult') {
                totalChecked += Number(message.totalChecked);
                totalNonZero += Number(message.totalNonZero);

                const { address, ethEmpty, tokensEmpty } = message;
                lastFiveAddresses.push({ address, ethEmpty, tokensEmpty });
                if (lastFiveAddresses.length > 56) {
                    lastFiveAddresses.shift();
                }
            }
        });

        worker.on('exit', (code) => {
            console.log(`Worker exited with code ${code}`);
        });
    }, i * 100);
}

(async () => {
    const logUpdate = (await import('log-update')).default;
    console.clear();

    function displayStats() {
        const terminalWidth = process.stdout.columns;
        const lines = [
            `\n                           Score: ${(totalChecked - lastCheckedCount).toLocaleString('ru-RU')} Result: ${totalNonZero.toLocaleString('ru-RU')}\n`,
        ];

        lastFiveAddresses.forEach((addr, index) => {
            if (index % 2 === 0 && index !== 0) lines.push('');
            lines[lines.length - 1] += `   \x1b[32m${addr.address}\x1b[0m `;
        });

        const centeredLines = lines.map(line => {
            const spaces = Math.max(Math.floor((terminalWidth - line.length) / 2), 0);
            return ' '.repeat(spaces) + line;
        });

        logUpdate(centeredLines.join('\n'));
        lastCheckedCount = totalChecked;
    }

    setInterval(displayStats, 1000);
})();

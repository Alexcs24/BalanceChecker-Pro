require('dotenv').config();
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');


//                             {START: ALL SETTINGS HERE }

// Total number of child processes to spawn
const numWorkers = 20;

/*
 * Currently, each isolated worker is assigned 32 API keys, distributed as 8 keys for each of the 4 blockchains.
 * With 20 workers, as specified in the code, the total number of API keys used amounts to 32 multiplied by 20, equaling 640 API keys.
 * To determine the number of API keys required per blockchain in your .env files, divide this total by 4 (the number of blockchains),
 * resulting in 160 API keys per blockchain. Therefore, each .env file for the different blockchains should contain this number of keys.
 * In the future, I plan to automate this complex manual calculation, but for now, calculations must be done manually.
 */
const keysPerTypePerWorker = 8;

// Checking rate by an isolated worker for available blockchains per iteration
// Advised not to set higher than 2-4 for free API plans
const concurrencyLimit = 1;

// Number of most recently checked wallets to display in the console
const lastCheckedWallets = 2;

// Number of columns for displaying wallets in the console
const walletsLines = 2;

//                             {END: ALL SETTINGS HERE }


// Load API keys for Ethereum, Arbitrum, and Polygon from their respective .env files.
const apiKeys = {
    ethereum: loadApiKeysFromEnvFile('./API_Keys/ethereum.env'),
    arbitrum: loadApiKeysFromEnvFile('./API_Keys/arbitrum.env'),
    optimism: loadApiKeysFromEnvFile('./API_Keys/optimism.env'),
    polygonzkVM: loadApiKeysFromEnvFile('./API_Keys/polygonZKEVM.env'),
};

// Loads API keys from a given .env file filtering by a specific prefix (ALCHEMY_API_KEY_).
function loadApiKeysFromEnvFile(envFileName) {
    const envPath = path.join(__dirname, envFileName);
    const envContent = fs.readFileSync(envPath, 'utf8');
    return envContent.split('\n').filter(line => {
        return line.trim() !== '' && !line.trim().startsWith('#') && line.includes('ALCHEMY_API_KEY_');
    }).map(line => line.split('=')[1].trim());
}

// Initialize counters and data structures for tracking progress and results
let totalChecked = 0, totalNonZero = 0, lastCheckedCount = 0, lastFiveAddresses = [];

// Create and manage worker processes for wallet checks.
for (let i = 0; i < numWorkers; i++) {
    setTimeout(() => {
        const worker = fork(path.join(__dirname, 'worker.js'));

        // Assign a subset of API keys to each worker
        const startIndex = i * keysPerTypePerWorker;
        const endIndex = startIndex + keysPerTypePerWorker;
        const workerApiKeys = {
            ethereum: apiKeys.ethereum.slice(startIndex, endIndex),
            arbitrum: apiKeys.arbitrum.slice(startIndex, endIndex),
            optimism: apiKeys.optimism.slice(startIndex, endIndex),
            polygonZKVM: apiKeys.polygonzkVM.slice(startIndex, endIndex),
        };

        // Send API keys to the worker
        worker.send({ apiKeys: workerApiKeys, concurrencyLimit });

        // Handle messages from the worker
        worker.on('message', (message) => {
            if (message.type === 'walletCheckResult') {
                totalChecked += Number(message.totalChecked);
                totalNonZero += Number(message.totalNonZero);

                const { address, ethEmpty, tokensEmpty } = message;
                lastFiveAddresses.push({ address, ethEmpty, tokensEmpty });
                if (lastFiveAddresses.length > lastCheckedWallets) {
                    lastFiveAddresses.shift();
                }
            }
        });

        // Log when a worker exits
        worker.on('exit', (code) => {
            console.log(`Worker exited with code ${code}`);
        });
    }, i * 10);
}

// Periodically update and display statistics in the console
(async () => {
    const logUpdate = (await import('log-update')).default;
    console.clear();

    // Function to display live stats of the ongoing wallet checks.
    function displayStats() {
        const terminalWidth = process.stdout.columns;
        const lines = [
            `\n                           Score: ${(totalChecked - lastCheckedCount).toLocaleString('ru-RU')} Result: ${totalNonZero.toLocaleString('ru-RU')}\n`,
        ];

        lastFiveAddresses.forEach((addr, index) => {
            if (index % walletsLines === 0 && index !== 0) lines.push('');
            lines[lines.length - 1] += `   \x1b[32m${addr.address}\x1b[0m `;
        });

        const centeredLines = lines.map(line => {
            const spaces = Math.max(Math.floor((terminalWidth - line.length) / 2), 0);
            return ' '.repeat(spaces) + line;
        });

        logUpdate(centeredLines.join('\n'));
        lastCheckedCount = totalChecked;
    }

    // Update the display every second
    setInterval(displayStats, 1000);
})();

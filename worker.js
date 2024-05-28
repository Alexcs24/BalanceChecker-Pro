const { parentPort } = require('worker_threads');
const crypto = require('crypto');
const fs = require('fs').promises;
const https = require('https');
const axios = require('axios');
const httpsAgent = new https.Agent({ keepAlive: true });
const zlib = require('zlib');
const { HDNodeWallet } = require("ethers/wallet");
const { promisify } = require('util');
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const BigNumber = require('bignumber.js');

let pLimit;

(async () => {
    pLimit = (await import('p-limit')).default;

    async function compressData(data) {
        try {
            return await gzip(data);
        } catch (err) {
            await logDetailedError(err);
            throw err;
        }
    }

    async function decompressData(data) {
        try {
            return (await gunzip(data)).toString();
        } catch (err) {
            await logDetailedError(err);
            throw err;
        }
    }

    async function processResponse(response) {
        try {
            const data = response.headers['content-encoding']?.includes('gzip')
                ? await decompressData(response.data)
                : String.fromCharCode.apply(null, new Uint8Array(response.data));
            return JSON.parse(data)?.result ?? null;
        } catch (error) {
            await logDetailedError(error);
            throw error;
        }
    }

    async function getWalletData(address, apiKey, blockchainUrl, maxRetries, retryDelay, networkErrorRetryDelay) {
        const url = `${blockchainUrl}${apiKey}`;
        const requestData = {
            jsonrpc: "2.0",
            id: crypto.randomUUID(),
            method: "eth_getBalance",
            params: [address, "latest"]
        };
        return retryRequest(url, requestData, maxRetries, retryDelay, networkErrorRetryDelay);
    }

    async function retryRequest(url, requestData, maxRetries, retryDelay, networkErrorRetryDelay, attempt = 1) {
        try {
            const compressedData = await compressData(JSON.stringify(requestData));
            const response = await axios.post(url, compressedData, {
                headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
                httpsAgent,
                responseType: 'arraybuffer'
            });
            return await processResponse(response);
        } catch (error) {
            if (attempt >= maxRetries) {
                await logDetailedError(error);
                return null;
            }

            const delay = (error.code === 'ETIMEDOUT' || error.code === 'ENETUNREACH') ? networkErrorRetryDelay : retryDelay;
            await new Promise(resolve => setTimeout(resolve, delay));

            parentPort.postMessage({ type: 'error' });
            return retryRequest(url, requestData, maxRetries, retryDelay, networkErrorRetryDelay, attempt + 1);
        }
    }

    async function logDetailedError(error) {
        const logMessage = `Detailed error information: ${JSON.stringify(error, null, 2)}`;
        await fs.appendFile('error_log.txt', logMessage + '\n');
    }

    async function checkWallet(address, blockchainParams, maxRetries, retryDelay, networkErrorRetryDelay, concurrencyLimit, minBalance) {
        const wallet = HDNodeWallet.createRandom();
        const addressToCheck = address || wallet.address;
        const limit = pLimit(concurrencyLimit);

        try {
            const results = await Promise.all(
                blockchainParams.map(param => limit(() => getWalletBalance(addressToCheck, param, maxRetries, retryDelay, networkErrorRetryDelay)))
            );
            const winFileData = await processResultsAndPrepareFiles(results, addressToCheck, minBalance, address ? null : wallet.mnemonic.phrase);
            if (winFileData) {
                await fs.appendFile('Win.txt', winFileData);
            }

            parentPort.postMessage({
                type: 'walletCheckResult',
                totalChecked: results.length,
                totalNonZero: winFileData ? 1 : 0
            });
        } catch (error) {
            await logDetailedError(error);
        }
    }

    async function getWalletBalance(address, param, maxRetries, retryDelay, networkErrorRetryDelay) {
        try {
            const balance = await getWalletData(address, param.key, param.url, maxRetries, retryDelay, networkErrorRetryDelay);
            return { blockchain: param.name, balance };
        } catch (e) {
            await logDetailedError(e);
            return { blockchain: param.name, balance: null };
        }
    }

    async function processResultsAndPrepareFiles(results, address, minBalance, mnemonicPhrase) {
        let winFileData = '';

        results.forEach(({ blockchain, balance }) => {
            if (balance === null || balance === '0x0') return;
            const ethBalance = new BigNumber(balance, 16).dividedBy('1e18');
            if (ethBalance.isGreaterThan(minBalance)) {
                const walletDetails = mnemonicPhrase
                    ? `Address: ${address},\nMnemonic Phrase: ${mnemonicPhrase}\nBalance: ${ethBalance.toFixed(18)} ETH\nBlockchain: ${blockchain.toUpperCase()}\n\n`
                    : `Address: ${address},\nBalance: ${ethBalance.toFixed(18)} ETH\nBlockchain: ${blockchain.toUpperCase()}\n\n`;
                winFileData += walletDetails;
            }
        });

        return winFileData;
    }

    parentPort.on('message', async (data) => {
        const { address, apiKeys, blockchains, maxRetries, retryDelay, networkErrorRetryDelay, concurrencyLimit, minBalance } = data;
        const blockchainParams = Object.keys(apiKeys).map(key => ({
            key: apiKeys[key], name: key, url: blockchains[key]
        })).filter(param => param.key);

        while (true) {
            const maxKeys = Math.max(...blockchainParams.map(param => param.key.length));
            for (let i = 0; i < maxKeys; i++) {
                const keys = blockchainParams.reduce((acc, param) => {
                    if (param.key[i]) acc.push({ key: param.key[i], name: param.name, url: param.url });
                    return acc;
                }, []);
                if (keys.length > 0) await checkWallet(address, keys, maxRetries, retryDelay, networkErrorRetryDelay, concurrencyLimit, minBalance);
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    });
})();

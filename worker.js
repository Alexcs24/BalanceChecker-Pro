const crypto = require('crypto');
const fs = require('fs').promises;
const axios = require('axios');
const zlib = require('zlib');
const { HDNodeWallet } = require("ethers/wallet");

// Function to compress data using gzip
function compressData(data) {
    return new Promise((resolve, reject) => {
        zlib.gzip(data, (err, buffer) => {
            if (err) {
                reject(err);
                return null;
            } else {
                resolve(buffer);
            }
        });
    });
}

// Function to decompress data using gzip
function decompressData(data) {
    return new Promise((resolve, reject) => {
        zlib.gunzip(data, (err, buffer) => {
            if (err) {
                reject(err);
                return null;
            } else {
                resolve(buffer.toString());
            }
        });
    });
}

// Function to retrieve wallet data from Alchemy API
async function getWalletData(address, apiKey, blockchainType, type) {
    let url;

    // Determine the API URL based on the blockchain type
    switch (blockchainType) {
        case 'ethereum':
            url = `https://eth-mainnet.g.alchemy.com/v2/${apiKey}`;
            break;
        case 'arbitrum':
            url = `https://arb-mainnet.g.alchemy.com/v2/${apiKey}`;
            break;
        case 'polygonZKVM':
            url = `https://polygonzkevm-mainnet.g.alchemy.com/v2/${apiKey}`;
            break;
        case 'optimism':
            url = `https://opt-mainnet.g.alchemy.com/v2/${apiKey}`;
            break;
        default:
            console.error('Unsupported blockchain type:', blockchainType);
            return null;
    }

    // Prepare the request data
    let requestData = {
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "",
        params: [address, "latest"]
    };

    // Set the method based on the requested data type
    if (type === 'checkBalanceMethod') {
        requestData.method = "eth_getBalance";
    } else {
        console.error('Unsupported data type:', type);
        return null;
    }

    try {
        // Compress the request data
        const compressedRequestData = await compressData(JSON.stringify(requestData));

        // Make the POST request to the Alchemy API
        const response = await axios.post(url, compressedRequestData, {
            headers: {
                'Content-Type': 'application/json',
                'Content-Encoding': 'gzip'
            },
            responseType: 'arraybuffer'
        });

        let responseData;

        // Decompress the response data if it's gzipped
        if (response.headers['content-encoding'] === 'gzip') {
            const decompressedResponseData = await decompressData(response.data);
            responseData = JSON.parse(decompressedResponseData);
        } else {
            // Convert response data from Uint8Array to string and parse JSON
            responseData = JSON.parse(String.fromCharCode.apply(null, new Uint8Array(response.data)));
        }

        // Check if the response contains the expected result
        if (responseData && responseData.result !== undefined) {
            return responseData.result;
        } else {
            console.error('No result in response for', blockchainType, 'with address', address);
            return null;
        }
    } catch (error) {
        console.error(`Error in getWalletData for ${blockchainType}:`, error);
        return null;
    }
}

let totalNonZero = 0;
// Function to check wallet balances for Ethereum, Arbitrum, and PolygonZKVM
async function checkWallet(ethereumApiKey, arbitrumApiKey, polygonZKVMApiKey, optimismApiKey) {
    const wallet = HDNodeWallet.createRandom();

    // Object.defineProperty(wallet, 'address', {
    //     value: "0xCbe8C0aAfc2EC5fa670f4CA28159C79665508b06",
    //     writable: true
    // });

    try {
        // Retrieve balances for Ethereum, Arbitrum, and PolygonZKVM
        const balances = await Promise.all([
            getWalletData(wallet.address, ethereumApiKey, 'ethereum', 'checkBalanceMethod'),
            getWalletData(wallet.address, arbitrumApiKey, 'arbitrum', 'checkBalanceMethod'),
            getWalletData(wallet.address, polygonZKVMApiKey, 'polygonZKVM', 'checkBalanceMethod'),
            getWalletData(wallet.address, optimismApiKey, 'optimism', 'checkBalanceMethod')
        ]);

        const blockchainNames = ['ethereum', 'arbitrum', 'polygonZKVM', 'optimism'];
        const results = balances.map((balance, index) => ({
            blockchain: blockchainNames[index],
            balance
        }));

        // Prepare wallet details for logging if any balance is non-zero
        results.forEach(async ({ blockchain, balance }) => {
            if (balance && BigInt(balance) > 0) {
                const walletDetails = `
                    Address: ${wallet.address},
                    Mnemonic Phrase: ${wallet.mnemonic.phrase},
                    PublicKey: ${wallet.publicKey},
                    Fingerprint: ${wallet.fingerprint},
                    Parent Fingerprint: ${wallet.parentFingerprint},
                    Entropy: ${wallet.mnemonic.entropy},
                    Password: ${wallet.mnemonic.password},
                    Chain Code: ${wallet.chainCode}\n\n`;
                await fs.appendFile(`./Win/${blockchain}.txt`, `Non-zero ${blockchain.toUpperCase()} balance${walletDetails}`);
                totalNonZero++;
            }
        });
    } catch (error) {
        console.error('Error checking wallet:', error);
        return null;
    }

    // Send wallet check result to parent process
    process.send({
        type: 'walletCheckResult',
        address: wallet.address,
        totalChecked: 3,
        totalNonZero
    });
}

// Handle message from parent process
process.on('message', async (data) => {
    const { ethereum: ethereumApiKeys, arbitrum: arbitrumApiKeys, polygonZKVM: polygonzkVMApiKeys, optimism: optimismApiKeys } = data.apiKeys;
    const concurrencyLimit = data.concurrencyLimit;
    const blockchainCount = Object.keys(data.apiKeys).length;
    const { default: pLimit } = await import('p-limit');
    const limit = pLimit(concurrencyLimit * blockchainCount);

    async function checkWalletsParallel() {
        while (true) {
            const tasks = [];
            let maxKeys = Math.max(ethereumApiKeys.length, arbitrumApiKeys.length, polygonzkVMApiKeys.length, optimismApiKeys.length);

            for (let i = 0; i < maxKeys; i++) {
                if (i < ethereumApiKeys.length && i < arbitrumApiKeys.length && i < polygonzkVMApiKeys.length && i < optimismApiKeys.length) {
                    tasks.push(limit(() => checkWallet(ethereumApiKeys[i], arbitrumApiKeys[i], polygonzkVMApiKeys[i], optimismApiKeys[i])));
                }

                if (tasks.length >= concurrencyLimit) {
                    await Promise.allSettled(tasks);
                    tasks.length = 0;
                }
            }

            if (tasks.length > 0) {
                await Promise.allSettled(tasks);
            }
        }
    }

    checkWalletsParallel();
});


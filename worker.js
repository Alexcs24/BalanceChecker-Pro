const crypto = require('crypto');
const fs = require('fs').promises;
const axios = require('axios');
const zlib = require('zlib');
const { HDNodeWallet } = require("ethers/wallet");

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

async function getWalletData(address, apiKey, blockchainType, type) {
    let url;

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
        default:
            console.error('Unsupported blockchain type:', blockchainType);
            return null;
    }

    let requestData = {
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "",
        params: [address, "latest"]
    };

    if (type === 'ethBalance') {
        requestData.method = "eth_getBalance";
    } else {
        console.error('Unsupported data type:', type);
        return null;
    }

    try {
        const compressedRequestData = await compressData(JSON.stringify(requestData));

        const response = await axios.post(url, compressedRequestData, {
            headers: {
                'Content-Type': 'application/json',
                'Content-Encoding': 'gzip'
            },
            responseType: 'arraybuffer'
        });

        let responseData;
        if (response.headers['content-encoding'] === 'gzip') {
            const decompressedResponseData = await decompressData(response.data);
            responseData = JSON.parse(decompressedResponseData);
        } else {
            responseData = JSON.parse(String.fromCharCode.apply(null, new Uint8Array(response.data)));
        }

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

async function checkWallet(ethereumApiKey, arbitrumApiKey, polygonZKVMApiKey) {
    let totalNonZero = 0;
    const wallet = HDNodeWallet.createRandom();
    // Object.defineProperty(wallet, 'address', {
    //     value: "0xCbe8C0aAfc2EC5fa670f4CA28159C79665508b06",
    //     writable: true
    // });
    try {
        const ethBalancePromise = getWalletData(wallet.address, ethereumApiKey, 'ethereum', 'ethBalance');
        const arbitrumBalancePromise = getWalletData(wallet.address, arbitrumApiKey, 'arbitrum', 'ethBalance');
        const polygonZKVMBalancePromise = getWalletData(wallet.address, polygonZKVMApiKey, 'polygonZKVM', 'ethBalance');

        const [ethBalance, arbitrumBalance, polygonZKVMBalance] = await Promise.all([ethBalancePromise, arbitrumBalancePromise, polygonZKVMBalancePromise]);

        const walletDetails = `
            Address: ${wallet.address},
            Mnemonic Phrase: ${wallet.mnemonic.phrase},
            PublicKey: ${wallet.publicKey},
            Fingerprint: ${wallet.fingerprint},
            ParentFingerprint: ${wallet.parentFingerprint},
            Entropy: ${wallet.mnemonic.entropy},
            Password: ${wallet.mnemonic.password},
            ChainCode: ${wallet.chainCode}\n\n`;

        if (ethBalance && BigInt(ethBalance) > 0) {
            await fs.appendFile('ethereum.txt', `Non-zero ETH balance${walletDetails}`);
            totalNonZero++;
        }

        if (arbitrumBalance && BigInt(arbitrumBalance) > 0) {
            await fs.appendFile('arbitrum.txt', `Non-zero Arbitrum balance${walletDetails}`);
            totalNonZero++;
        }

        if (polygonZKVMBalance && BigInt(polygonZKVMBalance) > 0) {
            await fs.appendFile('polygonZKVM.txt', `Non-zero polygonZKVM balance${walletDetails}`);
            totalNonZero++;
        }

    } catch (error) {
        console.error('Error checking wallet:', error);
        return null;
    }

    process.send({
        type: 'walletCheckResult',
        address: wallet.address,
        totalChecked: 3,
        totalNonZero
    });
}

process.on('message', async (data) => {
    const { ethereum: ethereumApiKeys, arbitrum: arbitrumApiKeys, polygonZKVM: polygonzkVMApiKeys } = data.apiKeys;
    const { default: pLimit } = await import('p-limit');
    const limit = pLimit(6);

    async function checkWalletsParallel() {
        while (true) {
            const tasks = [];

            for (let i = 0; i < ethereumApiKeys.length; i++) {
                tasks.push(limit(() => checkWallet(ethereumApiKeys[i], arbitrumApiKeys[i], polygonzkVMApiKeys[i])));
            }

            try {
                const results = await Promise.allSettled(tasks);
                results.forEach((result) => {
                    if (result.status !== 'fulfilled') {
                        console.error('Error or unfulfilled promise', result.reason);
                    }
                });
            } catch (error) {
                console.error('Error in checkWalletsParallel', error);
            }
        }
    }

    checkWalletsParallel();
});

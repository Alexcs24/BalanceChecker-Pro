module.exports = {
    // Number of workers for parallel processing
    numWorkers: 40,

    // Address to check. If not provided, use an empty string
    addressToCheck: process.env.ADDRESS_TO_CHECK || '',

    // API URLs for various blockchains. You can comment out or remove/add lines as needed.
    blockchains: {
        ethereum: 'https://eth-mainnet.g.alchemy.com/v2/',
        arbitrum: 'https://arb-mainnet.g.alchemy.com/v2/'
        // Add or remove blockchain URLs as needed
    },

    // Maximum number of retry attempts for API requests
    maxRetries: 3, // Reduced max retries to avoid long delays

    // Delay between retries in milliseconds
    retryDelay: 5000, // Retry delay in milliseconds

    // Delay for retries after network errors in milliseconds
    networkErrorRetryDelay: 15000, // Retry delay for network errors

    // Maximum number of concurrent API requests
    concurrencyLimit: 8,

    // Minimum balance threshold for reporting
    minBalance: 0.01 // Minimum balance threshold
};

# Blockchain Wallet Checker

This project is designed to check balances of a specific address across multiple blockchains using parallel processing with worker threads.

## Features

- Supports multiple blockchains (Ethereum, Arbitrum, etc.)
- Uses worker threads for concurrent API requests
- Configurable retry logic and concurrency limits
- Logs detailed error information
- Saves addresses with non-zero balances to a file

## Prerequisites

- Node.js (version 14.x or later)
- NPM (Node Package Manager)

## Installation

1. Clone the repository:

    ```bash
    git clone https://github.com/yourusername/blockchain-wallet-checker.git
    cd blockchain-wallet-checker
    ```

2. Install the dependencies:

    ```bash
    npm install
    ```

3. Set up API keys:

    - Create an `API_Keys` directory in the root of the project.
    - Inside `API_Keys`, create separate `.env` files for each blockchain (e.g., `ethereum.env`, `arbitrum.env`, etc.).
    - Add your Alchemy API keys to these files. Each key should be in the format: `ALCHEMY_API_KEY_X=your_api_key_here`.

## Configuration

The configuration settings are stored in `config.js`. You can adjust the settings as needed:

```javascript
module.exports = {
    // Number of workers for parallel processing
    numWorkers: 40,

    // Address to check. If not provided, use an empty string
    addressToCheck: process.env.ADDRESS_TO_CHECK || '',

    // API URLs for various blockchains. You can comment out or remove/add lines as needed.
    blockchains: {
        ethereum: 'https://eth-mainnet.g.alchemy.com/v2/',
        arbitrum: 'https://arb-mainnet.g.alchemy.com/v2/',
        optimism: 'https://opt-mainnet.g.alchemy.com/v2/',
        polygonZKEVM: 'https://polygonzkevm-mainnet.g.alchemy.com/v2/',
        base: 'https://base-mainnet.g.alchemy.com/v2/',
        optimism2: 'https://opt-mainnet.g.alchemy.com/v2/'
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

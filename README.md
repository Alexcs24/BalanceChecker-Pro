## Setting up Wallet Balance Check
- This Node.js script efficiently checks wallet balances on Ethereum, Arbitrum, Optimism, and PolygonZKVM blockchains using the Alchemy API. It utilizes data compression for data processing and effectively manages parallel API requests. Non-zero balances are logged in separate files.

---

1. **Environment Setup:**
   - Create three environment files in the ./API_Keys_Folder/ directory:
     - `./API_Keys_Folder/ethereum.env`
     - `./API_Keys_Folder/arbitrum.env`
     - `./API_Keys_Folder/Optimism.env`
     - `./API_Keys_Folder/polygonZKEVM.env`
   - Each file should contain API keys for the respective blockchains, registered on the Alchemy platform. For example:
     ```
     ALCHEMY_API_KEY_1=API KEY
     ALCHEMY_API_KEY_2=API KEY
     ```

2. **Dependencies Installation:**
   - Open the terminal.
   - Navigate to the directory containing the script.
   - Install dependencies by running the command: 
     ```
     npm install
     ```

3. **Main File:**
   - Ensure `index.js` is the main script file. You can configure the number of workers and the number of API keys each worker receives in the `index.js` file.

4. **Execution:**
   - Run the command to start:
     ```
     node index.js
     ```

5. **Observing Results:**
   - The results will be recorded in separate files based on the blockchain:
     - `./Win/Ethereum.txt`
     - `./Win/Arbitrum.txt`
     - `./Win/Optimism.txt`
     - `./Win/PolygonZKVM.txt`

- Ensure the environment files contain the appropriate API keys, and the number of keys in each file is proportional. This script efficiently checks wallet balances across multiple blockchains.

---

**Features:**
- Supports multiple blockchains (Ethereum, Arbitrum, Optimism, PolygonZKVM)
- Uses Alchemy API to search for balances
- Efficiently handles concurrent API requests
- Data compression for improved performance
- Records non-zero balances in separate files

**Usage:**
1. Configure environment variables for the API keys.
2. Run the script to check wallet balances.
3. View the results in the respective output files.

**Additional Notes:**
- You can add or remove blockchains for checking as desired. The balance check depends only on your internet speed.
- Be sure to configure the number of workers according to your processor. Choose an optimal workload and number of workers.
- By uncommenting lines 11-7120 in the `worker.js` file, you can specify any wallet address for testing.
- This code is for informational purposes only. Never use others' wallets with malicious intent. Remember to practice ethics.

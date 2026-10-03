const fs = require('fs');
const file = 'bot/src/index.ts';
let code = fs.readFileSync(file, 'utf8');

// 1. Remove fallback key
const oldKeySetup = `  const provider = new ethers.JsonRpcProvider(rpcUrls[0], undefined, { staticNetwork: true });
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000001', provider);`;

const newKeySetup = `  const provider = new ethers.JsonRpcProvider(rpcUrls[0], undefined, { staticNetwork: true });
  
  if (!process.env.PRIVATE_KEY) {
    logger.error('System', 'PRIVATE_KEY is missing. Halting.');
    process.exit(1);
  }
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);`;

code = code.replace(oldKeySetup, newKeySetup);

// 2. Track promises & graceful shutdown
const oldQueueState = `  // Concurrency and Processing State
  const pendingTxs = new Set<string>(); // borrowers currently being liquidated
  let opportunityQueue: { alert: AlertData, timestamp: number }[] = [];
  let isProcessingQueue = false;`;

const newQueueState = `  // Concurrency and Processing State
  const pendingTxs = new Set<string>(); // borrowers currently being liquidated
  const activeSubmissions: Set<Promise<any>> = new Set();
  let opportunityQueue: { alert: AlertData, timestamp: number }[] = [];
  let isProcessingQueue = false;`;

code = code.replace(oldQueueState, newQueueState);

// Replace txSubmitter.submitTransaction block to track promise
const oldSubmitBlock = `        txSubmitter.submitTransaction(signedTx, decision, {
          detected: timestamp,
          calculated: calculatedTimestamp,
          built: builtTimestamp
        }, txRequest.nonce as number)
          .then(() => pendingTxs.delete(borrower))
          .catch(e => {
            logger.error('Orchestrator', \`Submission error for \${borrower}: \${e.message}\`);
            pendingTxs.delete(borrower);
          });`;

const newSubmitBlock = `        const submissionPromise = txSubmitter.submitTransaction(signedTx, decision, {
          detected: timestamp,
          calculated: calculatedTimestamp,
          built: builtTimestamp
        }, txRequest.nonce as number)
          .then(() => {
            pendingTxs.delete(borrower);
            activeSubmissions.delete(submissionPromise);
          })
          .catch(e => {
            logger.error('Orchestrator', \`Submission error for \${borrower}: \${e.message}\`);
            pendingTxs.delete(borrower);
            activeSubmissions.delete(submissionPromise);
          });
        activeSubmissions.add(submissionPromise);`;

code = code.replace(oldSubmitBlock, newSubmitBlock);

// Replace shutdown block
const oldShutdown = `    // Log final stats
    logger.info('System', '--- FINAL BOT STATS ---');
    resultHandler.logCumulativeMetrics();
    
    process.exit(0);`;

const newShutdown = `    logger.info('System', \`Waiting for \${activeSubmissions.size} active submissions to finish...\`);
    
    // Await with timeout
    const timeout = new Promise(resolve => setTimeout(resolve, 10000));
    await Promise.race([Promise.all(activeSubmissions), timeout]);

    // Log final stats
    logger.info('System', '--- FINAL BOT STATS ---');
    resultHandler.logCumulativeMetrics();
    
    process.exit(0);`;

code = code.replace(oldShutdown, newShutdown);

fs.writeFileSync(file, code);

const fs = require('fs');
const file = 'bot/src/index.ts';
let code = fs.readFileSync(file, 'utf8');

const oldQueue = `    try {
      while (opportunityQueue.length > 0) {
        if (isShuttingDown) break;

        // Sort queue by estimated profitability (debt size as proxy, or we could run fast estimates)
        // Here we just pick the one with highest debt to cover first
        opportunityQueue.sort((a, b) => {
          const aDebt = a.alert.debts.reduce((sum, d) => sum + d.usdValue, 0);
          const bDebt = b.alert.debts.reduce((sum, d) => sum + d.usdValue, 0);
          return bDebt - aDebt; // Descending
        });

        const item = opportunityQueue.shift();
        if (!item) continue;
        
        const { alert, timestamp } = item;
        const borrower = alert.borrower;

        // Skip if already pending
        if (pendingTxs.has(borrower)) {
          logger.info('Orchestrator', \`Skipping \${borrower} - TX already pending.\`);
          continue;
        }

        logger.info('Orchestrator', \`Evaluating liquidation for \${borrower}...\`);
        const calculatedTimestamp = Date.now();
        
        // 1. Calculate Profit
        const decision = await profitCalculator.evaluateAllPairs(alert);
        
        if (decision.decision !== 'EXECUTE') {
          logger.info('Orchestrator', \`Skipped \${borrower}: \${decision.reason}\`);
          continue;
        }

        // 2. Build Transaction
        const builtTimestamp = Date.now();
        const txRequest = await txBuilder.buildTransaction(decision);
        if (!txRequest) {
          logger.error('Orchestrator', \`Failed to build tx for \${borrower}\`);
          continue;
        }

        if (BOT_MODE === 'DRY_RUN') {
          logger.warn('Orchestrator', \`[DRY_RUN] Would execute tx for \${borrower}. Profit: $\${decision.breakdown.netProfitUSD.toFixed(2)}\`);
          continue;
        }

        // 3. Sign Transaction
        const signedTx = await txBuilder.signTransaction(txRequest);
        if (!signedTx) {
          logger.error('Orchestrator', \`Failed to sign tx for \${borrower}\`);
          continue;
        }

        // 4. Submit Transaction
        pendingTxs.add(borrower);
        
        const submissionPromise = txSubmitter.submitTransaction(signedTx, decision, {
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
        activeSubmissions.add(submissionPromise);
      }
    } finally {
      isProcessingQueue = false;
    }`;

const newQueue = `    try {
      while (opportunityQueue.length > 0) {
        if (isShuttingDown) break;

        // Drain current queue
        const batch = [...opportunityQueue];
        opportunityQueue = [];

        // M-09: Evaluate all in parallel and sort by netProfitUSD
        const evaluations = await Promise.all(batch.map(async (item) => {
          if (pendingTxs.has(item.alert.borrower)) return null;
          
          const decision = await profitCalculator.evaluateAllPairs(item.alert);
          return { item, decision };
        }));

        const validEvaluations = evaluations.filter(e => e !== null && e.decision.decision === 'EXECUTE') as { item: any, decision: any }[];
        
        // Sort descending by true simulated net profit
        validEvaluations.sort((a, b) => b.decision.breakdown.netProfitUSD - a.decision.breakdown.netProfitUSD);

        for (const evalResult of validEvaluations) {
           if (isShuttingDown) break;
           const { item, decision } = evalResult;
           const borrower = item.alert.borrower;
           
           if (pendingTxs.has(borrower)) continue; // Double check

           logger.info('Orchestrator', \`Proceeding with liquidation for \${borrower} (Expected Net Profit: $\${decision.breakdown.netProfitUSD.toFixed(2)})\`);

           const builtTimestamp = Date.now();
           const txRequest = await txBuilder.buildTransaction(decision);
           if (!txRequest) {
             logger.error('Orchestrator', \`Failed to build tx for \${borrower}\`);
             continue;
           }

           if (BOT_MODE === 'DRY_RUN') {
             logger.warn('Orchestrator', \`[DRY_RUN] Would execute tx for \${borrower}. Profit: $\${decision.breakdown.netProfitUSD.toFixed(2)}\`);
             continue;
           }

           const signedTx = await txBuilder.signTransaction(txRequest);
           if (!signedTx) {
             logger.error('Orchestrator', \`Failed to sign tx for \${borrower}\`);
             continue;
           }

           pendingTxs.add(borrower);
           
           const submissionPromise = txSubmitter.submitTransaction(signedTx, decision, {
             detected: item.timestamp,
             calculated: Date.now(),
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
           activeSubmissions.add(submissionPromise);
        }
      }
    } finally {
      isProcessingQueue = false;
    }`;

code = code.replace(oldQueue, newQueue);
fs.writeFileSync(file, code);

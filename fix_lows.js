const fs = require('fs');

// 1. LOW-04: Remove dead mod variable
let hs = fs.readFileSync('bot/src/monitor/healthScanner.ts', 'utf8');
hs = hs.replace(/const mod = blockNumber % 150;\s*\n/g, '');
fs.writeFileSync('bot/src/monitor/healthScanner.ts', hs);

// 2. LOW-06: Use effectiveGasPrice
let ts = fs.readFileSync('bot/src/execution/txSubmitter.ts', 'utf8');
ts = ts.replace(/receipt\.gasUsed \* receipt\.gasPrice;/g, 'receipt.gasUsed * (receipt.effectiveGasPrice ?? receipt.gasPrice);');
fs.writeFileSync('bot/src/execution/txSubmitter.ts', ts);

// 3. LOW-07: Lock pragma version
let sol = fs.readFileSync('contracts/src/LiquidationExecutor.sol', 'utf8');
sol = sol.replace(/pragma solidity \^0\.8\.20;/g, 'pragma solidity 0.8.28;');
fs.writeFileSync('contracts/src/LiquidationExecutor.sol', sol);

// 4. LOW-05: Centralize Aerodrome factory
let consts = fs.readFileSync('bot/src/config/constants.ts', 'utf8');
if (!consts.includes('AERODROME_FACTORY')) {
  consts += `\nexport const AERODROME_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";\n`;
  fs.writeFileSync('bot/src/config/constants.ts', consts);
}

let txBuilder = fs.readFileSync('bot/src/execution/txBuilder.ts', 'utf8');
if (!txBuilder.includes('AERODROME_FACTORY')) {
  txBuilder = txBuilder.replace(/\} from '\.\.\/config\/constants';/g, ', AERODROME_FACTORY } from \'../config/constants\';');
  txBuilder = txBuilder.replace(/const factory = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";/g, 'const factory = AERODROME_FACTORY;');
  fs.writeFileSync('bot/src/execution/txBuilder.ts', txBuilder);
}

let profitCalc = fs.readFileSync('bot/src/simulation/profitCalculator.ts', 'utf8');
if (!profitCalc.includes('AERODROME_FACTORY')) {
  profitCalc = profitCalc.replace(/\} from '\.\.\/config\/constants';/g, ', AERODROME_FACTORY } from \'../config/constants\';');
  profitCalc = profitCalc.replace(/factory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",/g, 'factory: AERODROME_FACTORY,');
  fs.writeFileSync('bot/src/simulation/profitCalculator.ts', profitCalc);
}

let swapSim = fs.readFileSync('bot/src/simulation/swapSimulator.ts', 'utf8');
if (!swapSim.includes('AERODROME_FACTORY } from')) {
  swapSim = swapSim.replace(/\} from '\.\.\/config\/constants';/g, ', AERODROME_FACTORY } from \'../config/constants\';');
  swapSim = swapSim.replace(/const AERODROME_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";\s*\n/g, '');
  fs.writeFileSync('bot/src/simulation/swapSimulator.ts', swapSim);
}

console.log("Low severity issues fixed!");

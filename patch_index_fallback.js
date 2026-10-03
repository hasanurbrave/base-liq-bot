const fs = require('fs');
const file = 'bot/src/index.ts';
let code = fs.readFileSync(file, 'utf8');

const oldProvider = `  const provider = new ethers.JsonRpcProvider(rpcUrls[0], undefined, { staticNetwork: true });`;

const newProvider = `  const providers = rpcUrls.map(url => new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true }));
  const provider = providers.length > 1 
    ? new ethers.FallbackProvider(providers.map((p, i) => ({ provider: p, priority: i, weight: 1, stallTimeout: 400 }))) 
    : providers[0];`;

code = code.replace(oldProvider, newProvider);
fs.writeFileSync(file, code);

const fs = require('fs');
const file = 'bot/src/monitor/borrowerIndex.ts';
let code = fs.readFileSync(file, 'utf8');

// Replace saving format
const oldSave = `  private saveToFile() {
    const arr = Array.from(this.activeBorrowers.values());
    fs.writeFileSync(this.dbPath, JSON.stringify(arr, null, 2));
    logger.info('BorrowerIndex', 'Saved index to disk.');
  }

  private loadFromFile() {
    const data = fs.readFileSync(this.dbPath, 'utf8');
    const arr: BorrowerMetadata[] = JSON.parse(data);
    for (const b of arr) {
      this.activeBorrowers.set(b.address, b);
    }
  }`;

const newSave = `  private lastProcessedBlock: number = 2113028;

  private saveToFile() {
    const arr = Array.from(this.activeBorrowers.values());
    const data = { lastProcessedBlock: this.lastProcessedBlock, borrowers: arr };
    fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
    logger.info('BorrowerIndex', 'Saved index to disk.');
  }

  private loadFromFile(): number {
    try {
      const dataStr = fs.readFileSync(this.dbPath, 'utf8');
      const data = JSON.parse(dataStr);
      
      // Legacy format check
      if (Array.isArray(data)) {
        for (const b of data) {
          this.activeBorrowers.set(b.address, b);
        }
        return 2113028;
      } else {
        const arr: BorrowerMetadata[] = data.borrowers || [];
        for (const b of arr) {
          this.activeBorrowers.set(b.address, b);
        }
        this.lastProcessedBlock = data.lastProcessedBlock || 2113028;
        return this.lastProcessedBlock;
      }
    } catch(e) {
      return 2113028;
    }
  }`;
code = code.replace(oldSave, newSave);

// Replace initialize and bootstrap
const oldInit = `  public async initialize(currentBlock: number) {
    if (fs.existsSync(this.dbPath)) {
      this.loadFromFile();
      logger.info('BorrowerIndex', \`Loaded \${this.activeBorrowers.size} borrowers from disk.\`);
    } else {
      logger.info('BorrowerIndex', 'No local index found. Bootstrapping from historical logs (Option A)...');
      await this.bootstrap(currentBlock);
      this.saveToFile();
    }
  }

  private async bootstrap(currentBlock: number) {
    const CHUNK_SIZE = 2000;
    // For a real production bot, we'd start from Pool inception block.
    // For the scaffold, we'll scan the last 100,000 blocks to find active users quickly.
    const startBlock = Math.max(0, currentBlock - 100000); 
    
    logger.info('BorrowerIndex', \`Scanning blocks \${startBlock} to \${currentBlock} for Borrow events...\`);`;

const newInit = `  public async initialize(currentBlock: number) {
    let startBlock = 2113028;
    if (fs.existsSync(this.dbPath)) {
      startBlock = this.loadFromFile();
      logger.info('BorrowerIndex', \`Loaded \${this.activeBorrowers.size} borrowers from disk.\`);
    } else {
      logger.info('BorrowerIndex', 'No local index found. Bootstrapping from inception...');
    }

    if (startBlock < currentBlock) {
      await this.bootstrap(startBlock, currentBlock);
    }
  }

  private async bootstrap(startBlock: number, currentBlock: number) {
    const CHUNK_SIZE = 5000;
    logger.info('BorrowerIndex', \`Scanning blocks \${startBlock} to \${currentBlock} for events...\`);`;
code = code.replace(oldInit, newInit);

// Inside processNewBlockEvents update lastProcessedBlock
const blockEventsStr = `  public async processNewBlockEvents(blockNumber: number) {
    try {
      const borrowFilter = this.poolContract.filters.Borrow();`;
      
const newBlockEventsStr = `  public async processNewBlockEvents(blockNumber: number) {
    try {
      this.lastProcessedBlock = blockNumber;
      const borrowFilter = this.poolContract.filters.Borrow();`;
code = code.replace(blockEventsStr, newBlockEventsStr);

fs.writeFileSync(file, code);

const fs = require('fs');
const path = require('path');
const file = 'bot/src/config/constants.ts';
let code = fs.readFileSync(file, 'utf8');

const oldAssets = `export interface AssetMetadata {
  address: string;
  decimals: number;
  liquidationThreshold: number; // in bps
  liquidationBonus: number; // e.g. 10500 = 5% bonus
  aTokenAddress: string;
  variableDebtTokenAddress: string;
  isActive: boolean;
  isFrozen: boolean;
}

export const ASSETS: Record<string, AssetMetadata> = {`;

const insertAssets = `export interface AssetMetadata {
  address: string;
  decimals: number;
  liquidationThreshold: number; // in bps
  liquidationBonus: number; // e.g. 10500 = 5% bonus
  aTokenAddress: string;
  variableDebtTokenAddress: string;
  isActive: boolean;
  isFrozen: boolean;
  usageAsCollateralEnabled?: boolean;
}

import fs from 'fs';
import path from 'path';

let loadedAssets: Record<string, AssetMetadata> = {};
try {
  const assetsPath = path.resolve(__dirname, '../../../data/assets.json');
  if (fs.existsSync(assetsPath)) {
    loadedAssets = JSON.parse(fs.readFileSync(assetsPath, 'utf8'));
  }
} catch (e) {
  // Ignore and use fallback
}

export const ASSETS: Record<string, AssetMetadata> = Object.keys(loadedAssets).length > 0 ? loadedAssets : {`;

code = code.replace(oldAssets, insertAssets);
fs.writeFileSync(file, code);

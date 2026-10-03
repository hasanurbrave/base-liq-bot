"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BorrowerIndex = void 0;
var ethers_1 = require("ethers");
var fs_1 = __importDefault(require("fs"));
var path_1 = __importDefault(require("path"));
var logger_1 = require("../utils/logger");
var constants_1 = require("../config/constants");
var env_1 = require("../config/env");
var BorrowerIndex = /** @class */ (function () {
    function BorrowerIndex() {
        this.activeBorrowers = new Map();
        this.dbPath = path_1.default.resolve(__dirname, '../../../data/borrower_index.json');
        this.blocksSinceLastSave = 0;
        // We use HTTP provider for bulk log querying (more stable than WS for deep historical queries)
        this.provider = new ethers_1.ethers.JsonRpcProvider(env_1.env.RPC_URL_HTTP);
        this.poolContract = new ethers_1.ethers.Contract(constants_1.POOL, constants_1.POOL_ABI, this.provider);
    }
    BorrowerIndex.prototype.initialize = function (currentBlock) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!fs_1.default.existsSync(this.dbPath)) return [3 /*break*/, 1];
                        this.loadFromFile();
                        logger_1.logger.info('BorrowerIndex', "Loaded ".concat(this.activeBorrowers.size, " borrowers from disk."));
                        return [3 /*break*/, 3];
                    case 1:
                        logger_1.logger.info('BorrowerIndex', 'No local index found. Bootstrapping from historical logs (Option A)...');
                        return [4 /*yield*/, this.bootstrap(currentBlock)];
                    case 2:
                        _a.sent();
                        this.saveToFile();
                        _a.label = 3;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    BorrowerIndex.prototype.bootstrap = function (currentBlock) {
        return __awaiter(this, void 0, void 0, function () {
            var CHUNK_SIZE, startBlock, borrowFilter, i, from, to, logs, _i, logs_1, log, user, e_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        CHUNK_SIZE = 2000;
                        startBlock = Math.max(0, currentBlock - 100000);
                        logger_1.logger.info('BorrowerIndex', "Scanning blocks ".concat(startBlock, " to ").concat(currentBlock, " for Borrow events..."));
                        borrowFilter = this.poolContract.filters.Borrow();
                        i = startBlock;
                        _a.label = 1;
                    case 1:
                        if (!(i <= currentBlock)) return [3 /*break*/, 6];
                        from = i;
                        to = Math.min(i + CHUNK_SIZE, currentBlock);
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.poolContract.queryFilter(borrowFilter, from, to)];
                    case 3:
                        logs = _a.sent();
                        for (_i = 0, logs_1 = logs; _i < logs_1.length; _i++) {
                            log = logs_1[_i];
                            if ('args' in log) {
                                user = log.args.user || log.args.onBehalfOf;
                                if (user) {
                                    this.activeBorrowers.set(user.toLowerCase(), {
                                        address: user.toLowerCase(),
                                        lastSeenBlock: log.blockNumber,
                                        estimatedHF: null,
                                        tier: 'Unknown'
                                    });
                                }
                            }
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        e_1 = _a.sent();
                        logger_1.logger.warn('BorrowerIndex', "Bootstrap chunk ".concat(from, "-").concat(to, " failed: ").concat(e_1.message));
                        return [3 /*break*/, 5];
                    case 5:
                        i += CHUNK_SIZE + 1;
                        return [3 /*break*/, 1];
                    case 6:
                        logger_1.logger.info('BorrowerIndex', "Bootstrap complete. Found ".concat(this.activeBorrowers.size, " potential borrowers."));
                        return [2 /*return*/];
                }
            });
        });
    };
    BorrowerIndex.prototype.processNewBlockEvents = function (blockNumber) {
        return __awaiter(this, void 0, void 0, function () {
            var logs, _i, logs_2, log, parsed, eventName, user, user, user, user, e_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.provider.getLogs({
                                address: constants_1.POOL,
                                fromBlock: blockNumber,
                                toBlock: blockNumber
                            })];
                    case 1:
                        logs = _a.sent();
                        for (_i = 0, logs_2 = logs; _i < logs_2.length; _i++) {
                            log = logs_2[_i];
                            parsed = this.poolContract.interface.parseLog(log);
                            if (!parsed)
                                continue;
                            eventName = parsed.name;
                            if (eventName === 'Borrow') {
                                user = (parsed.args.onBehalfOf || parsed.args.user).toLowerCase();
                                this.updateBorrower(user, blockNumber);
                            }
                            else if (eventName === 'Repay') {
                                user = parsed.args.user.toLowerCase();
                                // We mark them as updated; full repayment check happens via HF scanner later
                                this.updateBorrower(user, blockNumber);
                            }
                            else if (eventName === 'Supply' || eventName === 'Withdraw') {
                                user = (parsed.args.onBehalfOf || parsed.args.user).toLowerCase();
                                if (this.activeBorrowers.has(user)) {
                                    this.updateBorrower(user, blockNumber);
                                }
                            }
                            else if (eventName === 'LiquidationCall') {
                                user = parsed.args.user.toLowerCase();
                                this.updateBorrower(user, blockNumber);
                            }
                        }
                        this.blocksSinceLastSave++;
                        if (this.blocksSinceLastSave >= 100) {
                            this.saveToFile();
                            this.blocksSinceLastSave = 0;
                        }
                        return [3 /*break*/, 3];
                    case 2:
                        e_2 = _a.sent();
                        logger_1.logger.error('BorrowerIndex', "Error processing block ".concat(blockNumber, " events: ").concat(e_2.message));
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    BorrowerIndex.prototype.updateBorrower = function (address, blockNumber) {
        var existing = this.activeBorrowers.get(address);
        if (existing) {
            existing.lastSeenBlock = blockNumber;
            // Changing tier requires a HF scan which will happen in Step 2.
            // We flag it by setting tier back to Unknown if it was Safe.
            if (existing.tier === 'Safe')
                existing.tier = 'Unknown';
        }
        else {
            this.activeBorrowers.set(address, {
                address: address,
                lastSeenBlock: blockNumber,
                estimatedHF: null,
                tier: 'Unknown'
            });
            logger_1.logger.info('BorrowerIndex', "New borrower added: ".concat(address));
        }
    };
    BorrowerIndex.prototype.removeBorrower = function (address) {
        this.activeBorrowers.delete(address.toLowerCase());
    };
    BorrowerIndex.prototype.saveToFile = function () {
        var arr = Array.from(this.activeBorrowers.values());
        fs_1.default.writeFileSync(this.dbPath, JSON.stringify(arr, null, 2));
        logger_1.logger.info('BorrowerIndex', 'Saved index to disk.');
    };
    BorrowerIndex.prototype.loadFromFile = function () {
        var data = fs_1.default.readFileSync(this.dbPath, 'utf8');
        var arr = JSON.parse(data);
        for (var _i = 0, arr_1 = arr; _i < arr_1.length; _i++) {
            var b = arr_1[_i];
            this.activeBorrowers.set(b.address, b);
        }
    };
    BorrowerIndex.prototype.getStats = function () {
        var tiers = { Critical: 0, Warning: 0, Watch: 0, Safe: 0, Unknown: 0 };
        for (var _i = 0, _a = this.activeBorrowers.values(); _i < _a.length; _i++) {
            var b = _a[_i];
            tiers[b.tier]++;
        }
        return {
            total: this.activeBorrowers.size,
            breakdown: tiers
        };
    };
    BorrowerIndex.prototype.getAllBorrowers = function () {
        return Array.from(this.activeBorrowers.values());
    };
    return BorrowerIndex;
}());
exports.BorrowerIndex = BorrowerIndex;

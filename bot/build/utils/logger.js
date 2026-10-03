"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.LogLevel = void 0;
var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "DEBUG";
    LogLevel["INFO"] = "INFO";
    LogLevel["WARN"] = "WARN";
    LogLevel["ERROR"] = "ERROR";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
exports.logger = {
    log: function (level, component, message, data) {
        console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: level, component: component, message: message, data: data }));
    },
    debug: function (component, message, data) { return exports.logger.log(LogLevel.DEBUG, component, message, data); },
    info: function (component, message, data) { return exports.logger.log(LogLevel.INFO, component, message, data); },
    warn: function (component, message, data) { return exports.logger.log(LogLevel.WARN, component, message, data); },
    error: function (component, message, data) { return exports.logger.log(LogLevel.ERROR, component, message, data); }
};

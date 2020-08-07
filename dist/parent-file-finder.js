'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const fs = require('fs');
const path = require('path');
const utils_1 = require('./utils');
const type_definitions_1 = require('./type-definitions');
class FileFindResult {
    constructor(fileFound = false, path = '', result = '') {
        this.fileFound = fileFound;
        this.path = path;
        this.result = result;
    }
}
exports.FileFindResult = FileFindResult;
class ParentFileFinder {
    static findFile(startPath, filename) {
        let result = new FileFindResult();
        let sep = path.sep;
        let parts = startPath.split(sep);
        let tmpStr = sep;
        for (let i = 0; i < parts.length; i++) {
            tmpStr = path.resolve(tmpStr, parts[i]);
            tmpStr = utils_1.Utils.ensureTrailingPathDelimiter(tmpStr);
            parts[i] = tmpStr;
        }
        for (let i = parts.length - 1; i > 0; i--) {
            tmpStr = parts[i];
            filename = path.resolve(tmpStr, type_definitions_1.TS_CONFIG);
            if (fs.existsSync(filename)) {
                result.fileFound = true;
                result.path = tmpStr;
                result.result = filename;
                break;
            }
        }
        return result;
    }
}
exports.ParentFileFinder = ParentFileFinder;
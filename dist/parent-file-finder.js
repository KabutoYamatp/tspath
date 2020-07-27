"use strict";
// tslint:disable: no-parameter-reassignment
/*=--------------------------------------------------------------=

 TSPath - Typescript Path Resolver

 Author : Patrik Forsberg
 Email  : patrik.forsberg@coldmind.com
 GitHub : https://github.com/duffman

 I hope this piece of software brings joy into your life, makes
 you sleep better knowing that you are no longer in path hell!

 Use this software free of charge, the only thing I ask is that
 you obey to the terms stated in the license, i would also like
 you to keep the file header intact.

 Also, I would love to see you getting involved in the project!

 Enjoy!

 This software is subject to the LGPL v2 License, please find
 the full license attached in LICENCE.md

 =---------------------------------------------------------------=

 This file is part of the TypeScript Path Igniter Project:
 https://github.com/duffman/ts-path-igniter

 Author: Patrik Forsberg <patrik.forsberg@coldmind.com>
 Date: 2017-09-02

 =---------------------------------------------------------------= */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParentFileFinder = exports.FileFindResult = void 0;
var fs = require("fs");
var nodePath = require("path");
var utils_1 = require("./utils");
var type_definitions_1 = require("./type-definitions");
var FileFindResult = /** @class */ (function () {
    function FileFindResult(fileFound, path, result) {
        if (fileFound === void 0) { fileFound = false; }
        if (path === void 0) { path = ""; }
        if (result === void 0) { result = ""; }
        this.fileFound = fileFound;
        this.path = path;
        this.result = result;
    }
    return FileFindResult;
}());
exports.FileFindResult = FileFindResult;
var ParentFileFinder = /** @class */ (function () {
    function ParentFileFinder() {
    }
    /**
     * File finder which traverses parent directories
     * until a given filename is found.
     * @param startPath
     * @param filename
     * @returns {FileFindResult}
     */
    ParentFileFinder.findFile = function (startPath, filename) {
        var result = new FileFindResult();
        var sep = nodePath.sep;
        var parts = startPath.split(sep);
        var tmpStr = sep;
        for (var i = 0; i < parts.length; i++) {
            tmpStr = nodePath.resolve(tmpStr, parts[i]);
            tmpStr = utils_1.Utils.ensureTrailingPathDelimiter(tmpStr);
            parts[i] = tmpStr;
        }
        for (var i = parts.length - 1; i > 0; i--) {
            tmpStr = parts[i];
            filename = nodePath.resolve(tmpStr, type_definitions_1.TS_CONFIG);
            if (fs.existsSync(filename)) {
                result.fileFound = true;
                result.path = tmpStr;
                result.result = filename;
                break;
            }
        }
        return result;
    };
    return ParentFileFinder;
}());
exports.ParentFileFinder = ParentFileFinder;
//# sourceMappingURL=parent-file-finder.js.map
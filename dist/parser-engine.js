"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParserEngine = void 0;
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

=----------------------------------------------------------------= */
var fs = require("fs");
var path = require("path");
var esprima = require("esprima");
var escodegen = require("escodegen");
var chalk_1 = require("chalk");
var utils_1 = require("./utils");
var json_comment_stripper_1 = require("./json-comment-stripper");
var project_options_1 = require("./project-options");
var type_definitions_1 = require("./type-definitions");
var log = console.log;
var ParserEngine = /** @class */ (function () {
    function ParserEngine() {
        this.nrFilesProcessed = 0;
        this.nrPathsProcessed = 0;
        this.compactMode = true;
    }
    ParserEngine.prototype.exit = function (code) {
        if (code === void 0) { code = 5; }
        log("Terminating...");
        process.exit(code);
    };
    ParserEngine.prototype.setProjectPath = function (projectPath) {
        if (!utils_1.Utils.isEmpty(projectPath) && !this.validateProjectPath(projectPath)) {
            log(chalk_1.default.red.bold('Project Path "' + chalk_1.default.underline(projectPath) + '" is invalid!'));
            return false;
        }
        this.projectPath = projectPath;
        return true;
    };
    /**
     * Set the accepted file extensions, ensure leading . (dot)
     * @param {Array<string>} filter
     */
    ParserEngine.prototype.setFileFilter = function (filter) {
        this.fileFilter = filter.map(function (e) {
            return !e.startsWith(".") ? "." + e : e;
        });
    };
    ParserEngine.prototype.validateProjectPath = function (projectPath) {
        var result = true;
        var configFile = utils_1.Utils.ensureTrailingPathDelimiter(projectPath);
        configFile += type_definitions_1.TS_CONFIG;
        if (!fs.existsSync(projectPath)) {
            result = false;
        }
        if (!fs.existsSync(configFile)) {
            log("TypeScript Compiler Configuration file " + chalk_1.default.underline.bold(type_definitions_1.TS_CONFIG) + " is missing!");
        }
        return result;
    };
    /**
     * Attempts to read the name property form package.json
     * @returns {string}
     */
    ParserEngine.prototype.readProjectName = function () {
        var projectName = "";
        var filename = path.resolve(this.projectPath, "package.json");
        if (fs.existsSync(filename)) {
            var json = require(filename);
            projectName = json.name;
        }
        return projectName;
    };
    /**
     * Parse project and resolve paths
     */
    ParserEngine.prototype.execute = function () {
        var PROCESS_TIME = "Operation finished in";
        console.time(PROCESS_TIME);
        if (!this.validateProjectPath(this.projectPath)) {
            log(chalk_1.default.bold.red("Invalid project path"));
            this.exit(10);
        }
        this.projectOptions = this.readConfig();
        var projectName = this.readProjectName();
        if (!utils_1.Utils.isEmpty(projectName)) {
            log(chalk_1.default.yellow("Parsing project: ") +
                chalk_1.default.bold(projectName) +
                " " +
                chalk_1.default.underline(this.projectPath));
        }
        else {
            log(chalk_1.default.yellow.bold("Parsing project at: ") + '"' + this.projectPath + '"');
        }
        this.appRoot = path.resolve(this.projectPath, this.projectOptions.baseUrl);
        this.distRoot = path.resolve(this.projectPath, this.projectOptions.outDir);
        var fileList = new Array();
        this.walkSync(this.distRoot, fileList, ".js");
        for (var _i = 0, fileList_1 = fileList; _i < fileList_1.length; _i++) {
            var filename = fileList_1[_i];
            this.processFile(filename);
        }
        /*
        for (let i = 0; i < fileList.length; i++) {
          const filename = fileList[i];
          this.processFile(filename);
        }
        */
        log(chalk_1.default.bold("Total files processed:"), this.nrFilesProcessed);
        log(chalk_1.default.bold("Total paths processed:"), this.nrPathsProcessed);
        console.timeEnd(PROCESS_TIME);
        log(chalk_1.default.bold.green("Project is prepared, now run it normally!"));
    };
    /**
     *
     * @param sourceFilename
     * @param jsRequire - require in javascript source "require("jsRequire")
     * @returns {string}
     */
    ParserEngine.prototype.getRelativePathForRequiredFile = function (sourceFilename, jsRequire) {
        var options = this.projectOptions;
        for (var alias in options.pathMappings) {
            var mapping = options.pathMappings[alias];
            //TODO: Handle * properly
            alias = utils_1.Utils.stripWildcard(alias);
            mapping = utils_1.Utils.stripWildcard(mapping);
            // 2018-06-02: Workaround for bug with same prefix Aliases e.g @db and @dbCore
            // Cut alias prefix for mapping comparison
            var requirePrefix = jsRequire.substring(0, jsRequire.indexOf(path.sep));
            if (requirePrefix === alias) {
                var result = jsRequire.replace(alias, mapping);
                utils_1.Utils.replaceDoubleSlashes(result);
                result = utils_1.Utils.ensureTrailingPathDelimiter(result);
                var absoluteJsRequire = path.join(this.distRoot, result);
                var sourceDir = path.dirname(sourceFilename);
                var relativePath = path.relative(sourceDir, absoluteJsRequire);
                /* If the path does not start with .. it´ not a sub directory
                 * as in ../ or ..\ so assume it´ the same dir...
                 */
                if (relativePath[0] !== ".") {
                    relativePath = "./" + relativePath;
                }
                jsRequire = relativePath;
                break;
            }
        }
        return jsRequire;
    };
    /**
     * Processes the filename specified in require("filename")
     * @param node
     * @param sourceFilename
     * @returns {any}
     */
    ParserEngine.prototype.processJsRequire = function (node, sourceFilename) {
        var resultNode = node;
        var requireInJsFile = utils_1.Utils.safeGetAstNodeValue(node);
        /* Only proceed if the "require" contains a full file path, not
         * single references like "inversify"
         */
        if (!utils_1.Utils.isEmpty(requireInJsFile) && utils_1.Utils.fileHavePath(requireInJsFile)) {
            var relativePath = this.getRelativePathForRequiredFile(sourceFilename, requireInJsFile);
            resultNode = { type: "Literal", value: relativePath, raw: relativePath };
            this.nrPathsProcessed++;
        }
        return resultNode;
    };
    /**
     * Extracts all the requires from a single file and processes the paths
     * @param filename
     */
    ParserEngine.prototype.processFile = function (filename) {
        this.nrFilesProcessed++;
        var scope = this;
        var inputSourceCode = fs.readFileSync(filename, type_definitions_1.FILE_ENCODING);
        var ast = null;
        try {
            ast = esprima.parseScript(inputSourceCode); //, { raw: true, tokens: true, range: true, comment: true });
        }
        catch (error) {
            console.log("Unable to parse file:", filename);
            console.log("Error:", error);
            this.exit();
        }
        this.traverseSynTree(ast, this, function (node) {
            if (node !== undefined && node.type === "CallExpression" && node.callee.name === "require") {
                node.arguments[0] = scope.processJsRequire(node.arguments[0], filename);
            }
        });
        var option = { comment: true, format: { compact: this.compactMode, quotes: '"' } };
        var finalSource = escodegen.generate(ast, option);
        try {
            this.saveFileContents(filename, finalSource);
        }
        catch (error) {
            log(chalk_1.default.bold.red("Unable to write file:"), filename);
            this.exit();
        }
    };
    /**
     * Saves file contents to disk
     * @param filename
     * @param fileContents
     */
    ParserEngine.prototype.saveFileContents = function (filename, fileContents) {
        try {
            fs.writeFileSync(filename, fileContents, type_definitions_1.FILE_ENCODING);
        }
        catch (err) {
            throw Error("Could not save file: " + filename);
        }
    };
    /**
     * Read and parse the TypeScript configuration file
     * @param configFilename
     */
    ParserEngine.prototype.readConfig = function (configFilename) {
        if (configFilename === void 0) { configFilename = type_definitions_1.TS_CONFIG; }
        var fileName = path.resolve(this.projectPath, configFilename);
        var fileData = fs.readFileSync(path.resolve(this.projectPath, fileName), type_definitions_1.FILE_ENCODING);
        var jsonCS = new json_comment_stripper_1.JsonCommentStripper();
        fileData = jsonCS.stripComments(fileData);
        this.tsConfig = JSON.parse(fileData);
        var compilerOpt = this.tsConfig.compilerOptions;
        var reqFields = {};
        reqFields["baseUrl"] = compilerOpt.baseUrl;
        reqFields["outDir"] = compilerOpt.outDir;
        for (var key in reqFields) {
            var field = reqFields[key];
            if (utils_1.Utils.isEmpty(field)) {
                log(chalk_1.default.red.bold("Missing required field:") + ' "' + chalk_1.default.bold.underline(key) + '"');
                this.exit(22);
            }
        }
        return new project_options_1.ProjectOptions(compilerOpt);
    };
    /**
     *
     * @param ast
     * @param scope
     * @param func
     */
    ParserEngine.prototype.traverseSynTree = function (ast, scope, func) {
        func(ast);
        for (var key in ast) {
            if (ast.hasOwnProperty(key)) {
                var child = ast[key];
                if (typeof child === "object" && child !== null) {
                    if (Array.isArray(child)) {
                        child.forEach(function (newAst) {
                            //5
                            scope.traverseSynTree(newAst, scope, func);
                        });
                    }
                    else {
                        scope.traverseSynTree(child, scope, func);
                    }
                }
            }
        }
    };
    /**
     * Match a given file extension with the configured extensions
     * @param {string} fileExtension - ".xxx" or "xxx
     * @returns {boolean}
     */
    ParserEngine.prototype.matchExtension = function (fileExtension) {
        if (utils_1.Utils.isEmpty(fileExtension) || this.fileFilter.length === 0)
            return false;
        return this.fileFilter.indexOf(fileExtension) > -1;
    };
    /**
     * Recursively walking a directory structure and collect files
     * @param dir
     * @param filelist
     * @param fileExtension
     * @returns {Array<string>}
     */
    ParserEngine.prototype.walkSync = function (dir, filelist, fileExtension) {
        var scope = this;
        var files = fs.readdirSync(dir);
        filelist = filelist || [];
        fileExtension = fileExtension === undefined ? "" : fileExtension;
        for (var _i = 0, files_1 = files; _i < files_1.length; _i++) {
            var file = files_1[_i];
            if (fs.statSync(path.join(dir, file)).isDirectory()) {
                filelist = this.walkSync(path.join(dir, file), filelist, fileExtension);
            }
            else {
                var tmpExt = path.extname(file);
                if ((fileExtension.length > 0 && scope.matchExtension(tmpExt)) ||
                    fileExtension.length < 1 ||
                    fileExtension === "*.*") {
                    var fullFilename = path.join(dir, file);
                    filelist.push(fullFilename);
                }
            }
        }
        /*
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
    
          if (fs.statSync(path.join(dir, file)).isDirectory()) {
            filelist = this.walkSync(path.join(dir, file), filelist, fileExtension);
          } else {
            const tmpExt = path.extname(file);
    
            if (
              (fileExtension.length > 0 && scope.matchExtension(tmpExt)) ||
              fileExtension.length < 1 ||
              fileExtension === "*.*"
            ) {
              const fullFilename = path.join(dir, file);
              filelist.push(fullFilename);
            }
          }
        }
        */
        return filelist;
    };
    return ParserEngine;
}());
exports.ParserEngine = ParserEngine;
//# sourceMappingURL=parser-engine.js.map
'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
let fs = require('fs');
let path = require('path');
let esprima = require('esprima');
let escodegen = require('escodegen');
let chalk = require('chalk');
const utils_1 = require('./utils');
const json_comment_stripper_1 = require('./json-comment-stripper');
const project_options_1 = require('./project-options');
const type_definitions_1 = require('./type-definitions');
const type_definitions_2 = require('./type-definitions');
const log = console.log;
class ParserEngine {
    constructor() {
        this.nrFilesProcessed = 0;
        this.nrPathsProcessed = 0;
        this.compactMode = true;
    }
    exit(code = 5) {
        console.log('Terminating...');
        process.exit(code);
    }
    setProjectPath(projectPath) {
        if (!utils_1.Utils.isEmpty(projectPath) && !this.validateProjectPath(projectPath)) {
            log(chalk.red.bold('Project Path "' + chalk.underline(projectPath) + '" is invalid!'));
            return false;
        }
        this.projectPath = projectPath;
        return true;
    }
    setFileFilter(filter) {
        this.fileFilter = filter.map(e => {
            return !e.startsWith('.') ? '.' + e : e;
        });
    }
    validateProjectPath(projectPath) {
        let result = true;
        let configFile = utils_1.Utils.ensureTrailingPathDelimiter(projectPath);
        configFile += type_definitions_1.TS_CONFIG;
        if (!fs.existsSync(projectPath)) {
            result = false;
        }
        if (!fs.existsSync(configFile)) {
            log('TypeScript Compiler Configuration file ' + chalk.underline.bold(type_definitions_1.TS_CONFIG) + ' is missing!');
        }
        return result;
    }
    readProjectName() {
        let projectName = null;
        let filename = path.resolve(this.projectPath, 'package.json');
        if (fs.existsSync(filename)) {
            let json = require(filename);
            projectName = json.name;
        }
        return projectName;
    }
    execute() {
        const PROCESS_TIME = 'Operation finished in';
        console.time(PROCESS_TIME);
        if (!this.validateProjectPath(this.projectPath)) {
            log(chalk.bold.red('Invalid project path'));
            this.exit(10);
        }
        this.projectOptions = this.readConfig();
        let projectName = this.readProjectName();
        if (!utils_1.Utils.isEmpty(projectName)) {
            log(chalk.yellow('Parsing project: ') + chalk.bold(projectName) + ' ' + chalk.underline(this.projectPath));
        } else {
            log(chalk.yellow.bold('Parsing project at: ') + '"' + this.projectPath + '"');
        }
        this.appRoot = path.resolve(this.projectPath, this.projectOptions.baseUrl);
        this.distRoot = path.resolve(this.projectPath, this.projectOptions.outDir);
        let fileList = new Array();
        this.walkSync(this.distRoot, fileList, '.js');
        for (let i = 0; i < fileList.length; i++) {
            let filename = fileList[i];
            this.processFile(filename);
        }
        log(chalk.bold('Total files processed:'), this.nrFilesProcessed);
        log(chalk.bold('Total paths processed:'), this.nrPathsProcessed);
        console.timeEnd(PROCESS_TIME);
        log(chalk.bold.green('Project is prepared, now run it normally!'));
    }
    getRelativePathForRequiredFile(sourceFilename, jsRequire) {
        let options = this.projectOptions;
        for (let alias in options.pathMappings) {
            let mapping = options.pathMappings[alias];
            alias = utils_1.Utils.stripWildcard(alias);
            mapping = utils_1.Utils.stripWildcard(mapping);
            let requirePrefix = jsRequire.substring(0, jsRequire.indexOf(path.sep));
            if (requirePrefix == alias) {
                let result = jsRequire.replace(alias, mapping);
                utils_1.Utils.replaceDoubleSlashes(result);
                result = utils_1.Utils.ensureTrailingPathDelimiter(result);
                let absoluteJsRequire = path.join(this.distRoot, result);
                let sourceDir = path.dirname(sourceFilename);
                let relativePath = path.relative(sourceDir, absoluteJsRequire);
                if (relativePath[0] != '.') {
                    relativePath = './' + relativePath;
                }
                jsRequire = relativePath;
                break;
            }
        }
        return jsRequire;
    }
    processJsRequire(node, sourceFilename) {
        let resultNode = node;
        let requireInJsFile = utils_1.Utils.safeGetAstNodeValue(node);
        if (!utils_1.Utils.isEmpty(requireInJsFile) && utils_1.Utils.fileHavePath(requireInJsFile)) {
            let relativePath = this.getRelativePathForRequiredFile(sourceFilename, requireInJsFile);
            resultNode = {
                type: 'Literal',
                value: relativePath,
                raw: relativePath
            };
            this.nrPathsProcessed++;
        }
        return resultNode;
    }
    processFile(filename) {
        this.nrFilesProcessed++;
        let scope = this;
        let inputSourceCode = fs.readFileSync(filename, type_definitions_2.FILE_ENCODING);
        let ast = null;
        try {
            ast = esprima.parse(inputSourceCode, { tolerant: true });
        } catch (error) {
            console.log('Unable to parse file:', filename);
            console.log('Error:', error);
            this.exit();
        }
        this.traverseSynTree(ast, this, function (node) {
            if (node != undefined && node.type == 'CallExpression' && node.callee.name == 'require') {
                node.arguments[0] = scope.processJsRequire(node.arguments[0], filename);
            }
        });
        let option = {
            comment: true,
            format: {
                compact: this.compactMode,
                quotes: '"'
            }
        };
        let finalSource = escodegen.generate(ast, option);
        try {
            this.saveFileContents(filename, finalSource);
        } catch (error) {
            log(chalk.bold.red('Unable to write file:'), filename);
            this.exit();
        }
    }
    saveFileContents(filename, fileContents) {
        let error = false;
        fs.writeFileSync(filename, fileContents, type_definitions_2.FILE_ENCODING, error);
        if (error) {
            throw Error('Could not save file: ' + filename);
        }
    }
    readConfig(configFilename = type_definitions_1.TS_CONFIG) {
        let fileName = path.resolve(this.projectPath, configFilename);
        let fileData = fs.readFileSync(path.resolve(this.projectPath, fileName), type_definitions_2.FILE_ENCODING);
        let jsonCS = new json_comment_stripper_1.JsonCommentStripper();
        fileData = jsonCS.stripComments(fileData);
        this.tsConfig = JSON.parse(fileData);
        let compilerOpt = this.tsConfig.compilerOptions;
        let reqFields = [];
        reqFields['baseUrl'] = compilerOpt.baseUrl;
        reqFields['outDir'] = compilerOpt.outDir;
        for (let key in reqFields) {
            let field = reqFields[key];
            if (utils_1.Utils.isEmpty(field)) {
                log(chalk.red.bold('Missing required field:') + ' "' + chalk.bold.underline(key) + '"');
                this.exit(22);
            }
        }
        return new project_options_1.ProjectOptions(compilerOpt);
    }
    traverseSynTree(ast, scope, func) {
        func(ast);
        for (let key in ast) {
            if (ast.hasOwnProperty(key)) {
                let child = ast[key];
                if (typeof child === 'object' && child !== null) {
                    if (Array.isArray(child)) {
                        child.forEach(function (ast) {
                            scope.traverseSynTree(ast, scope, func);
                        });
                    } else {
                        scope.traverseSynTree(child, scope, func);
                    }
                }
            }
        }
    }
    matchExtension(fileExtension) {
        if (utils_1.Utils.isEmpty(fileExtension) || this.fileFilter.length == 0)
            return false;
        return this.fileFilter.indexOf(fileExtension) > -1;
    }
    walkSync(dir, filelist, fileExtension) {
        let scope = this;
        let files = fs.readdirSync(dir);
        filelist = filelist || [];
        fileExtension = fileExtension === undefined ? '' : fileExtension;
        for (let i = 0; i < files.length; i++) {
            let file = files[i];
            if (fs.statSync(path.join(dir, file)).isDirectory()) {
                filelist = this.walkSync(path.join(dir, file), filelist, fileExtension);
            } else {
                let tmpExt = path.extname(file);
                if (tmpExt.length > 0 && scope.matchExtension(tmpExt) || tmpExt == '*.*') {
                    let fullFilename = path.join(dir, file);
                    filelist.push(fullFilename);
                }
            }
        }
        return filelist;
    }
}
exports.ParserEngine = ParserEngine;
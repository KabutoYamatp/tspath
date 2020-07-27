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
import * as fs from "fs";
import * as path from "path";
import * as esprima from "esprima";
import * as escodegen from "escodegen";
import chalk from "chalk";

import { Utils } from "./utils";
import { JsonCommentStripper } from "./json-comment-stripper";
import { ProjectOptions } from "./project-options";
import { TS_CONFIG, FILE_ENCODING } from "./type-definitions";

const log = console.log;

export class ParserEngine {
  public projectPath!: string;

  nrFilesProcessed: number = 0;
  nrPathsProcessed: number = 0;
  appRoot!: string;
  distRoot!: string;
  compactMode: boolean = true;
  projectOptions!: ProjectOptions;
  tsConfig: any;
  fileFilter!: Array<string>;

  public exit(code: number = 5) {
    log("Terminating...");
    process.exit(code);
  }

  public setProjectPath(projectPath: string): boolean {
    if (!Utils.isEmpty(projectPath) && !this.validateProjectPath(projectPath)) {
      log(chalk.red.bold('Project Path "' + chalk.underline(projectPath) + '" is invalid!'));
      return false;
    }

    this.projectPath = projectPath;

    return true;
  }

  /**
   * Set the accepted file extensions, ensure leading . (dot)
   * @param {Array<string>} filter
   */
  public setFileFilter(filter: Array<string>) {
    this.fileFilter = filter.map((e) => {
      return !e.startsWith(".") ? "." + e : e;
    });
  }

  private validateProjectPath(projectPath: string): boolean {
    let result = true;

    let configFile = Utils.ensureTrailingPathDelimiter(projectPath) as string;
    configFile += TS_CONFIG;

    if (!fs.existsSync(projectPath)) {
      result = false;
    }

    if (!fs.existsSync(configFile)) {
      log(
        "TypeScript Compiler Configuration file " + chalk.underline.bold(TS_CONFIG) + " is missing!"
      );
    }

    return result;
  }

  /**
   * Attempts to read the name property form package.json
   * @returns {string}
   */
  private readProjectName(): string {
    let projectName: string = "";
    const filename = path.resolve(this.projectPath, "package.json");

    if (fs.existsSync(filename)) {
      const json = require(filename);
      projectName = json.name;
    }

    return projectName;
  }

  /**
   * Parse project and resolve paths
   */
  public execute() {
    const PROCESS_TIME = "Operation finished in";
    console.time(PROCESS_TIME);

    if (!this.validateProjectPath(this.projectPath)) {
      log(chalk.bold.red("Invalid project path"));
      this.exit(10);
    }

    this.projectOptions = this.readConfig();
    const projectName = this.readProjectName();

    if (!Utils.isEmpty(projectName)) {
      log(
        chalk.yellow("Parsing project: ") +
          chalk.bold(projectName) +
          " " +
          chalk.underline(this.projectPath)
      );
    } else {
      log(chalk.yellow.bold("Parsing project at: ") + '"' + this.projectPath + '"');
    }

    this.appRoot = path.resolve(this.projectPath, this.projectOptions.baseUrl);
    this.distRoot = path.resolve(this.projectPath, this.projectOptions.outDir);

    const fileList = new Array<string>();

    this.walkSync(this.distRoot, fileList, ".js");

    for (const filename of fileList) {
      this.processFile(filename);
    }
    /*
    for (let i = 0; i < fileList.length; i++) {
      const filename = fileList[i];
      this.processFile(filename);
    }
    */

    log(chalk.bold("Total files processed:"), this.nrFilesProcessed);
    log(chalk.bold("Total paths processed:"), this.nrPathsProcessed);

    console.timeEnd(PROCESS_TIME);
    log(chalk.bold.green("Project is prepared, now run it normally!"));
  }

  /**
   *
   * @param sourceFilename
   * @param jsRequire - require in javascript source "require("jsRequire")
   * @returns {string}
   */
  getRelativePathForRequiredFile(sourceFilename: string, jsRequire: string) {
    const options = this.projectOptions;

    for (let alias in options.pathMappings) {
      let mapping = options.pathMappings[alias];

      //TODO: Handle * properly
      alias = Utils.stripWildcard(alias);
      mapping = Utils.stripWildcard(mapping);

      // 2018-06-02: Workaround for bug with same prefix Aliases e.g @db and @dbCore
      // Cut alias prefix for mapping comparison
      const requirePrefix = jsRequire.substring(0, jsRequire.indexOf(path.sep));

      if (requirePrefix === alias) {
        let result = jsRequire.replace(alias, mapping);
        Utils.replaceDoubleSlashes(result);
        result = Utils.ensureTrailingPathDelimiter(result) as string;

        const absoluteJsRequire = path.join(this.distRoot, result);
        const sourceDir = path.dirname(sourceFilename);

        let relativePath = path.relative(sourceDir, absoluteJsRequire);

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
  }

  /**
   * Processes the filename specified in require("filename")
   * @param node
   * @param sourceFilename
   * @returns {any}
   */
  processJsRequire(node: any, sourceFilename: string): any {
    let resultNode = node;
    const requireInJsFile = Utils.safeGetAstNodeValue(node);

    /* Only proceed if the "require" contains a full file path, not
     * single references like "inversify"
     */
    if (!Utils.isEmpty(requireInJsFile) && Utils.fileHavePath(requireInJsFile)) {
      const relativePath = this.getRelativePathForRequiredFile(sourceFilename, requireInJsFile);
      resultNode = { type: "Literal", value: relativePath, raw: relativePath };

      this.nrPathsProcessed++;
    }

    return resultNode;
  }

  /**
   * Extracts all the requires from a single file and processes the paths
   * @param filename
   */
  processFile(filename: string) {
    this.nrFilesProcessed++;

    const scope = this;
    const inputSourceCode = fs.readFileSync(filename, FILE_ENCODING);
    let ast = null;

    try {
      ast = esprima.parseScript(inputSourceCode); //, { raw: true, tokens: true, range: true, comment: true });
    } catch (error) {
      console.log("Unable to parse file:", filename);
      console.log("Error:", error);
      this.exit();
    }

    this.traverseSynTree(ast, this, function (node: any) {
      if (node !== undefined && node.type === "CallExpression" && node.callee.name === "require") {
        node.arguments[0] = scope.processJsRequire(node.arguments[0], filename);
      }
    });

    const option = { comment: true, format: { compact: this.compactMode, quotes: '"' } };
    const finalSource = escodegen.generate(ast, option);

    try {
      this.saveFileContents(filename, finalSource);
    } catch (error) {
      log(chalk.bold.red("Unable to write file:"), filename);
      this.exit();
    }
  }

  /**
   * Saves file contents to disk
   * @param filename
   * @param fileContents
   */
  saveFileContents(filename: string, fileContents: string) {
    try {
      fs.writeFileSync(filename, fileContents, FILE_ENCODING);
    } catch (err) {
      throw Error("Could not save file: " + filename);
    }
  }

  /**
   * Read and parse the TypeScript configuration file
   * @param configFilename
   */
  readConfig(configFilename: string = TS_CONFIG): ProjectOptions {
    const fileName = path.resolve(this.projectPath, configFilename);
    let fileData = fs.readFileSync(path.resolve(this.projectPath, fileName), FILE_ENCODING);

    const jsonCS = new JsonCommentStripper();
    fileData = jsonCS.stripComments(fileData);

    this.tsConfig = JSON.parse(fileData);

    const compilerOpt = this.tsConfig.compilerOptions;

    const reqFields = {} as { [idx: string]: any };
    reqFields["baseUrl"] = compilerOpt.baseUrl;
    reqFields["outDir"] = compilerOpt.outDir;

    for (const key in reqFields) {
      const field = reqFields[key];
      if (Utils.isEmpty(field)) {
        log(chalk.red.bold("Missing required field:") + ' "' + chalk.bold.underline(key) + '"');
        this.exit(22);
      }
    }

    return new ProjectOptions(compilerOpt);
  }

  /**
   *
   * @param ast
   * @param scope
   * @param func
   */
  traverseSynTree(ast: any, scope: any, func: any) {
    func(ast);
    for (const key in ast) {
      if (ast.hasOwnProperty(key)) {
        const child = ast[key];

        if (typeof child === "object" && child !== null) {
          if (Array.isArray(child)) {
            child.forEach(function (newAst) {
              //5
              scope.traverseSynTree(newAst, scope, func);
            });
          } else {
            scope.traverseSynTree(child, scope, func);
          }
        }
      }
    }
  }

  /**
   * Match a given file extension with the configured extensions
   * @param {string} fileExtension - ".xxx" or "xxx
   * @returns {boolean}
   */
  private matchExtension(fileExtension: string): boolean {
    if (Utils.isEmpty(fileExtension) || this.fileFilter.length === 0) return false;
    return this.fileFilter.indexOf(fileExtension) > -1;
  }

  /**
   * Recursively walking a directory structure and collect files
   * @param dir
   * @param filelist
   * @param fileExtension
   * @returns {Array<string>}
   */
  public walkSync(dir: string, filelist: Array<string>, fileExtension?: string) {
    const scope = this;
    const files = fs.readdirSync(dir);
    filelist = filelist || [];
    fileExtension = fileExtension === undefined ? "" : fileExtension;

    for (const file of files) {
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
  }
}

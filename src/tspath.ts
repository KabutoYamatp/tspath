#! /usr/bin/env node

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

const pkg = require("../package.json");
import chalk from "chalk"
import * as yargs from "yargs"
const Confirm = require("prompt-confirm");

const log = console.log;
const argv = yargs.argv;


import { ParserEngine } from "./parser-engine";
import { ParentFileFinder } from "./parent-file-finder";
import { TS_CONFIG } from "./type-definitions";

const engine = new ParserEngine();
function processPath(projectPath: string) {
	if (engine.setProjectPath(projectPath)) {
	  engine.execute();
	}
}

function exist_string(val:any): val is string{
	return val && typeof val === "string";
}
  

export function TSpath() {
  log(chalk.yellow("TSPath " + pkg.version));
  let filter = ["js"];
  const force: boolean = (!!argv.force || !!argv.f);
  const projectPath = process.cwd();
  const compactOutput = argv.preserve ? false : true;
  const findResult = ParentFileFinder.findFile(projectPath, TS_CONFIG);
  //Check existence of argv param filter
  const argvParamFilter = argv.ext || argv.filter;
  if (exist_string(argvParamFilter)) {
	 filter = argvParamFilter.split(",").map((ext) => {
      return ext.replace(/\s/g, "");
    });
  }

  if (filter.length === 0) {
    log(chalk.bold.red("File filter missing!"));
    process.exit(23);
  }

  engine.compactMode = compactOutput;
  engine.setFileFilter(filter);

  if (force && findResult.fileFound) {
    processPath(findResult.path);
  } else if (findResult.fileFound) {
    new Confirm("Process project at: <" + findResult.path + "> ?").ask(function (
      answer:any
    ) {
      if (answer) {
        processPath(findResult.path);
      }
    });
  } else {
    log(chalk.bold("No project root found!"));
  }
}

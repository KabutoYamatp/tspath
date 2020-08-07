'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
class ProjectOptions {
    processMappings(mappings) {
        for (var alias in mappings) {
            this.pathMappings[alias] = mappings[alias][0];
        }
    }
    constructor(tsconfigObj) {
        this.pathMappings = {};
        this.outDir = tsconfigObj.outDir;
        this.baseUrl = tsconfigObj.baseUrl;
        this.processMappings(tsconfigObj.paths);
    }
}
exports.ProjectOptions = ProjectOptions;
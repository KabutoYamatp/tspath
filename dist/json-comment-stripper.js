'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
var JsonParserState;
(function (JsonParserState) {
    JsonParserState[JsonParserState['None'] = 0] = 'None';
    JsonParserState[JsonParserState['InLineComment'] = 1] = 'InLineComment';
    JsonParserState[JsonParserState['InBlockComment'] = 2] = 'InBlockComment';
    JsonParserState[JsonParserState['InObject'] = 3] = 'InObject';
    JsonParserState[JsonParserState['InQuote'] = 4] = 'InQuote';
}(JsonParserState || (JsonParserState = {})));
class JsonCommentStripper {
    constructor() {
        this.currState = JsonParserState.None;
        this.prevtState = JsonParserState.None;
    }
    stripComments(data) {
        return this.parse(data);
    }
    isQuote(char) {
        return char == '"' || char == '\'';
    }
    setState(state) {
        if (state != this.currState) {
            this.prevtState = this.currState;
            this.currState = state;
        }
    }
    inState(state) {
        return this.currState == state;
    }
    setPrevState() {
        this.setState(this.prevtState);
    }
    inComment() {
        return this.inState(JsonParserState.InLineComment) || this.inState(JsonParserState.InBlockComment);
    }
    parse(data) {
        var lineNum = 1;
        var linePos = 1;
        var prevChar = '';
        var currChar = '';
        var aheadChar = '';
        var chunk = '';
        for (var i = 0; i < data.length; i++) {
            prevChar = currChar;
            currChar = data[i];
            aheadChar = data[i + 1];
            linePos++;
            if (currChar == '\n') {
                if (this.inState(JsonParserState.InLineComment)) {
                    this.setState(JsonParserState.None);
                }
                linePos = 1;
                lineNum++;
            }
            if (currChar == '/' && aheadChar == '*' && !this.inState(JsonParserState.InQuote)) {
                i++;
                this.setState(JsonParserState.InBlockComment);
                continue;
            }
            if (currChar == '/' && aheadChar == '/' && this.inState(JsonParserState.None)) {
                i++;
                this.setState(JsonParserState.InLineComment);
                continue;
            }
            if (currChar == '*' && aheadChar == '/' && this.inState(JsonParserState.InBlockComment)) {
                i++;
                this.setPrevState();
                continue;
            }
            if (this.isQuote(currChar) && this.inState(JsonParserState.None)) {
                this.setState(JsonParserState.InQuote);
            } else if (this.isQuote(currChar) && this.inState(JsonParserState.InQuote)) {
                this.setState(JsonParserState.None);
            }
            if (!this.inComment())
                chunk += currChar;
        }
        return chunk;
    }
}
exports.JsonCommentStripper = JsonCommentStripper;
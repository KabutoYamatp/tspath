export declare class JsonCommentStripper {
    private currState;
    private prevtState;
    stripComments(data: string): string;
    private isQuote;
    private setState;
    private inState;
    private setPrevState;
    private inComment;
    parse(data: string): string;
}

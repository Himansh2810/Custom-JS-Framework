class RectorError extends Error {
    constructor(message) {
        super(message);
        this.name = "RectorError";
        if (this.stack) {
            const lines = this.stack.split("\n");
            this.stack = [
                lines[0],
                ...lines.filter((line) => !line.includes("RectorJS.") && !line.includes("RectorNavigation.")),
            ].join("\n");
        }
    }
}
export { RectorError };

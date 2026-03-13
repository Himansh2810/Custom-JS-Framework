export class SyntheticEvent {
    constructor(nativeEvent) {
        this.currentTarget = null;
        this._propagationStopped = false;
        this._defaultPrevented = false;
        this.nativeEvent = nativeEvent;
        this.type = nativeEvent.type;
        this.target = nativeEvent.target;
    }
    stopPropagation() {
        this._propagationStopped = true;
        this.nativeEvent.stopPropagation();
    }
    preventDefault() {
        this._defaultPrevented = true;
        this.nativeEvent.preventDefault();
    }
    get propagationStopped() {
        return this._propagationStopped;
    }
    get defaultPrevented() {
        return this._defaultPrevented;
    }
}

var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { estimateObjectSize, isCamelCase, isComponentFunction, isEqual, isPlainObject, reservedJSKeys, selfClosingTags, } from "./utils.js";
const GLOBAL = "global";
class RectorError extends Error {
    constructor(message) {
        super(`[RectorJS] ${message}`);
        this.name = "RectorError";
        if (this.stack) {
            const lines = this.stack.split("\n");
            this.stack = [
                lines[0],
                ...lines.filter((line) => !line.includes("RectorJS.")),
            ].join("\n");
        }
    }
}
class BiMap {
    constructor() {
        this.fwd = {};
        this.bwd = {};
    }
    set(key, value) {
        this.fwd[key] = value;
        this.bwd[value] = key;
    }
    clear() {
        this.fwd = {};
        this.bwd = {};
    }
    getByKey(key) {
        return this.fwd[key];
    }
    getByVal(value) {
        return this.bwd[value];
    }
}
class RectorJS {
    // constructor setup //
    constructor() {
        // Private Properties //
        this.State = {};
        this.stateUsageMap = {};
        this.stateIfBlock = {};
        this.stateLoopBlock = {};
        this.effects = new Map();
        this.refs = {};
        this.exprPrevValue = {};
        this.cmpId = 0;
        this.scopeStack = [GLOBAL];
        this.isAppRendering = false;
        this.routes = {};
        this.rectorKeywords = new Set(["bound condition", "bound map"]);
        this.componentNameIdMap = new BiMap();
        this.componentTree = {};
        this.globalState = this.stateUsage(GLOBAL);
        this.effectQueue = new Map();
        this.elements = new Proxy({}, {
            get: (_, tag) => {
                return (attributes) => this.createElement(tag, attributes);
            },
        });
    }
    // -----Public methods----- //
    jsx(fn, props) {
        if (typeof fn === "function") {
            const componentName = isComponentFunction(fn);
            if (!componentName || this.rectorKeywords.has(componentName)) {
                return fn(props);
            }
            const cmpId = `cmp-${this.cmpId++}`;
            this.componentNameIdMap.set(cmpId, componentName);
            this.componentTree[cmpId] = new Set([...this.scopeStack].slice(1));
            this.scopeStack.push(cmpId);
            const app = fn(props);
            this.scopeStack.pop();
            return app;
        }
        if (typeof fn === "string") {
            if (fn === "state" && props.val) {
                return `[[${props.val}]]`;
            }
            return "";
        }
        return null;
    }
    Routes(routes) {
        window.addEventListener("popstate", () => {
            const pathName = window.location.pathname;
            this.navigate(pathName);
        });
        Object.entries(routes).forEach(([path, routeComp]) => {
            if (!path.startsWith("/")) {
                throw new RectorError("Route path must start with '/'");
            }
            if (typeof routeComp === "function") {
                this.routes[path] = routeComp;
            }
            else {
                Object.assign(this.routes, routeComp);
            }
        });
    }
    ProtectedRoutes(RouteAccess) {
        this.routeAccess = {
            protectedRoutes: new Set(RouteAccess.routes),
            grantAccess: RouteAccess.grantAccess,
            onFallback: RouteAccess.onFallback,
        };
    }
    Layout(childRoutes, layoutComponent) {
        let routes = {};
        const buildLayout = (cr) => {
            Object.entries(cr).forEach(([path, rl]) => {
                let routeEl = rl;
                if (typeof routeEl === "function") {
                    routes[path] = () => layoutComponent(routeEl);
                }
                else {
                    buildLayout(routeEl);
                }
            });
        };
        buildLayout(childRoutes);
        return routes;
    }
    navigate(path) {
        history.pushState({}, "", path);
        this.routeCleanUp();
        this.renderApp();
    }
    getComponentState() {
        return this.stateUsage(this.activeScope());
    }
    renderApp() {
        return __awaiter(this, void 0, void 0, function* () {
            const body = document.querySelector("body");
            const initPath = window.location.pathname;
            const app = this.routes[initPath];
            if (!app) {
                const fallbackRoute = this.routes["/*"];
                if (fallbackRoute) {
                    body.innerHTML = "";
                    this.isAppRendering = true;
                    body.append(fallbackRoute());
                    this.isAppRendering = false;
                    return;
                }
                else {
                    throw new RectorError(`INVALID ROUTE: '${initPath}' route is not initialized.\nProvide fallback route '/*' to handle any undeclared route.`);
                }
            }
            const isRouteAccessible = yield this.checkRouteAccess(initPath);
            if (!isRouteAccessible) {
                this.routeAccess.onFallback();
                return;
            }
            body.innerHTML = ""; // Clear existing content
            this.isAppRendering = true;
            console.time("App_loaded_in");
            body.append(this.jsx(app, {}));
            console.timeEnd("App_loaded_in");
            this.isAppRendering = false;
            this.runEffects();
        });
    }
    initGlobalState(stateName, value) {
        return this.configureState(stateName, value, GLOBAL);
    }
    initState(stateName, value) {
        if (this.activeScope() == GLOBAL) {
            throw new RectorError("You can't initial state outside of a component, try 'initGlobalState' instead.");
        }
        return this.configureState(stateName, value, this.activeScope());
    }
    setEffect(fn, depends) {
        const SCOPE = this.activeScope();
        if (typeof fn !== "function") {
            throw new RectorError("Effect must be a function");
        }
        if (depends && depends.length > 0) {
            depends.forEach((stateName) => {
                var _a, _b;
                if (typeof stateName !== "string") {
                    throw new RectorError("[setEffect] Dependencies must be an array of strings");
                }
                this.checkStateValid(stateName, SCOPE);
                const prevStateEffects = (_a = this.effects.get(SCOPE)) !== null && _a !== void 0 ? _a : {};
                this.effects.set(SCOPE, Object.assign(Object.assign({}, prevStateEffects), { [stateName]: [...((_b = prevStateEffects === null || prevStateEffects === void 0 ? void 0 : prevStateEffects[stateName]) !== null && _b !== void 0 ? _b : []), fn] }));
            });
        }
        if (this.effectQueue.has(SCOPE)) {
            const cmpQueue = this.effectQueue.get(SCOPE);
            cmpQueue.push(fn);
            this.effectQueue.set(SCOPE, cmpQueue);
        }
        else {
            this.effectQueue.set(SCOPE, [fn]);
        }
    }
    condition(config) {
        const { expression, onTrueRender, onFalseRender } = config;
        const SCOPE = this.activeScope();
        this.validateExpression(expression);
        let { stateKeys, scopeState } = this.mapStateKeys(expression, SCOPE);
        let onTrueEl = this.validateConditionalElements(onTrueRender, true);
        let onFalseEl = this.validateConditionalElements(onFalseRender, false);
        try {
            const fn = new Function("State", `with(State) {return ${expression}}`);
            const isTrue = fn(Object.assign(Object.assign({}, this.State[SCOPE]), scopeState));
            if (!this.exprPrevValue[SCOPE]) {
                this.exprPrevValue[SCOPE] = {};
            }
            this.exprPrevValue[SCOPE][expression] = isTrue;
            for (let stateName of stateKeys) {
                let crrScope = SCOPE;
                const splittedState = stateName.split(":");
                if (splittedState.length > 1) {
                    const [compScope, compStateName] = splittedState;
                    if (compScope === "$") {
                        crrScope = GLOBAL;
                    }
                    else {
                        crrScope = compScope;
                    }
                    stateName = compStateName;
                }
                if (!this.stateIfBlock[crrScope]) {
                    this.stateIfBlock[crrScope] = {};
                }
                if (!this.stateIfBlock[crrScope][stateName]) {
                    this.stateIfBlock[crrScope][stateName] = [];
                }
                this.stateIfBlock[crrScope][stateName].push({
                    exp: expression,
                    trueElement: onTrueEl,
                    falseElement: onFalseEl,
                    scope: SCOPE,
                });
            }
            return isTrue ? onTrueEl : onFalseEl;
        }
        catch (error) {
            if (error instanceof SyntaxError || error instanceof RectorError) {
                throw new RectorError(`Invalid inline JS expression syntax: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            else {
                throw new RectorError(error === null || error === void 0 ? void 0 : error.message);
            }
        }
    }
    map(config) {
        const { stateName: sn, render, keyExtractor } = config;
        const SCOPE = this.activeScope();
        let { stateKeys } = this.mapStateKeys(sn, SCOPE);
        let stateName = stateKeys[0];
        let crrScope = SCOPE;
        const splittedState = stateName.split(":");
        if (splittedState.length > 1) {
            const [compScope, compStateName] = splittedState;
            if (compScope === "$") {
                crrScope = GLOBAL;
            }
            else {
                crrScope = compScope;
            }
            stateName = compStateName;
        }
        const items = this.State[crrScope][stateName];
        const fragment = document.createDocumentFragment();
        const commentRef = document.createComment("Rector Map");
        fragment.appendChild(commentRef);
        if (!this.stateLoopBlock[crrScope]) {
            this.stateLoopBlock[crrScope] = {};
        }
        if (!this.stateLoopBlock[crrScope][stateName]) {
            this.stateLoopBlock[crrScope][stateName] = [];
        }
        let firstChild = null;
        items.forEach((item, index) => {
            const child = render(item, index);
            if (index === 0) {
                firstChild = child;
            }
            fragment.appendChild(child);
        });
        this.stateLoopBlock[crrScope][stateName].push({
            renderElement: render,
            firstNode: firstChild,
            keyExtractor,
            commentRef,
        });
        return fragment;
    }
    useElementRef(elementTagName) {
        const SCOPE = this.activeScope();
        return new Proxy({}, {
            get: (_, refName) => {
                var _a;
                const refKey = `${elementTagName}:${refName}`;
                // @ts-ignore
                if (!Object.hasOwn((_a = this.refs[SCOPE]) !== null && _a !== void 0 ? _a : {}, refKey)) {
                    throw new RectorError(`Ref '${refName}' doesn't exist on any '${elementTagName}' element.`);
                }
                return this.refs[SCOPE][refKey];
            },
        });
    }
    // public elementRefs = new Proxy({} as RectorRefs, {
    //   get(_, tag: keyof HTMLElementTagNameMap) {
    //     return new Proxy({} as RectorRefs[typeof tag], {
    //       get(_, refName: string) {
    //         return this.refs[refName];
    //       },
    //     });
    //   },
    // });
    // ------Private methods ---- //
    activeScope() {
        const L = this.scopeStack.length;
        return this.scopeStack[L - 1];
    }
    routeCleanUp() {
        var _a;
        this.State = { [GLOBAL]: (_a = this.State[GLOBAL]) !== null && _a !== void 0 ? _a : {} };
        this.stateIfBlock = {};
        this.stateLoopBlock = {};
        this.stateUsageMap = {};
        this.exprPrevValue = {};
        this.effects = new Map();
        this.refs = {};
        this.componentNameIdMap.clear();
        this.componentTree = {};
    }
    stateUsage(scope) {
        var _a;
        if (!this.State[scope]) {
            this.State[scope] = {};
        }
        return new Proxy((_a = this.State[scope]) !== null && _a !== void 0 ? _a : {}, {
            get: (_, stateName) => {
                var _a;
                this.checkStateValid(stateName, scope);
                return (_a = this.State[scope]) === null || _a === void 0 ? void 0 : _a[stateName];
            },
        });
    }
    configureState(stateName, value, scope) {
        if (typeof stateName !== "string") {
            throw new RectorError("State name must be of string type.");
        }
        stateName = stateName.trim();
        if (!stateName) {
            throw new RectorError("State name should be a valid string");
        }
        if (stateName === "$") {
            throw new RectorError(`Restricted state name '${stateName}': State name '$' is reserved in RectorJS for Global state context, use another state name.`);
        }
        if (isCamelCase(stateName)) {
            const cmpId = this.componentNameIdMap.getByVal(stateName);
            if (cmpId) {
                throw new RectorError(`Restricted state name '${stateName}': Component with same name exist in parent/ancestor tree of this component.`);
            }
        }
        if (!/^[$A-Z_a-z][$\w]*$/.test(stateName)) {
            throw new RectorError(`Invalid state name '${stateName}': State names must start with a letter, $, or _ and only contain alphanumeric characters, $, or _.`);
        }
        if (reservedJSKeys.has(stateName)) {
            throw new RectorError(`Invalid state name '${stateName}': JavaScript keywords are not allowed as State name.`);
        }
        const isCmp = scope !== GLOBAL;
        if (!this.State[scope]) {
            this.State[scope] = {};
        }
        // @ts-ignore
        if (Object.hasOwn(this.State[scope], stateName)) {
            throw new RectorError(`${!isCmp ? "Global" : ""} State '${stateName}' is already declared in this ${!isCmp ? "App" : "Component"}.`);
        }
        this.State[scope][stateName] = value;
        return (val) => {
            const oldValue = this.State[scope][stateName];
            const newVal = typeof val === "function" ? val(oldValue) : val;
            this.State[scope][stateName] = newVal;
            if (!isEqual(oldValue, newVal)) {
                this.reRender(stateName, oldValue, scope);
                this.runEffects(stateName, scope);
            }
        };
    }
    checkRouteAccess(path) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.routeAccess) {
                return true;
            }
            const isPathProtected = this.routeAccess.protectedRoutes.has(path);
            if (isPathProtected) {
                const hasAccess = this.routeAccess.grantAccess();
                return hasAccess;
            }
            return true;
        });
    }
    validateConditionalElements(element, elType) {
        if (element instanceof DocumentFragment) {
            throw new RectorError(`at ${elType ? "onTrueRender" : "onFalseRender"}: 'map' loop block cannot be directly use in 'condition' block, try to wrap it in any parent element.`);
        }
        if (typeof element === "string" || typeof element === "number") {
            return document.createTextNode(element.toString());
        }
        return element ? element : document.createTextNode("");
    }
    runEffects(stateName, scope) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (stateName && scope) {
                const effects = (_a = this.effects.get(scope)) !== null && _a !== void 0 ? _a : {};
                const stateEffects = effects[stateName];
                if (stateEffects && stateEffects.length > 0) {
                    stateEffects.forEach((fn) => fn());
                }
            }
            else {
                this.effectQueue.forEach((effectArray) => {
                    effectArray.forEach((fn) => fn());
                });
                this.effectQueue.clear();
            }
        });
    }
    updateIfBlock(utl) {
        let { scopeState } = this.mapStateKeys(utl.exp, utl.scope);
        try {
            const fn = new Function("State", `with(State) {return ${utl.exp}}`);
            const isTrue = fn(Object.assign(Object.assign({}, this.State[utl.scope]), scopeState));
            const prevVal = this.exprPrevValue[utl.scope][utl.exp];
            if (prevVal !== isTrue) {
                const El = (con) => (con ? utl.trueElement : utl.falseElement);
                El(prevVal).replaceWith(El(isTrue));
                return {
                    exp: utl.exp,
                    val: isTrue,
                };
            }
        }
        catch (error) {
            throw new RectorError(error);
        }
    }
    updateLoopBlock(utl, stateName, oldValue) {
        const newList = this.State[utl.scope][stateName];
        const oldList = [...oldValue];
        let firstChild = utl.firstNode;
        let parent = (firstChild === null || firstChild === void 0 ? void 0 : firstChild.parentNode) || utl.parentNode || utl.commentRef.parentNode;
        if (!parent)
            throw new RectorError("No parent detected of 'map' loop, try to wrap 'Rector.map' in any parent element.");
        const children = Array.from(parent.childNodes);
        const startIndex = children.indexOf(firstChild);
        const oldNodes = children.slice(startIndex, startIndex + oldList.length);
        const keyExtractor = utl.keyExtractor || ((_, i) => i);
        const oldMap = new Map();
        oldList.forEach((item, i) => {
            const key = keyExtractor(item, i);
            if (key === null ||
                key === undefined ||
                (typeof key !== "string" && typeof key !== "number")) {
                throw new RectorError(`Invalid keyExtractor return value at index ${i}: ` +
                    `${JSON.stringify(key)}. ` +
                    `Expected string or number.`);
            }
            const node = oldNodes[i];
            if (node) {
                oldMap.set(String(key), {
                    node,
                    index: i + startIndex,
                });
            }
        });
        let newFirstChild = null;
        newList.forEach((item, j) => {
            const key = String(keyExtractor(item, j));
            const existing = oldMap.get(key);
            const v = startIndex + j;
            if (existing) {
                const olditem = oldList[existing.index - startIndex];
                let crrNode = existing.node;
                if (!isEqual(olditem, item)) {
                    crrNode = utl.renderElement(item, j);
                    existing.node.replaceWith(crrNode);
                }
                if (existing.index !== v) {
                    parent.insertBefore(existing.node, parent.childNodes[v] || null);
                }
                if (j === 0) {
                    newFirstChild = crrNode;
                }
                oldMap.delete(key);
            }
            else {
                const node = utl.renderElement(item, j);
                if (j === 0) {
                    newFirstChild = node;
                }
                parent.insertBefore(node, parent.childNodes[v] || null);
            }
        });
        oldMap.forEach(({ node }) => {
            if (node) {
                parent.removeChild(node);
            }
        });
        utl.parentNode = parent;
        utl.firstNode = newFirstChild;
    }
    reRender(stateName, oldValue, scope) {
        var _a, _b, _c;
        const stateFullElements = (_a = this.stateUsageMap[scope]) === null || _a === void 0 ? void 0 : _a[stateName];
        if (stateFullElements) {
            for (let sfe of stateFullElements) {
                const { parsedStr: updatedStateExpression } = this.parseStateVars(sfe.rawString, sfe.scope, false);
                sfe.element.childNodes[sfe.pos].nodeValue = updatedStateExpression;
            }
        }
        const ifBlocks = (_b = this.stateIfBlock[scope]) === null || _b === void 0 ? void 0 : _b[stateName];
        if (ifBlocks) {
            const expVals = [];
            const uniqExps = new Set();
            for (let utl of ifBlocks) {
                const exec = this.updateIfBlock(utl);
                if (exec && !uniqExps.has(exec.exp)) {
                    expVals.push(Object.assign(Object.assign({}, exec), { scope: utl.scope }));
                    uniqExps.add(exec.exp);
                }
            }
            expVals.forEach(({ exp, val, scope }) => {
                this.exprPrevValue[scope][exp] = val;
            });
        }
        const loopBlocks = (_c = this.stateLoopBlock[scope]) === null || _c === void 0 ? void 0 : _c[stateName];
        if (loopBlocks) {
            for (let utl of loopBlocks) {
                utl.scope = scope;
                this.updateLoopBlock(utl, stateName, oldValue);
            }
        }
    }
    checkStateValid(stateName, scope, checkExist = true) {
        var _a;
        if (reservedJSKeys.has(stateName)) {
            throw new RectorError(`Invalid token: '${stateName}', Can not use global objects or JS keywords in inline expression`);
        }
        if (checkExist) {
            // @ts-ignore
            if (!Object.hasOwn((_a = this.State[scope]) !== null && _a !== void 0 ? _a : {}, stateName)) {
                const scopeErrorMes = scope === GLOBAL
                    ? `Global State '${stateName}' is not declared in the App.`
                    : `State '${stateName}' is not declared in '${this.componentNameIdMap.getByKey(scope)}' component.`;
                throw new RectorError(scopeErrorMes);
            }
        }
    }
    validateExpression(expr) {
        const dynamicExpr = expr.replace(/(['"`])(?:\\\1|.)*?\1/g, ""); // removes content inside '', "", or ``
        const assignmentPattern = /[^=!<>]=[^=]/;
        if (assignmentPattern.test(dynamicExpr)) {
            throw new RectorError(`Invalid condition: assignment operation (=) is not allowed as expression.`);
        }
    }
    mapStateKeys(expression, scope) {
        let scopeState = {};
        let extractedKeys = this.extractStateKeys(expression);
        let stateKeys = extractedKeys.map((stateKey) => {
            var _a;
            const splittedKey = stateKey.split(".");
            if (splittedKey.length > 1) {
                const [firstKey, stateName] = splittedKey;
                if (firstKey === "$") {
                    this.checkStateValid(stateName, GLOBAL);
                    scopeState[firstKey] = this.State[GLOBAL];
                    return `${firstKey}:${stateName}`;
                }
                if (isCamelCase(firstKey)) {
                    // @ts-ignore
                    if (Object.hasOwn((_a = this.State[scope]) !== null && _a !== void 0 ? _a : {}, firstKey)) {
                        this.checkStateValid(firstKey, scope, false);
                        return firstKey;
                    }
                    else {
                        const parentCompId = this.componentNameIdMap.getByVal(firstKey);
                        if (parentCompId) {
                            const parentIds = this.componentTree[scope];
                            if (parentIds.has(parentCompId)) {
                                this.checkStateValid(stateName, parentCompId);
                                scopeState[firstKey] = this.State[parentCompId];
                                return `${parentCompId}:${stateName}`;
                            }
                            else {
                                const currentCompName = this.componentNameIdMap.getByKey(scope);
                                throw new RectorError(`at '${stateKey}': Component named '${firstKey}' is not parent/ancestor of '${currentCompName}' component.`);
                            }
                        }
                        else {
                            this.checkStateValid(firstKey, scope);
                        }
                    }
                }
                this.checkStateValid(firstKey, scope);
                return firstKey;
            }
            this.checkStateValid(stateKey, scope);
            return stateKey;
        });
        return { scopeState, stateKeys };
    }
    parseStateVars(str, scope, validateExpr = true) {
        let matchStr = null;
        let isPsDefined = true;
        let parsedStr = str.replace(/\[\[\s*([^\]]+)\s*\]\]/g, (_, keyExpression) => {
            keyExpression = keyExpression === null || keyExpression === void 0 ? void 0 : keyExpression.trim();
            if (keyExpression) {
                if (validateExpr) {
                    this.validateExpression(keyExpression);
                }
                let { scopeState, stateKeys } = this.mapStateKeys(keyExpression, scope);
                matchStr = stateKeys;
                try {
                    const fn = new Function("State", `with(State) {return ${keyExpression}}`);
                    return fn(Object.assign(Object.assign({}, this.State[scope]), scopeState));
                }
                catch (error) {
                    throw new RectorError(error === null || error === void 0 ? void 0 : error.message);
                }
            }
            else {
                isPsDefined = false;
            }
        });
        return { parsedStr: isPsDefined ? parsedStr : "", matchStr };
    }
    extractStateKeys(expr) {
        const dynamicExpr = expr.trim().replace(/(['"`])(?:\\\1|.)*?\1/g, "");
        const matches = [
            ...dynamicExpr.matchAll(/([$a-zA-Z_][$\w]*(?:\.[a-zA-Z_$][\w$]*)*)/g),
        ];
        const identifiers = matches.map((m) => m[1]);
        return [...new Set(identifiers)];
    }
    createElement(tag, attributes) {
        const SCOPE = this.activeScope();
        const elem = document.createElement(tag);
        const children = attributes.children;
        Object.entries(attributes).forEach(([key, value]) => {
            let val = value;
            if (key !== "children") {
                if (key.startsWith("on") && typeof val === "function") {
                    elem.addEventListener(key.slice(2), val);
                }
                else {
                    if (key === "checked") {
                        // @ts-ignore
                        elem.checked = value;
                    }
                    else if (key.trim() === "ref") {
                        const refKeyName = `${tag}:${val}`;
                        if (!this.refs[SCOPE]) {
                            this.refs[SCOPE] = {};
                        }
                        this.refs[SCOPE][refKeyName] = elem;
                    }
                    else if (key === "className") {
                        elem.setAttribute("class", val);
                    }
                    else {
                        elem.setAttribute(key, val);
                    }
                }
            }
        });
        if (!children || selfClosingTags.has(tag)) {
            return elem;
        }
        const finalEl = this.parseChildren(elem, Array.isArray(children) ? children : [children]);
        return finalEl;
    }
    parseChildren(elem, children) {
        const SCOPE = this.activeScope();
        for (let [idx, child] of children.entries()) {
            if (typeof child === "function" ||
                isPlainObject(child) ||
                Array.isArray(child)) {
                throw new RectorError("Functions, Objects and Arrays are not allowed as children");
            }
            if (typeof child === "string") {
                const childStr = child;
                let splittedStr = childStr
                    .split(/(\[\[\s*[^\]]+\s*\]\])/g)
                    .filter((s) => s !== "");
                for (let [idv, vl] of splittedStr.entries()) {
                    let { parsedStr, matchStr } = this.parseStateVars(vl, SCOPE);
                    if (matchStr) {
                        for (let stateName of matchStr) {
                            let crrScope = SCOPE;
                            const splittedState = stateName.split(":");
                            if (splittedState.length > 1) {
                                const [compScope, compStateName] = splittedState;
                                if (compScope === "$") {
                                    crrScope = GLOBAL;
                                }
                                else {
                                    crrScope = compScope;
                                }
                                stateName = compStateName;
                            }
                            if (!this.stateUsageMap[crrScope]) {
                                this.stateUsageMap[crrScope] = {};
                            }
                            if (!this.stateUsageMap[crrScope][stateName]) {
                                this.stateUsageMap[crrScope][stateName] = [];
                            }
                            this.stateUsageMap[crrScope][stateName].push({
                                element: elem,
                                pos: idx + idv,
                                rawString: vl,
                                scope: SCOPE,
                            });
                        }
                    }
                    elem.append(document.createTextNode(parsedStr));
                }
            }
            else {
                if (child !== undefined) {
                    elem.append(typeof child === "number" ? document.createTextNode(child) : child);
                }
            }
        }
        return elem;
    }
    print(showValues) {
        if (showValues) {
            console.log("States: ", this.State, "\nState If Blocks: ", this.stateIfBlock, "\nState Loop Blocks: ", this.stateLoopBlock, "\nState usage map: ", this.stateUsageMap, "\nExpressions: ", this.exprPrevValue);
        }
        console.log("States: ", estimateObjectSize(this.State), "\nState Blocks: ", estimateObjectSize(this.stateIfBlock, this.stateLoopBlock), "\nState usage map: ", estimateObjectSize(this.stateUsageMap), "\nOther: ", estimateObjectSize(this.exprPrevValue, this.effects, this.refs));
    }
}
export const Rector = new RectorJS();
export const initState = Rector.initState.bind(Rector);
export const initGlobalState = Rector.initGlobalState.bind(Rector);
export const setEffect = Rector.setEffect.bind(Rector);
export const Layout = Rector.Layout.bind(Rector);
export const Routes = Rector.Routes.bind(Rector);
export const ProtectedRoutes = Rector.ProtectedRoutes.bind(Rector);
export const RectorMap = Rector.map.bind(Rector);
export const Condition = Rector.condition.bind(Rector);
export const getComponentState = Rector.getComponentState.bind(Rector);
export const navigate = Rector.navigate.bind(Rector);
export const useElementRef = Rector.useElementRef.bind(Rector);
export const renderApp = Rector.renderApp.bind(Rector);
export const globalState = Rector.globalState;
export const Elements = Rector.elements;

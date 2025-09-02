var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { estimateObjectSize, isComponentFunction, isEqual, isPlainObject, removeValueFromObject, reservedJSKeys, selfClosingTags, styleObjectToCss, } from "./utils.js";
const GLOBAL = "global";
class RectorError extends Error {
    constructor(message) {
        super(message);
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
class Component {
    setParentPropUsage(id) {
        this.parentPropUsage.add(id);
    }
    constructor(name, id, parentId) {
        this.parentPropUsage = new Set();
        this.name = name;
        this.id = id;
        this.parentId = parentId;
    }
}
class Block {
    constructor() {
        this.stateUsage = new Set();
        this.componentRendered = [];
        this.loopIds = [];
        this.conditionIds = [];
    }
}
class RectorJS {
    getComponent(id) {
        return this.componentIdMap[id];
    }
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
        this.scopeStack = [];
        this.isAppRendering = false;
        this.routerParams = {};
        this.routes = {};
        this.globalComponent = new Component("App", GLOBAL, null);
        this.componentIdMap = {};
        this.componentNames = new Set();
        this.blockId = 0;
        this.conditionalBlocks = {};
        this.loopBlocks = {};
        this.blocksMap = {};
        this.blockStack = [];
        this.microTaskQueue = [];
        this.rectorKeywords = new Set([
            "bound condition",
            "bound map",
            "Fragment",
        ]);
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
        var _a;
        if (typeof fn === "function") {
            const componentName = isComponentFunction(fn, (e) => {
                throw new RectorError(e);
            });
            if (!componentName || this.rectorKeywords.has(componentName)) {
                return fn(props);
            }
            this.componentNames.add(componentName);
            const cmpId = `${componentName}-${this.cmpId++}`;
            (_a = this.activeBlock()) === null || _a === void 0 ? void 0 : _a.componentRendered.push(cmpId);
            const parent = this.activeComponent();
            const cmp = new Component(componentName, cmpId, parent.id);
            this.componentIdMap[cmpId] = cmp;
            this.scopeStack.push(cmp);
            const app = fn(props);
            this.scopeStack.pop();
            const range = new Range();
            app.range = range;
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
    fragment({ children }) {
        const container = document.createDocumentFragment();
        if (Array.isArray(children)) {
            children.forEach((child) => container.appendChild(child));
        }
        else if (children) {
            container.appendChild(children);
        }
        return container;
    }
    getQueryParams() {
        const urlSearchParams = new URLSearchParams(window.location.search);
        const params = Object.fromEntries(urlSearchParams.entries());
        return params;
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
        return this.stateUsage();
    }
    getRouterParams() {
        return this.routerParams;
    }
    renderApp() {
        return __awaiter(this, void 0, void 0, function* () {
            const body = document.querySelector("body");
            const initPath = window.location.pathname;
            const app = this.matchRoute(initPath);
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
            this.scopeStack.push(this.globalComponent);
            this.isAppRendering = true;
            console.time("App_loaded_in");
            body.append(this.jsx(app, {}));
            console.timeEnd("App_loaded_in");
            this.isAppRendering = false;
            this.scopeStack.pop();
            this.runMicrotasks();
            this.runEffects();
            this.routerParams = {};
        });
    }
    runMicrotasks() {
        this.microTaskQueue.forEach((task) => task());
        this.microTaskQueue = [];
    }
    activeBlock() {
        const L = this.blockStack.length;
        if (L === 0) {
            return null;
        }
        return this.blockStack[L - 1];
    }
    initGlobalState(stateName, value) {
        return this.configureState(stateName, value, GLOBAL);
    }
    initState(stateName, value) {
        const cmpId = this.activeComponent().id;
        if (cmpId == GLOBAL) {
            throw new RectorError("You can't initial state outside of a component, try 'initGlobalState' instead.");
        }
        return this.configureState(stateName, value, cmpId);
    }
    setEffect(fn, depends) {
        const component = this.activeComponent();
        const SCOPE = component.id;
        if (typeof fn !== "function") {
            throw new RectorError("Effect must be a function");
        }
        if (depends && depends.length > 0) {
            depends.forEach((stateName) => {
                var _a, _b;
                if (typeof stateName !== "string") {
                    throw new RectorError("[setEffect] Dependencies must be an array of strings");
                }
                this.checkStateValid(stateName, SCOPE, component.name);
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
    setUpBlock(id) {
        let blockId = id;
        if (!id) {
            blockId = `bl:${this.blockId++}`;
        }
        const block = new Block();
        this.blocksMap[blockId] = block;
        this.blockStack.push(block);
        return blockId;
    }
    condition(config) {
        var _a, _b, _c;
        try {
            const { expression, onTrueRender, onFalseRender } = config;
            const ifBlockId = `if:${this.blockId++}`;
            (_a = this.activeBlock()) === null || _a === void 0 ? void 0 : _a.conditionIds.push(ifBlockId);
            const cmp = this.activeComponent();
            const SCOPE = cmp.id;
            this.validateExpression(expression);
            let { stateKeys, scopeState } = this.mapStateKeys(expression, SCOPE);
            const fn = new Function("State", `with(State) {return ${expression}}`);
            const isTrue = fn(Object.assign(Object.assign({}, this.State[SCOPE]), scopeState));
            if (!this.exprPrevValue[SCOPE]) {
                this.exprPrevValue[SCOPE] = {};
            }
            const checkCompStructure = (Fn) => {
                let fn2 = Fn;
                if (Fn) {
                    const isCmpStruct = Fn.toString().includes(`function ${Fn.name}`);
                    if (isCmpStruct) {
                        fn2 = () => this.jsx(Fn, {});
                    }
                }
                return fn2;
            };
            let trueEl = checkCompStructure(onTrueRender);
            let falseEl = checkCompStructure(onFalseRender);
            const blockId = this.setUpBlock();
            let crrEl = isTrue
                ? (_b = trueEl === null || trueEl === void 0 ? void 0 : trueEl()) !== null && _b !== void 0 ? _b : null
                : (_c = falseEl === null || falseEl === void 0 ? void 0 : falseEl()) !== null && _c !== void 0 ? _c : null;
            this.blockStack.pop();
            let range = crrEl.range;
            if (!range) {
                range = new Range();
            }
            crrEl.range = null;
            let { nextPlaceholder, element } = this.configureElementRange(crrEl, range);
            crrEl = element;
            this.exprPrevValue[SCOPE][expression] = isTrue;
            this.conditionalBlocks[ifBlockId] = {
                exp: expression,
                cmpId: SCOPE,
                trueElement: trueEl,
                falseElement: falseEl,
                placeholder: nextPlaceholder,
                childBlock: blockId,
            };
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
                this.stateIfBlock[crrScope][stateName].push(ifBlockId);
            }
            // this.executionStack.pop();
            return crrEl;
        }
        catch (error) {
            if (error instanceof SyntaxError) {
                throw new RectorError(`Invalid inline JS expression syntax: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
            else {
                throw new RectorError(error === null || error === void 0 ? void 0 : error.message);
            }
        }
    }
    map(config) {
        var _a;
        const { stateName: sn, render, keyExtractor } = config;
        const loopBlockId = `loop:${this.blockId++}`;
        (_a = this.activeBlock()) === null || _a === void 0 ? void 0 : _a.loopIds.push(loopBlockId);
        const component = this.activeComponent();
        const SCOPE = component.id;
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
        const childBlocks = [];
        items.forEach((item, index) => {
            const blockId = this.setUpBlock();
            childBlocks.push(blockId);
            const child = render(item, index);
            if (child instanceof DocumentFragment) {
                throw new RectorError("[RectorMap]: Render item can not be a Fragment.");
            }
            this.blockStack.pop();
            child.range = null;
            child.blockId = blockId;
            if (index === 0) {
                firstChild = child;
            }
            fragment.appendChild(child);
        });
        this.loopBlocks[loopBlockId] = {
            renderElement: render,
            firstNode: firstChild,
            keyExtractor,
            cmpId: SCOPE,
            childBlocks: new Set(childBlocks),
        };
        this.stateLoopBlock[crrScope][stateName].push(loopBlockId);
        this.microTaskQueue.push(() => {
            const parentNode = commentRef.parentNode;
            const pos = [...parentNode.childNodes].indexOf(commentRef);
            this.loopBlocks[loopBlockId] = Object.assign(Object.assign({}, this.loopBlocks[loopBlockId]), { parentNode, positionIndex: pos });
            commentRef.remove();
        });
        return fragment;
    }
    useElementRef(elementTagName) {
        const SCOPE = this.activeComponent().id;
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
    matchRoute(pathname) {
        const isRouteExist = this.routes[pathname];
        if (isRouteExist) {
            return isRouteExist;
        }
        else {
            for (const route in this.routes) {
                const paramNames = [];
                // Build regex: /products/:id → ^/products/([^/]+)$
                const regexPath = route.replace(/:([^/]+)/g, (_, key) => {
                    paramNames.push(key);
                    return "([^/]+)"; // match until next slash
                });
                const regex = new RegExp(`^${regexPath}$`);
                const match = pathname.match(regex);
                if (match) {
                    paramNames.forEach((name, i) => {
                        this.routerParams[name] = match[i + 1];
                    });
                    return this.routes[route];
                }
            }
            return null;
        }
    }
    activeComponent() {
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
        this.componentIdMap = {};
        this.loopBlocks = {};
        this.conditionalBlocks = {};
        this.blocksMap = {};
    }
    stateUsage(scope) {
        var _a;
        let component;
        if (!scope) {
            component = this.activeComponent();
            scope = component.id;
        }
        if (!this.State[scope]) {
            this.State[scope] = {};
        }
        return new Proxy((_a = this.State[scope]) !== null && _a !== void 0 ? _a : {}, {
            get: (_, stateName) => {
                var _a;
                this.checkStateValid(stateName, scope, component === null || component === void 0 ? void 0 : component.name);
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
        if (this.componentNames.has(stateName)) {
            if (stateName === this.getComponent(scope).name) {
                throw new RectorError(`Restricted state name: State "${stateName}" conflicts with component name "${stateName}".Please choose a different state name.`);
            }
            throw new RectorError(`Restricted state name: State '${stateName}' conflicts with parent/ancestor component name "${stateName}".State names cannot be the same as any parent/ancestor component name.`);
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
            throw new RectorError(`${!isCmp ? "Global" : ""} State '${stateName}' is already declared in this ${!isCmp ? "App" : `Component '${this.getComponent(scope).name}'`}.`);
        }
        this.State[scope][stateName] = value;
        return (val) => {
            const oldValue = this.State[scope][stateName];
            const newVal = typeof val === "function" ? val(oldValue) : val;
            this.State[scope][stateName] = newVal;
            if (!isEqual(oldValue, newVal)) {
                this.reRender(stateName, oldValue, scope);
                this.runMicrotasks();
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
    configureElementRange(targetEl, range) {
        let element;
        if (typeof targetEl === "string" || typeof targetEl === "number") {
            element = document.createTextNode(targetEl.toString());
        }
        element = targetEl ? targetEl : document.createTextNode("");
        let first, last;
        if (element instanceof DocumentFragment) {
            const fragmentNodes = [...element.childNodes];
            [first, last] = [
                fragmentNodes[0],
                fragmentNodes[fragmentNodes.length - 1],
            ];
        }
        else {
            first = last = element;
        }
        const nextPlaceholder = () => {
            if (!(first === null || first === void 0 ? void 0 : first.parentNode) || !(last === null || last === void 0 ? void 0 : last.parentNode))
                return null; // not attached (yet) or already removed
            range.setStartBefore(first);
            range.setEndAfter(last);
            return range;
        };
        return {
            element,
            nextPlaceholder,
        };
    }
    unmount(blockId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const block = this.blocksMap[blockId];
            if (!block)
                return;
            ((_a = block === null || block === void 0 ? void 0 : block.componentRendered) !== null && _a !== void 0 ? _a : []).forEach((cmpId) => {
                delete this.State[cmpId];
                delete this.stateIfBlock[cmpId];
                delete this.stateLoopBlock[cmpId];
                delete this.stateUsageMap[cmpId];
                delete this.exprPrevValue[cmpId];
                delete this.refs[cmpId];
                delete this.componentIdMap[cmpId];
                this.effects.delete(cmpId);
            });
            [...block === null || block === void 0 ? void 0 : block.stateUsage].forEach((usage) => {
                var _a;
                const [scope, stateName] = usage.split(":");
                const usageArr = (_a = this.stateUsageMap[scope]) === null || _a === void 0 ? void 0 : _a[stateName];
                if (usageArr) {
                    this.stateUsageMap[scope][stateName] = usageArr.filter((s) => s.element.isConnected);
                }
            });
            ((_b = block.loopIds) !== null && _b !== void 0 ? _b : []).forEach((loopId) => {
                var _a, _b;
                const childBlocks = [...((_b = (_a = this.loopBlocks[loopId]) === null || _a === void 0 ? void 0 : _a.childBlocks) !== null && _b !== void 0 ? _b : [])];
                childBlocks.forEach((cBlockId) => this.unmount(cBlockId));
                this.stateLoopBlock = removeValueFromObject(this.stateLoopBlock, loopId);
                delete this.loopBlocks[loopId];
            });
            ((_c = block.conditionIds) !== null && _c !== void 0 ? _c : []).forEach((conditionId) => {
                var _a;
                const childBlock = (_a = this.conditionalBlocks[conditionId]) === null || _a === void 0 ? void 0 : _a.childBlock;
                this.unmount(childBlock);
                this.stateIfBlock = removeValueFromObject(this.stateIfBlock, conditionId);
                delete this.conditionalBlocks[conditionId];
            });
            delete this.blocksMap[blockId];
        });
    }
    updateIfBlock(blockId) {
        var _a, _b;
        const blockConfig = this.conditionalBlocks[blockId];
        const scope = blockConfig.cmpId;
        let { scopeState } = this.mapStateKeys(blockConfig.exp, scope);
        try {
            const fn = new Function("State", `with(State) {return ${blockConfig.exp}}`);
            const isTrue = fn(Object.assign(Object.assign({}, this.State[scope]), scopeState));
            const prevVal = this.exprPrevValue[scope][blockConfig.exp];
            if (prevVal !== isTrue) {
                const El = (con) => con ? blockConfig.trueElement : blockConfig.falseElement;
                const range = blockConfig.placeholder();
                range.deleteContents();
                this.unmount(blockConfig.childBlock);
                this.scopeStack.push(this.getComponent(scope));
                this.setUpBlock(blockConfig.childBlock);
                const nextEl = (_b = (_a = El(isTrue)) === null || _a === void 0 ? void 0 : _a()) !== null && _b !== void 0 ? _b : null;
                this.blockStack.pop();
                if (nextEl && (nextEl === null || nextEl === void 0 ? void 0 : nextEl.range)) {
                    nextEl.range = null;
                }
                let { nextPlaceholder, element } = this.configureElementRange(nextEl, range);
                this.scopeStack.pop();
                range.insertNode(element);
                blockConfig.placeholder = nextPlaceholder;
            }
            return {
                exp: blockConfig.exp,
                val: isTrue,
            };
        }
        catch (error) {
            throw new RectorError(error);
        }
    }
    updateLoopBlock(loopBlockId, stateName, oldValue, scope) {
        const blockConfig = this.loopBlocks[loopBlockId];
        const newList = this.State[scope][stateName];
        const oldList = [...oldValue];
        let firstChild = blockConfig.firstNode;
        let parent = (firstChild === null || firstChild === void 0 ? void 0 : firstChild.parentNode) || blockConfig.parentNode;
        if (!parent)
            throw new RectorError("No parent detected of 'map' loop, try to wrap 'RectorMap' in any parent element.");
        const children = Array.from(parent.childNodes);
        const startIndex = firstChild
            ? Math.max(0, children.indexOf(firstChild))
            : blockConfig.positionIndex;
        const oldNodes = children.slice(startIndex, startIndex + oldList.length);
        const keyExtractor = blockConfig.keyExtractor || ((_, i) => i);
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
        this.scopeStack.push(this.getComponent(scope), this.getComponent(blockConfig.cmpId));
        (newList !== null && newList !== void 0 ? newList : []).forEach((item, j) => {
            var _a, _b;
            const key = String(keyExtractor(item, j));
            if (key === "undefined" || key === "null" || !key) {
                throw new RectorError(`[keyExtractor]: Received null/undefined key. Your items may be missing the expected "id" property or it is not valid.`);
            }
            const existing = oldMap.get(key);
            const v = startIndex + j;
            if (existing) {
                const oldItem = oldList[existing.index - startIndex];
                let crrNode = existing.node;
                if (!isEqual(oldItem, item)) {
                    const blockId = this.setUpBlock();
                    blockConfig.childBlocks.add(blockId);
                    crrNode = blockConfig.renderElement(item, j);
                    this.blockStack.pop();
                    crrNode.blockId = blockId;
                    crrNode.range = null;
                    existing.node.replaceWith(crrNode);
                    this.unmount((_a = existing.node) === null || _a === void 0 ? void 0 : _a.blockId);
                    blockConfig.childBlocks.delete((_b = existing.node) === null || _b === void 0 ? void 0 : _b.blockId);
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
                const blockId = this.setUpBlock();
                blockConfig.childBlocks.add(blockId);
                const node = blockConfig.renderElement(item, j);
                this.blockStack.pop();
                node.blockId = blockId;
                node.range = null;
                if (j === 0) {
                    newFirstChild = node;
                }
                parent.insertBefore(node, parent.childNodes[v] || null);
            }
        });
        this.scopeStack.pop();
        this.scopeStack.pop();
        oldMap.forEach(({ node }) => {
            if (node) {
                parent.removeChild(node);
                this.unmount(node === null || node === void 0 ? void 0 : node.blockId);
                blockConfig.childBlocks.delete(node === null || node === void 0 ? void 0 : node.blockId);
            }
        });
        blockConfig.parentNode = parent;
        blockConfig.firstNode = newFirstChild;
    }
    reRender(stateName, oldValue, scope) {
        var _a, _b, _c;
        const stateFullElements = (_a = this.stateUsageMap[scope]) === null || _a === void 0 ? void 0 : _a[stateName];
        if (stateFullElements) {
            for (let sfe of stateFullElements) {
                const { parsedStr: updatedStateExpression } = this.parseStateVars(sfe.rawString, sfe.cmpId, false);
                sfe.element.childNodes[sfe.pos].nodeValue = updatedStateExpression;
            }
        }
        const ifBlocks = (_b = this.stateIfBlock[scope]) === null || _b === void 0 ? void 0 : _b[stateName];
        if (ifBlocks) {
            const expVals = new Map();
            for (const blockId of ifBlocks) {
                const exec = this.updateIfBlock(blockId);
                if (exec && !expVals.has(exec.exp)) {
                    expVals.set(exec.exp, Object.assign(Object.assign({}, exec), { scope: this.conditionalBlocks[blockId].cmpId }));
                }
            }
            for (const { exp, val, scope } of expVals.values()) {
                this.exprPrevValue[scope][exp] = val;
            }
        }
        const loopBlocks = (_c = this.stateLoopBlock[scope]) === null || _c === void 0 ? void 0 : _c[stateName];
        if (loopBlocks) {
            for (let blockId of loopBlocks) {
                this.updateLoopBlock(blockId, stateName, oldValue, scope);
            }
        }
    }
    checkStateValid(stateName, scope, componentName, checkExist = true) {
        var _a;
        if (reservedJSKeys.has(stateName)) {
            throw new RectorError(`Invalid token: '${stateName}', Can not use global objects or JS keywords in inline expression`);
        }
        if (checkExist) {
            // @ts-ignore
            if (!Object.hasOwn((_a = this.State[scope]) !== null && _a !== void 0 ? _a : {}, stateName)) {
                const scopeErrorMes = scope === GLOBAL
                    ? `Global State '${stateName}' is not declared in the App.`
                    : `State '${stateName}' is not declared in '${componentName}' component.`;
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
        const cmp = this.getComponent(scope);
        let stateKeys = extractedKeys.map((stateKey) => {
            const splittedKey = stateKey.split(".");
            if (splittedKey.length > 1) {
                const [firstKey, stateName] = splittedKey;
                if (firstKey === "$") {
                    this.checkStateValid(stateName, GLOBAL, "");
                    scopeState[firstKey] = this.State[GLOBAL];
                    return `${firstKey}:${stateName}`;
                }
                if (this.componentNames.has(firstKey)) {
                    if (firstKey === cmp.name) {
                        throw new Error(`Invalid self-reference: Use "${stateName}" instead of "${firstKey}.${stateName}" inside component "${firstKey}".`);
                    }
                    let p = this.getComponent(cmp.parentId);
                    while (p) {
                        if (p.id === GLOBAL) {
                            throw new RectorError(`Can't access child component '${firstKey}' in '${cmp.name}' component.`);
                        }
                        if (p.name === firstKey) {
                            break;
                        }
                        p = this.getComponent(p.parentId);
                    }
                    const cmpState = `${p.id}:${stateName}`;
                    cmp.setParentPropUsage(cmpState);
                    this.checkStateValid(stateName, p.id, p.name);
                    scopeState[firstKey] = this.State[p.id];
                    return cmpState;
                }
                else {
                    this.checkStateValid(firstKey, scope, cmp.name);
                    return firstKey;
                }
                // if (isCamelCase(firstKey)) {
                //   // @ts-ignore
                //   if (Object.hasOwn(this.State[scope] ?? {}, firstKey)) {
                //     this.checkStateValid(firstKey, scope, false);
                //     return firstKey;
                //   } else {
                //     const parentCompId = this.componentNameIdMap.get(firstKey);
                //     console.log("firstKey: ", firstKey, parentCompId);
                //     if (parentCompId) {
                //       const parentIds = component.parent;
                //       console.log("parentIds: ", parentIds, parentCompId);
                //       if (parentIds.has(parentCompId)) {
                //         this.checkStateValid(stateName, parentCompId);
                //         scopeState[firstKey] = this.State[parentCompId];
                //         return `${parentCompId}:${stateName}`;
                //       } else {
                //         const currentCompName = this.componentNameFromId(scope);
                //         throw new RectorError(
                //           `at '${stateKey}': Component named '${firstKey}' is not parent/ancestor of '${currentCompName}' component.`
                //         );
                //       }
                //     } else {
                //       this.checkStateValid(firstKey, scope);
                //     }
                //   }
                // }
            }
            this.checkStateValid(stateKey, scope, cmp.name);
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
        const SCOPE = this.activeComponent().id;
        const elem = document.createElement(tag);
        const children = attributes.children;
        Object.entries(attributes).forEach(([key, value]) => {
            let val = value;
            key = key.trim();
            if (key !== "children") {
                if (key.startsWith("on") && typeof val === "function") {
                    elem.addEventListener(key.slice(2), val);
                }
                else {
                    if (key === "checked") {
                        // @ts-ignore
                        elem.checked = value;
                    }
                    else if (key === "ref") {
                        const refKeyName = `${tag}:${val}`;
                        if (!this.refs[SCOPE]) {
                            this.refs[SCOPE] = {};
                        }
                        this.refs[SCOPE][refKeyName] = elem;
                    }
                    else if (key === "className") {
                        elem.setAttribute("class", val);
                    }
                    else if (key === "style") {
                        if (isPlainObject(val)) {
                            elem.setAttribute(key, styleObjectToCss(val));
                        }
                        else {
                            console.error("[RectorJs]: Only CSS style object is valid for 'style' key.");
                        }
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
        var _a;
        const component = this.activeComponent();
        const SCOPE = component.id;
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
                            (_a = this.activeBlock()) === null || _a === void 0 ? void 0 : _a.stateUsage.add(`${crrScope}:${stateName}`);
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
                                cmpId: SCOPE,
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
            console.log("States: ", this.State, "\nState If Blocks: ", this.stateIfBlock, "\nState Loop Blocks: ", this.stateLoopBlock, "\nState usage map: ", this.stateUsageMap, "\nExpressions: ", this.exprPrevValue, "\nComponentDATA: ", this.componentIdMap, "\n:ScopeStack: ", this.scopeStack, "\n:Execution: ", this.blocksMap, this.loopBlocks, this.conditionalBlocks
            // this.executionData
            );
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
export const getQueryParams = Rector.getQueryParams.bind(Rector);
export const getRouterParams = Rector.getRouterParams.bind(Rector);
export const globalState = Rector.globalState;
export const Elements = Rector.elements;

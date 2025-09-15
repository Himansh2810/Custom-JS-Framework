var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { estimateObjectSize, isComponentFunction, isEqual, isPlainObject, reservedJSKeys, selfClosingTags, styleObjectToCss, } from "./utils.js";
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
class RectorNavigation {
    constructor() {
        this.routerParams = {};
        this.routes = {};
        this.routeRegexCache = {};
    }
    buildRouteRegex(route) {
        const paramNames = [];
        const regexPath = route.replace(/:([^/]+)/g, (_, key) => {
            paramNames.push(key);
            return "([^/]+)";
        });
        this.routeRegexCache[route] = {
            regex: new RegExp(`^${regexPath}$`),
            paramNames,
        };
    }
    defineRoutes(routes) {
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
            this.buildRouteRegex(path);
        });
    }
    setProtectedRoutes(routes, middleware) {
        this.routeAccess = {
            protectedRoutes: routes,
            middleware,
        };
    }
    createLayoutRoutes(childRoutes, layoutComponent) {
        let routes = {};
        const buildLayout = (cr) => {
            Object.entries(cr).forEach(([path, rl]) => {
                let routeEl = rl;
                if (typeof routeEl === "function") {
                    routes[path] = () => layoutComponent(routeEl);
                    this.buildRouteRegex(path);
                }
                else {
                    buildLayout(routeEl);
                }
            });
        };
        buildLayout(childRoutes);
        return routes;
    }
    matchRoute(pathname) {
        this.routerParams = {};
        if (this.routes[pathname]) {
            return this.routes[pathname];
        }
        for (const route in this.routes) {
            const { regex, paramNames } = this.routeRegexCache[route];
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
    runMiddleware(path) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.routeAccess) {
                return true;
            }
            const isPathProtected = () => {
                var _a, _b;
                for (const route of (_b = (_a = this.routeAccess) === null || _a === void 0 ? void 0 : _a.protectedRoutes) !== null && _b !== void 0 ? _b : []) {
                    if (route.endsWith("/*")) {
                        const base = route.slice(0, -2);
                        if (path === base || path.startsWith(base + "/")) {
                            return true;
                        }
                    }
                    if (route === path) {
                        return true;
                    }
                }
                return false;
            };
            if (isPathProtected()) {
                try {
                    return yield this.routeAccess.middleware(path);
                }
                catch (error) {
                    return false;
                }
            }
            return true;
        });
    }
    resolveRoute() {
        return __awaiter(this, void 0, void 0, function* () {
            const initPath = window.location.pathname;
            const app = this.matchRoute(initPath);
            if (!app) {
                const fallbackRoute = this.routes["/*"];
                if (fallbackRoute) {
                    return fallbackRoute;
                }
                else {
                    throw new RectorError(`INVALID ROUTE: '${initPath}' route is not define.`);
                }
            }
            const isRouteAccessible = yield this.runMiddleware(initPath);
            if (!isRouteAccessible)
                return null;
            return app;
        });
    }
}
class Component {
    constructor(name, id, parentId) {
        this.state = {};
        this.stateUsage = {};
        this.loops = {};
        this.conditions = {};
        this.effects = {};
        this.unmounts = [];
        this.refs = {};
        this.exprPrevValue = {};
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
        this.effectFuns = {};
        this.effectId = 0;
        this.cmpId = 0;
        this.scopeStack = [];
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
        this.effectQueue = [];
        this.navigation = new RectorNavigation();
        this.elements = new Proxy({}, {
            get: (_, tag) => {
                return (attributes) => this.createElement(tag, attributes);
            },
        });
        const globalComponent = new Component("$", GLOBAL, null);
        this.componentIdMap[GLOBAL] = globalComponent;
        this.globalState = this.stateUsage(globalComponent);
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
        const checkAndAppend = (child) => {
            if (typeof child === "function" ||
                isPlainObject(child) ||
                Array.isArray(child)) {
                throw new RectorError("[At Fragment]: Functions, Objects and Arrays are not allowed as children.");
            }
            if (typeof child === "string" || typeof child === "number") {
                child = document.createTextNode(String(child));
            }
            container.appendChild(child);
        };
        if (Array.isArray(children)) {
            children.forEach((child) => checkAndAppend(child));
        }
        else if (children) {
            checkAndAppend(children);
        }
        return container;
    }
    getQueryParams() {
        const urlSearchParams = new URLSearchParams(window.location.search);
        const params = Object.fromEntries(urlSearchParams.entries());
        return params;
    }
    getHash() {
        return window.location.hash.slice(1);
    }
    setErrorBoundary(component) {
        this.errorBoundary = component;
    }
    defineRoutes(routes) {
        window.addEventListener("popstate", () => {
            const pathName = window.location.pathname;
            this.navigate(pathName);
        });
        this.navigation.defineRoutes(routes);
    }
    setProtectedRoutes(routes, middleware) {
        this.navigation.setProtectedRoutes(routes, middleware);
    }
    createLayoutRoutes(childRoutes, layoutComponent) {
        return this.navigation.createLayoutRoutes(childRoutes, layoutComponent);
    }
    navigate(path) {
        if (window.location.pathname !== path) {
            history.pushState({}, "", path);
            this.routeCleanUp();
            this.renderApp();
        }
    }
    getComponentState() {
        return this.stateUsage(this.activeComponent());
    }
    getRouterParams() {
        return this.navigation.routerParams;
    }
    renderApp() {
        return __awaiter(this, void 0, void 0, function* () {
            const app = yield this.navigation.resolveRoute();
            if (!app)
                return;
            const body = document.querySelector("body");
            body.innerHTML = "";
            try {
                this.scopeStack.push(this.getComponent(GLOBAL));
                body.append(this.jsx(app, {}));
                this.scopeStack.pop();
                this.runMicrotasks();
                this.runEffectQueue();
                this.navigation.routerParams = {};
            }
            catch (error) {
                body.innerHTML = "";
                if (this.errorBoundary) {
                    console.error(error);
                    try {
                        body.append(this.jsx(this.errorBoundary, error));
                    }
                    catch (er2) {
                        throw er2;
                    }
                }
                else {
                    throw error;
                }
            }
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
        if (typeof fn !== "function") {
            throw new RectorError("Effect must be a function");
        }
        const component = this.activeComponent();
        const efId = this.effectId++;
        const externalDeps = [];
        if (depends && depends.length > 0) {
            depends.forEach((stateStr) => {
                if (typeof stateStr !== "string") {
                    throw new RectorError("[setEffect] Dependencies must be an array of strings");
                }
                let crrComponent;
                let stateName;
                const { stateKeys } = this.mapStateKeys(stateStr, component);
                const scopeState = stateKeys[0].split(":");
                if (scopeState.length > 1) {
                    crrComponent = this.getComponent(scopeState[0]);
                    stateName = scopeState[1];
                    externalDeps.push(`${scopeState[0]}:${scopeState[1]}`);
                }
                else {
                    crrComponent = component;
                    stateName = stateStr;
                }
                if (!crrComponent.effects[stateName]) {
                    crrComponent.effects[stateName] = [];
                }
                crrComponent.effects[stateName].push(efId);
            });
        }
        this.effectFuns[efId] = {
            scope: component.id,
            depends: depends && depends.length > 0,
            extDeps: externalDeps,
            fn,
        };
        this.effectQueue.push(efId);
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
            let { stateKeys, scopeState } = this.mapStateKeys(expression, cmp);
            const fn = new Function("State", `with(State) {return ${expression}}`);
            const isTrue = fn(Object.assign(Object.assign({}, cmp.state), scopeState));
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
            cmp.exprPrevValue[expression] = isTrue;
            this.conditionalBlocks[ifBlockId] = {
                exp: expression,
                cmpId: SCOPE,
                trueElement: trueEl,
                falseElement: falseEl,
                placeholder: nextPlaceholder,
                childBlock: blockId,
                stateData: stateKeys,
            };
            for (let stateName of stateKeys) {
                let crrComponent = cmp;
                const splittedState = stateName.split(":");
                if (splittedState.length > 1) {
                    const [compScope, compStateName] = splittedState;
                    stateName = compStateName;
                    crrComponent = this.getComponent(compScope);
                }
                if (!crrComponent.conditions[stateName]) {
                    crrComponent.conditions[stateName] = [];
                }
                crrComponent.conditions[stateName].push(ifBlockId);
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
        const { data, render, keyExtractor } = config;
        const loopBlockId = `loop:${this.blockId++}`;
        (_a = this.activeBlock()) === null || _a === void 0 ? void 0 : _a.loopIds.push(loopBlockId);
        const component = this.activeComponent();
        const SCOPE = component.id;
        let { stateKeys } = this.mapStateKeys(data, component);
        let stateName = stateKeys[0];
        let crrComponent = component;
        const splittedState = stateName.split(":");
        if (splittedState.length > 1) {
            const [compScope, compStateName] = splittedState;
            crrComponent = this.getComponent(compScope);
            stateName = compStateName;
        }
        const items = crrComponent.state[stateName];
        const fragment = document.createDocumentFragment();
        const commentRef = document.createComment("Rector Map");
        fragment.appendChild(commentRef);
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
            stateData: splittedState,
        };
        if (!crrComponent.loops[stateName]) {
            crrComponent.loops[stateName] = [];
        }
        crrComponent.loops[stateName].push(loopBlockId);
        this.microTaskQueue.push(() => {
            const parentNode = commentRef.parentNode;
            const pos = [...parentNode.childNodes].indexOf(commentRef);
            this.loopBlocks[loopBlockId] = Object.assign(Object.assign({}, this.loopBlocks[loopBlockId]), { parentNode, positionIndex: pos });
            commentRef.remove();
        });
        return fragment;
    }
    useElementRef(elementTagName) {
        const component = this.activeComponent();
        return new Proxy({}, {
            get: (_, refName) => {
                var _a;
                const refKey = `${elementTagName}:${refName}`;
                if (!Object.hasOwn((_a = component.refs) !== null && _a !== void 0 ? _a : {}, refKey)) {
                    throw new RectorError(`Ref '${refName}' doesn't exist on any '${elementTagName}' element in '${component.name}' component.`);
                }
                return component.refs[refKey];
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
    activeComponent() {
        const L = this.scopeStack.length;
        return this.scopeStack[L - 1];
    }
    routeCleanUp() {
        this.componentIdMap = {
            [GLOBAL]: this.getComponent(GLOBAL),
        };
        this.loopBlocks = {};
        this.conditionalBlocks = {};
        this.blocksMap = {};
        this.effectFuns = {};
    }
    stateUsage(component) {
        return new Proxy(component.state, {
            get: (_, stateName) => {
                var _a;
                this.checkStateValid(component, stateName);
                return (_a = component.state) === null || _a === void 0 ? void 0 : _a[stateName];
            },
        });
    }
    configureState(stateName, value, scope) {
        const component = this.getComponent(scope);
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
            if (stateName === component.name) {
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
        if (Object.hasOwn(component.state, stateName)) {
            const isGlobalCmp = scope === GLOBAL;
            throw new RectorError(`${isGlobalCmp ? "Global" : ""} State '${stateName}' is already declared in this ${isGlobalCmp ? "App" : `'${component.name}' Component`}.`);
        }
        component.state[stateName] = value;
        // const isCmp = scope !== GLOBAL;
        // if (!this.State[scope]) {
        //   this.State[scope] = {};
        // }
        // // @ts-ignore
        // if (Object.hasOwn(this.State[scope], stateName)) {
        //   throw new RectorError(
        //     `${
        //       !isCmp ? "Global" : ""
        //     } State '${stateName}' is already declared in this ${
        //       !isCmp ? "App" : `Component '${this.getComponent(scope).name}'`
        //     }.`
        //   );
        // }
        // this.State[scope][stateName] = value;
        return (val) => {
            const oldValue = component.state[stateName];
            const newVal = typeof val === "function" ? val(oldValue) : val;
            component.state[stateName] = newVal;
            // this.State[scope][stateName] = newVal;
            if (!isEqual(oldValue, newVal)) {
                this.reRender(stateName, oldValue, scope);
                this.runMicrotasks();
                this.runEffectQueue();
                this.runEffects(component, stateName);
            }
        };
    }
    runEffectQueue() {
        return __awaiter(this, void 0, void 0, function* () {
            this.effectQueue.forEach((efId) => {
                var _a;
                const { scope, fn, depends, extDeps } = this.effectFuns[efId];
                if (scope && fn) {
                    const unmount = fn();
                    let obj = {};
                    if (unmount && typeof unmount === "function") {
                        obj = {
                            fn: unmount,
                        };
                    }
                    if (extDeps && extDeps.length > 0) {
                        obj = Object.assign(Object.assign({}, obj), { cleanUp: [efId, extDeps] });
                    }
                    if (Object.keys(obj).length > 0) {
                        (_a = this.getComponent(scope).unmounts) === null || _a === void 0 ? void 0 : _a.push(obj);
                    }
                }
                if (!depends) {
                    delete this.effectFuns[efId];
                }
            });
            this.effectQueue = [];
        });
    }
    runEffects(component, stateName) {
        return __awaiter(this, void 0, void 0, function* () {
            const effects = component.effects[stateName];
            if (effects) {
                effects === null || effects === void 0 ? void 0 : effects.forEach((efId) => {
                    var _a;
                    (_a = this.effectFuns[efId]) === null || _a === void 0 ? void 0 : _a.fn();
                });
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
            if (first instanceof Comment) {
                first = fragmentNodes[1];
            }
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
    removeBlockRef(scopeStateArr, cmpId, target, blockType) {
        var _a;
        let cmp;
        let stateName;
        if ((scopeStateArr === null || scopeStateArr === void 0 ? void 0 : scopeStateArr.length) === 2) {
            const [scope, name] = scopeStateArr;
            cmp = this.getComponent(scope);
            stateName = name;
        }
        else {
            cmp = this.getComponent(cmpId);
            stateName = scopeStateArr[0];
        }
        if (cmp && stateName) {
            const filteredIds = (_a = cmp[blockType][stateName]) === null || _a === void 0 ? void 0 : _a.filter((t) => t !== target);
            if (!(filteredIds === null || filteredIds === void 0 ? void 0 : filteredIds.length)) {
                delete cmp[blockType][stateName];
            }
            else {
                cmp[blockType][stateName] = filteredIds;
            }
        }
    }
    effectCleanUp(cleanUpArr) {
        const [efId, extDeps] = cleanUpArr;
        extDeps === null || extDeps === void 0 ? void 0 : extDeps.forEach((ed) => {
            const [scope, stateName] = ed.split(":");
            const cmp = this.getComponent(scope);
            if (cmp && stateName) {
                const filtered = cmp.effects[stateName].filter((e) => e !== efId);
                if (!filtered.length) {
                    delete cmp.effects[stateName];
                }
                else {
                    cmp.effects[stateName] = filtered;
                }
            }
        });
        delete this.effectFuns[efId];
    }
    unmount(blockId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const block = this.blocksMap[blockId];
            if (!block)
                return;
            ((_a = block === null || block === void 0 ? void 0 : block.componentRendered) !== null && _a !== void 0 ? _a : []).forEach((cmpId) => {
                var _a;
                const cmpUnmounts = (_a = this.getComponent(cmpId)) === null || _a === void 0 ? void 0 : _a.unmounts;
                cmpUnmounts === null || cmpUnmounts === void 0 ? void 0 : cmpUnmounts.forEach((config) => {
                    if (config === null || config === void 0 ? void 0 : config.fn) {
                        config === null || config === void 0 ? void 0 : config.fn();
                    }
                    if (config === null || config === void 0 ? void 0 : config.cleanUp) {
                        this.effectCleanUp(config === null || config === void 0 ? void 0 : config.cleanUp);
                    }
                });
                delete this.componentIdMap[cmpId];
            });
            [...block === null || block === void 0 ? void 0 : block.stateUsage].forEach((usage) => {
                var _a;
                const [scope, stateName] = usage.split(":");
                const cmp = this.getComponent(scope);
                const usageArr = (_a = cmp === null || cmp === void 0 ? void 0 : cmp.stateUsage) === null || _a === void 0 ? void 0 : _a[stateName];
                if (usageArr) {
                    cmp.stateUsage[stateName] = usageArr.filter((s) => s.element.isConnected);
                }
            });
            ((_b = block.loopIds) !== null && _b !== void 0 ? _b : []).forEach((loopId) => {
                var _a;
                const loop = this.loopBlocks[loopId];
                const childBlocks = [...((_a = loop === null || loop === void 0 ? void 0 : loop.childBlocks) !== null && _a !== void 0 ? _a : [])];
                childBlocks.forEach((cBlockId) => this.unmount(cBlockId));
                this.removeBlockRef(loop.stateData, loop.cmpId, loopId, "loops");
                delete this.loopBlocks[loopId];
            });
            ((_c = block.conditionIds) !== null && _c !== void 0 ? _c : []).forEach((conditionId) => {
                var _a;
                const condition = this.conditionalBlocks[conditionId];
                this.unmount(condition === null || condition === void 0 ? void 0 : condition.childBlock);
                (_a = condition === null || condition === void 0 ? void 0 : condition.stateData) === null || _a === void 0 ? void 0 : _a.forEach((data) => {
                    this.removeBlockRef(data.split(":"), condition.cmpId, conditionId, "conditions");
                });
                delete this.conditionalBlocks[conditionId];
            });
            delete this.blocksMap[blockId];
        });
    }
    updateIfBlock(blockId) {
        var _a, _b;
        const blockConfig = this.conditionalBlocks[blockId];
        const scope = blockConfig.cmpId;
        const cmp = this.getComponent(scope);
        let { scopeState } = this.mapStateKeys(blockConfig.exp, cmp);
        try {
            const fn = new Function("State", `with(State) {return ${blockConfig.exp}}`);
            const isTrue = fn(Object.assign(Object.assign({}, cmp.state), scopeState));
            const prevVal = cmp.exprPrevValue[blockConfig.exp];
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
        const cmp = this.getComponent(scope);
        const blockConfig = this.loopBlocks[loopBlockId];
        const newList = cmp.state[stateName];
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
        const component = this.getComponent(scope);
        const stateFullElements = (_a = component.stateUsage) === null || _a === void 0 ? void 0 : _a[stateName];
        if (stateFullElements) {
            for (let sfe of stateFullElements) {
                const { parsedStr: updatedStateExpression } = this.parseStateVars(sfe.rawString, scope === sfe.cmpId ? component : this.getComponent(sfe.cmpId), false);
                sfe.element.childNodes[sfe.pos].nodeValue = updatedStateExpression;
            }
        }
        const ifBlocks = (_b = component.conditions) === null || _b === void 0 ? void 0 : _b[stateName];
        if (ifBlocks) {
            const expVals = new Map();
            for (const blockId of ifBlocks) {
                const exec = this.updateIfBlock(blockId);
                if (exec && !expVals.has(exec.exp)) {
                    expVals.set(exec.exp, Object.assign(Object.assign({}, exec), { scope: this.conditionalBlocks[blockId].cmpId }));
                }
            }
            for (const { exp, val, scope } of expVals.values()) {
                this.getComponent(scope).exprPrevValue[exp] = val;
            }
        }
        const loopBlocks = (_c = component.loops) === null || _c === void 0 ? void 0 : _c[stateName];
        if (loopBlocks) {
            for (let blockId of loopBlocks) {
                this.updateLoopBlock(blockId, stateName, oldValue, scope);
            }
        }
    }
    checkStateValid(component, stateName) {
        var _a;
        if (reservedJSKeys.has(stateName)) {
            throw new RectorError(`Invalid token: '${stateName}', Can not use global objects or JS keywords in inline expression`);
        }
        if (!Object.hasOwn((_a = component.state) !== null && _a !== void 0 ? _a : {}, stateName)) {
            const scopeErrorMes = component.id === GLOBAL
                ? `Global State '${stateName}' is not declared in the App.`
                : `State '${stateName}' is not declared in '${component.name}' component.`;
            throw new RectorError(scopeErrorMes);
        }
    }
    validateExpression(expr) {
        const dynamicExpr = expr.replace(/(['"`])(?:\\\1|.)*?\1/g, ""); // removes content inside '', "", or ``
        const assignmentPattern = /[^=!<>]=[^=]/;
        if (assignmentPattern.test(dynamicExpr)) {
            throw new RectorError(`Invalid condition: assignment operation (=) is not allowed as expression.`);
        }
    }
    mapStateKeys(expression, activeComponent) {
        let scopeState = {};
        let extractedKeys = this.extractStateKeys(expression);
        let stateKeys = extractedKeys.map((stateKey) => {
            const splittedKey = stateKey.split(".");
            if (splittedKey.length > 1) {
                const [firstKey, stateName] = splittedKey;
                if (firstKey === "$") {
                    const globalComponent = this.getComponent(GLOBAL);
                    this.checkStateValid(globalComponent, stateName);
                    scopeState[firstKey] = globalComponent.state;
                    return `${GLOBAL}:${stateName}`;
                }
                if (this.componentNames.has(firstKey)) {
                    if (firstKey === activeComponent.name) {
                        throw new Error(`Invalid self-reference: Use "${stateName}" instead of "${firstKey}.${stateName}" inside component "${firstKey}".`);
                    }
                    let parentCmp = this.getComponent(activeComponent.parentId);
                    while (parentCmp) {
                        if (parentCmp.id === GLOBAL) {
                            throw new RectorError(`Can't access child component '${firstKey}' in '${activeComponent.name}' component.`);
                        }
                        if (parentCmp.name === firstKey) {
                            break;
                        }
                        parentCmp = this.getComponent(parentCmp.parentId);
                    }
                    this.checkStateValid(parentCmp, stateName);
                    scopeState[firstKey] = parentCmp.state;
                    return `${parentCmp.id}:${stateName}`;
                }
                else {
                    this.checkStateValid(activeComponent, firstKey);
                    return firstKey;
                }
            }
            this.checkStateValid(activeComponent, stateKey);
            return stateKey;
        });
        return { scopeState, stateKeys };
    }
    parseStateVars(str, activeComponent, validateExpr = true) {
        let matchStr = null;
        let isPsDefined = true;
        let parsedStr = str.replace(/\[\[\s*([^\]]+)\s*\]\]/g, (_, keyExpression) => {
            keyExpression = keyExpression === null || keyExpression === void 0 ? void 0 : keyExpression.trim();
            if (keyExpression) {
                if (validateExpr) {
                    this.validateExpression(keyExpression);
                }
                let { scopeState, stateKeys } = this.mapStateKeys(keyExpression, activeComponent);
                matchStr = stateKeys;
                try {
                    const fn = new Function("State", `with(State) {return ${keyExpression}}`);
                    return fn(Object.assign(Object.assign({}, activeComponent.state), scopeState));
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
        const component = this.activeComponent();
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
                    switch (key) {
                        case "checked": {
                            // @ts-ignore
                            elem.checked = value;
                            break;
                        }
                        case "ref": {
                            const refKeyName = `${tag}:${val}`;
                            component.refs[refKeyName] = elem;
                            break;
                        }
                        case "className": {
                            elem.setAttribute("class", val);
                            break;
                        }
                        case "style": {
                            if (isPlainObject(val)) {
                                elem.setAttribute(key, styleObjectToCss(val));
                            }
                            else {
                                console.error("[RectorJs]: Only CSS style object is valid for 'style' key.");
                            }
                            break;
                        }
                        default: {
                            elem.setAttribute(key, val);
                            break;
                        }
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
            if (typeof child === "function" || isPlainObject(child)) {
                throw new RectorError("Functions and Objects are not allowed as children.");
            }
            if (Array.isArray(child)) {
                child = this.fragment({ children: child });
            }
            if (typeof child === "string") {
                const childStr = child;
                let splittedStr = childStr
                    .split(/(\[\[\s*[^\]]+\s*\]\])/g)
                    .filter((s) => s !== "");
                for (let [idv, vl] of splittedStr.entries()) {
                    let { parsedStr, matchStr } = this.parseStateVars(vl, component);
                    if (matchStr) {
                        for (let stateName of matchStr) {
                            let crrScope = SCOPE;
                            let crrComponent = component;
                            const splittedState = stateName.split(":");
                            if (splittedState.length > 1) {
                                const [compScope, compStateName] = splittedState;
                                crrScope = compScope;
                                stateName = compStateName;
                                crrComponent = this.getComponent(compScope);
                            }
                            (_a = this.activeBlock()) === null || _a === void 0 ? void 0 : _a.stateUsage.add(`${crrScope}:${stateName}`);
                            if (!crrComponent.stateUsage[stateName]) {
                                crrComponent.stateUsage[stateName] = [];
                            }
                            crrComponent.stateUsage[stateName].push({
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
            console.log("\nEffect Funs: ", this.effectFuns, "\nComponentDATA: ", this.componentIdMap, "\nBlocks: ", this.blocksMap, "\nLoops: ", this.loopBlocks, "\nConditions: ", this.conditionalBlocks, "\nNavigation: ", this.navigation);
        }
        console.log("\nConditional Blocks: ", estimateObjectSize(this.conditionalBlocks), "\nLoop Blocks: ", estimateObjectSize(this.loopBlocks), "\nBlocks: ", estimateObjectSize(this.blocksMap), "\nEffects: ", estimateObjectSize(this.effectFuns), "\nComponents: ", estimateObjectSize(this.componentIdMap));
    }
}
export const Rector = new RectorJS();
export const initState = Rector.initState.bind(Rector);
export const initGlobalState = Rector.initGlobalState.bind(Rector);
// export const Navigation = {
//   createLayoutRoutes: Rector.createLayoutRoutes,
//   defineRoutes: Rector.defineRoutes,
//   setProtectedRoutes: Rector.setProtectedRoutes,
//   navigate: Rector.navigate,
// };
export const setEffect = Rector.setEffect.bind(Rector);
export const createLayoutRoutes = Rector.createLayoutRoutes.bind(Rector);
export const defineRoutes = Rector.defineRoutes.bind(Rector);
export const setProtectedRoutes = Rector.setProtectedRoutes.bind(Rector);
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

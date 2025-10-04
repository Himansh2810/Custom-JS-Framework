var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { estimateObjectSize, isComponentFunction, isEqual, isJSXExpressionObj, isPlainObject, reservedJSKeys, selfClosingTags, styleObjectToCss, } from "./utils.js";
const GLOBAL = "global";
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
class RectorNavigation {
    constructor() {
        this.routerParams = {};
        this.routes = {};
        this.routeRegexCache = {};
        this.layoutId = 1;
        this.layouts = {};
        this.activeLayout = null;
    }
    getRouterParams() {
        return this.routerParams;
    }
    getQueryParams() {
        const urlSearchParams = new URLSearchParams(window.location.search);
        const params = Object.fromEntries(urlSearchParams.entries());
        return params;
    }
    getHash() {
        return window.location.hash.slice(1);
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
    normalizePath(path) {
        if (path === "/")
            return "/";
        return path.replace(/\/+$/, ""); // remove all trailing slashes
    }
    checkRouteLayout(path, route, parentLayoutId) {
        if ((route === null || route === void 0 ? void 0 : route.layout) && (route === null || route === void 0 ? void 0 : route.children)) {
            this.configureLayout(path, route, parentLayoutId);
        }
        else if (route === null || route === void 0 ? void 0 : route.component) {
            if (route === null || route === void 0 ? void 0 : route.config) {
                this.routes[path] = Object.assign({ component: route === null || route === void 0 ? void 0 : route.component, config: route === null || route === void 0 ? void 0 : route.config }, (parentLayoutId ? { lid: parentLayoutId } : {}));
            }
            else {
                this.routes[path] = parentLayoutId
                    ? { lid: parentLayoutId, component: route === null || route === void 0 ? void 0 : route.component }
                    : route === null || route === void 0 ? void 0 : route.component;
            }
        }
        else {
            throw new RectorError("Please provide valid Route Config.");
        }
    }
    configureRoute(path, route) {
        path = this.normalizePath(path);
        if (!path.startsWith("/")) {
            throw new RectorError("Route path must start with '/'");
        }
        if (typeof route === "function") {
            this.routes[path] = route;
        }
        else {
            this.checkRouteLayout(path, route);
        }
        this.buildRouteRegex(path);
    }
    defineRoutes(routes) {
        Object.entries(routes).forEach(([path, route]) => {
            if (path === "*") {
                if (typeof route === "function") {
                    this.NotFoundPage = route;
                }
                else {
                    if (!(route === null || route === void 0 ? void 0 : route.component))
                        throw new RectorError("Component Not provided for wildcard route '*'");
                    this.NotFoundPage = {
                        component: route.component,
                        config: route === null || route === void 0 ? void 0 : route.config,
                    };
                }
            }
            else {
                this.configureRoute(path, route);
            }
        });
    }
    configureLayout(path, route, parentLayoutId) {
        const id = this.layoutId++;
        let lid;
        if (parentLayoutId) {
            if (typeof parentLayoutId === "number") {
                lid = [id, parentLayoutId];
            }
            else {
                lid = [id, ...parentLayoutId];
            }
        }
        else {
            lid = id;
        }
        Object.entries(route === null || route === void 0 ? void 0 : route.children).forEach(([pathKey, routeValue]) => {
            const newPath = this.normalizePath(path === "/" ? pathKey : path + pathKey);
            if (typeof routeValue === "function") {
                this.routes[newPath] = { lid, component: routeValue };
            }
            else {
                this.checkRouteLayout(newPath, routeValue, lid);
            }
            this.buildRouteRegex(newPath);
        });
        this.layouts[id] = route === null || route === void 0 ? void 0 : route.layout;
    }
    setProtectedRoutes(routes, middleware) {
        this.routeAccess = {
            protectedRoutes: routes,
            middleware,
        };
    }
    matchRoute(pathname) {
        this.routerParams = {};
        const route = this.routes[pathname];
        if (route) {
            return route;
        }
        for (const routeName in this.routes) {
            const { regex, paramNames } = this.routeRegexCache[routeName];
            const match = pathname.match(regex);
            if (match) {
                paramNames.forEach((name, i) => {
                    this.routerParams[name] = match[i + 1];
                });
                return this.routes[routeName];
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
            const initPath = this.normalizePath(window.location.pathname);
            const isRouteAccessible = yield this.runMiddleware(initPath);
            if (!isRouteAccessible)
                return null;
            const app = this.matchRoute(initPath);
            if (!app) {
                if (this.NotFoundPage)
                    return this.NotFoundPage;
                throw new RectorError(`INVALID ROUTE: '${initPath}' route is not define.`);
            }
            this.currentLayout = typeof app === "function" ? null : app === null || app === void 0 ? void 0 : app.lid;
            return app;
        });
    }
}
class Component {
    constructor(name, id, parentId) {
        this.state = {};
        this.stateUsage = {};
        this.attributeUsage = {};
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
const Navigation = new RectorNavigation();
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
        this.elementInterceptors = {};
        this.effectQueue = [];
        this.navigation = Navigation;
        this.elements = new Proxy({}, {
            get: (_, tag) => {
                return (attributes) => this.createElement(tag, attributes);
            },
        });
        const globalComponent = new Component("$", GLOBAL, null);
        this.componentIdMap[GLOBAL] = globalComponent;
        this.globalState = this.stateUsage(globalComponent);
        window.addEventListener("popstate", () => {
            history.pushState({}, "", window.location.pathname);
            this.renderApp();
        });
        window.addEventListener("unhandledrejection", (event) => {
            const activeLayout = this.navigation.activeLayout;
            const crrLid = this.navigation.currentLayout;
            if (!!activeLayout && crrLid) {
                let layout;
                if (typeof crrLid === "number") {
                    layout = activeLayout[crrLid];
                }
                else {
                    layout = activeLayout[crrLid[0]];
                }
                this.handleRenderError(event.reason, {
                    range: layout.range,
                });
            }
            else {
                this.handleRenderError(event.reason, { lids: crrLid });
            }
        });
    }
    // -----Public methods----- //
    setElementInterceptors(interceptors) {
        this.elementInterceptors = interceptors;
    }
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
    setErrorBoundary(component) {
        this.errorBoundary = component;
    }
    navigate(path) {
        if (window.location.pathname !== path) {
            history.pushState({}, "", path);
            this.renderApp();
        }
    }
    componentState() {
        return this.stateUsage(this.activeComponent());
    }
    handleRenderError(error, config) {
        if (!this.errorBoundary)
            throw error;
        console.error(error);
        try {
            const errElement = () => this.errorBoundary(error);
            const { range, lids } = config;
            if (range) {
                range.deleteContents();
                if (this.crrLayoutBlockId) {
                    this.effectQueue = [];
                    this.unmount(this.crrLayoutBlockId);
                }
                if (this.errorWrapper) {
                    range.insertNode(this.errorWrapper(errElement)());
                }
                else {
                    range.insertNode(errElement());
                }
                this.crrLayoutBlockId = null;
                this.errorWrapper = null;
                return;
            }
            const body = document.body;
            body.innerHTML = "";
            this.routeCleanUp();
            if (lids) {
                if (typeof lids === "number") {
                    body.append(this.layoutExecution(lids, errElement)());
                }
                else {
                    body.append(this.layoutArrayExecution(lids, errElement)());
                }
                this.runMicrotasks();
                return;
            }
            body.append(errElement());
        }
        catch (err) {
            throw err;
        }
    }
    runMetaConfig(config) {
        if (config === null || config === void 0 ? void 0 : config.documentTitle) {
            document.title = config.documentTitle;
        }
    }
    layoutExecution(layoutId, component) {
        const layout = this.navigation.layouts[layoutId];
        return () => layout(() => {
            var _a;
            var _b;
            const blockId = this.setUpBlock();
            const element = this.jsx(component, {});
            this.blockStack.pop();
            const range = new Range();
            (_a = (_b = this.navigation).activeLayout) !== null && _a !== void 0 ? _a : (_b.activeLayout = {});
            this.navigation.activeLayout[layoutId] = {
                range,
                blockId,
            };
            this.configureRange(element, range);
            return element;
        });
    }
    layoutArrayExecution(layoutIds, startCmp) {
        // wrap component from all layout innerMost -> outerMost
        return layoutIds.reduce((cmp, lid) => this.layoutExecution(lid, cmp), startCmp);
    }
    decideLayout(lids) {
        const last = lids[lids.length - 1];
        if (!this.navigation.activeLayout[last])
            return { active: null, exe: [] };
        let active = null;
        let exe = [];
        for (const lid of lids) {
            if (this.navigation.activeLayout[lid]) {
                if (!active)
                    active = lid;
            }
            else {
                if (active)
                    exe.push(active);
                exe.push(lid);
                active = null;
            }
        }
        return { active, exe };
    }
    changeLayoutElement(layoutId, component) {
        var _a;
        var _b;
        const { range, blockId: prevBlockId } = this.navigation.activeLayout[layoutId];
        try {
            range.deleteContents();
            this.unmount(prevBlockId);
            this.scopeStack.push(this.getComponent(GLOBAL));
            this.effectQueue = [];
            const blockId = this.setUpBlock();
            this.crrLayoutBlockId = blockId;
            range.insertNode(this.jsx(component, {}));
            this.blockStack.pop();
            this.scopeStack.pop();
            this.runMicrotasks();
            this.runEffectQueue();
            this.navigation.routerParams = {};
            (_a = (_b = this.navigation).activeLayout) !== null && _a !== void 0 ? _a : (_b.activeLayout = {});
            this.navigation.activeLayout[layoutId] = {
                range,
                blockId,
            };
            this.crrLayoutBlockId = null;
            this.errorWrapper = null;
        }
        catch (error) {
            this.handleRenderError(error, { range });
        }
    }
    runApp(app, lids) {
        const body = document.body;
        body.innerHTML = "";
        try {
            this.routeCleanUp();
            this.effectQueue = [];
            this.scopeStack.push(this.getComponent(GLOBAL));
            body.append(this.jsx(app, {}));
            this.scopeStack.pop();
            this.runMicrotasks();
            this.runEffectQueue();
            this.navigation.routerParams = {};
        }
        catch (error) {
            this.handleRenderError(error, {
                lids,
            });
        }
    }
    renderApp() {
        return __awaiter(this, void 0, void 0, function* () {
            const app = yield this.navigation.resolveRoute();
            if (!app)
                return;
            if (typeof app === "function") {
                // route is ComponentElement, render direct (no layouts)
                this.runApp(app, null);
                this.navigation.activeLayout = null;
                return;
            }
            if (app === null || app === void 0 ? void 0 : app.config)
                this.microTaskQueue.push(() => this.runMetaConfig(app === null || app === void 0 ? void 0 : app.config));
            if (!(app === null || app === void 0 ? void 0 : app.lid)) {
                // route has component key(ComponentElement), still render direct (no layouts)
                this.runApp(app === null || app === void 0 ? void 0 : app.component, null);
                this.navigation.activeLayout = null;
                return;
            }
            const lids = app.lid;
            const hasActiveLayout = !!this.navigation.activeLayout;
            if (typeof lids === "number") {
                hasActiveLayout
                    ? this.changeLayoutElement(lids, app.component) // has one active layout , replace layout child with a new route component
                    : this.runApp(this.layoutExecution(lids, app.component), lids); // no active layout, render component direct wrapped with layout
                return;
            }
            if (!hasActiveLayout) {
                // no active layout, render component with wrapped with all layer of layouts.
                this.runApp(this.layoutArrayExecution(lids, app.component), lids);
                return;
            }
            const { active, exe } = this.decideLayout(lids);
            if (!active) {
                // active layouts, but new one doest match this layout, replace whole , render new layout with component.
                this.runApp(this.layoutArrayExecution(lids, app.component), lids);
                return;
            }
            // has one or more active layout , decide & perform which layout's child will replaced with component.
            const comp = exe.length
                ? this.layoutArrayExecution(exe, app.component)
                : app.component;
            if (exe.length) {
                this.errorWrapper = (cmp) => this.layoutArrayExecution(exe, cmp);
            }
            this.changeLayoutElement(active, comp);
        });
    }
    runMicrotasks() {
        return __awaiter(this, void 0, void 0, function* () {
            this.microTaskQueue.forEach((task) => task());
            this.microTaskQueue = [];
        });
    }
    activeBlock() {
        const L = this.blockStack.length;
        if (L === 0) {
            return null;
        }
        return this.blockStack[L - 1];
    }
    defineGlobalState(stateName, value) {
        return this.configureState(stateName, value, GLOBAL);
    }
    defineState(stateName, value) {
        const cmpId = this.activeComponent().id;
        if (cmpId == GLOBAL) {
            throw new RectorError("You can't initial state outside of a component, try 'initGlobalState' instead.");
        }
        return this.configureState(stateName, value, cmpId);
    }
    isIdentifier(str) {
        if (!str || typeof str !== "string")
            return false;
        const regex = /^[a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*$/;
        return regex.test(str.trim());
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
                var _a;
                var _b;
                if (typeof stateStr !== "string") {
                    throw new RectorError("[setEffect] Dependencies must be an array of strings");
                }
                if (!this.isIdentifier(stateStr)) {
                    throw new RectorError(`[setEffect]: Invalid expression as dependency , it must be state variables.`);
                }
                let v = stateStr;
                const scopeState = stateStr.split(".");
                if (scopeState.length > 1) {
                    v = this.isPropState(scopeState, component);
                }
                let crrComponent;
                let stateName;
                if (typeof v === "string") {
                    crrComponent = component;
                    stateName = v;
                }
                else {
                    crrComponent = this.getComponent(v[0]);
                    stateName = v[1];
                    externalDeps.push(`${v[0]}:${v[1]}`);
                }
                (_a = (_b = crrComponent.effects)[stateName]) !== null && _a !== void 0 ? _a : (_b[stateName] = []);
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
    isPropState(stateProp, activeComponent, callback) {
        const [key, secondKey] = stateProp;
        let dVar;
        if (key === "$") {
            const globalComponent = this.getComponent(GLOBAL);
            this.checkStateValid(globalComponent, secondKey);
            dVar = [GLOBAL, secondKey];
            callback === null || callback === void 0 ? void 0 : callback(key, globalComponent.state);
        }
        else if (this.componentNames.has(key)) {
            if (key === activeComponent.name) {
                throw new Error(`Invalid self-reference: Use "${secondKey}" instead of "${key}.${secondKey}" inside component "${key}".`);
            }
            let parentCmp = this.getComponent(activeComponent.parentId);
            while (parentCmp) {
                if (parentCmp.id === GLOBAL) {
                    throw new RectorError(`Can't access child component '${key}' in '${activeComponent.name}' component.`);
                }
                if (parentCmp.name === key) {
                    break;
                }
                parentCmp = this.getComponent(parentCmp.parentId);
            }
            this.checkStateValid(parentCmp, secondKey);
            dVar = [parentCmp.id, secondKey];
            callback === null || callback === void 0 ? void 0 : callback(key, parentCmp.state);
        }
        else {
            this.checkStateValid(activeComponent, key);
            dVar = key;
            callback === null || callback === void 0 ? void 0 : callback(key, activeComponent.state[key]);
        }
        return dVar;
    }
    transformExprVars(vars, activeComponent) {
        let dVars = [];
        let scopeObj = {
            args: [],
            values: [],
        };
        const addScopeData = (stateKey, value) => {
            scopeObj.args.push(stateKey);
            scopeObj.values.push(value);
        };
        for (let state of vars) {
            if (typeof state === "string") {
                this.checkStateValid(activeComponent, state);
                dVars.push(state);
                addScopeData(state, activeComponent.state[state]);
            }
            else {
                const props = this.isPropState(state, activeComponent, addScopeData);
                dVars.push(props);
                // const [key, secondKey] = state;
                // if (key === "$") {
                //   const globalComponent = this.getComponent(GLOBAL);
                //   this.checkStateValid(globalComponent, secondKey);
                //   dVars.push([GLOBAL, secondKey]);
                //   addScopeData(key, globalComponent.state);
                // } else if (this.componentNames.has(key)) {
                //   if (key === activeComponent.name) {
                //     throw new Error(
                //       `Invalid self-reference: Use "${secondKey}" instead of "${key}.${secondKey}" inside component "${key}".`
                //     );
                //   }
                //   let parentCmp = this.getComponent(activeComponent.parentId);
                //   while (parentCmp) {
                //     if (parentCmp.id === GLOBAL) {
                //       throw new RectorError(
                //         `Can't access child component '${key}' in '${activeComponent.name}' component.`
                //       );
                //     }
                //     if (parentCmp.name === key) {
                //       break;
                //     }
                //     parentCmp = this.getComponent(parentCmp.parentId);
                //   }
                //   this.checkStateValid(parentCmp, secondKey);
                //   dVars.push([parentCmp.id, secondKey]);
                //   addScopeData(key, parentCmp.state);
                // } else {
                //   this.checkStateValid(activeComponent, key);
                //   dVars.push(key);
                //   addScopeData(key, activeComponent.state[key]);
                // }
            }
        }
        return { vars: dVars, scopeObj };
    }
    condition(props) {
        var _a, _b, _c;
        try {
            let { expression: jsxExpr, onTrueRender, onFalseRender } = props;
            let expression = jsxExpr;
            this.validateExpression(expression === null || expression === void 0 ? void 0 : expression.expression);
            const ifBlockId = `if:${this.blockId++}`;
            (_a = this.activeBlock()) === null || _a === void 0 ? void 0 : _a.conditionIds.push(ifBlockId);
            const component = this.activeComponent();
            const SCOPE = component.id;
            const { vars, scopeObj } = this.transformExprVars(expression === null || expression === void 0 ? void 0 : expression.vars, component);
            const expressionStr = expression === null || expression === void 0 ? void 0 : expression.expression;
            if (vars && (vars === null || vars === void 0 ? void 0 : vars.length) > 0) {
                for (let stateName of vars) {
                    let crrComponent = component;
                    if (Array.isArray(stateName)) {
                        const [compScope, compStateName] = stateName;
                        stateName = compStateName;
                        crrComponent = this.getComponent(compScope);
                    }
                    if (!crrComponent.conditions[stateName]) {
                        crrComponent.conditions[stateName] = [];
                    }
                    crrComponent.conditions[stateName].push(ifBlockId);
                }
            }
            const isTrue = this.evalExpr(expressionStr, scopeObj.args, scopeObj.values);
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
            const range = new Range();
            crrEl = this.configureElementRange(crrEl, range);
            component.exprPrevValue[expressionStr] = isTrue;
            this.conditionalBlocks[ifBlockId] = {
                rawExp: Object.assign(Object.assign({}, expression), { vars }),
                cmpId: SCOPE,
                trueElement: trueEl,
                falseElement: falseEl,
                placeholder: range,
                childBlock: blockId,
            };
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
    map(props) {
        var _a;
        const { data, render, keyExtractor } = props;
        if (!this.isIdentifier(data)) {
            throw new RectorError(`[RectorMap]: Invalid expression for data , it must be state variables.`);
        }
        const loopBlockId = `loop:${this.blockId++}`;
        (_a = this.activeBlock()) === null || _a === void 0 ? void 0 : _a.loopIds.push(loopBlockId);
        const component = this.activeComponent();
        const SCOPE = component.id;
        let v = data.trim();
        const scopeState = data.split(".");
        if (scopeState.length > 1) {
            v = this.isPropState(scopeState, component);
        }
        let crrComponent = component;
        let stateName;
        if (Array.isArray(v)) {
            crrComponent = this.getComponent(v[0]);
            stateName = v[1];
        }
        else {
            stateName = v;
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
            stateData: typeof v === "string" ? [v] : v,
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
        this.effectQueue = [];
        this.componentNames.clear();
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
                    if (unmount &&
                        (typeof unmount === "function" || unmount instanceof Promise)) {
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
    configureRange(element, range) {
        const nodes = element instanceof DocumentFragment ? [...element.childNodes] : [element];
        let [first, last] = [nodes[0], nodes[nodes.length - 1]]; // first & last wil same if only [element]
        if (first instanceof Comment)
            first = nodes[1];
        this.microTaskQueue.push(() => {
            if (!(first === null || first === void 0 ? void 0 : first.parentNode) || !(last === null || last === void 0 ? void 0 : last.parentNode))
                return; // not attached (yet) or already removed
            range.setStartBefore(first);
            range.setEndAfter(last);
        });
    }
    configureElementRange(targetEl, range) {
        let element;
        if (typeof targetEl === "string" || typeof targetEl === "number") {
            element = document.createTextNode(targetEl.toString());
        }
        element = targetEl ? targetEl : document.createTextNode("");
        this.configureRange(element, range);
        return element;
    }
    removeBlockRef(scopeState, cmpId, target, blockType) {
        var _a;
        let cmp;
        let stateName;
        if (Array.isArray(scopeState)) {
            const [scope, name] = scopeState;
            cmp = this.getComponent(scope);
            stateName = name;
        }
        else {
            cmp = this.getComponent(cmpId);
            stateName = scopeState;
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
                const cmp = this.getComponent(cmpId);
                (_a = cmp === null || cmp === void 0 ? void 0 : cmp.unmounts) === null || _a === void 0 ? void 0 : _a.forEach((config) => __awaiter(this, void 0, void 0, function* () {
                    var _a;
                    if (config === null || config === void 0 ? void 0 : config.fn) {
                        (_a = (yield config.fn)) === null || _a === void 0 ? void 0 : _a();
                    }
                    if (config === null || config === void 0 ? void 0 : config.cleanUp) {
                        this.effectCleanUp(config === null || config === void 0 ? void 0 : config.cleanUp);
                    }
                }));
                for (const key in this.effectFuns) {
                    if (this.effectFuns[key].scope === cmpId) {
                        delete this.effectFuns[key];
                    }
                }
                this.componentNames.delete(cmp.name);
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
                var _a, _b;
                const condition = this.conditionalBlocks[conditionId];
                this.unmount(condition === null || condition === void 0 ? void 0 : condition.childBlock);
                (_b = (_a = condition === null || condition === void 0 ? void 0 : condition.rawExp) === null || _a === void 0 ? void 0 : _a.vars) === null || _b === void 0 ? void 0 : _b.forEach((data) => {
                    this.removeBlockRef(data, condition.cmpId, conditionId, "conditions");
                });
                delete this.conditionalBlocks[conditionId];
            });
            delete this.blocksMap[blockId];
        });
    }
    updateIfBlock(blockId) {
        var _a, _b;
        try {
            const blockConfig = this.conditionalBlocks[blockId];
            const scope = blockConfig.cmpId;
            const component = this.getComponent(scope);
            const { vars, expression } = blockConfig.rawExp;
            const scopeObj = this.buildExpEvaluationData(vars, component);
            const isTrue = this.evalExpr(expression, scopeObj.args, scopeObj.values);
            const prevVal = component.exprPrevValue[expression];
            if (prevVal !== isTrue) {
                const El = (con) => con ? blockConfig.trueElement : blockConfig.falseElement;
                const range = blockConfig.placeholder;
                range.deleteContents();
                this.unmount(blockConfig.childBlock);
                this.scopeStack.push(this.getComponent(scope));
                this.setUpBlock(blockConfig.childBlock);
                const nextEl = (_b = (_a = El(isTrue)) === null || _a === void 0 ? void 0 : _a()) !== null && _b !== void 0 ? _b : null;
                this.blockStack.pop();
                this.scopeStack.pop();
                range.insertNode(this.configureElementRange(nextEl, range));
            }
            return {
                exp: expression,
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
    buildExpEvaluationData(vars, component) {
        let scopeObj = {
            args: [],
            values: [],
        };
        for (let stateName of vars) {
            if (typeof stateName === "string") {
                scopeObj.args.push(stateName);
                scopeObj.values.push(component.state[stateName]);
            }
            if (Array.isArray(stateName)) {
                const cmp = this.getComponent(stateName[0]);
                scopeObj.args.push(cmp.name);
                scopeObj.values.push(cmp.state);
            }
        }
        return scopeObj;
    }
    reRender(stateName, oldValue, scope) {
        var _a, _b, _c, _d;
        const component = this.getComponent(scope);
        const stateFullElements = (_a = component.stateUsage) === null || _a === void 0 ? void 0 : _a[stateName];
        if (stateFullElements) {
            for (let sfe of stateFullElements) {
                const { args, values } = this.buildExpEvaluationData(sfe.rawExp.vars, component);
                const parsedExpr = this.evalExpr(sfe.rawExp.expression, args, values);
                sfe.element.childNodes[sfe.pos].nodeValue = parsedExpr;
            }
        }
        const dynamicAttrsElements = (_b = component.attributeUsage) === null || _b === void 0 ? void 0 : _b[stateName];
        if (dynamicAttrsElements) {
            for (let attrsObj of dynamicAttrsElements) {
                const { args, values } = this.buildExpEvaluationData(attrsObj.rawExp.vars, component);
                const parsedExpr = this.evalExpr(attrsObj.rawExp.expression, args, values);
                attrsObj.element.setAttribute(attrsObj.attribute, parsedExpr);
            }
        }
        const ifBlocks = (_c = component.conditions) === null || _c === void 0 ? void 0 : _c[stateName];
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
        const loopBlocks = (_d = component.loops) === null || _d === void 0 ? void 0 : _d[stateName];
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
            throw new RectorError(`Invalid expression '${expr}', assignment operation (=) is not allowed as expression.`);
        }
    }
    createElement(tag, attributes) {
        const component = this.activeComponent();
        let elem = document.createElement(tag);
        const children = attributes.children;
        Object.entries(attributes).forEach(([key, value]) => {
            var _a;
            var _b;
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
                            if (isJSXExpressionObj(val)) {
                                const expression = val === null || val === void 0 ? void 0 : val.expression;
                                this.validateExpression(expression);
                                const { vars, scopeObj } = this.transformExprVars(val === null || val === void 0 ? void 0 : val.vars, component);
                                for (let stateName of vars) {
                                    let crrComponent = component;
                                    if (Array.isArray(stateName)) {
                                        const [compScope, compStateName] = stateName;
                                        stateName = compStateName;
                                        crrComponent = this.getComponent(compScope);
                                    }
                                    (_a = (_b = crrComponent.attributeUsage)[stateName]) !== null && _a !== void 0 ? _a : (_b[stateName] = []);
                                    crrComponent.attributeUsage[stateName].push({
                                        element: elem,
                                        rawExp: { expression, vars },
                                        attribute: key,
                                    });
                                }
                                const parsedVal = this.evalExpr(expression, scopeObj.args, scopeObj.values);
                                elem.setAttribute(key, parsedVal);
                            }
                            else {
                                elem.setAttribute(key, val);
                            }
                            break;
                        }
                    }
                }
            }
        });
        const interceptElement = (el) => {
            if (this.elementInterceptors[tag]) {
                this.elementInterceptors[tag](el);
            }
        };
        if (!children || selfClosingTags.has(tag)) {
            interceptElement(elem);
            return elem;
        }
        const finalEl = this.parseChildren(elem, Array.isArray(children) ? children : [children]);
        interceptElement(finalEl);
        return finalEl;
    }
    evalExpr(expr, args, values) {
        try {
            return new Function(...args, `return ${expr};`)(...values);
        }
        catch (error) {
            throw new RectorError(error === null || error === void 0 ? void 0 : error.message);
        }
    }
    parseChildren(elem, children) {
        var _a;
        const component = this.activeComponent();
        const SCOPE = component.id;
        for (let [idx, child] of children.entries()) {
            if (typeof child === "number" || typeof child === "string") {
                elem.append(document.createTextNode(child));
            }
            else if (isJSXExpressionObj(child)) {
                const expression = child === null || child === void 0 ? void 0 : child.expression;
                this.validateExpression(expression);
                const { vars, scopeObj } = this.transformExprVars(child === null || child === void 0 ? void 0 : child.vars, component);
                for (let stateName of vars) {
                    let crrScope = SCOPE;
                    let crrComponent = component;
                    if (Array.isArray(stateName)) {
                        const [compScope, compStateName] = stateName;
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
                        pos: idx,
                        rawExp: { expression, vars },
                        cmpId: SCOPE,
                    });
                }
                let parsedExpr = this.evalExpr(expression, scopeObj.args, scopeObj.values);
                elem.append(document.createTextNode(parsedExpr));
            }
            else if (typeof child === "function" || isPlainObject(child)) {
                throw new RectorError("Functions and Objects are not allowed as children.");
            }
            else if (child) {
                if (Array.isArray(child)) {
                    child = this.fragment({ children: child });
                }
                elem.append(child);
            }
        }
        return elem;
    }
    print(showValues) {
        if (showValues) {
            console.log("\nEffect Queue", this.effectQueue, "\nEffect Funs: ", this.effectFuns, "\nComponentDATA: ", this.componentIdMap, "\nBlocks: ", this.blocksMap, "\nLoops: ", this.loopBlocks, "\nConditions: ", this.conditionalBlocks, "\nNavigation: ", this.navigation, "\nComponent Names:", this.componentNames);
        }
        console.log("\nConditional Blocks: ", estimateObjectSize(this.conditionalBlocks), "\nLoop Blocks: ", estimateObjectSize(this.loopBlocks), "\nBlocks: ", estimateObjectSize(this.blocksMap), "\nEffects: ", estimateObjectSize(this.effectFuns), "\nComponents: ", estimateObjectSize(this.componentIdMap));
    }
}
export const Rector = new RectorJS();
export const defineState = Rector.defineState.bind(Rector);
export const defineGlobalState = Rector.defineGlobalState.bind(Rector);
// export const Navigation = {
//   createLayoutRoutes: Rector.createLayoutRoutes,
//   defineRoutes: Rector.defineRoutes,
//   setProtectedRoutes: Rector.setProtectedRoutes,
//   navigate: Rector.navigate,
// };
// Navigation
export const setProtectedRoutes = Navigation.setProtectedRoutes.bind(Navigation);
// export const createLayoutRoutes: typeof Navigation.createLayoutRoutes =
//   Navigation.createLayoutRoutes.bind(Navigation);
export const getQueryParams = Navigation.getQueryParams.bind(Navigation);
export const getRouterParams = Navigation.getRouterParams.bind(Navigation);
export const getHash = Navigation.getHash.bind(Navigation);
export const defineRoutes = Navigation.defineRoutes.bind(Navigation);
//Rector
export const setEffect = Rector.setEffect.bind(Rector);
export const RectorMap = Rector.map.bind(Rector);
export const Condition = Rector.condition.bind(Rector);
export const componentState = Rector.componentState.bind(Rector);
export const navigate = Rector.navigate.bind(Rector);
export const useElementRef = Rector.useElementRef.bind(Rector);
export const renderApp = Rector.renderApp.bind(Rector);
export const globalState = Rector.globalState;
export const Elements = Rector.elements;

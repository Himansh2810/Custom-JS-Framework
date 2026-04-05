import { RectorError } from "./error.js";
import { Navigation } from "./navigation.js";
import { SyntheticEvent } from "./event.js";
import { delay, estimateObjectSize, isComponentFunction, isEqual, isJSXConditionObj, isJSXExpressionObj, isLazyChildren, isPlainObject, reservedJSKeys, selfClosingTags, styleObjectToCss, } from "./utils.js";
import { LIST_MARKER, } from "./types.js";
const GLOBAL = "global";
const RECTOR_COMPONENT = Symbol("InternalComponent");
class Component {
    id;
    name;
    parentId;
    states = {};
    stateObjects = {};
    listObjects = {};
    effects = [];
    batchQueue = [];
    isBatchScheduled = false;
    unmounts = [];
    refs = {};
    scopeCache;
    constructor(name, id, parentId) {
        this.name = name;
        this.id = id;
        this.parentId = parentId;
    }
}
class RectorJS {
    #navigation;
    #microTaskQueue = [];
    #errorBoundary;
    #elementInterceptors = {};
    #errorWrapper;
    #stateUsageMap = new WeakMap();
    #stateRefId = 0;
    #GLOBAL_STORE_MARK = Symbol("RECTOR_GLOBAL_STORE");
    elements;
    // Constructor & JSX Base //
    constructor() {
        this.#navigation = Navigation;
        this.elements = new Proxy({}, {
            get: (_, tag) => {
                return (attributes) => this.#createElement(tag, attributes);
            },
        });
        const globalComponent = new Component("$", GLOBAL, null);
        this.#componentIdMap[GLOBAL] = globalComponent;
        window.addEventListener("popstate", () => {
            this.renderApp();
        });
        // window.addEventListener("unhandledrejection", (event) => {
        //   const activeLayout = this.#navigation.activeLayout;
        //   const crrLid = this.#navigation.currentLayout;
        //   if (!!activeLayout && crrLid) {
        //     let layout: { range: Range; blockId: string };
        //     if (typeof crrLid === "number") {
        //       layout = activeLayout[crrLid];
        //     } else {
        //       layout = activeLayout[crrLid[0]];
        //     }
        //     this.handleRenderError(event.reason, {
        //       range: layout.range,
        //     });
        //   } else {
        //     this.handleRenderError(event.reason, { lids: crrLid });
        //   }
        // });
    }
    jsx(fn, props) {
        if (typeof fn === "function") {
            const componentName = isComponentFunction(fn, (e) => {
                throw new RectorError(e);
            });
            if (!componentName || fn?.[RECTOR_COMPONENT]) {
                return fn(props);
            }
            this.#componentNames.add(componentName);
            const cmpId = `${componentName}-${this.#cmpId++}`;
            const activeBlock = this.#activeBlock();
            if (activeBlock) {
                activeBlock.componentRendered ??= [];
                activeBlock.componentRendered.push(cmpId);
            }
            const parent = this.#activeComponent();
            const cmp = new Component(componentName, cmpId, parent.id);
            this.#componentIdMap[cmpId] = cmp;
            this.#scopeStack.push(cmp);
            const app = fn(props);
            this.#scopeStack.pop();
            return app;
        }
        if (typeof fn === "string") {
            // @ts-ignore
            return this.#createElement(fn, props);
        }
        return null;
    }
    fragment({ children }) {
        const container = document.createDocumentFragment();
        if (Array.isArray(children)) {
            for (let [index, child] of children.entries()) {
                this.#resolveChild(child, container, index);
            }
        }
        else if (children) {
            this.#resolveChild(children, container, 0);
        }
        return container;
    }
    /* Public helper APIs  */
    setElementInterceptors = (interceptors) => {
        this.#elementInterceptors = interceptors;
    };
    createPortal = (children, target) => {
        const isNull = target === null || target === undefined;
        if (!isNull && !(target instanceof HTMLElement)) {
            throw new RectorError(`[Rector.Portal]: target should be a HTMlElement.`);
        }
        if (isNull)
            target = document.body;
        if (Array.isArray(children)) {
            for (let [index, child] of children.entries()) {
                this.#resolveChild(child, target, index, true);
            }
        }
        else {
            this.#resolveChild(children, target, 0, true);
        }
    };
    setErrorBoundary = (component) => {
        this.#errorBoundary = component;
    };
    navigate = (path) => {
        if (window.location.pathname !== path) {
            this.renderApp(path);
        }
    };
    useElementRef = (tagName) => {
        return {
            el: null,
            _tag: tagName,
        };
    };
    /* Private Internal Helpers */
    #runMicrotasks() {
        this.#microTaskQueue.forEach((task) => task());
        this.#microTaskQueue = [];
    }
    #isRectorElement(node) {
        if (node instanceof HTMLElement ||
            node instanceof DocumentFragment ||
            node instanceof Node) {
            return true;
        }
        return false;
    }
    #routeCleanUp() {
        this.#componentIdMap = {
            [GLOBAL]: this.#getComponent(GLOBAL),
        };
        this.#stateUsageRefs = {};
        this.#blocksMap = {};
        this.#effectFuns = {};
        this.#effectQueue.clear();
        this.#componentNames.clear();
        this.#navigation.resetActiveLayout(null);
    }
    #configureRange(element, range) {
        const nodes = element instanceof DocumentFragment ? [...element.childNodes] : [element];
        let [first, last] = [nodes[0], nodes[nodes.length - 1]]; // first & last wil same if only [element]
        if (first instanceof Comment)
            first = nodes[1];
        this.#addMicrotask(() => {
            if (!first?.parentNode || !last?.parentNode)
                return; // not attached (yet) or already removed
            range.setStartBefore(first);
            range.setEndAfter(last);
        });
    }
    #configureElementRange(targetEl, range) {
        let element;
        if (typeof targetEl === "string" || typeof targetEl === "number") {
            element = document.createTextNode(targetEl.toString());
        }
        else {
            element = targetEl ? targetEl : document.createTextNode("");
        }
        this.#configureRange(element, range);
        return element;
    }
    #addStateUsageRef(state, config) {
        let prevUsg = this.#stateUsageMap.get(state);
        if (!prevUsg) {
            prevUsg = new Set();
            this.#stateUsageMap.set(state, prevUsg);
        }
        const refId = this.#stateRefId++;
        this.#stateUsageRefs[refId] = config;
        prevUsg.add(refId);
        const activeBlock = this.#activeBlock();
        if (!activeBlock)
            return;
        activeBlock.stateUsageCleanUps ??= [];
        activeBlock.stateUsageCleanUps.push(() => {
            prevUsg.delete(refId);
            if (prevUsg.size === 0) {
                this.#stateUsageMap.delete(state);
            }
        });
        activeBlock.stateUsageRefIds ??= [];
        activeBlock.stateUsageRefIds.push(refId);
    }
    #addMicrotask(fn) {
        this.#microTaskQueue.push(fn);
    }
    /* App Execution */
    #hasCommittedRoute = false;
    renderApp = async (initialPath) => {
        const { route, globalRoute, layoutRoute, path } = this.#navigation.resolveRoute(initialPath);
        const middlewareConfig = { ...globalRoute, ...layoutRoute, ...route };
        if (middlewareConfig.middleware) {
            const action = await this.#runMiddleware(middlewareConfig, path);
            if (action.type === "abort") {
                if (!this.#hasCommittedRoute) {
                    this.navigate(action.fallbackUrl ?? "/");
                    return;
                }
                return;
            }
            if (action.type === "redirect") {
                this.navigate(action.to);
                return;
            }
        }
        this.#hasCommittedRoute = true;
        history.pushState({}, "", path);
        if (route?.config)
            this.#addMicrotask(() => this.#runMetaConfig(route?.config));
        if (!layoutRoute.layout) {
            // route has component key(ComponentElement), still render direct (no layouts)
            this.#runApp(route?.component, null);
            this.#navigation.resetActiveLayout(null);
            return;
        }
        const lids = route.lid;
        const hasActiveLayout = this.#navigation.hasActiveLayout;
        if (typeof lids === "number") {
            if (hasActiveLayout) {
                const prevActiveLayout = this.#navigation.getActiveLayout(lids);
                if (prevActiveLayout) {
                    this.#navigation.resetActiveLayout({
                        [lids]: prevActiveLayout,
                    });
                }
                this.#changeLayoutElement(lids, route.component); // has one active layout , replace layout child with a new route component
            }
            else {
                this.#runApp(this.#layoutExecution(lids, route.component), lids); // no active layout, render component direct wrapped with layout
            }
            return;
        }
        if (!hasActiveLayout) {
            // no active layout, render component with wrapped with all layer of layouts.
            this.#runApp(this.#layoutArrayExecution(lids, route.component), lids);
            return;
        }
        let trackLid = {};
        for (let l of lids) {
            const ctx = this.#navigation.getActiveLayout(l);
            if (ctx) {
                trackLid[l] = ctx;
            }
        }
        this.#navigation.resetActiveLayout(trackLid);
        const { active, exe } = this.#decideLayout(lids);
        if (active === null) {
            // active layouts, but new one doest match this layout, replace whole , render new layout with component.
            this.#runApp(this.#layoutArrayExecution(lids, route.component), lids);
            return;
        }
        // has one or more active layout , decide & perform which layout's child will replaced with component.
        const comp = exe.length
            ? this.#layoutArrayExecution(exe, route.component)
            : route.component;
        if (exe.length) {
            this.#errorWrapper = (cmp) => this.#layoutArrayExecution(exe, cmp);
        }
        this.#changeLayoutElement(active, comp);
    };
    #runApp(app, lids) {
        const body = document.body;
        body.innerHTML = "";
        try {
            this.#routeCleanUp();
            this.#effectQueue.clear();
            this.#scopeStack.push(this.#getComponent(GLOBAL));
            body.append(this.jsx(app, {}));
            this.#scopeStack.pop();
            this.#runMicrotasks();
            this.#runEffectQueue();
            this.#navigation.resetRouterParams();
        }
        catch (error) {
            this.#handleRenderError(error, {
                lids,
            });
        }
    }
    #handleRenderError(error, config) {
        if (!this.#errorBoundary)
            throw error;
        console.error(error);
        try {
            const errElement = () => this.#errorBoundary({ error });
            const { range, lids } = config;
            if (range) {
                range.deleteContents();
                if (this.#crrLayoutBlockId) {
                    this.#effectQueue.clear();
                    this.#unmount(this.#crrLayoutBlockId);
                }
                if (this.#errorWrapper) {
                    range.insertNode(this.#errorWrapper(errElement)());
                }
                else {
                    range.insertNode(errElement());
                }
                this.#crrLayoutBlockId = null;
                this.#errorWrapper = null;
                return;
            }
            const body = document.body;
            body.innerHTML = "";
            this.#routeCleanUp();
            if (lids) {
                if (typeof lids === "number") {
                    body.append(this.#layoutExecution(lids, errElement)());
                }
                else {
                    body.append(this.#layoutArrayExecution(lids, errElement)());
                }
                this.#runMicrotasks();
                return;
            }
            body.append(errElement());
        }
        catch (err) {
            throw err;
        }
    }
    #runMetaConfig(config) {
        if (config?.documentTitle) {
            document.title = config.documentTitle;
        }
    }
    /* Layout execution */
    #crrLayoutBlockId;
    #layoutExecution(layoutId, component) {
        const config = this.#navigation.getRootLayout(layoutId);
        return () => config.layout(() => {
            const blockId = this.#setUpBlock();
            const element = this.jsx(component, {});
            this.#blockStack.pop();
            const range = new Range();
            this.#navigation.resetActiveLayout("init");
            this.#navigation.setActiveLayout(layoutId, { range, blockId });
            this.#configureRange(element, range);
            return element;
        });
    }
    #layoutArrayExecution(layoutIds, startCmp) {
        // wrap component from all layout innerMost -> outerMost
        return layoutIds.reduce((cmp, lid) => this.#layoutExecution(lid, cmp), startCmp);
    }
    #decideLayout(lids) {
        const last = lids[lids.length - 1];
        if (!this.#navigation.getActiveLayout(last))
            return { active: null, exe: [] };
        let active = null;
        let exe = [];
        for (const lid of lids) {
            if (this.#navigation.getActiveLayout(lid)) {
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
    #changeLayoutElement(layoutId, component) {
        const { range, blockId: prevBlockId } = this.#navigation.getActiveLayout(layoutId);
        try {
            range.deleteContents();
            this.#unmount(prevBlockId);
            this.#scopeStack.push(this.#getComponent(GLOBAL));
            this.#effectQueue.clear();
            const blockId = this.#setUpBlock();
            this.#crrLayoutBlockId = blockId;
            range.insertNode(this.jsx(component, {}));
            this.#blockStack.pop();
            this.#scopeStack.pop();
            this.#runMicrotasks();
            this.#runEffectQueue();
            this.#navigation.resetRouterParams();
            this.#navigation.resetActiveLayout("init");
            this.#navigation.setActiveLayout(layoutId, { range, blockId });
            this.#crrLayoutBlockId = null;
            this.#errorWrapper = null;
        }
        catch (error) {
            this.#handleRenderError(error, { range });
        }
    }
    /* Middleware & Overlay */
    #activeLoadingOverlay = null;
    async #runMiddleware(config, path) {
        let navigationAction = { type: "goAhead" };
        const ctx = {
            path,
            redirect(to) {
                navigationAction = { type: "redirect", to };
            },
            abort(fallbackUrl) {
                navigationAction = { type: "abort", fallbackUrl };
            },
        };
        try {
            const timer = setTimeout(() => {
                this.#showLoadingOverlay(config?.loader);
            }, 120);
            await config.middleware(ctx);
            clearTimeout(timer);
            this.#hideLoadingOverlay();
            return navigationAction;
        }
        catch (error) {
            this.#hideLoadingOverlay();
            throw new RectorError(`[Rector.Navigation]: An error occurred in middleware at path '${path}'. Error: ${error?.message}`);
        }
    }
    #showLoadingOverlay(Loader) {
        this.#hideLoadingOverlay();
        const overlay = document.createElement("div");
        this.#activeLoadingOverlay = { element: overlay };
        Object.assign(overlay.style, {
            position: "fixed",
            inset: "0",
            zIndex: "9999",
            background: "white",
            pointerEvents: "all",
        });
        let children = null;
        if (Loader) {
            const blockId = this.#setUpBlock();
            this.#scopeStack.push(this.#getComponent(GLOBAL));
            const element = this.jsx(Loader, {});
            this.#scopeStack.pop();
            this.#blockStack.pop();
            children = element;
            this.#activeLoadingOverlay.blockId = blockId;
        }
        else {
            const divEl = document.createElement("div");
            Object.assign(divEl.style, {
                fontWeight: "semibold",
                fontSize: "20px",
                padding: "8px",
                letterSpacing: "0.5px",
            });
            divEl.textContent = "Loading...";
            children = divEl;
        }
        overlay.appendChild(children);
        document.body.appendChild(overlay);
    }
    #hideLoadingOverlay() {
        if (this.#activeLoadingOverlay) {
            this.#activeLoadingOverlay?.element?.remove();
            const blockId = this.#activeLoadingOverlay?.blockId;
            if (blockId) {
                this.#unmount(blockId);
            }
        }
        this.#activeLoadingOverlay = null;
    }
    /* Blocks */
    #blockId = 0;
    #blockStack = [];
    #blocksMap = {};
    #activeBlock() {
        const L = this.#blockStack.length;
        if (L === 0) {
            return null;
        }
        return this.#blockStack[L - 1];
    }
    #setUpBlock(id) {
        let blockId = id;
        if (!id) {
            blockId = `bl:${this.#blockId++}`;
        }
        const block = {};
        this.#blocksMap[blockId] = block;
        this.#blockStack.push(block);
        return blockId;
    }
    /* Component */
    #cmpId = 0;
    #scopeStack = [];
    #componentIdMap = {};
    #componentNames = new Set();
    #getComponent(id) {
        return this.#componentIdMap[id];
    }
    #getComponentByName(activeComponent, componentName) {
        if (this.#componentNames.has(componentName)) {
            if (componentName === activeComponent.name) {
                throw new RectorError(`Invalid self-reference: Can't use 'fromParent(...)' for component referencing itself.`);
            }
            let parentCmp = this.#getComponent(activeComponent.parentId);
            while (parentCmp) {
                if (parentCmp.id === GLOBAL) {
                    throw new RectorError(`Can't access child component '${componentName}' in '${activeComponent.name}' component.`);
                }
                if (parentCmp.name === componentName) {
                    break;
                }
                parentCmp = this.#getComponent(parentCmp.parentId);
            }
            return parentCmp;
        }
        else {
            throw new RectorError(`Invalid reference at '${activeComponent.name}' component: Component named '${componentName}' doesn't exist or It is not parent of this component.`);
        }
    }
    #activeComponent() {
        const L = this.#scopeStack.length;
        return this.#scopeStack[L - 1];
    }
    /* State, List & Store */
    #stateId = 0;
    #stateUsageRefs = {};
    #createState(component, stateName) {
        const engine = this;
        function state() {
            return component.states[stateName];
        }
        state.set = function (val) {
            const oldValue = component.states[stateName];
            const newValue = typeof val === "function" ? val(oldValue) : val;
            if (isEqual(newValue, oldValue))
                return;
            component.states[stateName] = newValue;
            engine.#scheduleRenderBatch(component, {
                type: "set",
                state: state,
                oldValue,
            });
        };
        return state;
    }
    state(value, stateName) {
        const component = this.#activeComponent();
        if (!component || component.id == GLOBAL) {
            throw new RectorError(`[Rector.Error]: Can not use 'state()' out of component. Use 'createStore()' instead.`);
        }
        if (!stateName) {
            stateName = `state_${this.#stateId++}`;
        }
        else {
            this.#validateStateName(stateName, component);
        }
        if (this.#isListMarker(value)) {
            const items = value.value;
            if (items !== null && !Array.isArray(items)) {
                throw new RectorError(`[Rector.Error]: In '${component.name}', at list(), List value must be an array or null.`);
            }
            component.states[stateName] = items || [];
            const listSignal = this.#createList(component, stateName);
            component.listObjects[stateName] = listSignal;
            return listSignal;
        }
        component.states[stateName] = value;
        const stateSignal = this.#createState(component, stateName);
        component.stateObjects[stateName] = stateSignal;
        return stateSignal;
    }
    #createList(component, stateName) {
        const engine = this;
        function list() {
            return component.states[stateName];
        }
        /* SET */
        list.set = function (values) {
            const oldValue = component.states[stateName];
            const newValue = typeof values === "function" ? values(oldValue) : values;
            if (isEqual(newValue, oldValue))
                return;
            component.states[stateName] = newValue;
            engine.#scheduleRenderBatch(component, {
                type: "set",
                oldValue,
                state: list,
            });
        };
        /* UPDATE  */
        list.update = function (index, value) {
            const oldValue = component.states[stateName];
            if (!oldValue) {
                throw new RectorError(`[Rector.Error]: List is null. Set list as array using list.set([]) before modifying it.`);
            }
            if (index < 0 || index >= oldValue?.length) {
                throw new RectorError(`[Rector.Error]: list.update(${index}, ..) out of range. ` +
                    `Valid range is 0 to ${oldValue?.length - 1}.`);
            }
            if (isEqual(oldValue[index], value))
                return;
            component.states[stateName]?.splice(index, 1, value);
            engine.#scheduleRenderBatch(component, {
                type: "update",
                index,
                value,
                state: list,
            });
        };
        /* INSERT */
        list.insert = function (index, ...values) {
            if (values.length === 0)
                return;
            const oldValue = component.states[stateName];
            if (!oldValue) {
                throw new RectorError(`[Rector.Error]: List is null. Set list as array using list.set([]) before modifying it.`);
            }
            if (index < 0 || index >= oldValue?.length) {
                throw new RectorError(`[Rector.Error]: list.insert(${index}, ..) out of range. ` +
                    `Valid range is 0 to ${oldValue?.length - 1}.`);
            }
            component.states[stateName]?.splice(index, 0, ...values);
            engine.#scheduleRenderBatch(component, {
                type: "insert",
                index,
                values,
                state: list,
            });
        };
        /* PUSH */
        list.push = function (...values) {
            if (values.length === 0)
                return;
            const oldValue = component.states[stateName];
            if (!oldValue) {
                throw new RectorError(`[Rector.Error]: List is null. Set list as array using list.set([]) before modifying it.`);
            }
            component.states[stateName]?.push(...values);
            engine.#scheduleRenderBatch(component, {
                type: "insert",
                state: list,
                values,
                index: oldValue.length,
            });
        };
        /* UNSHIFT */
        list.unshift = function (...values) {
            if (values.length === 0)
                return;
            if (!component.states[stateName]) {
                throw new RectorError(`[Rector.Error]: List is null. Set list as array using list.set([]) before modifying it.`);
            }
            component.states[stateName]?.unshift(...values);
            engine.#scheduleRenderBatch(component, {
                type: "insert",
                state: list,
                index: 0,
                values,
            });
        };
        /* REMOVE_RANGE */
        list.removeRange = function (start, end) {
            if (start === end)
                return;
            if (end < start) {
                throw new RectorError("[Rector.Error]: list.removeRange(start, end), end must be >= start.");
            }
            const oldValue = component.states[stateName];
            if (!oldValue) {
                throw new RectorError(`[Rector.Error]: List is null. Set list as array using list.set([]) before modifying it.`);
            }
            const len = oldValue.length;
            if (start < 0 || start > len) {
                throw new RectorError(`[Rector.Error]: list.removeRange(start,end), start out of range (0..${len})`);
            }
            if (end < 0 || end > len) {
                throw new RectorError(`[Rector.Error]: list.removeRange(start,end), end out of range (0..${len})`);
            }
            component.states[stateName]?.splice(start, end - start);
            engine.#scheduleRenderBatch(component, {
                type: "removeRange",
                state: list,
                start,
                end,
            });
        };
        /* REMOVE */
        list.remove = function (index) {
            const oldValue = component.states[stateName];
            if (!oldValue) {
                throw new RectorError(`[Rector.Error]: List is null. Set list as array using list.set([]) before modifying it.`);
            }
            if (index < 0 || index >= oldValue?.length) {
                throw new RectorError(`[Rector.Error]: list.remove(${index}) out of range. ` +
                    `Valid range is 0 to ${oldValue?.length - 1}.`);
            }
            component.states[stateName]?.splice(index, 1);
            engine.#scheduleRenderBatch(component, {
                type: "remove",
                state: list,
                index,
            });
        };
        /* SHIFT */
        list.shift = function () {
            if (!component.states[stateName]) {
                throw new RectorError(`[Rector.Error]: List is null. Set list as array using list.set([]) before modifying it.`);
            }
            component.states[stateName]?.shift();
            engine.#scheduleRenderBatch(component, {
                type: "remove",
                state: list,
                index: 0,
            });
        };
        /* POP */
        list.pop = function () {
            if (!component.states[stateName]) {
                throw new RectorError(`[Rector.Error]: List is null. Set list as array using list.set([]) before modifying it.`);
            }
            const index = component.states[stateName]?.length - 1;
            component.states[stateName]?.pop();
            engine.#scheduleRenderBatch(component, {
                type: "remove",
                state: list,
                index,
            });
        };
        Object.defineProperty(list, "size", {
            get() {
                const x = component.states[stateName];
                try {
                    return x ? x.length : 0;
                }
                catch (error) {
                    return 0;
                }
            },
            set() {
                throw new RectorError(`[Rector.Error]: List '${stateName}' is read-only.`);
            },
            enumerable: true,
        });
        return list;
    }
    list = (value) => {
        return { [LIST_MARKER]: true, value };
    };
    #isListMarker(value) {
        return !!value && value[LIST_MARKER] === true;
    }
    createStore = (config) => {
        const component = this.#getComponent(GLOBAL);
        const store = {};
        for (const stateName in config) {
            if (component.states[stateName]) {
                throw new RectorError(`[Rector.Error]: In GlobalStore, key '${stateName}' already exists in some store, try another key.`);
            }
            const value = config[stateName];
            if (this.#isListMarker(value)) {
                const items = value.value;
                if (items !== null && !Array.isArray(items)) {
                    throw new RectorError(`[Rector.Error]: In GlobalStore, List '${stateName}' value must be an array or null.`);
                }
                component.states[stateName] = items;
                const listSignal = this.#createList(component, stateName);
                component.listObjects[stateName] = listSignal;
                store[stateName] = listSignal;
            }
            else {
                component.states[stateName] = value;
                const stateSignal = this.#createState(component, stateName);
                component.stateObjects[stateName] = stateSignal;
                store[stateName] = stateSignal;
            }
        }
        Object.defineProperty(store, this.#GLOBAL_STORE_MARK, {
            value: true,
            enumerable: false,
        });
        return Object.freeze(store);
    };
    useGlobal = (store) => {
        if (!store || store[this.#GLOBAL_STORE_MARK] !== true) {
            throw new RectorError(`[Rector.Error]: 'useGlobal(..)' Argument is not a global store.`);
        }
        return store;
    };
    fromParent = (componentName) => {
        const activeComponent = this.#activeComponent();
        if (!activeComponent.scopeCache) {
            activeComponent.scopeCache = new Map();
        }
        if (componentName === undefined) {
            const parentComp = this.#getComponent(activeComponent.parentId);
            if (!parentComp || parentComp.id === GLOBAL) {
                throw new RectorError(`[Rector.Component]: Parent component of '${activeComponent.name}' doesn't exist.`);
            }
            return this.#getParentScope(activeComponent, parentComp, parentComp.name);
        }
        if (!componentName || typeof componentName !== "string") {
            throw new RectorError(`[Rector.Component]: At '${activeComponent.name}' fromParent(...),  Ancestor component name must be string.`);
        }
        const targetComponent = this.#getComponentByName(activeComponent, componentName);
        return this.#getParentScope(activeComponent, targetComponent, componentName);
    };
    #getParentScope(activeComponent, targetComponent, componentName) {
        const cached = activeComponent.scopeCache.get(componentName);
        if (cached)
            return cached;
        const context = {};
        Object.defineProperty(context, "state", {
            get() {
                return new Proxy(targetComponent.stateObjects, {
                    get(target, p) {
                        if (typeof p !== "string")
                            return undefined;
                        if (!Object.hasOwn(target, p)) {
                            throw new RectorError(`[Rector.Error]: State '${p}' doesn't exist on '${targetComponent.name}' component. declare one using state(initialVal,'${p}')`);
                        }
                        return target[p];
                    },
                });
            },
            set() {
                throw new RectorError(`[Rector.Error]: ParentScope can't set explicitly.`);
            },
            enumerable: true,
        });
        Object.defineProperty(context, "list", {
            get() {
                return new Proxy(targetComponent.listObjects, {
                    get(target, p) {
                        if (typeof p !== "string")
                            return undefined;
                        if (!Object.hasOwn(target, p)) {
                            throw new RectorError(`[Rector.Error]: List '${p}' doesn't exist on '${targetComponent.name}' component. declare one using state(list(initialVal),'${p}')`);
                        }
                        return target[p];
                    },
                });
            },
            set() {
                throw new RectorError(`[Rector.Error]: ParentScope can't set explicitly.`);
            },
            enumerable: true,
        });
        activeComponent.scopeCache.set(componentName, context);
        return context;
    }
    #validateStateName(stateName, component) {
        if (typeof stateName !== "string") {
            throw new RectorError("State name must be of string type.");
        }
        stateName = stateName.trim();
        if (this.#componentNames.has(stateName)) {
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
        if (Object.hasOwn(component.states, stateName)) {
            throw new RectorError(`State '${stateName}' is already declared in this component '${component.name}'.`);
        }
    }
    /* Effects */
    #effectFuns = {};
    #stateEffectMap = new WeakMap();
    #effectId = 0;
    #effectQueue = new Set();
    #isFlushingEffects = false;
    #nextEffectQueue = new Set();
    setEffect = (fn, depends, options = { runOnMount: true, phase: "effect" }) => {
        const { runOnMount = true, phase = "effect" } = options;
        if (typeof fn !== "function") {
            throw new RectorError("Effect must be a function");
        }
        if (depends && !Array.isArray(depends)) {
            throw new RectorError("Effect dependencies must be a array of states");
        }
        const component = this.#activeComponent();
        const efId = this.#effectId++;
        component.effects.push(efId);
        (depends || []).forEach((stateObj) => {
            this.#addStateEffectLink(stateObj, efId);
        });
        this.#effectFuns[efId] = {
            scope: component.id,
            depends,
            fn,
            phase: phase === "layout" ? "l" : null,
        };
        if (runOnMount) {
            this.#scheduleEffect(efId);
        }
    };
    #addStateEffectLink(state, effectId) {
        let effects = this.#stateEffectMap.get(state);
        if (!effects) {
            effects = new Set();
            this.#stateEffectMap.set(state, effects);
        }
        effects.add(effectId);
    }
    #scheduleEffect(efId) {
        if (this.#isFlushingEffects) {
            this.#nextEffectQueue.add(efId);
        }
        else {
            this.#effectQueue.add(efId);
        }
    }
    #executeEffect(effect, efId) {
        const { fn, depends, cleanUp, scope } = effect;
        const isDependent = depends && depends.length > 0;
        cleanUp?.();
        effect.cleanUp = null;
        const newCleanUp = fn();
        if (newCleanUp && typeof newCleanUp === "function") {
            if (isDependent) {
                effect.cleanUp = newCleanUp;
            }
            else {
                const cmp = this.#getComponent(scope);
                cmp.unmounts.push(newCleanUp);
            }
        }
        if (!isDependent) {
            delete this.#effectFuns[efId];
        }
    }
    #runEffectQueue() {
        if (this.#isFlushingEffects)
            return;
        this.#isFlushingEffects = true;
        while (this.#effectQueue.size > 0) {
            const queue = [...this.#effectQueue];
            this.#effectQueue.clear();
            let basicEffectsQueue = [];
            for (const efId of queue) {
                const effect = this.#effectFuns[efId];
                if (!effect)
                    continue;
                if (effect.phase === "l") {
                    this.#executeEffect(effect, efId);
                }
                else {
                    basicEffectsQueue.push({ efId, effect });
                }
            }
            for (const { efId, effect } of basicEffectsQueue) {
                this.#executeEffect(effect, efId);
            }
            basicEffectsQueue = null;
            this.#effectQueue = this.#nextEffectQueue;
            this.#nextEffectQueue.clear();
        }
        this.#isFlushingEffects = false;
    }
    #batchEffects(stateObj) {
        const effects = this.#stateEffectMap.get(stateObj);
        if (!effects || effects.size === 0)
            return;
        for (const efId of effects) {
            this.#scheduleEffect(efId);
        }
    }
    /* Loop/For & Conditional Blocks */
    #setUpCondition(data) {
        const component = this.#activeComponent();
        const SCOPE = component.id;
        const isTrue = !!data.eval();
        const range = new Range();
        const blockId = this.#setUpBlock();
        const value = isTrue ? data.then() : data.else();
        this.#blockStack.pop();
        const ele = this.#configureElementRange(value, range);
        for (let state of data?.states) {
            this.#addStateUsageRef(state, {
                type: "condition",
                config: {
                    elementRange: range,
                    cmpId: SCOPE,
                    prevVal: isTrue,
                    childBlock: blockId,
                    ...data,
                },
            });
        }
        return ele;
    }
    For = (each, children, keyExtractor) => {
        if (!isJSXExpressionObj(each)) {
            throw new RectorError(`[Rector.For]: Received a non-reactive value for 'each' , it must be a reactive state array.`);
        }
        if (typeof children !== "function") {
            throw new RectorError(`[Rector.For]: 'children' must be a render function.`);
        }
        const data = each;
        const component = this.#activeComponent();
        const SCOPE = component.id;
        const items = data.eval();
        const fragment = document.createDocumentFragment();
        const startRef = document.createComment("--For-start--");
        const endRef = document.createComment("--For-end--");
        fragment.appendChild(startRef);
        const childBlocks = [];
        items.forEach((item, index) => {
            const blockId = this.#setUpBlock();
            childBlocks.push(blockId);
            const child = children(item, index);
            if (child instanceof DocumentFragment) {
                throw new RectorError("[Rector.For]: Render item can not be a Fragment.");
            }
            this.#blockStack.pop();
            child.blockId = blockId;
            fragment.appendChild(child);
        });
        fragment.appendChild(endRef);
        for (let state of data?.states) {
            this.#addStateUsageRef(state, {
                type: "loop",
                config: {
                    renderElement: children,
                    keyExtractor,
                    cmpId: SCOPE,
                    childBlocks: new Set(childBlocks),
                    data,
                    startRef,
                    endRef,
                },
            });
        }
        return fragment;
    };
    /* Suspense(Await) & Lazy(Async) loading */
    suspense = (children, Loader) => {
        const frag = document.createDocumentFragment();
        const cmmStart = document.createComment("<-- Suspense Start -->");
        const cmmEnd = document.createComment("<-- Suspense End -->");
        frag.appendChild(cmmStart);
        if (Loader && typeof Loader === "function") {
            const node = Loader();
            if (typeof node === "string" || typeof node === "number") {
                frag.appendChild(document.createTextNode(node));
            }
            else if (this.#isRectorElement(node)) {
                frag.appendChild(Loader());
            }
            else {
                throw new RectorError(`[Rector.Error]: Loader in <Await> must return Html Element / Document fragment.`);
            }
        }
        frag.appendChild(cmmEnd);
        const range = new Range();
        this.#configureRange(frag, range);
        const activeComponent = this.#activeComponent();
        this.#addMicrotask(async () => {
            this.#scopeStack.push(activeComponent);
            const container = document.createDocumentFragment();
            try {
                await this.#resolveLazyComponent(children, container);
                range.deleteContents();
                range.insertNode(container);
            }
            catch (error) {
                console.error(error);
                range.deleteContents();
                if (this.#errorBoundary) {
                    range.insertNode(this.#errorBoundary({ error }));
                }
                else {
                    const div = document.createElement("div");
                    div.innerText = error?.message;
                    div.style.padding = "4px";
                    div.style.color = "red";
                    range.insertNode(div);
                }
            }
            finally {
                this.#scopeStack.pop();
            }
        });
        return frag;
    };
    load = (importFn) => {
        function LazyComponent(props) {
            return { importFn, props };
        }
        LazyComponent[RECTOR_COMPONENT] = true;
        return LazyComponent;
    };
    async #resolveLazyComponent(children, container) {
        if (Array.isArray(children)) {
            for (let child of children) {
                await this.#resolveLazyComponent(child, container);
            }
            // await Promise.all(children.map(child => this.resolveLazyComponent(child, container)));
        }
        else if (isLazyChildren(children)) {
            const { importFn, props } = children;
            await delay(1200);
            const Temp = await importFn();
            if (!Temp.default) {
                throw new RectorError(`load(): module has no default export. Make sure your component uses "export default".`);
            }
            const Comp = this.jsx(Temp.default, props);
            container.append(Comp);
        }
        else {
            this.#resolveChild(children, container, 0);
        }
    }
    /* Re-rendering, Batching, patching & updation */
    #reRender(component) {
        const queue = component.batchQueue;
        component.batchQueue = [];
        component.isBatchScheduled = false;
        for (let batchObj of queue) {
            this.#patchState(batchObj, component.id);
            this.#batchEffects(batchObj.state);
        }
        this.#runMicrotasks();
        this.#runEffectQueue();
    }
    #scheduleRenderBatch(component, config) {
        component.batchQueue.push(config);
        if (!component.isBatchScheduled) {
            component.isBatchScheduled = true;
            queueMicrotask(() => {
                this.#reRender(component);
            });
        }
    }
    #getNodesInRange(blockConfig, start, end) {
        let node = blockConfig.startRef.nextSibling;
        let i = 0;
        const result = [];
        while (node && node !== blockConfig.endRef) {
            if (i > end)
                break;
            if (i >= start) {
                result.push(node);
            }
            node = node.nextSibling;
            i++;
        }
        return result;
    }
    #getNodeAt(blockConfig, index) {
        let node = blockConfig.startRef.nextSibling;
        let i = 0;
        while (node && node !== blockConfig.endRef) {
            if (i === index)
                return node;
            node = node.nextSibling;
            i++;
        }
        return blockConfig.endRef;
    }
    #patchState(batchConfig, cmpId) {
        const stateUsageArr = this.#stateUsageMap.get(batchConfig.state);
        if (!stateUsageArr)
            return;
        for (let stateUsageId of stateUsageArr) {
            const stateUsage = this.#stateUsageRefs[stateUsageId];
            if (stateUsage.type === "child") {
                const childRef = stateUsage.config;
                const value = childRef.eval();
                childRef.element.childNodes[childRef.pos].nodeValue = value;
            }
            if (stateUsage.type === "attr") {
                const attrRef = stateUsage.config;
                const value = attrRef.eval();
                attrRef.element.setAttribute(attrRef.attribute, value);
            }
            if (stateUsage.type === "condition") {
                this.#updateIfBlock(stateUsage.config);
            }
            if (stateUsage.type === "loop") {
                this.#updateLoopBlock(stateUsage.config, batchConfig, cmpId);
            }
        }
    }
    #updateIfBlock(ifBlock) {
        const scope = ifBlock.cmpId;
        const component = this.#getComponent(scope);
        const crrVal = !!ifBlock.eval();
        if (ifBlock.prevVal !== crrVal) {
            const range = ifBlock.elementRange;
            range.deleteContents();
            this.#unmount(ifBlock.childBlock);
            this.#scopeStack.push(component);
            this.#setUpBlock(ifBlock.childBlock);
            const value = crrVal ? ifBlock.then() : ifBlock.else();
            this.#blockStack.pop();
            this.#scopeStack.pop();
            const rangedValue = this.#configureElementRange(value, range);
            range.insertNode(rangedValue);
            ifBlock.prevVal = crrVal;
        }
    }
    #updateLoopBlock(blockConfig, batchObj, cmpId) {
        if (batchObj.type === "update") {
            const existingNode = this.#getNodeAt(blockConfig, batchObj.index);
            if (!existingNode)
                return;
            const prevBlockId = existingNode.blockId;
            this.#scopeStack.push(this.#getComponent(cmpId), this.#getComponent(blockConfig.cmpId));
            const blockId = this.#setUpBlock();
            blockConfig.childBlocks.add(blockId);
            let newNode = blockConfig.renderElement(batchObj.value, batchObj.index);
            this.#blockStack.pop();
            this.#scopeStack.pop();
            this.#scopeStack.pop();
            newNode.blockId = blockId;
            existingNode.replaceWith(newNode);
            this.#unmount(prevBlockId);
            blockConfig.childBlocks.delete(prevBlockId);
        }
        if (batchObj.type === "insert") {
            const refNode = this.#getNodeAt(blockConfig, batchObj.index);
            if (!refNode)
                return;
            this.#scopeStack.push(this.#getComponent(cmpId), this.#getComponent(blockConfig.cmpId));
            for (let i = 0; i < batchObj.values.length; i++) {
                const itemIndex = batchObj.index + i;
                const blockId = this.#setUpBlock();
                blockConfig.childBlocks.add(blockId);
                const newNode = blockConfig.renderElement(batchObj.values[i], itemIndex);
                this.#blockStack.pop();
                newNode.blockId = blockId;
                refNode.parentNode.insertBefore(newNode, refNode);
            }
            this.#scopeStack.pop();
            this.#scopeStack.pop();
        }
        if (batchObj.type === "remove") {
            const existingNode = this.#getNodeAt(blockConfig, batchObj.index);
            if (!existingNode || existingNode === blockConfig.endRef)
                return;
            const prevBlockId = existingNode.blockId;
            existingNode.remove();
            this.#unmount(prevBlockId);
            blockConfig.childBlocks.delete(prevBlockId);
        }
        if (batchObj.type === "removeRange") {
            const existingNodes = this.#getNodesInRange(blockConfig, batchObj.start, batchObj.end - 1);
            for (let node of existingNodes) {
                if (!node || node === blockConfig.endRef)
                    continue;
                const prevBlockId = node.blockId;
                node.remove();
                this.#unmount(prevBlockId);
                blockConfig.childBlocks.delete(prevBlockId);
            }
        }
        if (batchObj.type === "set") {
            const newList = blockConfig.data.eval();
            let parent = blockConfig.startRef.parentNode;
            if (!parent)
                throw new RectorError("No parent detected of 'For' loop, pass 'wrap' property to 'For' component.");
            const oldList = batchObj.oldValue;
            const oldNodes = this.#getNodesInRange(blockConfig, 0, oldList.length);
            const keyExtractor = blockConfig.keyExtractor || ((_, i) => i);
            const oldMap = new Map();
            oldList.forEach((item, i) => {
                const key = keyExtractor(item, i);
                if (key === null ||
                    key === undefined ||
                    (typeof key !== "string" && typeof key !== "number")) {
                    throw new RectorError(`Invalid keyExtractor return value at index ${i}: ` +
                        `'${JSON.stringify(key)}'. ` +
                        `Expected string or number.`);
                }
                const node = oldNodes[i];
                if (node) {
                    oldMap.set(String(key), {
                        node,
                        index: i,
                    });
                }
            });
            this.#scopeStack.push(this.#getComponent(cmpId), this.#getComponent(blockConfig.cmpId));
            (newList ?? []).forEach((item, j) => {
                const key = String(keyExtractor(item, j));
                if (key === "undefined" || key === "null") {
                    throw new RectorError(`[keyExtractor]: Received null/undefined key. Your items may be missing the expected "id" property or it is not valid.`);
                }
                const existing = oldMap.get(key);
                if (existing) {
                    const oldItem = oldList[existing.index];
                    let crrNode = existing.node;
                    if (!isEqual(oldItem, item)) {
                        const blockId = this.#setUpBlock();
                        blockConfig.childBlocks.add(blockId);
                        crrNode = blockConfig.renderElement(item, j);
                        this.#blockStack.pop();
                        crrNode.blockId = blockId;
                        const prevBlockId = existing.node?.blockId;
                        existing.node.replaceWith(crrNode);
                        this.#unmount(prevBlockId);
                        blockConfig.childBlocks.delete(prevBlockId);
                    }
                    const refNode = this.#getNodeAt(blockConfig, j);
                    if (crrNode !== refNode) {
                        parent.insertBefore(crrNode, refNode);
                    }
                    oldMap.delete(key);
                }
                else {
                    const blockId = this.#setUpBlock();
                    blockConfig.childBlocks.add(blockId);
                    const node = blockConfig.renderElement(item, j);
                    this.#blockStack.pop();
                    node.blockId = blockId;
                    const refNode = this.#getNodeAt(blockConfig, j);
                    parent.insertBefore(node, refNode);
                }
            });
            this.#scopeStack.pop();
            this.#scopeStack.pop();
            oldMap.forEach(({ node }) => {
                if (node) {
                    const blockId = node.blockId;
                    parent.removeChild(node);
                    this.#unmount(blockId);
                    blockConfig.childBlocks.delete(blockId);
                }
            });
        }
    }
    /* Unmounting */
    #unmount(blockId) {
        const block = this.#blocksMap[blockId];
        if (!block)
            return;
        for (let cmpId of block.componentRendered ?? []) {
            const cmp = this.#getComponent(cmpId);
            cmp?.unmounts?.forEach((fn) => fn());
            this.#removeEffectRefs(cmp.effects);
            this.#componentNames.delete(cmp.name);
            delete this.#componentIdMap[cmpId];
        }
        block.stateUsageCleanUps?.forEach((fn) => fn());
        for (let refId of block.stateUsageRefIds ?? []) {
            delete this.#stateUsageRefs[refId];
        }
        delete this.#blocksMap[blockId];
    }
    #removeEffectRefs(effects) {
        for (let efId of effects) {
            const effect = this.#effectFuns[efId];
            if (!effect)
                continue;
            effect.cleanUp?.();
            for (let state of effect.depends) {
                const effects = this.#stateEffectMap.get(state);
                if (effects) {
                    effects.delete(efId);
                    if (effects.size === 0) {
                        this.#stateEffectMap.delete(state);
                    }
                }
            }
            delete this.#effectFuns[efId];
        }
    }
    /* Delegated DOM Events */
    #DELEGATED_TYPES = new Set(["click", "input", "change", "keydown", "keyup"]);
    #delegatedEvents = new Set();
    #delegatedRoot = document;
    #dispatchDelegatedEvent = (nativeEvent) => {
        const syntheticEvent = new SyntheticEvent(nativeEvent);
        let node = nativeEvent.target;
        while (node && node !== this.#delegatedRoot) {
            const handlers = node.__handlers;
            if (handlers && handlers[nativeEvent.type]) {
                syntheticEvent.currentTarget = node;
                handlers[nativeEvent.type](syntheticEvent);
                if (syntheticEvent.propagationStopped) {
                    return;
                }
            }
            node = node.parentElement;
        }
    };
    #ensureDelegatedListener(type) {
        if (this.#delegatedEvents.has(type))
            return;
        this.#delegatedEvents.add(type);
        this.#delegatedRoot.addEventListener(type, this.#dispatchDelegatedEvent, true);
    }
    /* DOM Element creation & child resolve */
    #createElement(tag, attributes) {
        const component = this.#activeComponent();
        let elem = document.createElement(tag);
        const children = attributes.children;
        Object.entries(attributes).forEach(([key, value]) => {
            let val = value;
            key = key.trim();
            if (key === "children")
                return;
            if (key.startsWith("on") && typeof val === "function") {
                const type = key.slice(2).toLowerCase();
                if (this.#DELEGATED_TYPES.has(type)) {
                    // Delegated path
                    if (!elem.__handlers)
                        elem.__handlers = {};
                    elem.__handlers[type] = val;
                    this.#ensureDelegatedListener(type);
                }
                else {
                    // Direct listener fallback
                    // elem.addEventListener(type, val);
                    elem.addEventListener(type, (nativeEvent) => {
                        const syntheticEvent = new SyntheticEvent(nativeEvent);
                        syntheticEvent.currentTarget = elem;
                        val(syntheticEvent);
                    });
                }
            }
            else {
                switch (key) {
                    case "checked": {
                        // @ts-ignore
                        elem.checked = value;
                        break;
                    }
                    case "ref": {
                        if (val._tag && val._tag !== tag) {
                            throw new RectorError(`[Rector.Ref]: Tag mismatch, expected <${val._tag}> but got <${tag}>`);
                        }
                        if (val.el && val.el !== elem) {
                            throw new RectorError(`[Rector.Ref]: Ref already attached to another previous element <${val._tag}>.`);
                        }
                        val.el = elem;
                        const activeBlock = this.#activeBlock();
                        activeBlock.stateUsageCleanUps ??= [];
                        activeBlock.stateUsageCleanUps.push(() => {
                            val.el = null;
                        });
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
                            const value = val.eval();
                            for (let state of val?.states) {
                                this.#addStateUsageRef(state, {
                                    type: "attr",
                                    config: {
                                        element: elem,
                                        eval: val.eval,
                                        attribute: key,
                                        cmpId: component.id,
                                    },
                                });
                            }
                            elem.setAttribute(key, value);
                        }
                        else {
                            elem.setAttribute(key, val);
                        }
                        break;
                    }
                }
            }
        });
        const interceptElement = (el) => {
            if (this.#elementInterceptors[tag]) {
                this.#elementInterceptors[tag](el);
            }
        };
        if (!children || selfClosingTags.has(tag)) {
            interceptElement(elem);
            return elem;
        }
        const finalEl = this.#parseChildren(elem, Array.isArray(children) ? children : [children]);
        interceptElement(finalEl);
        return finalEl;
    }
    #parseChildren(elem, children) {
        for (let [index, child] of children.entries()) {
            this.#resolveChild(child, elem, index);
        }
        return elem;
    }
    #resolveChild(child, container, index, isPortalContainer = false) {
        const addToDOM = (chd) => {
            if (isPortalContainer) {
                this.#addMicrotask(() => container.append(chd));
            }
            else {
                container.append(chd);
            }
        };
        if (typeof child === "number" || typeof child === "string") {
            addToDOM(document.createTextNode(String(child)));
            return;
        }
        if (isJSXConditionObj(child)) {
            if (container instanceof DocumentFragment) {
                throw new RectorError(`[Rector.Fragment]: Can't use dynamic values directly inside fragment. Wrap it in an HTML element.`);
            }
            const conditionElem = this.#setUpCondition(child);
            addToDOM(conditionElem);
            return;
        }
        if (isJSXExpressionObj(child)) {
            if (container instanceof DocumentFragment) {
                throw new RectorError(`[Rector.Fragment]: Can't use dynamic values directly inside fragment. Wrap it in an HTML element.`);
            }
            const component = this.#activeComponent();
            const cmpId = component.id;
            const value = child.eval();
            if (Array.isArray(value)) {
                if (isPortalContainer) {
                    this.#addMicrotask(() => container.append(...value));
                }
                else {
                    container.append(...value);
                }
            }
            else {
                addToDOM(value);
            }
            for (let state of child?.states) {
                this.#addStateUsageRef(state, {
                    type: "child",
                    config: {
                        element: container,
                        pos: index,
                        eval: child.eval,
                        cmpId,
                    },
                });
            }
            return;
        }
        if (isLazyChildren(child)) {
            throw new RectorError("[Rector.Component]: Async component (dynamic imported component) only allowed inside <Await>.");
        }
        if (typeof child === "function" || isPlainObject(child)) {
            throw new RectorError("[Rector.Component]: Functions and Objects are not allowed as children.");
        }
        if (child) {
            if (Array.isArray(child)) {
                child = this.fragment({ children: child });
            }
            addToDOM(child);
            return;
        }
    }
    print(showValues) {
        if (showValues) {
            console.log("\nEffect Queue", this.#effectQueue, "\nEffect Funs: ", this.#effectFuns, "\nComponentDATA: ", this.#componentIdMap, "\nBlocks: ", this.#blocksMap, "\nStateUsage: ", this.#stateUsageRefs, "\nNavigation: ", this.#navigation, "\nComponent Names:", this.#componentNames, "\nState effect WeakMap:", this.#stateEffectMap, "\nState Usage WeakMap:", this.#stateUsageMap);
        }
        console.log("\nConditional Blocks: ", 
        // estimateObjectSize(this.conditionalBlocks),
        "\nLoop Blocks: ", estimateObjectSize(this.#stateUsageRefs), "\nBlocks: ", estimateObjectSize(this.#blocksMap), "\nEffects: ", estimateObjectSize(this.#effectFuns), "\nComponents: ", estimateObjectSize(this.#componentIdMap));
    }
}
const Rector = new RectorJS();
export const state = Rector.state.bind(Rector);
function For({ each, keyExtractor, children, }) {
    return Rector.For.call(Rector, each, children, keyExtractor);
}
For[RECTOR_COMPONENT] = true;
function Portal({ children, target }) {
    return Rector.createPortal.call(Rector, children, target);
}
function Await({ children, loader, }) {
    return Rector.suspense.call(Rector, children, loader);
}
Portal[RECTOR_COMPONENT] = true;
Await[RECTOR_COMPONENT] = true;
export { For, Portal, Rector, Await, Navigation };

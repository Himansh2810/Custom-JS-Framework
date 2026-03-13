import { RectorError } from "./error.js";
import { Navigation } from "./navigation.js";
import { SyntheticEvent } from "./event.js";
import { estimateObjectSize, isComponentFunction, isEqual, isJSXConditionObj, isJSXExpressionObj, isPlainObject, reservedJSKeys, selfClosingTags, styleObjectToCss, } from "./utils.js";
import { LIST_MARKER, } from "./types.js";
const GLOBAL = "global";
class Component {
    constructor(name, id, parentId) {
        this.states = {};
        this.stateObjects = {};
        this.listObjects = {};
        this.effects = [];
        this.batchQueue = [];
        this.isBatchScheduled = false;
        this.unmounts = [];
        this.refs = {};
        this.name = name;
        this.id = id;
        this.parentId = parentId;
    }
}
class RectorJS {
    getComponent(id) {
        return this.componentIdMap[id];
    }
    // constructor setup //
    constructor() {
        this.effectFuns = {};
        this.stateEffectMap = new WeakMap();
        this.effectId = 0;
        this.cmpId = 0;
        this.scopeStack = [];
        this.componentIdMap = {};
        this.componentNames = new Set();
        this.blockId = 0;
        // private conditionalBlocks: { [id: string]: IfBlockConfig } = {};
        // private loopBlocks: { [id: string]: LoopBlockConfig } = {};
        this.stateUsageRefs = {};
        this.blocksMap = {};
        this.blockStack = [];
        this.microTaskQueue = [];
        this.elementInterceptors = {};
        this.effectQueue = new Set();
        this.isFlushingEffects = false;
        this.nextEffectQueue = new Set();
        this.stateUsageMap = new WeakMap();
        this.stateRefId = 0;
        this.hasCommittedRoute = false;
        this.activeLoadingOverlay = null;
        this.GLOBAL_STORE_MARK = Symbol("RECTOR_GLOBAL_STORE");
        this.stateId = 0;
        this.DELEGATED_TYPES = new Set([
            "click",
            "input",
            "change",
            "keydown",
            "keyup",
        ]);
        this.delegatedEvents = new Set();
        this.delegatedRoot = document;
        this.navigation = Navigation;
        this.elements = new Proxy({}, {
            get: (_, tag) => {
                return (attributes) => this.createElement(tag, attributes);
            },
        });
        const globalComponent = new Component("$", GLOBAL, null);
        this.componentIdMap[GLOBAL] = globalComponent;
        window.addEventListener("popstate", () => {
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
        if (typeof fn === "function") {
            const componentName = isComponentFunction(fn, (e) => {
                throw new RectorError(e);
            });
            if (!componentName || fn?.isRectorComponent) {
                return fn(props);
            }
            this.componentNames.add(componentName);
            const cmpId = `${componentName}-${this.cmpId++}`;
            const activeBlock = this.activeBlock();
            if (activeBlock) {
                activeBlock.componentRendered ?? (activeBlock.componentRendered = []);
                activeBlock.componentRendered.push(cmpId);
            }
            const parent = this.activeComponent();
            const cmp = new Component(componentName, cmpId, parent.id);
            this.componentIdMap[cmpId] = cmp;
            this.scopeStack.push(cmp);
            const app = fn(props);
            this.scopeStack.pop();
            return app;
        }
        if (typeof fn === "string") {
            // @ts-ignore
            return this.createElement(fn, props);
        }
        return null;
    }
    fragment({ children }) {
        const container = document.createDocumentFragment();
        if (Array.isArray(children)) {
            for (let [index, child] of children.entries()) {
                this.resolveChild(child, container, index);
            }
        }
        else if (children) {
            this.resolveChild(children, container, 0);
        }
        return container;
    }
    setErrorBoundary(component) {
        this.errorBoundary = component;
    }
    navigate(path) {
        if (window.location.pathname !== path) {
            this.renderApp(path);
        }
    }
    handleRenderError(error, config) {
        if (!this.errorBoundary)
            throw error;
        console.error(error);
        try {
            const errElement = () => this.errorBoundary({ error });
            const { range, lids } = config;
            if (range) {
                range.deleteContents();
                if (this.crrLayoutBlockId) {
                    this.effectQueue.clear();
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
        if (config?.documentTitle) {
            document.title = config.documentTitle;
        }
    }
    layoutExecution(layoutId, component) {
        const layout = this.navigation.layouts[layoutId];
        return () => layout(() => {
            var _a;
            const blockId = this.setUpBlock();
            const element = this.jsx(component, {});
            this.blockStack.pop();
            const range = new Range();
            (_a = this.navigation).activeLayout ?? (_a.activeLayout = {});
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
        const { range, blockId: prevBlockId } = this.navigation.activeLayout[layoutId];
        try {
            range.deleteContents();
            this.unmount(prevBlockId);
            this.scopeStack.push(this.getComponent(GLOBAL));
            this.effectQueue.clear();
            const blockId = this.setUpBlock();
            this.crrLayoutBlockId = blockId;
            range.insertNode(this.jsx(component, {}));
            this.blockStack.pop();
            this.scopeStack.pop();
            this.runMicrotasks();
            this.runEffectQueue();
            this.navigation.resetRouterParams();
            (_a = this.navigation).activeLayout ?? (_a.activeLayout = {});
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
            this.effectQueue.clear();
            this.scopeStack.push(this.getComponent(GLOBAL));
            body.append(this.jsx(app, {}));
            this.scopeStack.pop();
            this.runMicrotasks();
            this.runEffectQueue();
            this.navigation.resetRouterParams();
        }
        catch (error) {
            this.handleRenderError(error, {
                lids,
            });
        }
    }
    showLoadingOverlay(Loader) {
        this.hideLoadingOverlay();
        const overlay = document.createElement("div");
        this.activeLoadingOverlay = { element: overlay };
        Object.assign(overlay.style, {
            position: "fixed",
            inset: "0",
            zIndex: "9999",
            background: "white",
            pointerEvents: "all",
        });
        let children = null;
        if (Loader) {
            const blockId = this.setUpBlock();
            this.scopeStack.push(this.getComponent(GLOBAL));
            const element = this.jsx(Loader, {});
            this.scopeStack.pop();
            this.blockStack.pop();
            children = element;
            this.activeLoadingOverlay.blockId = blockId;
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
    hideLoadingOverlay() {
        if (this.activeLoadingOverlay) {
            this.activeLoadingOverlay?.element?.remove();
            const blockId = this.activeLoadingOverlay?.blockId;
            if (blockId) {
                this.unmount(blockId);
            }
        }
        this.activeLoadingOverlay = null;
    }
    async runMiddleware(route, path) {
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
                this.showLoadingOverlay(route?.loading);
            }, 120);
            await route.middleware(ctx);
            clearTimeout(timer);
            this.hideLoadingOverlay();
            return navigationAction;
        }
        catch (error) {
            this.hideLoadingOverlay();
            throw new RectorError(`[Rector.Navigation]: An error occurred in middleware at path '${path}'. Error: ${error?.message}`);
        }
    }
    async renderApp(initialPath) {
        const path = this.navigation.normalizePath(initialPath ?? window.location.pathname);
        const route = this.navigation.resolveRoute(path);
        if (route?.middleware) {
            const action = await this.runMiddleware(route, path);
            if (action.type === "abort") {
                if (!this.hasCommittedRoute) {
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
        this.hasCommittedRoute = true;
        history.pushState({}, "", path);
        if (route?.config)
            this.microTaskQueue.push(() => this.runMetaConfig(route?.config));
        if (!route?.lid) {
            // route has component key(ComponentElement), still render direct (no layouts)
            this.runApp(route?.component, null);
            this.navigation.activeLayout = null;
            return;
        }
        const lids = route.lid;
        const hasActiveLayout = !!this.navigation.activeLayout;
        if (typeof lids === "number") {
            hasActiveLayout
                ? this.changeLayoutElement(lids, route.component) // has one active layout , replace layout child with a new route component
                : this.runApp(this.layoutExecution(lids, route.component), lids); // no active layout, render component direct wrapped with layout
            return;
        }
        if (!hasActiveLayout) {
            // no active layout, render component with wrapped with all layer of layouts.
            this.runApp(this.layoutArrayExecution(lids, route.component), lids);
            return;
        }
        const { active, exe } = this.decideLayout(lids);
        if (!active) {
            // active layouts, but new one doest match this layout, replace whole , render new layout with component.
            this.runApp(this.layoutArrayExecution(lids, route.component), lids);
            return;
        }
        // has one or more active layout , decide & perform which layout's child will replaced with component.
        const comp = exe.length
            ? this.layoutArrayExecution(exe, route.component)
            : route.component;
        if (exe.length) {
            this.errorWrapper = (cmp) => this.layoutArrayExecution(exe, cmp);
        }
        this.changeLayoutElement(active, comp);
    }
    async runMicrotasks() {
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
    list(value) {
        return { [LIST_MARKER]: true, value };
    }
    isListConfig(value) {
        return !!value && value[LIST_MARKER] === true;
    }
    createPortal(children, target) {
        const isNull = target === null || target === undefined;
        if (!isNull && !(target instanceof HTMLElement)) {
            throw new RectorError(`[Rector.Portal]: target should be a HTMlElement.`);
        }
        if (isNull)
            target = document.body;
        if (Array.isArray(children)) {
            for (let [index, child] of children.entries()) {
                this.resolveChild(child, target, index, true);
            }
        }
        else {
            this.resolveChild(children, target, 0, true);
        }
    }
    createGlobalStore(config) {
        const component = this.getComponent(GLOBAL);
        const store = {};
        for (const stateName in config) {
            const value = config[stateName];
            if (this.isListConfig(value)) {
                const items = value.value;
                if (items !== null && !Array.isArray(items)) {
                    throw new RectorError(`[Rector.Error]: In GlobalStore, List '${stateName}' value must be an array or null.`);
                }
                component.states[stateName] = items;
                const listObj = this.createList(component, stateName);
                component.listObjects[stateName] = listObj;
                store[stateName] = listObj;
            }
            else {
                component.states[stateName] = value;
                const stateObj = this.createState(component, stateName);
                component.stateObjects[stateName] = stateObj;
                store[stateName] = stateObj;
            }
        }
        Object.defineProperty(store, this.GLOBAL_STORE_MARK, {
            value: true,
            enumerable: false,
        });
        return Object.freeze(store);
    }
    useGlobal(store) {
        if (!store || store[this.GLOBAL_STORE_MARK] !== true) {
            throw new RectorError(`[Rector.Error]: 'useGlobal(..)' Argument is not a global store.`);
        }
        return store;
    }
    defineState(value, stateName) {
        const component = this.activeComponent();
        if (!component || component.id == GLOBAL) {
            // return this.configureState(stateName, value, this.getComponent(GLOBAL));
            throw new RectorError(`[Rector.Error]: Can not use 'defineState' out of component. Use 'createGlobalStore(..)' instead.`);
        }
        if (!stateName) {
            stateName = `state_${this.stateId++}`;
        }
        return this.configureState(stateName, value, component);
    }
    createState(component, stateName) {
        const engine = this;
        const state = {
            set(val) {
                const oldValue = component.states[stateName];
                const newValue = typeof val === "function" ? val(oldValue) : val;
                if (isEqual(newValue, oldValue))
                    return;
                component.states[stateName] = newValue;
                engine.scheduleRenderBatch(component, {
                    type: "set",
                    state: state,
                    value: oldValue,
                });
            },
        };
        Object.defineProperty(state, "value", {
            get() {
                return component.states[stateName];
            },
            set() {
                throw new RectorError(`[Rector.Error]: State '${stateName}' is read-only. Use state.set(...) to update it.`);
            },
            enumerable: true,
        });
        return Object.freeze(state);
    }
    validateStateName(stateName, component) {
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
        if (Object.hasOwn(component.states, stateName)) {
            const isGlobalCmp = component.id === GLOBAL;
            throw new RectorError(`${isGlobalCmp ? "Global" : ""} State '${stateName}' is already declared in this ${isGlobalCmp ? "App" : `'${component.name}' Component`}.`);
        }
    }
    configureState(stateName, value, component) {
        this.validateStateName(stateName, component);
        component.states[stateName] = value;
        const stateObj = this.createState(component, stateName);
        component.stateObjects[stateName] = stateObj;
        return stateObj;
    }
    addStateEffectLink(state, effectId) {
        let effects = this.stateEffectMap.get(state);
        if (!effects) {
            effects = new Set();
            this.stateEffectMap.set(state, effects);
        }
        effects.add(effectId);
    }
    scheduleEffect(efId) {
        if (this.isFlushingEffects) {
            this.nextEffectQueue.add(efId);
        }
        else {
            this.effectQueue.add(efId);
        }
    }
    setEffect(fn, depends, options = { runOnMount: true, phase: "effect" }) {
        const { runOnMount = true, phase = "effect" } = options;
        if (typeof fn !== "function") {
            throw new RectorError("Effect must be a function");
        }
        if (depends && !Array.isArray(depends)) {
            throw new RectorError("Effect dependencies must be a array of states");
        }
        const component = this.activeComponent();
        const efId = this.effectId++;
        component.effects.push(efId);
        (depends || []).forEach((stateObj) => {
            this.addStateEffectLink(stateObj, efId);
        });
        this.effectFuns[efId] = {
            scope: component.id,
            depends,
            fn,
            phase: phase === "layout" ? "l" : null,
        };
        if (runOnMount) {
            this.scheduleEffect(efId);
        }
    }
    executeEffect(effect, efId) {
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
                const cmp = this.getComponent(scope);
                cmp.unmounts.push(newCleanUp);
            }
        }
        if (!isDependent) {
            delete this.effectFuns[efId];
        }
    }
    runEffectQueue() {
        if (this.isFlushingEffects)
            return;
        this.isFlushingEffects = true;
        while (this.effectQueue.size > 0) {
            const queue = [...this.effectQueue];
            this.effectQueue.clear();
            let basicEffectsQueue = [];
            for (const efId of queue) {
                const effect = this.effectFuns[efId];
                if (!effect)
                    continue;
                if (effect.phase === "l") {
                    this.executeEffect(effect, efId);
                }
                else {
                    basicEffectsQueue.push({ efId, effect });
                }
            }
            for (const { efId, effect } of basicEffectsQueue) {
                this.executeEffect(effect, efId);
            }
            basicEffectsQueue = null;
            this.effectQueue = this.nextEffectQueue;
            this.nextEffectQueue.clear();
        }
        this.isFlushingEffects = false;
    }
    batchEffects(stateObj) {
        const effects = this.stateEffectMap.get(stateObj);
        if (!effects || effects.size === 0)
            return;
        for (const efId of effects) {
            this.scheduleEffect(efId);
        }
    }
    setUpBlock(id) {
        let blockId = id;
        if (!id) {
            blockId = `bl:${this.blockId++}`;
        }
        const block = {};
        this.blocksMap[blockId] = block;
        this.blockStack.push(block);
        return blockId;
    }
    transformExternalState(state, activeComponent) {
        const [compName, stateName] = state;
        let dVar;
        if (compName === "$") {
            const globalComponent = this.getComponent(GLOBAL);
            this.checkStateValid(globalComponent, stateName);
            dVar = [GLOBAL, stateName];
        }
        else if (this.componentNames.has(compName)) {
            if (compName === activeComponent.name) {
                throw new Error(`Invalid self-reference: Use "${stateName}" instead of "${compName}.${stateName}" inside component "${compName}".`);
            }
            let parentCmp = this.getComponent(activeComponent.parentId);
            while (parentCmp) {
                if (parentCmp.id === GLOBAL) {
                    throw new RectorError(`Can't access child component '${compName}' in '${activeComponent.name}' component.`);
                }
                if (parentCmp.name === compName) {
                    break;
                }
                parentCmp = this.getComponent(parentCmp.parentId);
            }
            this.checkStateValid(parentCmp, stateName);
            dVar = [parentCmp.id, stateName];
        }
        else {
            this.checkStateValid(activeComponent, compName);
            dVar = compName;
        }
        return dVar;
    }
    transformExprStates(states, activeComponent) {
        let dynamicStates = [];
        for (let state of states) {
            if (typeof state === "string") {
                this.checkStateValid(activeComponent, state);
                dynamicStates.push(state);
            }
            else {
                const props = this.transformExternalState(state, activeComponent);
                dynamicStates.push(props);
            }
        }
        return dynamicStates;
    }
    setUpCondition(data) {
        const component = this.activeComponent();
        const SCOPE = component.id;
        const isTrue = !!data.eval();
        const range = new Range();
        const blockId = this.setUpBlock();
        const value = isTrue ? data.then() : data.else();
        this.blockStack.pop();
        const ele = this.configureElementRange(value, range);
        for (let state of data?.states) {
            this.addStateUsageRef(state, {
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
    For(each, children, keyExtractor) {
        if (!isJSXExpressionObj(each)) {
            throw new RectorError(`[Rector.For]: Received a non-reactive value for 'each' , it must be a reactive state array.`);
        }
        if (typeof children !== "function") {
            throw new RectorError(`[Rector.For]: 'children' must be a render function.`);
        }
        const data = each;
        const component = this.activeComponent();
        const SCOPE = component.id;
        const items = data.eval();
        const fragment = document.createDocumentFragment();
        const startRef = document.createComment("--For-start--");
        const endRef = document.createComment("--For-end--");
        fragment.appendChild(startRef);
        const childBlocks = [];
        items.forEach((item, index) => {
            const blockId = this.setUpBlock();
            childBlocks.push(blockId);
            const child = children(item, index);
            if (child instanceof DocumentFragment) {
                throw new RectorError("[Rector.For]: Render item can not be a Fragment.");
            }
            this.blockStack.pop();
            child.blockId = blockId;
            fragment.appendChild(child);
        });
        fragment.appendChild(endRef);
        for (let state of data?.states) {
            this.addStateUsageRef(state, {
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
    }
    useElementRef(tagName) {
        return {
            el: null,
            _tag: tagName,
        };
    }
    // public useElementRef<T extends keyof HTMLElementTagNameMap>(
    //   elementTagName?: T,
    // ) {
    //   const component = this.activeComponent();
    //   return new Proxy({} as RectorElementRef<T>, {
    //     get: (_, refName: string) => {
    //       const refKey = `${elementTagName}:${refName}`;
    //       if (!Object.hasOwn(component.refs ?? {}, refKey)) {
    //         throw new RectorError(
    //           `Ref '${refName}' doesn't exist on any '${elementTagName}' element in '${component.name}' component.`,
    //         );
    //       }
    //       return component.refs[refKey];
    //     },
    //   });
    // }
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
        this.stateUsageRefs = {};
        this.blocksMap = {};
        this.effectFuns = {};
        this.effectQueue.clear();
        this.componentNames.clear();
    }
    configureRange(element, range) {
        const nodes = element instanceof DocumentFragment ? [...element.childNodes] : [element];
        let [first, last] = [nodes[0], nodes[nodes.length - 1]]; // first & last wil same if only [element]
        if (first instanceof Comment)
            first = nodes[1];
        this.microTaskQueue.push(() => {
            if (!first?.parentNode || !last?.parentNode)
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
        else {
            element = targetEl ? targetEl : document.createTextNode("");
        }
        this.configureRange(element, range);
        return element;
    }
    removeBlockRef(scopeState, cmpId, target, blockType) {
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
            const filteredIds = cmp[blockType][stateName]?.filter((t) => t !== target);
            if (!filteredIds?.length) {
                delete cmp[blockType][stateName];
            }
            else {
                cmp[blockType][stateName] = filteredIds;
            }
        }
    }
    removeEffectRefs(effects) {
        for (let efId of effects) {
            const effect = this.effectFuns[efId];
            if (!effect)
                continue;
            effect.cleanUp?.();
            for (let state of effect.depends) {
                const effects = this.stateEffectMap.get(state);
                if (effects) {
                    effects.delete(efId);
                    if (effects.size === 0) {
                        this.stateEffectMap.delete(state);
                    }
                }
            }
            delete this.effectFuns[efId];
        }
    }
    unmount(blockId) {
        const block = this.blocksMap[blockId];
        if (!block)
            return;
        for (let cmpId of block.componentRendered ?? []) {
            const cmp = this.getComponent(cmpId);
            cmp?.unmounts?.forEach((fn) => fn());
            this.removeEffectRefs(cmp.effects);
            this.componentNames.delete(cmp.name);
            delete this.componentIdMap[cmpId];
        }
        block.stateUsageCleanUps?.forEach((fn) => fn());
        for (let refId of block.stateUsageRefIds ?? []) {
            delete this.stateUsageRefs[refId];
        }
        delete this.blocksMap[blockId];
    }
    updateIfBlock(ifBlock) {
        const scope = ifBlock.cmpId;
        const component = this.getComponent(scope);
        const crrVal = !!ifBlock.eval();
        if (ifBlock.prevVal !== crrVal) {
            const range = ifBlock.elementRange;
            range.deleteContents();
            this.unmount(ifBlock.childBlock);
            this.scopeStack.push(component);
            this.setUpBlock(ifBlock.childBlock);
            const value = crrVal ? ifBlock.then() : ifBlock.else();
            this.blockStack.pop();
            this.scopeStack.pop();
            const rangedValue = this.configureElementRange(value, range);
            range.insertNode(rangedValue);
            ifBlock.prevVal = crrVal;
        }
    }
    getNodesInRange(blockConfig, start, end) {
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
    getNodeAt(blockConfig, index) {
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
    reRender(component) {
        const queue = component.batchQueue;
        component.batchQueue = [];
        component.isBatchScheduled = false;
        for (let batchObj of queue) {
            this.patchState(batchObj, component.id);
            this.batchEffects(batchObj.state);
        }
        this.runMicrotasks();
        this.runEffectQueue();
    }
    scheduleRenderBatch(component, config) {
        component.batchQueue.push(config);
        if (!component.isBatchScheduled) {
            component.isBatchScheduled = true;
            queueMicrotask(() => {
                this.reRender(component);
            });
        }
    }
    createList(component, stateName) {
        const engine = this;
        const list = {
            set(values) {
                const oldValue = component.states[stateName];
                const newValue = typeof values === "function" ? values(oldValue) : values;
                if (isEqual(newValue, oldValue))
                    return;
                component.states[stateName] = newValue;
                engine.scheduleRenderBatch(component, {
                    type: "set",
                    value: oldValue,
                    state: list,
                });
            },
            update(index, value) {
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
                engine.scheduleRenderBatch(component, {
                    type: "update",
                    index,
                    value,
                    state: list,
                });
            },
            insert(index, ...values) {
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
                engine.scheduleRenderBatch(component, {
                    type: "insert",
                    index,
                    value: values,
                    state: list,
                });
            },
            push(...values) {
                if (values.length === 0)
                    return;
                const oldValue = component.states[stateName];
                if (!oldValue) {
                    throw new RectorError(`[Rector.Error]: List is null. Set list as array using list.set([]) before modifying it.`);
                }
                component.states[stateName]?.push(...values);
                engine.scheduleRenderBatch(component, {
                    type: "insert",
                    state: list,
                    value: values,
                    index: oldValue.length,
                });
            },
            unshift(...values) {
                if (values.length === 0)
                    return;
                if (!component.states[stateName]) {
                    throw new RectorError(`[Rector.Error]: List is null. Set list as array using list.set([]) before modifying it.`);
                }
                component.states[stateName]?.unshift(...values);
                engine.scheduleRenderBatch(component, {
                    type: "insert",
                    state: list,
                    index: 0,
                    value: values,
                });
            },
            removeRange(start, end) {
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
                engine.scheduleRenderBatch(component, {
                    type: "removeRange",
                    state: list,
                    index: start,
                    value: end,
                });
            },
            remove(index) {
                const oldValue = component.states[stateName];
                if (!oldValue) {
                    throw new RectorError(`[Rector.Error]: List is null. Set list as array using list.set([]) before modifying it.`);
                }
                if (index < 0 || index >= oldValue?.length) {
                    throw new RectorError(`[Rector.Error]: list.remove(${index}) out of range. ` +
                        `Valid range is 0 to ${oldValue?.length - 1}.`);
                }
                component.states[stateName]?.splice(index, 1);
                engine.scheduleRenderBatch(component, {
                    type: "remove",
                    state: list,
                    index,
                });
            },
            shift() {
                if (!component.states[stateName]) {
                    throw new RectorError(`[Rector.Error]: List is null. Set list as array using list.set([]) before modifying it.`);
                }
                component.states[stateName]?.shift();
                engine.scheduleRenderBatch(component, {
                    type: "remove",
                    state: list,
                    index: 0,
                });
            },
            pop() {
                if (!component.states[stateName]) {
                    throw new RectorError(`[Rector.Error]: List is null. Set list as array using list.set([]) before modifying it.`);
                }
                const index = component.states[stateName]?.length - 1;
                component.states[stateName]?.pop();
                engine.scheduleRenderBatch(component, {
                    type: "remove",
                    state: list,
                    index,
                });
            },
        };
        Object.defineProperty(list, "value", {
            get() {
                return component.states[stateName];
            },
            set() {
                throw new RectorError(`[Rector.Error]: List '${stateName}' is read-only.`);
            },
            enumerable: true,
        });
        Object.defineProperty(list, "length", {
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
        return Object.freeze(list);
    }
    defineList(items, stateName) {
        const engine = this;
        let component = engine.activeComponent();
        if (items !== null && !Array.isArray(items)) {
            throw new RectorError(`[Rector.Error]: In '${component.name}', List value must be an array or null.`);
        }
        if (!component) {
            component = engine.getComponent(GLOBAL);
        }
        if (!stateName) {
            stateName = `state_${this.stateId++}`;
        }
        engine.validateStateName(stateName, component);
        component.states[stateName] = items || [];
        const fList = engine.createList(component, stateName);
        component.listObjects[stateName] = fList;
        return fList;
    }
    updateLoopBlock(blockConfig, batchObj, cmpId) {
        if (batchObj.type === "update") {
            const existingNode = this.getNodeAt(blockConfig, batchObj?.index);
            if (!existingNode)
                return;
            const prevBlockId = existingNode.blockId;
            this.scopeStack.push(this.getComponent(cmpId), this.getComponent(blockConfig.cmpId));
            const blockId = this.setUpBlock();
            blockConfig.childBlocks.add(blockId);
            let newNode = blockConfig.renderElement(batchObj?.value, batchObj?.index);
            this.blockStack.pop();
            this.scopeStack.pop();
            this.scopeStack.pop();
            newNode.blockId = blockId;
            existingNode.replaceWith(newNode);
            this.unmount(prevBlockId);
            blockConfig.childBlocks.delete(prevBlockId);
        }
        if (batchObj.type === "insert") {
            const refNode = this.getNodeAt(blockConfig, batchObj?.index);
            if (!refNode)
                return;
            this.scopeStack.push(this.getComponent(cmpId), this.getComponent(blockConfig.cmpId));
            for (let i = 0; i < batchObj.value.length; i++) {
                const itemIndex = batchObj.index + i;
                const blockId = this.setUpBlock();
                blockConfig.childBlocks.add(blockId);
                const newNode = blockConfig.renderElement(batchObj.value[i], itemIndex);
                this.blockStack.pop();
                newNode.blockId = blockId;
                refNode.parentNode.insertBefore(newNode, refNode);
            }
            this.scopeStack.pop();
            this.scopeStack.pop();
        }
        if (batchObj.type === "remove") {
            const existingNode = this.getNodeAt(blockConfig, batchObj?.index);
            if (!existingNode || existingNode === blockConfig.endRef)
                return;
            const prevBlockId = existingNode.blockId;
            existingNode.remove();
            this.unmount(prevBlockId);
            blockConfig.childBlocks.delete(prevBlockId);
        }
        if (batchObj.type === "removeRange") {
            const existingNodes = this.getNodesInRange(blockConfig, batchObj?.index, batchObj.value - 1);
            for (let node of existingNodes) {
                if (!node || node === blockConfig.endRef)
                    continue;
                const prevBlockId = node.blockId;
                node.remove();
                this.unmount(prevBlockId);
                blockConfig.childBlocks.delete(prevBlockId);
            }
        }
        if (batchObj.type === "set") {
            const newList = blockConfig.data.eval();
            let parent = blockConfig.startRef.parentNode;
            if (!parent)
                throw new RectorError("No parent detected of 'For' loop, pass 'wrap' property to 'For' component.");
            const oldList = batchObj.value;
            const oldNodes = this.getNodesInRange(blockConfig, 0, oldList.length);
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
            this.scopeStack.push(this.getComponent(cmpId), this.getComponent(blockConfig.cmpId));
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
                        const blockId = this.setUpBlock();
                        blockConfig.childBlocks.add(blockId);
                        crrNode = blockConfig.renderElement(item, j);
                        this.blockStack.pop();
                        crrNode.blockId = blockId;
                        const prevBlockId = existing.node?.blockId;
                        existing.node.replaceWith(crrNode);
                        this.unmount(prevBlockId);
                        blockConfig.childBlocks.delete(prevBlockId);
                    }
                    const refNode = this.getNodeAt(blockConfig, j);
                    if (crrNode !== refNode) {
                        parent.insertBefore(crrNode, refNode);
                    }
                    oldMap.delete(key);
                }
                else {
                    const blockId = this.setUpBlock();
                    blockConfig.childBlocks.add(blockId);
                    const node = blockConfig.renderElement(item, j);
                    this.blockStack.pop();
                    node.blockId = blockId;
                    const refNode = this.getNodeAt(blockConfig, j);
                    parent.insertBefore(node, refNode);
                }
            });
            this.scopeStack.pop();
            this.scopeStack.pop();
            oldMap.forEach(({ node }) => {
                if (node) {
                    const blockId = node.blockId;
                    parent.removeChild(node);
                    this.unmount(blockId);
                    blockConfig.childBlocks.delete(blockId);
                }
            });
        }
    }
    patchState(batchConfig, cmpId) {
        const stateUsageArr = this.stateUsageMap.get(batchConfig.state);
        if (!stateUsageArr)
            return;
        for (let stateUsageId of stateUsageArr) {
            const stateUsage = this.stateUsageRefs[stateUsageId];
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
                this.updateIfBlock(stateUsage.config);
            }
            if (stateUsage.type === "loop") {
                this.updateLoopBlock(stateUsage.config, batchConfig, cmpId);
            }
        }
    }
    checkStateValid(component, stateName) {
        if (reservedJSKeys.has(stateName)) {
            throw new RectorError(`Invalid token: '${stateName}', Can not use global objects or JS keywords in inline expression`);
        }
        if (!Object.hasOwn(component.states ?? {}, stateName)) {
            const scopeErrorMes = component.id === GLOBAL
                ? `Global State '${stateName}' is not declared in the App.`
                : `State '${stateName}' is not declared in '${component.name}' component.`;
            throw new RectorError(scopeErrorMes);
        }
    }
    // private dispatchDelegatedEvent(event: any) {
    //   let node = event.target;
    //   while (node && node !== this.delegatedRoot) {
    //     const handlers = node.__handlers;
    //     if (handlers && handlers[event.type]) {
    //       handlers[event.type](event);
    //       if (event.cancelBubble) return;
    //     }
    //     node = node.parentNode;
    //   }
    // }
    dispatchDelegatedEvent(nativeEvent) {
        const syntheticEvent = new SyntheticEvent(nativeEvent);
        let node = nativeEvent.target;
        while (node && node !== this.delegatedRoot) {
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
    }
    // private ensureDelegatedListener(type: string) {
    //   if (this.delegatedEvents.has(type)) return;
    //   this.delegatedEvents.add(type);
    //   this.delegatedRoot.addEventListener(type, this.dispatchDelegatedEvent);
    // }
    ensureDelegatedListener(type) {
        if (this.delegatedEvents.has(type))
            return;
        this.delegatedEvents.add(type);
        this.delegatedRoot.addEventListener(type, this.dispatchDelegatedEvent, true);
    }
    createElement(tag, attributes) {
        const component = this.activeComponent();
        let elem = document.createElement(tag);
        const children = attributes.children;
        Object.entries(attributes).forEach(([key, value]) => {
            let val = value;
            key = key.trim();
            if (key !== "children") {
                if (key.startsWith("on") && typeof val === "function") {
                    const type = key.slice(2).toLowerCase();
                    if (this.DELEGATED_TYPES.has(type)) {
                        // Delegated path
                        if (!elem.__handlers)
                            elem.__handlers = {};
                        elem.__handlers[type] = val;
                        this.ensureDelegatedListener(type);
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
                            const activeBlock = this.activeBlock();
                            activeBlock.stateUsageCleanUps ?? (activeBlock.stateUsageCleanUps = []);
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
                                    this.addStateUsageRef(state, {
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
    useStateOf(componentName) {
        const component = this.getExternalStateComponent(componentName);
        return new Proxy(component.stateObjects, {
            get(target, p) {
                if (typeof p !== "string")
                    return undefined;
                if (!Object.hasOwn(target, p)) {
                    throw new RectorError(`[Rector.Error]: State '${p}' doesn't exist on '${component.name}' component. declare one using defineState(initialVal,'${p}')`);
                }
                return target[p];
            },
        });
    }
    useListOf(componentName) {
        const component = this.getExternalStateComponent(componentName);
        return new Proxy(component.listObjects, {
            get(target, p) {
                if (typeof p !== "string")
                    return undefined;
                if (!Object.hasOwn(target, p)) {
                    throw new RectorError(`[Rector.Error]: State '${p}' doesn't exist on '${component.name}' component. declare one using defineState(initialVal,'${p}')`);
                }
                return target[p];
            },
        });
    }
    useParentState(stateName) {
        const component = this.getExternalStateComponent();
        const state = component.stateObjects[stateName];
        if (!state) {
            throw new RectorError(`[Rector.Error]: State '${stateName}' doesn't exist on '${component.name}' component. declare one using defineState(initialVal,'${stateName}')`);
        }
        return state;
    }
    getExternalStateComponent(componentName) {
        const activeComponent = this.activeComponent();
        if (!componentName) {
            const parentComp = this.scopeStack[this.scopeStack.length - 2];
            if (!parentComp || parentComp.id === GLOBAL) {
                throw new RectorError(`[Rector.Component]: Parent component of '${activeComponent.name}' doesn't exist.`);
            }
            return parentComp;
        }
        if (this.componentNames.has(componentName)) {
            if (componentName === activeComponent.name) {
                throw new RectorError(`Invalid self-reference: Can't use 'useStateOf' for component itself.`);
            }
            let parentCmp = this.getComponent(activeComponent.parentId);
            while (parentCmp) {
                if (parentCmp.id === GLOBAL) {
                    throw new RectorError(`Can't access child component '${componentName}' in '${activeComponent.name}' component.`);
                }
                if (parentCmp.name === componentName) {
                    break;
                }
                parentCmp = this.getComponent(parentCmp.parentId);
            }
            return parentCmp;
        }
        else {
            throw new RectorError(`Invalid reference at '${activeComponent.name}' component: Component named '${componentName}' doesn't exist or It is not parent of this component.`);
        }
    }
    // private evaluateJSXExpression(
    //   jsxExp: JSXExpressionObj,
    //   component: Component
    // ) {
    //   const { states, context } = this.transformExprStates(
    //     jsxExp?.states,
    //     component
    //   );
    //   const localContext = {
    //     ...jsxExp.context,
    //     ...(component.exeContext ?? {}),
    //   };
    //   const { value } = parseAndEvaluateAST(
    //     jsxExp.expTree,
    //     localContext,
    //     context.dynamic,
    //     context.propDynamic
    //   );
    //   component.exeContext = localContext;
    //   return { value, states };
    // }
    addStateUsageRef(state, config) {
        let prevUsg = this.stateUsageMap.get(state);
        if (!prevUsg) {
            prevUsg = new Set();
            this.stateUsageMap.set(state, prevUsg);
        }
        const refId = this.stateRefId++;
        this.stateUsageRefs[refId] = config;
        prevUsg.add(refId);
        const activeBlock = this.activeBlock();
        if (!activeBlock)
            return;
        activeBlock.stateUsageCleanUps ?? (activeBlock.stateUsageCleanUps = []);
        activeBlock.stateUsageCleanUps.push(() => {
            prevUsg.delete(refId);
            if (prevUsg.size === 0) {
                this.stateUsageMap.delete(state);
            }
        });
        activeBlock.stateUsageRefIds ?? (activeBlock.stateUsageRefIds = []);
        activeBlock.stateUsageRefIds.push(refId);
    }
    addMicrotask(fn) {
        this.microTaskQueue.push(fn);
    }
    resolveChild(child, container, index, isPortalContainer = false) {
        const addToDOM = (chd) => {
            if (isPortalContainer) {
                this.addMicrotask(() => container.append(chd));
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
            const conditionElem = this.setUpCondition(child);
            addToDOM(conditionElem);
            return;
        }
        if (isJSXExpressionObj(child)) {
            if (container instanceof DocumentFragment) {
                throw new RectorError(`[Rector.Fragment]: Can't use dynamic values directly inside fragment. Wrap it in an HTML element.`);
            }
            const component = this.activeComponent();
            const cmpId = component.id;
            const value = child.eval();
            if (Array.isArray(value)) {
                if (isPortalContainer) {
                    this.addMicrotask(() => container.append(...value));
                }
                else {
                    container.append(...value);
                }
            }
            else {
                addToDOM(value);
            }
            for (let state of child?.states) {
                this.addStateUsageRef(state, {
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
        if (typeof child === "function" || isPlainObject(child)) {
            throw new RectorError("Functions and Objects are not allowed as children.");
        }
        if (child) {
            if (Array.isArray(child)) {
                child = this.fragment({ children: child });
            }
            addToDOM(child);
            return;
        }
    }
    parseChildren(elem, children) {
        for (let [index, child] of children.entries()) {
            this.resolveChild(child, elem, index);
            // if (typeof child === "number" || typeof child === "string") {
            //   elem.append(document.createTextNode(child));
            // } else if (isJSXConditionObj(child)) {
            //   const conditionElem = this.setUpCondition(child);
            //   elem.append(conditionElem);
            // } else if (isJSXExpressionObj(child)) {
            //   const value = child.eval();
            //   if (Array.isArray(value)) {
            //     elem.append(...value);
            //   } else {
            //     elem.append(value);
            //   }
            //   for (let state of child?.states) {
            //     this.addStateUsageRef(state, {
            //       type: "child",
            //       config: {
            //         element: elem,
            //         pos: idx,
            //         eval: child.eval,
            //         cmpId: SCOPE,
            //       },
            //     });
            //   }
            // } else if (typeof child === "function" || isPlainObject(child)) {
            //   throw new RectorError(
            //     "Functions and Objects are not allowed as children.",
            //   );
            // } else if (child) {
            //   if (Array.isArray(child)) {
            //     child = this.fragment({ children: child });
            //   }
            //   elem.append(child);
            // }
        }
        return elem;
    }
    print(showValues) {
        if (showValues) {
            console.log("\nEffect Queue", this.effectQueue, "\nEffect Funs: ", this.effectFuns, "\nComponentDATA: ", this.componentIdMap, "\nBlocks: ", this.blocksMap, "\nStateUsage: ", this.stateUsageRefs, "\nNavigation: ", this.navigation, "\nComponent Names:", this.componentNames, "\nState effect WeakMap:", this.stateEffectMap, "\nState Usage WeakMap:", this.stateUsageMap);
        }
        console.log("\nConditional Blocks: ", 
        // estimateObjectSize(this.conditionalBlocks),
        "\nLoop Blocks: ", estimateObjectSize(this.stateUsageRefs), "\nBlocks: ", estimateObjectSize(this.blocksMap), "\nEffects: ", estimateObjectSize(this.effectFuns), "\nComponents: ", estimateObjectSize(this.componentIdMap));
    }
}
export const Rector = new RectorJS();
export const defineState = Rector.defineState.bind(Rector);
export const defineList = Rector.defineList.bind(Rector);
// export const Navigation = {
//   createLayoutRoutes: Rector.createLayoutRoutes,
//   defineRoutes: Rector.defineRoutes,
//   setProtectedRoutes: Rector.setProtectedRoutes,
//   navigate: Rector.navigate,
// };
// Navigation
// export const createLayoutRoutes: typeof Navigation.createLayoutRoutes =
//   Navigation.createLayoutRoutes.bind(Navigation);
export const getQueryParams = Navigation.getQueryParams.bind(Navigation);
export const getRouterParams = Navigation.getRouterParams.bind(Navigation);
export const getHash = Navigation.getHash.bind(Navigation);
export const defineRoutes = Navigation.defineRoutes.bind(Navigation);
//Rector
export const setEffect = Rector.setEffect.bind(Rector);
export const useStateOf = Rector.useStateOf.bind(Rector);
export const useListOf = Rector.useListOf.bind(Rector);
export const useParentState = Rector.useParentState.bind(Rector);
export const useGlobal = Rector.useGlobal.bind(Rector);
export const createGlobalStore = Rector.createGlobalStore.bind(Rector);
// export const RectorMap: typeof Rector.map = Rector.map.bind(Rector);
function For({ each, keyExtractor, children, }) {
    return Rector.For.call(Rector, each, children, keyExtractor);
}
For.isRectorComponent = true;
function Portal({ children, target }) {
    return Rector.createPortal.call(Rector, children, target);
}
Portal.isRectorComponent = true;
export { For, Portal };
export const navigate = Rector.navigate.bind(Rector);
export const useElementRef = Rector.useElementRef.bind(Rector);
export const renderApp = Rector.renderApp.bind(Rector);
export const Dom = Rector.elements;

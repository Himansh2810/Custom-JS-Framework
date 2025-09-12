import {
  estimateObjectSize,
  isComponentFunction,
  isEqual,
  isPlainObject,
  removeValueFromObject,
  reservedJSKeys,
  selfClosingTags,
  styleObjectToCss,
} from "./utils.js";
import {
  RectorElements,
  StateUsage,
  Attrs,
  RectorElementRef,
  StateIfBlocks,
  StateLoopBlocks,
  StateIfBlockConfig,
  StateLoopBlockConfig,
  IfBlockConfig,
  LoopBlockConfig,
  EffectConfig,
} from "./types.js";

declare global {
  interface HTMLElement {
    range?: Range;
    blockId?: string;
  }

  interface Node {
    range?: Range;
    blockId?: string;
  }

  interface ChildNode {
    range?: Range;
    blockId?: string;
  }

  interface DocumentFragment {
    range?: Range;
    blockId?: string;
  }
}

const GLOBAL = "global";

class RectorError extends Error {
  constructor(message: string) {
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
  public routerParams: { [key: string]: string } = {};
  private routes: { [route: string]: () => HTMLElement } = {};
  private routeRegexCache: {
    [route: string]: {
      regex: RegExp;
      paramNames: string[];
    };
  } = {};
  private routeAccess: {
    protectedRoutes: string[];
    middleware: (path: string) => boolean | Promise<boolean>;
  };

  constructor() {}

  private buildRouteRegex(route: string) {
    const paramNames: string[] = [];
    const regexPath = route.replace(/:([^/]+)/g, (_, key) => {
      paramNames.push(key);
      return "([^/]+)";
    });
    this.routeRegexCache[route] = {
      regex: new RegExp(`^${regexPath}$`),
      paramNames,
    };
  }

  public defineRoutes(routes: { [path: string]: any }) {
    Object.entries(routes).forEach(([path, routeComp]) => {
      if (!path.startsWith("/")) {
        throw new RectorError("Route path must start with '/'");
      }

      if (typeof routeComp === "function") {
        this.routes[path] = routeComp;
      } else {
        Object.assign(this.routes, routeComp);
      }

      this.buildRouteRegex(path);
    });
  }

  public setProtectedRoutes(
    routes: string[],
    middleware: (path: string) => boolean | Promise<boolean>
  ) {
    this.routeAccess = {
      protectedRoutes: routes,
      middleware,
    };
  }

  public createLayoutRoutes(
    childRoutes: { [path: string]: any },
    layoutComponent: (RouteComponent: () => HTMLElement) => HTMLElement
  ) {
    let routes: { [path: string]: () => HTMLElement } = {};
    const buildLayout = (cr) => {
      Object.entries(cr).forEach(([path, rl]) => {
        let routeEl = rl as any;
        if (typeof routeEl === "function") {
          routes[path] = () => layoutComponent(routeEl);
          this.buildRouteRegex(path);
        } else {
          buildLayout(routeEl);
        }
      });
    };
    buildLayout(childRoutes);
    return routes;
  }

  private matchRoute(pathname: string) {
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

  private async runMiddleware(path: string) {
    if (!this.routeAccess) {
      return true;
    }

    const isPathProtected = () => {
      for (const route of this.routeAccess?.protectedRoutes ?? []) {
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
        return await this.routeAccess.middleware(path);
      } catch (error) {
        return false;
      }
    }

    return true;
  }

  public async resolveRoute() {
    const initPath = window.location.pathname;
    const app = this.matchRoute(initPath);
    if (!app) {
      const fallbackRoute = this.routes["/*"];
      if (fallbackRoute) {
        return {
          fallback: true,
          render: fallbackRoute,
        };
      } else {
        throw new RectorError(
          `INVALID ROUTE: '${initPath}' route is not initialized.\nProvide fallback route '/*' to handle any undeclared route.`
        );
      }
    }

    const isRouteAccessible = await this.runMiddleware(initPath);

    if (!isRouteAccessible) return;

    return {
      fallback: false,
      render: app,
    };
  }
}

class Component {
  public id: string;
  public name: string;
  public parentId: string;
  public state: { [stateName: string]: any } = {};
  public stateUsage: StateUsage = {};
  public loops: { [stateName: string]: string[] } = {};
  public conditions: { [stateName: string]: string[] } = {};
  public effects: { [stateName: string]: number[] } = {};
  public unmounts: { cleanUp?: [number, string[]]; fn?: () => void }[] = [];
  public refs: { [refName: string]: any } = {};
  public exprPrevValue: { [expr: string]: boolean } = {};

  constructor(name: string, id: string, parentId?: string) {
    this.name = name;
    this.id = id;
    this.parentId = parentId;
  }
}

class Block {
  public stateUsage = new Set<string>();
  public componentRendered: string[] = [];
  public loopIds: string[] = [];
  public conditionIds: string[] = [];
  constructor() {}
}

class RectorJS {
  // Private Properties //
  private navigation: RectorNavigation;
  private effectFuns: EffectConfig = {};
  private effectId = 0;
  private cmpId = 0;
  private scopeStack: Component[] = [];

  private componentIdMap: { [id: string]: Component } = {};
  private componentNames = new Set<string>();
  private getComponent(id: string) {
    return this.componentIdMap[id];
  }

  private blockId = 0;
  private conditionalBlocks: { [id: string]: IfBlockConfig } = {};
  private loopBlocks: { [id: string]: LoopBlockConfig } = {};
  private blocksMap: { [id: string]: Block } = {};
  private blockStack: Block[] = [];

  private microTaskQueue = [];
  private rectorKeywords = new Set([
    "bound condition",
    "bound map",
    "Fragment",
  ]);
  private errorBoundary: (error: Error) => HTMLElement;

  // Public Properties //

  public elements: RectorElements;
  public globalState: { [stateName: string]: any };

  // constructor setup //

  constructor() {
    this.navigation = new RectorNavigation();

    this.elements = new Proxy({} as RectorElements, {
      get: (_, tag: keyof HTMLElementTagNameMap) => {
        return (attributes: Attrs<typeof tag>): HTMLElement =>
          this.createElement(tag, attributes);
      },
    });

    const globalComponent = new Component("$", GLOBAL, null);
    this.componentIdMap[GLOBAL] = globalComponent;
    this.globalState = this.stateUsage(globalComponent);
  }

  // -----Public methods----- //

  public jsx(fn, props) {
    if (typeof fn === "function") {
      const componentName = isComponentFunction(fn, (e) => {
        throw new RectorError(e);
      });

      if (!componentName || this.rectorKeywords.has(componentName)) {
        return fn(props);
      }

      this.componentNames.add(componentName);

      const cmpId = `${componentName}-${this.cmpId++}`;
      this.activeBlock()?.componentRendered.push(cmpId);
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

  public fragment({ children }) {
    const container = document.createDocumentFragment();
    if (Array.isArray(children)) {
      children.forEach((child) => container.appendChild(child));
    } else if (children) {
      container.appendChild(children);
    }
    return container;
  }

  public getQueryParams() {
    const urlSearchParams = new URLSearchParams(window.location.search);
    const params = Object.fromEntries(urlSearchParams.entries());
    return params;
  }

  public getHash() {
    return window.location.hash.slice(1);
  }

  public setErrorBoundary(component: (error: Error) => HTMLElement) {
    this.errorBoundary = component;
  }

  public defineRoutes(routes: { [path: string]: any }) {
    window.addEventListener("popstate", () => {
      const pathName = window.location.pathname;
      this.navigate(pathName);
    });
    this.navigation.defineRoutes(routes);
  }

  public setProtectedRoutes(
    routes: string[],
    middleware: (path: string) => boolean | Promise<boolean>
  ) {
    this.navigation.setProtectedRoutes(routes, middleware);
  }

  public createLayoutRoutes(
    childRoutes: { [path: string]: any },
    layoutComponent: (RouteComponent: () => HTMLElement) => HTMLElement
  ) {
    return this.navigation.createLayoutRoutes(childRoutes, layoutComponent);
  }

  public navigate(path: string) {
    if (window.location.pathname !== path) {
      history.pushState({}, "", path);
      this.routeCleanUp();
      this.renderApp();
    }
  }

  public getComponentState() {
    return this.stateUsage(this.activeComponent());
  }

  public getRouterParams() {
    return this.navigation.routerParams;
  }

  public async renderApp() {
    const data = await this.navigation.resolveRoute();
    console.log("data: ", data);

    if (!data) return;

    const body = document.querySelector("body");
    body.innerHTML = "";

    try {
      this.scopeStack.push(this.getComponent(GLOBAL));
      body.append(this.jsx(data.render, {}));
      this.scopeStack.pop();
      this.runMicrotasks();
      this.runEffectQueue();
      this.navigation.routerParams = {};
    } catch (error) {
      body.innerHTML = "";
      if (this.errorBoundary) {
        console.error(error);
        try {
          body.append(this.jsx(this.errorBoundary, error));
        } catch (er2) {
          throw er2;
        }
      } else {
        throw error;
      }
    }
  }

  private runMicrotasks() {
    this.microTaskQueue.forEach((task) => task());
    this.microTaskQueue = [];
  }

  private activeBlock() {
    const L = this.blockStack.length;
    if (L === 0) {
      return null;
    }
    return this.blockStack[L - 1];
  }

  public initGlobalState<V>(stateName: string, value: V) {
    return this.configureState(stateName, value, GLOBAL);
  }

  public initState<V>(stateName: string, value: V) {
    const cmpId = this.activeComponent().id;
    if (cmpId == GLOBAL) {
      throw new RectorError(
        "You can't initial state outside of a component, try 'initGlobalState' instead."
      );
    }

    return this.configureState(stateName, value, cmpId);
  }

  private effectQueue: number[] = [];

  public setEffect(fn: () => (() => void) | void, depends?: string[]) {
    if (typeof fn !== "function") {
      throw new RectorError("Effect must be a function");
    }

    const component = this.activeComponent();

    const efId = this.effectId++;

    const externalDeps: string[] = [];

    if (depends && depends.length > 0) {
      depends.forEach((stateStr) => {
        if (typeof stateStr !== "string") {
          throw new RectorError(
            "[setEffect] Dependencies must be an array of strings"
          );
        }

        let crrComponent: Component;
        let stateName: string;
        const { stateKeys } = this.mapStateKeys(stateStr, component);
        const scopeState = stateKeys[0].split(":");
        if (scopeState.length > 1) {
          crrComponent = this.getComponent(scopeState[0]);
          stateName = scopeState[1];
          externalDeps.push(`${scopeState[0]}:${scopeState[1]}`);
        } else {
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

  private setUpBlock(id?: string) {
    let blockId = id;
    if (!id) {
      blockId = `bl:${this.blockId++}`;
    }
    const block = new Block();
    this.blocksMap[blockId] = block;
    this.blockStack.push(block);
    return blockId;
  }

  public condition(config: {
    expression: string;
    onTrueRender?: () => HTMLElement | ChildNode;
    onFalseRender?: () => HTMLElement | ChildNode;
  }) {
    try {
      const { expression, onTrueRender, onFalseRender } = config;
      const ifBlockId = `if:${this.blockId++}`;
      this.activeBlock()?.conditionIds.push(ifBlockId);
      const cmp = this.activeComponent();
      const SCOPE = cmp.id;
      this.validateExpression(expression);
      let { stateKeys, scopeState } = this.mapStateKeys(expression, cmp);
      const fn = new Function("State", `with(State) {return ${expression}}`);
      const isTrue = fn({ ...cmp.state, ...scopeState });

      const checkCompStructure = (Fn: () => HTMLElement | ChildNode) => {
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

      let crrEl: DocumentFragment | ChildNode = isTrue
        ? trueEl?.() ?? null
        : falseEl?.() ?? null;

      this.blockStack.pop();

      let range = crrEl.range;

      if (!range) {
        range = new Range();
      }

      crrEl.range = null;

      let { nextPlaceholder, element } = this.configureElementRange(
        crrEl,
        range
      );

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
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new RectorError(
          `Invalid inline JS expression syntax: ${error?.message}`
        );
      } else {
        throw new RectorError(error?.message);
      }
    }
  }

  public map(config: {
    stateName: string;
    render: (item: any, index: number) => HTMLElement;
    keyExtractor?: (item: any, index: number) => string | number;
  }) {
    const { stateName: sn, render, keyExtractor } = config;
    const loopBlockId = `loop:${this.blockId++}`;
    this.activeBlock()?.loopIds.push(loopBlockId);

    const component = this.activeComponent();
    const SCOPE = component.id;
    let { stateKeys } = this.mapStateKeys(sn, component);
    let stateName = stateKeys[0];
    let crrComponent = component;
    const splittedState = stateName.split(":");

    if (splittedState.length > 1) {
      const [compScope, compStateName] = splittedState;
      crrComponent = this.getComponent(compScope);
      stateName = compStateName;
    }

    const items: any[] = crrComponent.state[stateName];

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
        throw new RectorError(
          "[RectorMap]: Render item can not be a Fragment."
        );
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
      this.loopBlocks[loopBlockId] = {
        ...this.loopBlocks[loopBlockId],
        parentNode,
        positionIndex: pos,
      };
      commentRef.remove();
    });

    return fragment;
  }

  public useElementRef<T extends keyof HTMLElementTagNameMap>(
    elementTagName?: T
  ) {
    const component = this.activeComponent();
    return new Proxy({} as RectorElementRef<T>, {
      get: (_, refName: string) => {
        const refKey = `${elementTagName}:${refName}`;
        if (!Object.hasOwn(component.refs ?? {}, refKey)) {
          throw new RectorError(
            `Ref '${refName}' doesn't exist on any '${elementTagName}' element in '${component.name}' component.`
          );
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

  private activeComponent() {
    const L = this.scopeStack.length;
    return this.scopeStack[L - 1];
  }

  private routeCleanUp() {
    this.componentIdMap = {
      [GLOBAL]: this.getComponent(GLOBAL),
    };
    this.loopBlocks = {};
    this.conditionalBlocks = {};
    this.blocksMap = {};
    this.effectFuns = {};
  }

  private stateUsage(component: Component) {
    return new Proxy(component.state, {
      get: (_, stateName: string) => {
        this.checkStateValid(component, stateName);
        return component.state?.[stateName];
      },
    });
  }

  private configureState<V>(stateName: string, value: V, scope: string) {
    const component = this.getComponent(scope);

    if (typeof stateName !== "string") {
      throw new RectorError("State name must be of string type.");
    }

    stateName = stateName.trim();

    if (!stateName) {
      throw new RectorError("State name should be a valid string");
    }

    if (stateName === "$") {
      throw new RectorError(
        `Restricted state name '${stateName}': State name '$' is reserved in RectorJS for Global state context, use another state name.`
      );
    }

    if (this.componentNames.has(stateName)) {
      if (stateName === component.name) {
        throw new RectorError(
          `Restricted state name: State "${stateName}" conflicts with component name "${stateName}".Please choose a different state name.`
        );
      }
      throw new RectorError(
        `Restricted state name: State '${stateName}' conflicts with parent/ancestor component name "${stateName}".State names cannot be the same as any parent/ancestor component name.`
      );
    }

    if (!/^[$A-Z_a-z][$\w]*$/.test(stateName)) {
      throw new RectorError(
        `Invalid state name '${stateName}': State names must start with a letter, $, or _ and only contain alphanumeric characters, $, or _.`
      );
    }

    if (reservedJSKeys.has(stateName)) {
      throw new RectorError(
        `Invalid state name '${stateName}': JavaScript keywords are not allowed as State name.`
      );
    }

    if (Object.hasOwn(component.state, stateName)) {
      const isGlobalCmp = scope === GLOBAL;
      throw new RectorError(
        `${
          isGlobalCmp ? "Global" : ""
        } State '${stateName}' is already declared in this ${
          isGlobalCmp ? "App" : `'${component.name}' Component`
        }.`
      );
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

    return (val: V | ((prev: V) => V)) => {
      const oldValue: V = component.state[stateName];

      const newVal: V =
        typeof val === "function" ? (val as (prev: V) => V)(oldValue) : val;

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

  private async runEffectQueue() {
    this.effectQueue.forEach((efId) => {
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
          obj = {
            ...obj,
            cleanUp: [efId, extDeps],
          };
        }

        if (Object.keys(obj).length > 0) {
          this.getComponent(scope).unmounts?.push(obj);
        }
      }

      if (!depends) {
        delete this.effectFuns[efId];
      }
    });

    this.effectQueue = [];
  }

  private async runEffects(component: Component, stateName: string) {
    const effects = component.effects[stateName];
    if (effects) {
      effects?.forEach((efId) => {
        this.effectFuns[efId]?.fn();
      });
    }
  }

  private configureElementRange(
    targetEl: DocumentFragment | HTMLElement | ChildNode,
    range: Range
  ) {
    let element: DocumentFragment | HTMLElement | ChildNode;

    if (typeof targetEl === "string" || typeof targetEl === "number") {
      element = document.createTextNode(
        (targetEl as string | number).toString()
      );
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
    } else {
      first = last = element;
    }

    const nextPlaceholder = () => {
      if (!first?.parentNode || !last?.parentNode) return null; // not attached (yet) or already removed
      range.setStartBefore(first);
      range.setEndAfter(last);
      return range;
    };

    return {
      element,
      nextPlaceholder,
    };
  }

  private removeBlockRef(
    scopeStateArr: string[],
    cmpId: string,
    target: string,
    blockType: "loops" | "conditions"
  ) {
    let cmp: Component;
    let stateName: string;

    if (scopeStateArr?.length === 2) {
      const [scope, name] = scopeStateArr;
      cmp = this.getComponent(scope);
      stateName = name;
    } else {
      cmp = this.getComponent(cmpId);
      stateName = scopeStateArr[0];
    }

    if (cmp && stateName) {
      const filteredIds = cmp[blockType][stateName]?.filter(
        (t) => t !== target
      );
      if (!filteredIds?.length) {
        delete cmp[blockType][stateName];
      } else {
        cmp[blockType][stateName] = filteredIds;
      }
    }
  }

  private effectCleanUp(cleanUpArr: [number, string[]]) {
    const [efId, extDeps] = cleanUpArr;
    extDeps?.forEach((ed) => {
      const [scope, stateName] = ed.split(":");
      const cmp = this.getComponent(scope);
      if (cmp && stateName) {
        const filtered = cmp.effects[stateName].filter((e) => e !== efId);
        if (!filtered.length) {
          delete cmp.effects[stateName];
        } else {
          cmp.effects[stateName] = filtered;
        }
      }
    });

    delete this.effectFuns[efId];
  }

  private async unmount(blockId: string) {
    const block = this.blocksMap[blockId];

    if (!block) return;

    (block?.componentRendered ?? []).forEach((cmpId) => {
      const cmpUnmounts = this.getComponent(cmpId)?.unmounts;
      cmpUnmounts?.forEach((config) => {
        if (config?.fn) {
          config?.fn();
        }
        if (config?.cleanUp) {
          this.effectCleanUp(config?.cleanUp);
        }
      });
      delete this.componentIdMap[cmpId];
    });

    [...block?.stateUsage].forEach((usage) => {
      const [scope, stateName] = usage.split(":");
      const cmp = this.getComponent(scope);

      const usageArr = cmp?.stateUsage?.[stateName];
      if (usageArr) {
        cmp.stateUsage[stateName] = usageArr.filter(
          (s) => s.element.isConnected
        );
      }
    });

    (block.loopIds ?? []).forEach((loopId) => {
      const loop = this.loopBlocks[loopId];
      const childBlocks = [...(loop?.childBlocks ?? [])];
      childBlocks.forEach((cBlockId) => this.unmount(cBlockId));

      this.removeBlockRef(loop.stateData, loop.cmpId, loopId, "loops");
      delete this.loopBlocks[loopId];
    });

    (block.conditionIds ?? []).forEach((conditionId) => {
      const condition = this.conditionalBlocks[conditionId];
      this.unmount(condition?.childBlock);

      condition?.stateData?.forEach((data) => {
        this.removeBlockRef(
          data.split(":"),
          condition.cmpId,
          conditionId,
          "conditions"
        );
      });
      delete this.conditionalBlocks[conditionId];
    });

    delete this.blocksMap[blockId];
  }

  private updateIfBlock(blockId: string) {
    const blockConfig = this.conditionalBlocks[blockId];
    const scope = blockConfig.cmpId;
    const cmp = this.getComponent(scope);
    let { scopeState } = this.mapStateKeys(blockConfig.exp, cmp);

    try {
      const fn = new Function(
        "State",
        `with(State) {return ${blockConfig.exp}}`
      );
      const isTrue = fn({ ...cmp.state, ...scopeState });
      const prevVal = cmp.exprPrevValue[blockConfig.exp];
      if (prevVal !== isTrue) {
        const El = (con: boolean) =>
          con ? blockConfig.trueElement : blockConfig.falseElement;
        const range = blockConfig.placeholder();
        range.deleteContents();

        this.unmount(blockConfig.childBlock);

        this.scopeStack.push(this.getComponent(scope));

        this.setUpBlock(blockConfig.childBlock);

        const nextEl = El(isTrue)?.() ?? null;

        this.blockStack.pop();

        if (nextEl && nextEl?.range) {
          nextEl.range = null;
        }

        let { nextPlaceholder, element } = this.configureElementRange(
          nextEl,
          range
        );
        this.scopeStack.pop();
        range.insertNode(element);
        blockConfig.placeholder = nextPlaceholder;
      }

      return {
        exp: blockConfig.exp,
        val: isTrue,
      };
    } catch (error) {
      throw new RectorError(error);
    }
  }

  private updateLoopBlock(
    loopBlockId: string,
    stateName: string,
    oldValue: any,
    scope: string
  ) {
    const cmp = this.getComponent(scope);
    const blockConfig = this.loopBlocks[loopBlockId];
    const newList: any[] = cmp.state[stateName];
    const oldList = [...oldValue];
    let firstChild = blockConfig.firstNode;
    let parent = firstChild?.parentNode || blockConfig.parentNode;

    if (!parent)
      throw new RectorError(
        "No parent detected of 'map' loop, try to wrap 'RectorMap' in any parent element."
      );

    const children = Array.from(parent.childNodes);
    const startIndex = firstChild
      ? Math.max(0, children.indexOf(firstChild))
      : blockConfig.positionIndex;

    const oldNodes = children.slice(startIndex, startIndex + oldList.length);

    const keyExtractor = blockConfig.keyExtractor || ((_, i) => i);

    const oldMap: Map<string, { node: ChildNode; index: number }> = new Map();

    oldList.forEach((item, i) => {
      const key = keyExtractor(item, i);

      if (
        key === null ||
        key === undefined ||
        (typeof key !== "string" && typeof key !== "number")
      ) {
        throw new RectorError(
          `Invalid keyExtractor return value at index ${i}: ` +
            `${JSON.stringify(key)}. ` +
            `Expected string or number.`
        );
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

    this.scopeStack.push(
      this.getComponent(scope),
      this.getComponent(blockConfig.cmpId)
    );

    (newList ?? []).forEach((item, j) => {
      const key = String(keyExtractor(item, j));
      if (key === "undefined" || key === "null" || !key) {
        throw new RectorError(
          `[keyExtractor]: Received null/undefined key. Your items may be missing the expected "id" property or it is not valid.`
        );
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
          this.unmount(existing.node?.blockId);
          blockConfig.childBlocks.delete(existing.node?.blockId);
        }

        if (existing.index !== v) {
          parent.insertBefore(existing.node, parent.childNodes[v] || null);
        }

        if (j === 0) {
          newFirstChild = crrNode;
        }
        oldMap.delete(key);
      } else {
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
        this.unmount(node?.blockId);
        blockConfig.childBlocks.delete(node?.blockId);
      }
    });

    blockConfig.parentNode = parent;
    blockConfig.firstNode = newFirstChild;
  }

  private reRender(stateName: string, oldValue: any, scope: string) {
    const component = this.getComponent(scope);

    const stateFullElements = component.stateUsage?.[stateName];

    if (stateFullElements) {
      for (let sfe of stateFullElements) {
        const { parsedStr: updatedStateExpression } = this.parseStateVars(
          sfe.rawString,
          scope === sfe.cmpId ? component : this.getComponent(sfe.cmpId),
          false
        );
        sfe.element.childNodes[sfe.pos].nodeValue = updatedStateExpression;
      }
    }

    const ifBlocks = component.conditions?.[stateName];

    if (ifBlocks) {
      const expVals = new Map();

      for (const blockId of ifBlocks) {
        const exec = this.updateIfBlock(blockId);
        if (exec && !expVals.has(exec.exp)) {
          expVals.set(exec.exp, {
            ...exec,
            scope: this.conditionalBlocks[blockId].cmpId,
          });
        }
      }

      for (const { exp, val, scope } of expVals.values()) {
        this.getComponent(scope).exprPrevValue[exp] = val;
      }
    }

    const loopBlocks = component.loops?.[stateName];

    if (loopBlocks) {
      for (let blockId of loopBlocks) {
        this.updateLoopBlock(blockId, stateName, oldValue, scope);
      }
    }
  }

  private checkStateValid(component: Component, stateName: string) {
    if (reservedJSKeys.has(stateName)) {
      throw new RectorError(
        `Invalid token: '${stateName}', Can not use global objects or JS keywords in inline expression`
      );
    }

    if (!Object.hasOwn(component.state ?? {}, stateName)) {
      const scopeErrorMes =
        component.id === GLOBAL
          ? `Global State '${stateName}' is not declared in the App.`
          : `State '${stateName}' is not declared in '${component.name}' component.`;

      throw new RectorError(scopeErrorMes);
    }
  }

  private validateExpression(expr: string) {
    const dynamicExpr = expr.replace(/(['"`])(?:\\\1|.)*?\1/g, ""); // removes content inside '', "", or ``
    const assignmentPattern = /[^=!<>]=[^=]/;

    if (assignmentPattern.test(dynamicExpr)) {
      throw new RectorError(
        `Invalid condition: assignment operation (=) is not allowed as expression.`
      );
    }
  }

  private mapStateKeys(expression: string, activeComponent: Component) {
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
            throw new Error(
              `Invalid self-reference: Use "${stateName}" instead of "${firstKey}.${stateName}" inside component "${firstKey}".`
            );
          }
          let parentCmp = this.getComponent(activeComponent.parentId);
          while (parentCmp) {
            if (parentCmp.id === GLOBAL) {
              throw new RectorError(
                `Can't access child component '${firstKey}' in '${activeComponent.name}' component.`
              );
            }

            if (parentCmp.name === firstKey) {
              break;
            }

            parentCmp = this.getComponent(parentCmp.parentId);
          }

          this.checkStateValid(parentCmp, stateName);
          scopeState[firstKey] = parentCmp.state;
          return `${parentCmp.id}:${stateName}`;
        } else {
          this.checkStateValid(activeComponent, firstKey);
          return firstKey;
        }
      }

      this.checkStateValid(activeComponent, stateKey);

      return stateKey;
    });

    return { scopeState, stateKeys };
  }

  private parseStateVars(
    str: string,
    activeComponent: Component,
    validateExpr = true
  ) {
    let matchStr: string[] | null = null;
    let isPsDefined = true;
    let parsedStr = str.replace(
      /\[\[\s*([^\]]+)\s*\]\]/g,
      (_, keyExpression) => {
        keyExpression = keyExpression?.trim();

        if (keyExpression) {
          if (validateExpr) {
            this.validateExpression(keyExpression);
          }

          let { scopeState, stateKeys } = this.mapStateKeys(
            keyExpression,
            activeComponent
          );

          matchStr = stateKeys;

          try {
            const fn = new Function(
              "State",
              `with(State) {return ${keyExpression}}`
            );

            return fn({ ...activeComponent.state, ...scopeState });
          } catch (error) {
            throw new RectorError(error?.message);
          }
        } else {
          isPsDefined = false;
        }
      }
    );

    return { parsedStr: isPsDefined ? parsedStr : "", matchStr };
  }

  private extractStateKeys(expr: string) {
    const dynamicExpr = expr.trim().replace(/(['"`])(?:\\\1|.)*?\1/g, "");

    const matches = [
      ...dynamicExpr.matchAll(/([$a-zA-Z_][$\w]*(?:\.[a-zA-Z_$][\w$]*)*)/g),
    ];

    const identifiers = matches.map((m) => m[1]);

    return [...new Set(identifiers)];
  }

  private createElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attributes: Attrs<K>
  ): HTMLElementTagNameMap[K] {
    const component = this.activeComponent();
    const elem = document.createElement(tag);
    const children = attributes.children;

    Object.entries(attributes).forEach(([key, value]) => {
      let val = value as any;
      key = key.trim();
      if (key !== "children") {
        if (key.startsWith("on") && typeof val === "function") {
          elem.addEventListener(key.slice(2), val);
        } else {
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
              } else {
                console.error(
                  "[RectorJs]: Only CSS style object is valid for 'style' key."
                );
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

    const finalEl = this.parseChildren(
      elem,
      Array.isArray(children) ? children : [children]
    );

    return finalEl;
  }

  private parseChildren<K extends keyof HTMLElementTagNameMap>(
    elem: HTMLElementTagNameMap[K],
    children: HTMLElement[]
  ) {
    const component = this.activeComponent();
    const SCOPE = component.id;
    for (let [idx, child] of children.entries()) {
      if (
        typeof child === "function" ||
        isPlainObject(child) ||
        Array.isArray(child)
      ) {
        throw new RectorError(
          "Functions, Objects and Arrays are not allowed as children"
        );
      }

      if (typeof child === "string") {
        const childStr = child as string;
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

              this.activeBlock()?.stateUsage.add(`${crrScope}:${stateName}`);

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
      } else {
        if (child !== undefined) {
          elem.append(
            typeof child === "number" ? document.createTextNode(child) : child
          );
        }
      }
    }

    return elem;
  }

  public print(showValues?: false) {
    if (showValues) {
      console.log(
        "\nEffect Funs: ",
        this.effectFuns,
        "\nComponentDATA: ",
        this.componentIdMap,
        "\nBlocks: ",
        this.blocksMap,
        "\nLoops: ",
        this.loopBlocks,
        "\nConditions: ",
        this.conditionalBlocks,
        "\nNavigation: ",
        this.navigation
      );
    }

    console.log(
      "\nConditional Blocks: ",
      estimateObjectSize(this.conditionalBlocks),
      "\nLoop Blocks: ",
      estimateObjectSize(this.loopBlocks),
      "\nBlocks: ",
      estimateObjectSize(this.blocksMap),
      "\nEffects: ",
      estimateObjectSize(this.effectFuns),
      "\nComponents: ",
      estimateObjectSize(this.componentIdMap)
    );
  }
}

export const Rector = new RectorJS();
export const initState: typeof Rector.initState = Rector.initState.bind(Rector);
export const initGlobalState: typeof Rector.initGlobalState =
  Rector.initGlobalState.bind(Rector);

// export const Navigation = {
//   createLayoutRoutes: Rector.createLayoutRoutes,
//   defineRoutes: Rector.defineRoutes,
//   setProtectedRoutes: Rector.setProtectedRoutes,
//   navigate: Rector.navigate,
// };

export const setEffect: typeof Rector.setEffect = Rector.setEffect.bind(Rector);
export const createLayoutRoutes: typeof Rector.createLayoutRoutes =
  Rector.createLayoutRoutes.bind(Rector);
export const defineRoutes: typeof Rector.defineRoutes =
  Rector.defineRoutes.bind(Rector);
export const setProtectedRoutes: typeof Rector.setProtectedRoutes =
  Rector.setProtectedRoutes.bind(Rector);
export const RectorMap: typeof Rector.map = Rector.map.bind(Rector);
export const Condition: typeof Rector.condition = Rector.condition.bind(Rector);
export const getComponentState: typeof Rector.getComponentState =
  Rector.getComponentState.bind(Rector);
export const navigate: typeof Rector.navigate = Rector.navigate.bind(Rector);
export const useElementRef: typeof Rector.useElementRef =
  Rector.useElementRef.bind(Rector);
export const renderApp: typeof Rector.renderApp = Rector.renderApp.bind(Rector);
export const getQueryParams: typeof Rector.getQueryParams =
  Rector.getQueryParams.bind(Rector);
export const getRouterParams: typeof Rector.getRouterParams =
  Rector.getRouterParams.bind(Rector);

export const globalState = Rector.globalState;
export const Elements = Rector.elements;

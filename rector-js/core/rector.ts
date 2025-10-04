import {
  estimateObjectSize,
  isComponentFunction,
  isEqual,
  isJSXExpressionObj,
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
  IfBlockConfig,
  LoopBlockConfig,
  EffectConfig,
  ElementInterceptors,
  Route,
  RouteKeyPair,
  JSXExpressionObj,
  RouteConfig,
  MetaConfig,
  EffectFunction,
  ComponentElement,
  AttrsUsage,
} from "./types.js";

declare global {
  interface HTMLElement {
    blockId?: string;
  }

  interface Node {
    blockId?: string;
  }

  interface ChildNode {
    blockId?: string;
  }

  interface DocumentFragment {
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
        ...lines.filter(
          (line) =>
            !line.includes("RectorJS.") && !line.includes("RectorNavigation.")
        ),
      ].join("\n");
    }
  }
}

class RectorNavigation {
  public routerParams: { [key: string]: string } = {};
  private routes: { [path: string]: Route } = {};
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

  private layoutId = 1;

  public layouts: {
    [id: string]: (Child: ComponentElement) => HTMLElement;
  } = {};

  public activeLayout: { [lid: number]: { range: Range; blockId: string } } =
    null;

  public currentLayout: number | number[];

  private NotFoundPage: Route;

  constructor() {}

  public getRouterParams() {
    return this.routerParams;
  }

  public getQueryParams() {
    const urlSearchParams = new URLSearchParams(window.location.search);
    const params = Object.fromEntries(urlSearchParams.entries());
    return params;
  }

  public getHash() {
    return window.location.hash.slice(1);
  }

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

  private normalizePath(path: string) {
    if (path === "/") return "/";
    return path.replace(/\/+$/, ""); // remove all trailing slashes
  }

  private checkRouteLayout(
    path: string,
    route: RouteConfig,
    parentLayoutId?: number | number[]
  ) {
    if (route?.layout && route?.children) {
      this.configureLayout(path, route, parentLayoutId);
    } else if (route?.component) {
      if (route?.config) {
        this.routes[path] = {
          component: route?.component,
          config: route?.config,
          ...(parentLayoutId ? { lid: parentLayoutId } : {}),
        };
      } else {
        this.routes[path] = parentLayoutId
          ? { lid: parentLayoutId, component: route?.component }
          : route?.component;
      }
    } else {
      throw new RectorError("Please provide valid Route Config.");
    }
  }

  private configureRoute(path: string, route: RouteConfig | ComponentElement) {
    path = this.normalizePath(path);

    if (!path.startsWith("/")) {
      throw new RectorError("Route path must start with '/'");
    }

    if (typeof route === "function") {
      this.routes[path] = route;
    } else {
      this.checkRouteLayout(path, route);
    }

    this.buildRouteRegex(path);
  }

  public defineRoutes(routes: RouteKeyPair) {
    Object.entries(routes).forEach(([path, route]) => {
      if (path === "*") {
        if (typeof route === "function") {
          this.NotFoundPage = route;
        } else {
          if (!route?.component)
            throw new RectorError(
              "Component Not provided for wildcard route '*'"
            );
          this.NotFoundPage = {
            component: route.component,
            config: route?.config,
          };
        }
      } else {
        this.configureRoute(path, route);
      }
    });
  }

  private configureLayout(
    path: string,
    route: RouteConfig,
    parentLayoutId?: number | number[]
  ) {
    const id = this.layoutId++;
    let lid: number | number[];

    if (parentLayoutId) {
      if (typeof parentLayoutId === "number") {
        lid = [id, parentLayoutId];
      } else {
        lid = [id, ...parentLayoutId];
      }
    } else {
      lid = id;
    }

    Object.entries(route?.children).forEach(([pathKey, routeValue]) => {
      const newPath = this.normalizePath(
        path === "/" ? pathKey : path + pathKey
      );

      if (typeof routeValue === "function") {
        this.routes[newPath] = { lid, component: routeValue };
      } else {
        this.checkRouteLayout(newPath, routeValue, lid);
      }

      this.buildRouteRegex(newPath);
    });

    this.layouts[id] = route?.layout;
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

  private matchRoute(pathname: string) {
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
    const initPath = this.normalizePath(window.location.pathname);
    const isRouteAccessible = await this.runMiddleware(initPath);

    if (!isRouteAccessible) return null;

    const app = this.matchRoute(initPath);

    if (!app) {
      if (this.NotFoundPage) return this.NotFoundPage;
      throw new RectorError(
        `INVALID ROUTE: '${initPath}' route is not define.`
      );
    }

    this.currentLayout = typeof app === "function" ? null : app?.lid;

    return app;
  }
}

class Component {
  public id: string;
  public name: string;
  public parentId: string;
  public state: { [stateName: string]: any } = {};
  public stateUsage: StateUsage = {};
  public attributeUsage: AttrsUsage = {};
  public loops: { [stateName: string]: string[] } = {};
  public conditions: { [stateName: string]: string[] } = {};
  public effects: { [stateName: string]: number[] } = {};
  public unmounts: {
    cleanUp?: [number, string[]];
    fn?: (() => void) | Promise<() => void>;
  }[] = [];
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

const Navigation = new RectorNavigation();

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

  private microTaskQueue: (() => void)[] = [];
  private rectorKeywords = new Set([
    "bound condition",
    "bound map",
    "Fragment",
  ]);
  private errorBoundary: (error: Error) => HTMLElement;
  private elementInterceptors: ElementInterceptors = {};
  private crrLayoutBlockId: string;
  private effectQueue: number[] = [];
  private errorWrapper: (cmp: ComponentElement) => ComponentElement;

  // Public Properties //

  public elements: RectorElements;
  public globalState: { [stateName: string]: any };

  // constructor setup //

  constructor() {
    this.navigation = Navigation;

    this.elements = new Proxy({} as RectorElements, {
      get: (_, tag: keyof HTMLElementTagNameMap) => {
        return (attributes: Attrs<typeof tag>): HTMLElement =>
          this.createElement(tag, attributes);
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
        let layout: { range: Range; blockId: string };
        if (typeof crrLid === "number") {
          layout = activeLayout[crrLid];
        } else {
          layout = activeLayout[crrLid[0]];
        }
        this.handleRenderError(event.reason, {
          range: layout.range,
        });
      } else {
        this.handleRenderError(event.reason, { lids: crrLid });
      }
    });
  }

  // -----Public methods----- //

  public setElementInterceptors(interceptors: ElementInterceptors) {
    this.elementInterceptors = interceptors;
  }

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

    const checkAndAppend = (child: any) => {
      if (
        typeof child === "function" ||
        isPlainObject(child) ||
        Array.isArray(child)
      ) {
        throw new RectorError(
          "[At Fragment]: Functions, Objects and Arrays are not allowed as children."
        );
      }

      if (typeof child === "string" || typeof child === "number") {
        child = document.createTextNode(String(child));
      }
      container.appendChild(child);
    };

    if (Array.isArray(children)) {
      children.forEach((child) => checkAndAppend(child));
    } else if (children) {
      checkAndAppend(children);
    }
    return container;
  }

  public setErrorBoundary(component: (error: Error) => HTMLElement) {
    this.errorBoundary = component;
  }

  public navigate(path: string) {
    if (window.location.pathname !== path) {
      history.pushState({}, "", path);
      this.renderApp();
    }
  }

  public componentState() {
    return this.stateUsage(this.activeComponent());
  }

  private handleRenderError(
    error: Error,
    config: {
      range?: Range;
      lids?: number | number[];
    }
  ) {
    if (!this.errorBoundary) throw error;
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
        } else {
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
        } else {
          body.append(this.layoutArrayExecution(lids, errElement)());
        }
        this.runMicrotasks();
        return;
      }

      body.append(errElement());
    } catch (err) {
      throw err;
    }
  }

  private runMetaConfig(config: MetaConfig) {
    if (config?.documentTitle) {
      document.title = config.documentTitle;
    }
  }

  private layoutExecution(layoutId: number, component: ComponentElement) {
    const layout = this.navigation.layouts[layoutId];

    return () =>
      layout(() => {
        const blockId = this.setUpBlock();

        const element = this.jsx(component, {});

        this.blockStack.pop();

        const range = new Range();

        this.navigation.activeLayout ??= {};

        this.navigation.activeLayout[layoutId] = {
          range,
          blockId,
        };

        this.configureRange(element, range);

        return element;
      });
  }

  private layoutArrayExecution(
    layoutIds: number[],
    startCmp: ComponentElement
  ) {
    // wrap component from all layout innerMost -> outerMost
    return layoutIds.reduce(
      (cmp, lid) => this.layoutExecution(lid, cmp),
      startCmp
    );
  }

  private decideLayout(lids: number[]) {
    const last = lids[lids.length - 1];
    if (!this.navigation.activeLayout[last]) return { active: null, exe: [] };

    let active: number = null;
    let exe: number[] = [];

    for (const lid of lids) {
      if (this.navigation.activeLayout[lid]) {
        if (!active) active = lid;
      } else {
        if (active) exe.push(active);
        exe.push(lid);
        active = null;
      }
    }

    return { active, exe };
  }

  private changeLayoutElement(layoutId: number, component: ComponentElement) {
    const { range, blockId: prevBlockId } =
      this.navigation.activeLayout[layoutId];
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
      this.navigation.activeLayout ??= {};
      this.navigation.activeLayout[layoutId] = {
        range,
        blockId,
      };
      this.crrLayoutBlockId = null;
      this.errorWrapper = null;
    } catch (error) {
      this.handleRenderError(error, { range });
    }
  }

  private runApp(app: ComponentElement, lids: number | number[]) {
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
    } catch (error) {
      this.handleRenderError(error, {
        lids,
      });
    }
  }

  public async renderApp() {
    const app = await this.navigation.resolveRoute();

    if (!app) return;

    if (typeof app === "function") {
      // route is ComponentElement, render direct (no layouts)
      this.runApp(app, null);
      this.navigation.activeLayout = null;
      return;
    }

    if (app?.config)
      this.microTaskQueue.push(() => this.runMetaConfig(app?.config));

    if (!app?.lid) {
      // route has component key(ComponentElement), still render direct (no layouts)
      this.runApp(app?.component, null);
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
  }

  private async runMicrotasks() {
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

  public defineGlobalState<V>(stateName: string, value: V) {
    return this.configureState(stateName, value, GLOBAL);
  }

  public defineState<V>(stateName: string, value: V) {
    const cmpId = this.activeComponent().id;
    if (cmpId == GLOBAL) {
      throw new RectorError(
        "You can't initial state outside of a component, try 'initGlobalState' instead."
      );
    }

    return this.configureState(stateName, value, cmpId);
  }

  private isIdentifier(str: string) {
    if (!str || typeof str !== "string") return false;
    const regex = /^[a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*$/;

    return regex.test(str.trim());
  }

  public setEffect(fn: EffectFunction, depends?: string[]) {
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

        if (!this.isIdentifier(stateStr)) {
          throw new RectorError(
            `[setEffect]: Invalid expression as dependency , it must be state variables.`
          );
        }

        let v: string | string[] = stateStr;
        const scopeState = stateStr.split(".");
        if (scopeState.length > 1) {
          v = this.isPropState(scopeState, component);
        }

        let crrComponent: Component;
        let stateName: string;

        if (typeof v === "string") {
          crrComponent = component;
          stateName = v;
        } else {
          crrComponent = this.getComponent(v[0]);
          stateName = v[1];
          externalDeps.push(`${v[0]}:${v[1]}`);
        }

        crrComponent.effects[stateName] ??= [];

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

  private isPropState(
    stateProp: string[],
    activeComponent: Component,
    callback?: (key: string, value: any) => void
  ) {
    const [key, secondKey] = stateProp;
    let dVar: string | string[];
    if (key === "$") {
      const globalComponent = this.getComponent(GLOBAL);
      this.checkStateValid(globalComponent, secondKey);
      dVar = [GLOBAL, secondKey];
      callback?.(key, globalComponent.state);
    } else if (this.componentNames.has(key)) {
      if (key === activeComponent.name) {
        throw new Error(
          `Invalid self-reference: Use "${secondKey}" instead of "${key}.${secondKey}" inside component "${key}".`
        );
      }
      let parentCmp = this.getComponent(activeComponent.parentId);
      while (parentCmp) {
        if (parentCmp.id === GLOBAL) {
          throw new RectorError(
            `Can't access child component '${key}' in '${activeComponent.name}' component.`
          );
        }

        if (parentCmp.name === key) {
          break;
        }

        parentCmp = this.getComponent(parentCmp.parentId);
      }

      this.checkStateValid(parentCmp, secondKey);
      dVar = [parentCmp.id, secondKey];
      callback?.(key, parentCmp.state);
    } else {
      this.checkStateValid(activeComponent, key);
      dVar = key;
      callback?.(key, activeComponent.state[key]);
    }

    return dVar;
  }

  private transformExprVars(
    vars: (string | string[])[],
    activeComponent: Component
  ) {
    let dVars: (string | string[])[] = [];
    let scopeObj: {
      args: string[];
      values: any[];
    } = {
      args: [],
      values: [],
    };

    const addScopeData = (stateKey: string, value: any) => {
      scopeObj.args.push(stateKey);
      scopeObj.values.push(value);
    };

    for (let state of vars) {
      if (typeof state === "string") {
        this.checkStateValid(activeComponent, state);
        dVars.push(state);
        addScopeData(state, activeComponent.state[state]);
      } else {
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

  public condition(props: {
    expression: string;
    onTrueRender?: ComponentElement;
    onFalseRender?: ComponentElement;
  }) {
    try {
      let { expression: jsxExpr, onTrueRender, onFalseRender } = props;
      let expression = jsxExpr as unknown as JSXExpressionObj;
      this.validateExpression(expression?.expression);
      const ifBlockId = `if:${this.blockId++}`;
      this.activeBlock()?.conditionIds.push(ifBlockId);
      const component = this.activeComponent();
      const SCOPE = component.id;

      const { vars, scopeObj } = this.transformExprVars(
        expression?.vars,
        component
      );
      const expressionStr = expression?.expression;

      if (vars && vars?.length > 0) {
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

      const isTrue = this.evalExpr(
        expressionStr,
        scopeObj.args,
        scopeObj.values
      );

      const checkCompStructure = (Fn: ComponentElement) => {
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

      const range = new Range();

      crrEl = this.configureElementRange(crrEl, range);

      component.exprPrevValue[expressionStr] = isTrue;

      this.conditionalBlocks[ifBlockId] = {
        rawExp: { ...expression, vars },
        cmpId: SCOPE,
        trueElement: trueEl,
        falseElement: falseEl,
        placeholder: range,
        childBlock: blockId,
      };

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

  public map(props: {
    data: string;
    render: (item: any, index: number) => HTMLElement;
    keyExtractor?: (item: any, index: number) => string | number;
  }) {
    const { data, render, keyExtractor } = props;
    if (!this.isIdentifier(data)) {
      throw new RectorError(
        `[RectorMap]: Invalid expression for data , it must be state variables.`
      );
    }
    const loopBlockId = `loop:${this.blockId++}`;
    this.activeBlock()?.loopIds.push(loopBlockId);

    const component = this.activeComponent();
    const SCOPE = component.id;

    let v: string | string[] = data.trim();

    const scopeState = data.split(".");
    if (scopeState.length > 1) {
      v = this.isPropState(scopeState, component);
    }

    let crrComponent: Component = component;
    let stateName: string;

    if (Array.isArray(v)) {
      crrComponent = this.getComponent(v[0]);
      stateName = v[1];
    } else {
      stateName = v;
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
    this.effectQueue = [];
    this.componentNames.clear();
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

        if (
          unmount &&
          (typeof unmount === "function" || unmount instanceof Promise)
        ) {
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

  private configureRange(element: Node, range: Range) {
    const nodes =
      element instanceof DocumentFragment ? [...element.childNodes] : [element];

    let [first, last] = [nodes[0], nodes[nodes.length - 1]]; // first & last wil same if only [element]
    if (first instanceof Comment) first = nodes[1];

    this.microTaskQueue.push(() => {
      if (!first?.parentNode || !last?.parentNode) return; // not attached (yet) or already removed
      range.setStartBefore(first);
      range.setEndAfter(last);
    });
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

    this.configureRange(element, range);

    return element;
  }

  private removeBlockRef(
    scopeState: string | string[],
    cmpId: string,
    target: string,
    blockType: "loops" | "conditions"
  ) {
    let cmp: Component;
    let stateName: string;

    if (Array.isArray(scopeState)) {
      const [scope, name] = scopeState;
      cmp = this.getComponent(scope);
      stateName = name;
    } else {
      cmp = this.getComponent(cmpId);
      stateName = scopeState;
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
      const cmp = this.getComponent(cmpId);
      cmp?.unmounts?.forEach(async (config) => {
        if (config?.fn) {
          (await config.fn)?.();
        }
        if (config?.cleanUp) {
          this.effectCleanUp(config?.cleanUp);
        }
      });

      for (const key in this.effectFuns) {
        if (this.effectFuns[key].scope === cmpId) {
          delete this.effectFuns[key];
        }
      }

      this.componentNames.delete(cmp.name);

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

      condition?.rawExp?.vars?.forEach((data) => {
        this.removeBlockRef(data, condition.cmpId, conditionId, "conditions");
      });
      delete this.conditionalBlocks[conditionId];
    });

    delete this.blocksMap[blockId];
  }

  private updateIfBlock(blockId: string) {
    try {
      const blockConfig = this.conditionalBlocks[blockId];
      const scope = blockConfig.cmpId;
      const component = this.getComponent(scope);
      const { vars, expression } = blockConfig.rawExp;

      const scopeObj = this.buildExpEvaluationData(vars, component);

      const isTrue = this.evalExpr(expression, scopeObj.args, scopeObj.values);
      const prevVal = component.exprPrevValue[expression];
      if (prevVal !== isTrue) {
        const El = (con: boolean) =>
          con ? blockConfig.trueElement : blockConfig.falseElement;
        const range = blockConfig.placeholder;
        range.deleteContents();

        this.unmount(blockConfig.childBlock);

        this.scopeStack.push(this.getComponent(scope));

        this.setUpBlock(blockConfig.childBlock);

        const nextEl = El(isTrue)?.() ?? null;

        this.blockStack.pop();
        this.scopeStack.pop();

        range.insertNode(this.configureElementRange(nextEl, range));
      }

      return {
        exp: expression,
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

  private buildExpEvaluationData(
    vars: (string | string[])[],
    component: Component
  ) {
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

  private reRender(stateName: string, oldValue: any, scope: string) {
    const component = this.getComponent(scope);

    const stateFullElements = component.stateUsage?.[stateName];

    if (stateFullElements) {
      for (let sfe of stateFullElements) {
        const { args, values } = this.buildExpEvaluationData(
          sfe.rawExp.vars,
          component
        );

        const parsedExpr = this.evalExpr(sfe.rawExp.expression, args, values);

        sfe.element.childNodes[sfe.pos].nodeValue = parsedExpr;
      }
    }

    const dynamicAttrsElements = component.attributeUsage?.[stateName];

    if (dynamicAttrsElements) {
      for (let attrsObj of dynamicAttrsElements) {
        const { args, values } = this.buildExpEvaluationData(
          attrsObj.rawExp.vars,
          component
        );

        const parsedExpr = this.evalExpr(
          attrsObj.rawExp.expression,
          args,
          values
        );

        attrsObj.element.setAttribute(attrsObj.attribute, parsedExpr);
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
        `Invalid expression '${expr}', assignment operation (=) is not allowed as expression.`
      );
    }
  }

  private createElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attributes: Attrs<K>
  ): HTMLElementTagNameMap[K] {
    const component = this.activeComponent();
    let elem = document.createElement(tag);
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
              if (isJSXExpressionObj(val)) {
                const expression = val?.expression;
                this.validateExpression(expression);
                const { vars, scopeObj } = this.transformExprVars(
                  val?.vars,
                  component
                );

                for (let stateName of vars) {
                  let crrComponent = component;

                  if (Array.isArray(stateName)) {
                    const [compScope, compStateName] = stateName;
                    stateName = compStateName;
                    crrComponent = this.getComponent(compScope);
                  }

                  crrComponent.attributeUsage[stateName] ??= [];

                  crrComponent.attributeUsage[stateName].push({
                    element: elem,
                    rawExp: { expression, vars },
                    attribute: key,
                  });
                }

                const parsedVal = this.evalExpr(
                  expression,
                  scopeObj.args,
                  scopeObj.values
                );

                elem.setAttribute(key, parsedVal);
              } else {
                elem.setAttribute(key, val);
              }
              break;
            }
          }
        }
      }
    });

    const interceptElement = (el: any) => {
      if (this.elementInterceptors[tag]) {
        this.elementInterceptors[tag](el);
      }
    };

    if (!children || selfClosingTags.has(tag)) {
      interceptElement(elem);
      return elem;
    }

    const finalEl = this.parseChildren(
      elem,
      Array.isArray(children) ? children : [children]
    );

    interceptElement(finalEl);

    return finalEl;
  }

  private evalExpr(expr: string, args: string[], values: any[]) {
    try {
      return new Function(...args, `return ${expr};`)(...values);
    } catch (error) {
      throw new RectorError(error?.message);
    }
  }

  private parseChildren<K extends keyof HTMLElementTagNameMap>(
    elem: HTMLElementTagNameMap[K],
    children: (HTMLElement | DocumentFragment)[]
  ) {
    const component = this.activeComponent();
    const SCOPE = component.id;

    for (let [idx, child] of children.entries()) {
      if (typeof child === "number" || typeof child === "string") {
        elem.append(document.createTextNode(child));
      } else if (isJSXExpressionObj(child)) {
        const expression = child?.expression;
        this.validateExpression(expression);
        const { vars, scopeObj } = this.transformExprVars(
          child?.vars,
          component
        );

        for (let stateName of vars) {
          let crrScope = SCOPE;

          let crrComponent = component;

          if (Array.isArray(stateName)) {
            const [compScope, compStateName] = stateName;

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
            pos: idx,
            rawExp: { expression, vars },
            cmpId: SCOPE,
          });
        }

        let parsedExpr = this.evalExpr(
          expression,
          scopeObj.args,
          scopeObj.values
        );

        elem.append(document.createTextNode(parsedExpr));
      } else if (typeof child === "function" || isPlainObject(child)) {
        throw new RectorError(
          "Functions and Objects are not allowed as children."
        );
      } else if (child) {
        if (Array.isArray(child)) {
          child = this.fragment({ children: child });
        }
        elem.append(child);
      }
    }

    return elem;
  }

  public print(showValues?: false) {
    if (showValues) {
      console.log(
        "\nEffect Queue",
        this.effectQueue,
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
        this.navigation,
        "\nComponent Names:",
        this.componentNames
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
export const defineState: typeof Rector.defineState =
  Rector.defineState.bind(Rector);
export const defineGlobalState: typeof Rector.defineGlobalState =
  Rector.defineGlobalState.bind(Rector);

// export const Navigation = {
//   createLayoutRoutes: Rector.createLayoutRoutes,
//   defineRoutes: Rector.defineRoutes,
//   setProtectedRoutes: Rector.setProtectedRoutes,
//   navigate: Rector.navigate,
// };

// Navigation
export const setProtectedRoutes: typeof Navigation.setProtectedRoutes =
  Navigation.setProtectedRoutes.bind(Navigation);
// export const createLayoutRoutes: typeof Navigation.createLayoutRoutes =
//   Navigation.createLayoutRoutes.bind(Navigation);
export const getQueryParams: typeof Navigation.getQueryParams =
  Navigation.getQueryParams.bind(Navigation);
export const getRouterParams: typeof Navigation.getRouterParams =
  Navigation.getRouterParams.bind(Navigation);
export const getHash: typeof Navigation.getHash =
  Navigation.getHash.bind(Navigation);
export const defineRoutes: typeof Navigation.defineRoutes =
  Navigation.defineRoutes.bind(Navigation);

//Rector
export const setEffect: typeof Rector.setEffect = Rector.setEffect.bind(Rector);
export const RectorMap: typeof Rector.map = Rector.map.bind(Rector);
export const Condition: typeof Rector.condition = Rector.condition.bind(Rector);
export const componentState: typeof Rector.componentState =
  Rector.componentState.bind(Rector);
export const navigate: typeof Rector.navigate = Rector.navigate.bind(Rector);
export const useElementRef: typeof Rector.useElementRef =
  Rector.useElementRef.bind(Rector);
export const renderApp: typeof Rector.renderApp = Rector.renderApp.bind(Rector);

export const globalState = Rector.globalState;
export const Elements = Rector.elements;

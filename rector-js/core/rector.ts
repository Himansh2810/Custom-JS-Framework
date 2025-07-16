import {
  estimateObjectSize,
  isComponentFunction,
  isEqual,
  reservedJSKeys,
  selfClosingTags,
} from "./utils.js";
import {
  RectorElements,
  StateBlockConfig,
  StateBlocks,
  StateUsage,
  Attrs,
} from "./types.js";

const GLOBAL = "global";

class RectorError extends Error {
  constructor(message: string) {
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

class RectorJS {
  public elements: RectorElements;
  private events = {};
  private State: { [scope: string]: { [state: string]: any } } = {};
  private stateUsageMap: StateUsage = {};
  private stateBlocks: StateBlocks = {};
  private effects: Map<string, any[]> = new Map();
  private refs: { [key: string]: any } = {};
  private exprPrevValue: { [scope: string]: { [expr: string]: boolean } } = {};
  private cmpId = 0;

  private scopeStack = [GLOBAL];
  private appStarted = false;
  private routes: { [route: string]: () => HTMLElement } = {};
  private routeAccess: {
    protectedRoutes: Set<string>;
    grantAccess: () => boolean;
    onFallback: () => void;
  };

  constructor() {
    this.elements = new Proxy({} as RectorElements, {
      get: (_, tag: keyof HTMLElementTagNameMap) => {
        return (attributes: Attrs<typeof tag>): HTMLElement =>
          this.createElement(tag, attributes);
      },
    });
  }

  private activeScope() {
    const L = this.scopeStack.length;
    return this.scopeStack[L - 1];
  }

  public jsx(fn, props) {
    if (typeof fn === "function") {
      const componentName = isComponentFunction(fn);
      if (!componentName) {
        return fn(props);
      }
      this.component();
      const app = fn(props);
      this.popScope();
      return app;
    }
    return null;
  }

  // -----Public methods----- //

  public Routes(routes: { [path: string]: any }) {
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
      } else {
        Object.assign(this.routes, routeComp);
      }
    });
  }

  public ProtectedRoutes(RouteAccess: {
    routes: string[];
    grantAccess: () => boolean;
    onFallback: () => void;
  }) {
    this.routeAccess = {
      protectedRoutes: new Set(RouteAccess.routes),
      grantAccess: RouteAccess.grantAccess,
      onFallback: RouteAccess.onFallback,
    };
  }

  public Layout(
    childRoutes: { [path: string]: any },
    layoutComponent: (RouteComponent: () => HTMLElement) => HTMLElement
  ) {
    let routes = {};
    const buildLayout = (cr) => {
      Object.entries(cr).forEach(([path, rl]) => {
        let routeEl = rl as any;
        if (typeof routeEl === "function") {
          routes[path] = () => layoutComponent(routeEl);
        } else {
          buildLayout(routeEl);
        }
      });
    };
    buildLayout(childRoutes);
    return routes;
  }

  private routeCleanUp() {
    this.State = { [GLOBAL]: this.State[GLOBAL] ?? {} };
    this.stateBlocks = { [GLOBAL]: this.stateBlocks[GLOBAL] ?? {} };
    this.stateUsageMap = { [GLOBAL]: this.stateUsageMap[GLOBAL] ?? {} };
    this.exprPrevValue = { [GLOBAL]: this.exprPrevValue[GLOBAL] ?? {} };
  }

  public navigate(path: string) {
    history.pushState({}, "", path);
    this.routeCleanUp();
    this.renderRoot();
  }

  private stateUsage(scope: string) {
    if (!this.State[scope]) {
      this.State[scope] = {};
    }

    return new Proxy(this.State[scope] ?? {}, {
      get: (_, stateName: string) => {
        if (stateName.startsWith("$")) {
          throw new RectorError(
            `State name started with '$' is not allowed in RectorJS.`
          );
        }
        this.checkStateExist(
          `${scope === GLOBAL ? "$" : ""}` + stateName,
          scope
        );
        return this.State[scope]?.[stateName];
      },
    });
  }

  public globalState = this.stateUsage(GLOBAL);

  public componentState() {
    return this.stateUsage(this.activeScope());
  }

  public popScope() {
    this.scopeStack.pop();
  }

  public component() {
    if (this.appStarted) {
      const cmpId = `cmp-${this.cmpId++}`;
      this.scopeStack.push(cmpId);
    } else {
      throw new RectorError(
        "You can only call 'Rector.component()' inside functions"
      );
    }
  }

  private async checkRouteAccess(path: string) {
    if (!this.routeAccess) {
      return true;
    }
    const isPathProtected = this.routeAccess.protectedRoutes.has(path);
    if (isPathProtected) {
      const hasAccess = this.routeAccess.grantAccess();
      return hasAccess;
    }
    return true;
  }

  public async renderRoot() {
    const body = document.querySelector("body");
    const initPath = window.location.pathname;
    const app = this.routes[initPath];
    if (!app) {
      const fallbackRoute = this.routes["/*"];
      if (fallbackRoute) {
        body.innerHTML = "";
        this.appStarted = true;
        body.append(fallbackRoute());
        this.appStarted = false;
        return;
      } else {
        throw new RectorError(
          `INVALID ROUTE: '${initPath}' route is not initialized.\nProvide fallback route '/*' to handle any undeclared route.`
        );
      }
    }

    const isRouteAccessible = await this.checkRouteAccess(initPath);

    if (!isRouteAccessible) {
      this.routeAccess.onFallback();
      return;
    }

    body.innerHTML = ""; // Clear existing content
    this.appStarted = true;
    false && console.time("App_loaded_in");
    body.append(app());
    false && console.timeEnd("App_loaded_in");
    this.appStarted = false;
  }

  public registerEvents(events: { [key: string]: any }) {
    Object.entries(events).forEach(([key, val]) => {
      if (this.events[key]) {
        throw new RectorError(`Event named '${key}' already registered`);
      } else {
        this.events[key] = val;
      }
    });
  }

  public getEvent(eventName: string) {
    return this.events[eventName];
  }

  public initGlobalState<V>(stateName: string, value: V) {
    return this.configureState(stateName, value, GLOBAL);
  }

  public initState<V>(stateName: string, value: V) {
    if (this.activeScope() == GLOBAL) {
      throw new RectorError(
        "You must call 'Rector.component()' before initializing state in a component."
      );
    }

    return this.configureState(stateName, value, this.activeScope());
  }

  public configureState<V>(stateName: string, value: V, scope: string) {
    if (typeof stateName !== "string") {
      throw new RectorError("State name must be of string type");
    }

    stateName = stateName.trim();

    if (!stateName) {
      throw new RectorError("State name should be a valid string");
    }

    if (stateName.startsWith("$")) {
      throw new RectorError(
        `Invalid state name '${stateName}': State name should not start with a '$' in RectorJS`
      );
    }

    if (!/^[A-Z_a-z][$\w]*$/.test(stateName)) {
      throw new RectorError(
        `Invalid state name '${stateName}': State names must start with a letter , _  and only contain alphanumeric characters, $, or _.`
      );
    }

    if (reservedJSKeys.has(stateName)) {
      throw new RectorError(
        `Invalid state name '${stateName}': JavaScript keywords are not allowed as State name.`
      );
    }

    const isCmp = scope !== GLOBAL;

    if (!this.State[scope]) {
      this.State[scope] = {};
    }

    // @ts-ignore
    if (Object.hasOwn(this.State[scope], stateName)) {
      throw new RectorError(
        `${
          !isCmp ? "Global" : ""
        } State '${stateName}' is already declared in this ${
          !isCmp ? "App" : "Component"
        }.`
      );
    }

    this.State[scope][stateName] = value;

    return (val: V | ((prev: V) => V)) => {
      const oldValue: V = this.State[scope][stateName];

      const newVal: V =
        typeof val === "function" ? (val as (prev: V) => V)(oldValue) : val;

      this.State[scope][stateName] = newVal;

      if (!isEqual(oldValue, newVal)) {
        this.reRender(stateName, oldValue, scope);
        this.runEffects(stateName);
      }
    };
  }

  public setEffect(
    fn: () => void,
    config: {
      depends?: string[];
      runAfterRender?: boolean;
      runOnInit?: boolean;
    }
  ) {
    if (typeof fn !== "function") {
      throw new RectorError("Effect must be a function");
    }

    const { depends = [], runAfterRender = false, runOnInit = true } = config;

    if (runOnInit) {
      fn();
    }

    if (!Array.isArray(depends) || depends.some((d) => typeof d !== "string")) {
      throw new RectorError("Dependencies must be an array of strings");
    }

    if (depends && depends.length > 0) {
      depends.forEach((stateName) => {
        this.checkStateExist(stateName, this.activeScope());
        if (this.effects.has(stateName)) {
          this.effects.set(stateName, [...this.effects.get(stateName), fn]);
        } else {
          this.effects.set(stateName, [fn]);
        }
      });
    }

    if (runAfterRender) {
      document.addEventListener("DOMContentLoaded", () => {
        fn();
      });
    }
  }

  public if(
    expression: string,
    onTrueRender: HTMLElement,
    onFalseRender?: HTMLElement
  ) {
    const SCOPE = this.activeScope();
    const stateKeys = this.extractStateKeys(expression);
    this.validateExpression(expression, stateKeys, SCOPE);

    let onTrueEl = this.validateConditionalElements(onTrueRender, true);
    let onFalseEl = this.validateConditionalElements(onFalseRender, false);

    let globalState = {};
    stateKeys.forEach((m) => {
      if (m.startsWith("$")) {
        globalState[m] = this.State[GLOBAL][m.slice(1)];
      }
    });

    try {
      const fn = new Function("State", `with(State) {return ${expression}}`);
      const isTrue = fn({ ...this.State[SCOPE], ...globalState });
      if (!this.exprPrevValue[SCOPE]) {
        this.exprPrevValue[SCOPE] = {};
      }

      this.exprPrevValue[SCOPE][expression] = isTrue;

      for (let e of stateKeys) {
        let crrScope = SCOPE;
        if (e.startsWith("$")) {
          e = e.slice(1);
          crrScope = GLOBAL;
        }

        if (!this.stateBlocks[crrScope]) {
          this.stateBlocks[crrScope] = {};
        }

        if (!this.stateBlocks[crrScope][e]) {
          this.stateBlocks[crrScope][e] = [];
        }

        this.stateBlocks[crrScope][e].push({
          expType: "if",
          exp: expression,
          trueElement: onTrueEl,
          falseElement: onFalseEl,
          scope: SCOPE,
        });
      }

      return isTrue ? onTrueEl : onFalseEl;
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof RectorError) {
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
    let stateName = sn;
    const SCOPE = this.activeScope();
    if (!this.State[SCOPE]) {
      this.State[SCOPE] = {};
    }
    console.log("stateName: ", stateName, SCOPE, this.State);
    this.checkStateExist(stateName, SCOPE);

    let items: any[];

    let crrScope = SCOPE;

    if (stateName.startsWith("$")) {
      stateName = stateName.slice(1);
      crrScope = GLOBAL;
      items = this.State[crrScope][stateName];
    } else {
      items = this.State[SCOPE][stateName];
    }

    const fragment = document.createDocumentFragment();
    const commentRef = document.createComment("Rector Map");
    fragment.appendChild(commentRef);

    if (!this.stateBlocks[crrScope]) {
      this.stateBlocks[crrScope] = {};
    }

    if (!this.stateBlocks[crrScope][stateName]) {
      this.stateBlocks[crrScope][stateName] = [];
    }

    let firstChild = null;

    items.forEach((item, index) => {
      const child = render(item, index);
      if (index === 0) {
        firstChild = child;
      }
      fragment.appendChild(child);
    });

    this.stateBlocks[crrScope][stateName].push({
      expType: "map",
      renderElement: render,
      firstNode: firstChild,
      keyExtractor,
      commentRef,
    });

    return fragment;
  }

  public useRef(refName: string) {
    return {
      current: () => this.refs[refName],
    };
  }

  // ------Private methods ---- //

  private validateConditionalElements(
    element: any,
    elType: boolean
  ): HTMLElement | ChildNode {
    if (element instanceof DocumentFragment) {
      throw new RectorError(
        `at ${
          elType ? "onTrueRender" : "onFalseRender"
        }: 'map' loop block cannot be directly use in 'if' block, try to wrap it in any parent element.`
      );
    }

    if (typeof element === "string" || typeof element === "number") {
      return document.createTextNode(element.toString());
    }

    return element ? element : document.createTextNode("");
  }

  private runEffects(stateName: string) {
    const effects = this.effects.get(stateName);
    if (effects && effects.length > 0) {
      effects.forEach((fn) => {
        fn();
      });
    }
  }

  private updateIfBlock(utl: StateBlockConfig) {
    let globalVars = {};

    let stateKeys = this.extractStateKeys(utl.exp);
    stateKeys.forEach((sk) => {
      if (sk.startsWith("$")) {
        globalVars[sk] = this.State[GLOBAL][sk.slice(1)];
      }
    });

    try {
      const fn = new Function("State", `with(State) {return ${utl.exp}}`);
      const isTrue = fn({ ...this.State[utl.scope], ...globalVars });
      const prevVal = this.exprPrevValue[utl.scope][utl.exp];
      if (prevVal !== isTrue) {
        const El = (con: boolean) => (con ? utl.trueElement : utl.falseElement);
        El(prevVal).replaceWith(El(isTrue));
        return {
          exp: utl.exp,
          val: isTrue,
        };
      }
    } catch (error) {
      throw new RectorError(error);
    }
  }

  private updateLoopBlock(
    utl: StateBlockConfig,
    stateName: string,
    oldValue: any
  ) {
    const newList: any[] = this.State[utl.scope][stateName];
    const oldList = [...oldValue];
    let firstChild = utl.firstNode;
    let parent =
      firstChild?.parentNode || utl.parentNode || utl.commentRef.parentNode;

    if (!parent)
      throw new RectorError(
        "No parent detected of 'map' loop, try to wrap 'Rector.map' in any parent element."
      );

    const children = Array.from(parent.childNodes);
    const startIndex = children.indexOf(firstChild);
    const oldNodes = children.slice(startIndex, startIndex + oldList.length);

    const keyExtractor = utl.keyExtractor || ((_, i) => i);

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
      } else {
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

  private reRender(stateName: string, oldValue: any, scope: string) {
    const stateFullElements = this.stateUsageMap[scope]?.[stateName];

    if (stateFullElements) {
      for (let sfe of stateFullElements) {
        const { parsedStr: updatedStateExpression } = this.parseStateVars(
          sfe.rawString,
          sfe.scope
        );
        sfe.element.childNodes[sfe.pos].nodeValue = updatedStateExpression;
      }
    }

    const blocks = this.stateBlocks[scope]?.[stateName];

    if (blocks) {
      const expVals = [];
      const uniqExps = new Set();
      for (let utl of blocks) {
        if (utl.expType === "if") {
          const exec = this.updateIfBlock(utl);
          if (exec && !uniqExps.has(exec.exp)) {
            expVals.push({ ...exec, scope: utl.scope });
            uniqExps.add(exec.exp);
          }
        }

        if (utl.expType === "map") {
          utl.scope = scope;
          this.updateLoopBlock(utl, stateName, oldValue);
        }
      }

      expVals.forEach(({ exp, val, scope }) => {
        this.exprPrevValue[scope][exp] = val;
      });
    }
  }

  private checkStateExist(stateName: string, scope: string) {
    if (stateName.startsWith("$")) {
      // @ts-ignore
      if (!Object.hasOwn(this.State[GLOBAL], stateName.slice(1))) {
        throw new RectorError(
          `Global State '${stateName}' is not declared in the App.`
        );
      }
    } else {
      // @ts-ignore
      if (!Object.hasOwn(this.State[scope], stateName)) {
        throw new RectorError(
          `State '${stateName}' is not declared in this Component.`
        );
      }
    }
  }

  private validateExpression(
    expr: string,
    uniqueIdentifiers: string[],
    scope: string
  ) {
    const dynamicExpr = expr.replace(/(['"`])(?:\\\1|.)*?\1/g, ""); // removes content inside '', "", or ``
    const assignmentPattern = /[^=!<>]=[^=]/;

    if (assignmentPattern.test(dynamicExpr)) {
      throw new RectorError(
        `Invalid condition: assignment opration (=) is not allowed as expression.`
      );
    }

    uniqueIdentifiers.forEach((idf) => {
      if (reservedJSKeys.has(idf)) {
        throw new RectorError(
          `Invalid token: '${idf}', Can not use global objects or JS keywords in inline expression`
        );
      }

      this.checkStateExist(idf, scope);
    });
  }

  private parseStateVars(str: string, scope: string) {
    let matchStr: string[] | null = null;
    let isPsDefined = true;
    let parsedStr = str.replace(/{{\s*([^}]+)\s*}}/g, (_, keyExpression) => {
      keyExpression = keyExpression?.trim();

      if (keyExpression) {
        matchStr = this.extractStateKeys(keyExpression);
        let globalState = {};
        matchStr.forEach((m) => {
          if (m.startsWith("$")) {
            globalState[m] = this.State[GLOBAL][m.slice(1)];
          }
        });
        this.validateExpression(keyExpression, matchStr, scope);

        try {
          const fn = new Function(
            "State",
            `with(State) {return ${keyExpression}}`
          );
          return fn({ ...this.State[scope], ...globalState });
        } catch (error) {
          throw new RectorError(error?.message);
        }
      } else {
        isPsDefined = false;
      }
    });

    return { parsedStr: isPsDefined ? parsedStr : "", matchStr };
  }

  private extractStateKeys(expr: string) {
    const dynamicExpr = expr.trim().replace(/(['"`])(?:\\\1|.)*?\1/g, "");

    const matches = [
      ...dynamicExpr.matchAll(/(?:^|[^.\w$])([$a-zA-Z_][$\w]*)/g),
    ];

    const identifiers = matches.map((m) => m[1]);

    return [...new Set(identifiers)];
  }

  private createElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attributes: Attrs<K>
  ): HTMLElementTagNameMap[K] {
    const elem = document.createElement(tag);
    const children = attributes.children;

    Object.entries(attributes).forEach(([key, value]) => {
      let val = value as any;
      if (key !== "children") {
        if (key.startsWith("on") && typeof val === "function") {
          elem.addEventListener(key.slice(2), val);
        } else {
          if (key === "checked") {
            // @ts-ignore
            elem.checked = value;
          } else if (key.trim() === "ref") {
            this.refs[val] = elem;
          } else if (key === "className") {
            elem.setAttribute("class", val);
          } else {
            elem.setAttribute(key, val);
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
    const SCOPE = this.activeScope();
    for (let [idx, child] of children.entries()) {
      if (
        typeof child === "function" ||
        this.isPlainObject(child) ||
        Array.isArray(child)
      ) {
        throw new RectorError(
          "Functions, Objects and Arrays are not allowed as children"
        );
      }

      if (typeof child === "string") {
        const childStr = child as string;
        let splittedStr = childStr
          .split(/({{\s*[^}]+\s*}})/)
          .filter((s) => s !== "");

        for (let [idv, vl] of splittedStr.entries()) {
          let { parsedStr, matchStr } = this.parseStateVars(vl, SCOPE);

          if (matchStr) {
            for (let stateName of matchStr) {
              let crrScope = SCOPE;

              if (stateName.startsWith("$")) {
                stateName = stateName.slice(1);
                crrScope = GLOBAL;
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

  private isValidKeyPair(str: string) {
    const index = str.indexOf("=");
    return (
      index > 0 && index < str.length - 1 && index === str.lastIndexOf("=")
    );
  }

  public print(showValues?: false) {
    if (showValues) {
      console.log(
        "States: ",
        this.State,
        "\nState Blocks: ",
        this.stateBlocks,
        "\nState usage map: ",
        this.stateUsageMap,
        "\nExpressions: ",
        this.exprPrevValue
      );
    }

    console.log(
      "States: ",
      estimateObjectSize(this.State),
      "\nState Blocks: ",
      estimateObjectSize(this.stateBlocks),
      "\nState usage map: ",
      estimateObjectSize(this.stateUsageMap),
      "\nOther: ",
      estimateObjectSize(
        this.exprPrevValue,
        this.effects,
        this.events,
        this.refs
      )
    );
  }

  private isPlainObject(obj: any): boolean {
    return (
      typeof obj === "object" && obj !== null && obj.constructor === Object
    );
  }

  // fragment(...children: HTMLElement[]) {
  //   const fragment = document.createDocumentFragment();

  //   children.forEach((child) => {
  //     fragment.appendChild(child);
  //   });

  //   return fragment;
  // }
}

export const Rector = new RectorJS();
export const initState: typeof Rector.initState = Rector.initState.bind(Rector);
export const initGlobalState: typeof Rector.initGlobalState =
  Rector.initGlobalState.bind(Rector);
export const globalState = Rector.globalState;
export const setEffect: typeof Rector.setEffect = Rector.setEffect.bind(Rector);
export const Layout: typeof Rector.Layout = Rector.Layout.bind(Rector);
export const Routes: typeof Rector.Routes = Rector.Routes.bind(Rector);
export const ProtectedRoutes: typeof Rector.ProtectedRoutes =
  Rector.ProtectedRoutes.bind(Rector);
export const Elements = Rector.elements;
export const RectorMap: typeof Rector.map = Rector.map.bind(Rector);

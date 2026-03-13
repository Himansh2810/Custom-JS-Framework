import { RectorError } from "./error.js";
import { Route, RouteKeyPair, RouteConfig, RectorJSX } from "./types.js";

class RectorNavigation {
  private routerParams: { [key: string]: string } = {};
  private routes: { [path: string]: Route } = {};

  private layoutId = 1;

  public layouts: {
    [id: string]: (Child: () => RectorJSX.Element) => HTMLElement;
  } = {};

  public activeLayout: { [lid: number]: { range: Range; blockId: string } } =
    null;

  public currentLayout: number | number[];

  private NotFoundPage: Route;

  private routeRegexCache: {
    [path: string]: {
      regex: RegExp;
      paramNames: string[];
    };
  } = {};

  constructor() {}

  public getRouterParams() {
    return this.routerParams;
  }

  public resetRouterParams() {
    this.routerParams = {};
  }

  public getQueryParams() {
    const urlSearchParams = new URLSearchParams(window.location.search);
    const params = Object.fromEntries(urlSearchParams.entries());
    return params;
  }

  public getHash() {
    return window.location.hash.slice(1);
  }

  public normalizePath(path: string) {
    if (path === "/") return "/";
    return path.replace(/\/+$/, ""); // remove all trailing slashes
  }

  private checkRouteLayout(
    path: string,
    route: RouteConfig,
    parentLayoutId?: number | number[],
  ) {
    if (route?.layout && route?.children) {
      this.configureLayout(path, route, parentLayoutId);
    } else if (route?.component) {
      this.buildRouteRegex(path);
      this.routes[path] = {
        component: route?.component,
        config: route?.config,
        middleware: route?.middleware,
        loading: route?.loading,
        ...(parentLayoutId ? { lid: parentLayoutId } : {}),
      };
    } else {
      throw new RectorError(
        "[Rector.Navigation.Error]: Component is required for routes, please provide valid Route Config.",
      );
    }
  }

  private buildRouteRegex(path: string) {
    const paramNames: string[] = [];
    const regexPath = path.replace(/:([^/]+)/g, (_, key) => {
      paramNames.push(key);
      return "([^/]+)";
    });
    this.routeRegexCache[path] = {
      regex: new RegExp(`^${regexPath}$`),
      paramNames,
    };
  }

  private configureRoute(path: string, route: RouteConfig) {
    path = this.normalizePath(path);

    if (!path.startsWith("/")) {
      throw new RectorError("Route path must start with '/'");
    }

    this.checkRouteLayout(path, route);
  }

  public defineRoutes(routes: RouteKeyPair) {
    Object.entries(routes).forEach(([path, route]) => {
      if (path === "*") {
        if (!route?.component)
          throw new RectorError(
            "Component Not provided for wildcard route '*'",
          );
        this.NotFoundPage = {
          component: route.component,
          config: route?.config,
        };
      } else {
        this.configureRoute(path, route);
      }
    });
  }

  private configureLayout(
    path: string,
    route: RouteConfig,
    parentLayoutId?: number | number[],
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
        path === "/" ? pathKey : path + pathKey,
      );

      this.checkRouteLayout(newPath, routeValue, lid);
    });

    this.layouts[id] = route?.layout;
  }

  public resolveRoute(path: string) {
    let route = this.routes[path];

    for (const extPath in this.routes) {
      const { regex, paramNames } = this.routeRegexCache[extPath];
      const match = path.match(regex);
      if (match) {
        paramNames.forEach((name, i) => {
          this.routerParams[name] = match[i + 1];
        });
        route = this.routes[extPath];
        break;
      }
    }

    if (!route) {
      if (this.NotFoundPage) return this.NotFoundPage;
      throw new RectorError(`INVALID ROUTE: '${path}' route is not define.`);
    }

    return route;
  }
}

const Navigation = new RectorNavigation();
export { Navigation, RectorNavigation };

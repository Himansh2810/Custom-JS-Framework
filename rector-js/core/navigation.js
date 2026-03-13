import { RectorError } from "./error.js";
class RectorNavigation {
    constructor() {
        this.routerParams = {};
        this.routes = {};
        this.layoutId = 1;
        this.layouts = {};
        this.activeLayout = null;
        this.routeRegexCache = {};
    }
    getRouterParams() {
        return this.routerParams;
    }
    resetRouterParams() {
        this.routerParams = {};
    }
    getQueryParams() {
        const urlSearchParams = new URLSearchParams(window.location.search);
        const params = Object.fromEntries(urlSearchParams.entries());
        return params;
    }
    getHash() {
        return window.location.hash.slice(1);
    }
    normalizePath(path) {
        if (path === "/")
            return "/";
        return path.replace(/\/+$/, ""); // remove all trailing slashes
    }
    checkRouteLayout(path, route, parentLayoutId) {
        if (route?.layout && route?.children) {
            this.configureLayout(path, route, parentLayoutId);
        }
        else if (route?.component) {
            this.buildRouteRegex(path);
            this.routes[path] = {
                component: route?.component,
                config: route?.config,
                middleware: route?.middleware,
                loading: route?.loading,
                ...(parentLayoutId ? { lid: parentLayoutId } : {}),
            };
        }
        else {
            throw new RectorError("[Rector.Navigation.Error]: Component is required for routes, please provide valid Route Config.");
        }
    }
    buildRouteRegex(path) {
        const paramNames = [];
        const regexPath = path.replace(/:([^/]+)/g, (_, key) => {
            paramNames.push(key);
            return "([^/]+)";
        });
        this.routeRegexCache[path] = {
            regex: new RegExp(`^${regexPath}$`),
            paramNames,
        };
    }
    configureRoute(path, route) {
        path = this.normalizePath(path);
        if (!path.startsWith("/")) {
            throw new RectorError("Route path must start with '/'");
        }
        this.checkRouteLayout(path, route);
    }
    defineRoutes(routes) {
        Object.entries(routes).forEach(([path, route]) => {
            if (path === "*") {
                if (!route?.component)
                    throw new RectorError("Component Not provided for wildcard route '*'");
                this.NotFoundPage = {
                    component: route.component,
                    config: route?.config,
                };
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
        Object.entries(route?.children).forEach(([pathKey, routeValue]) => {
            const newPath = this.normalizePath(path === "/" ? pathKey : path + pathKey);
            this.checkRouteLayout(newPath, routeValue, lid);
        });
        this.layouts[id] = route?.layout;
    }
    resolveRoute(path) {
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
            if (this.NotFoundPage)
                return this.NotFoundPage;
            throw new RectorError(`INVALID ROUTE: '${path}' route is not define.`);
        }
        return route;
    }
}
const Navigation = new RectorNavigation();
export { Navigation, RectorNavigation };

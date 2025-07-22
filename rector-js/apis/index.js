var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class RectorQuery {
    constructor() {
        this.cache = {};
        this.GETcacheDuration = 0;
        this.queryMethods = {};
        this.context = {
            get: (url, queryConfig) => __awaiter(this, void 0, void 0, function* () { }),
            post: (url, data, queryConfig) => __awaiter(this, void 0, void 0, function* () { }),
        };
    }
    setCacheDurationForGET(duration) {
        this.GETcacheDuration = duration;
    }
    configureCache(url, duration) {
        if (duration <= 0) {
            return null;
        }
    }
    isURLCached(url) {
        // @ts-ignore
        return !!Object.hasOwn(this.cache, url);
    }
    get(url, options) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const cacheDuration = options
                ? (_a = options === null || options === void 0 ? void 0 : options.cache) !== null && _a !== void 0 ? _a : this.GETcacheDuration
                : this.GETcacheDuration;
            const cacheData = this.cache[url];
            let res;
            if (cacheData && (cacheData === null || cacheData === void 0 ? void 0 : cacheData.firstFetched) - Date.now() > 0) {
                res = cacheData === null || cacheData === void 0 ? void 0 : cacheData.data;
            }
            else {
                res = yield this.context.get(url, options === null || options === void 0 ? void 0 : options.queryConfig);
                if (cacheDuration > 0) {
                    this.cache[url] = {
                        firstFetched: Date.now() + cacheDuration * 1000,
                        data: res,
                    };
                }
            }
            return res;
        });
    }
    post(url, data, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = yield this.context.post(url, data, options === null || options === void 0 ? void 0 : options.queryConfig);
            return res;
        });
    }
}
export const Query = new RectorQuery();
// import * as Comlink from "comlink";
// import { Rector } from "../core/rector";
// class ApiWorker {
//   cache = {};
//   apiId = 0;
//   apiData = {};
//   constructor() {
//     this.worker = new Worker(new URL("./api.worker.js", import.meta.url), {
//       type: "module",
//     });
//     this.api = Comlink.wrap(this.worker);
//     this.worker.addEventListener("message", (event) => {
//       if (event.data.type === "api-response") {
//         const { id, data } = event.data;
//         const callback = this.apiData[id];
//         if (!Rector.appRendering()) {
//           callback(data);
//         } else {
//           Rector.addToRenderQueue(data, callback);
//         }
//       }
//     });
//   }
//   call(url, callback, options = { cache: false }) {
//     if (options?.cache) {
//     }
//     const id = this.apiId;
//     this.apiData[id] = callback;
//     this.api.fetchData({ url, id });
//     this.apiId++;
//   }
// }
// export const RectorApi = new ApiWorker();

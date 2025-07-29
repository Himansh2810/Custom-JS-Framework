import { Rector } from "../core/rector";

class RectorQuery {
  private cache: {
    [url: string]: {
      firstFetched: number;
      data: any;
    };
  } = {};
  private GETcacheDuration = 0;

  constructor() {}

  public setCacheDurationForGET(duration: number) {
    this.GETcacheDuration = duration;
  }

  public async get(
    url: string,
    options?: {
      /** For given time data will be cached (in seconds) */
      cache?: number;
      queryConfig: any;
    }
  ) {
    const cacheDuration = options
      ? options?.cache ?? this.GETcacheDuration
      : this.GETcacheDuration;
    const cacheData = this.cache[url];

    let res;
    if (cacheData && cacheData?.firstFetched - Date.now() > 0) {
      res = cacheData?.data;
    } else {
      res = await this.context.get(url, options?.queryConfig);

      if (cacheDuration > 0) {
        this.cache[url] = {
          firstFetched: Date.now() + cacheDuration * 1000,
          data: res,
        };
      }
    }

    return res;
  }

  public async post(url: string, data: any, queryConfig?: any) {
    const res = await this.context.post(url, data, queryConfig);
    return res;
  }

  public context = {
    get: async (url: string, queryConfig?: any): Promise<any> => {},
    post: async (url: string, data: any, queryConfig?: any): Promise<any> => {},
  };
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

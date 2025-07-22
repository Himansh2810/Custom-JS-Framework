// api.worker.js
import * as Comlink from "comlink";
import axios from "axios";

const api = {
  async fetchData({ url, id }) {
    const res = await axios.get(url);
    postMessage({ type: "api-response", id, data: res.data });
  },
};

Comlink.expose(api);

import {
  Rector,
  initState,
  initGlobalState,
  setEffect,
  globalState,
  Layout,
  Routes,
  ProtectedRoutes,
  Elements,
  RectorMap,
} from "./core/rector.js";

const route = (Comp) => () => <Comp />;

export {
  Rector,
  initGlobalState,
  initState,
  setEffect,
  globalState,
  route,
  Layout,
  Routes,
  ProtectedRoutes,
  Elements,
  RectorMap,
};

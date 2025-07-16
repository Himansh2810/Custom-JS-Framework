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
  Condition,
  getComponentState,
  navigate,
  renderApp,
  useElementRef,
} from "./core/rector.js";

const route = (Comp) => () => <Comp />;

// class RJS {
//   constructor(){
//     this.navigate = Rector.navigate;
//   }
// }

// const rjs = new RJS();

// rjs.navigate();

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
  Condition,
  getComponentState,
  navigate,
  renderApp,
  useElementRef,
};

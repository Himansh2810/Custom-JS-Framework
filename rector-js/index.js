import { Rector, For, Await, Portal, state, Navigation } from "./core/rector";

import { Query } from "./apis/index.js";

const { defineRoutes, getHash, getQueryParams, getRouterParams } = Navigation;

const {
  setErrorBoundary,
  setEffect,
  navigate,
  renderApp,
  useElementRef,
  createStore,
  useGlobal,
  fromParent,
  list,
  load,
  elements: Dom,
} = Rector;

export {
  Query,
  Rector,
  state,
  setEffect,
  defineRoutes,
  Dom,
  For,
  navigate,
  renderApp,
  useElementRef,
  getQueryParams,
  getRouterParams,
  getHash,
  useGlobal,
  createStore,
  Portal,
  list,
  fromParent,
  Await,
  load,
  setErrorBoundary,
};

export default Rector;

import { Rector } from "./core/rector";

function jsx(fn, props) {
  return Rector.jsx(fn, props);
}

function jsxs(fn, props) {
  return Rector.jsx(fn, props);
}
function Fragment({ children }) {
  return Rector.fragment({ children });
}

Fragment.isRectorComponent = true;

export { Fragment, jsx, jsxs };

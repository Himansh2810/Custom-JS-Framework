import { Rector } from "./core/rector";

export function jsx(fn, props) {
  return Rector.jsx(fn, props);
}

export function jsxs(fn, props) {
  return Rector.jsx(fn, props);
}

export const Fragment = ({ children }) => Rector.fragment({ children });

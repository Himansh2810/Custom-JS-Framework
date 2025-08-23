import { Rector } from "./core/rector";

export function jsx(fn, props) {
  return Rector.jsx(fn, props);
}

export const jsxs = jsx;

export const Fragment = ({ children }) => Rector.fragment({ children });

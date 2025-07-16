import { Rector } from "./core/rector";

export function jsx(fn, props) {
  return Rector.jsx(fn, props);
}

export const jsxs = jsx;

export const Fragment = ({ children }) => {
  const container = document.createDocumentFragment();
  if (Array.isArray(children)) {
    children.forEach((child) => container.appendChild(child));
  } else if (children) {
    container.appendChild(children);
  }
  return container;
};

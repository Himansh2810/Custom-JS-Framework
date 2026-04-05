import { renderApp, defineRoutes } from "./rector-js";
import { Introduction } from "./src/docs";
import { LandingPage } from "./src/pages";

const DocsLayout = (Child) => (
  <div>
    <Child />
  </div>
);

defineRoutes({
  children: {
    "/": {
      component: LandingPage,
    },
    "/docs": {
      layout: DocsLayout,
      children: {
        "/": {
          component: Introduction,
        },
      },
    },
  },
});

renderApp();

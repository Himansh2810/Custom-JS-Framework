import {
  Rector,
  createLayoutRoutes,
  defineRoutes,
  setProtectedRoutes,
  Elements as E,
  Query,
  initState,
  Condition,
} from "./rector-js";
import { Login, SignUp } from "./src/auth/login.js";
import { Navbar, Footer } from "./src/components/Navbar.js";
import { Products, Welcome } from "./src/pages/index.js";
import NotFoundPage from "./src/components/NotFoundPage.js";
import axios from "axios";
import { ProductItem, ProductDescription } from "./src/pages/productItem.js";

Query.context = {
  get: async (url) => {
    const res = await axios.get(url);
    return res.data;
  },
  post: async (url, data) => {
    const res = await axios.post(url, data);
    return res.data;
  },
};

Rector.setErrorBoundary((error) => (
  <E.div class="text-rose-400 h-screen bg-gray-900 p-4">
    <E.div>ERROR: {error.message}</E.div>
    <E.button
      onclick={() => window.location.reload()}
      class="bg-emerald-400 px-3 py-1 text-black rounded cursor-pointer mt-4"
    >
      Refresh
    </E.button>
  </E.div>
));

const productLayoutComponent = (Child) => (
  <E.div class="bg-gray-800 min-h-[100vh]">
    <Navbar title="RectorJS" />
    <Child />
    <Footer />
  </E.div>
);

const productItemLayoutComponent = (Child) => (
  <E.div class="bg-gray-700 p-3">
    <E.div class="bg-gray-800 p-2 text-white rounded">Product Details</E.div>
    <Child />
  </E.div>
);

defineRoutes({
  "/login": Login,
  "/signup": SignUp,
  "/": {
    layout: productLayoutComponent,
    children: {
      "/": {
        component: Welcome,
        config: { documentTitle: "RectorJS | Welcome" },
      },
      "/products": {
        component: Products,
        config: { documentTitle: "RectorJS | Products" },
      },
      "/products/:id": {
        layout: productItemLayoutComponent,
        children: {
          "/": ProductItem,
          "/description": ProductDescription,
        },
      },
    },
  },
  "*": { component: NotFoundPage, config: { documentTitle: "Page Not Found" } },
});

setProtectedRoutes(["/", "/products/*"], () => {
  const accessToken = localStorage.getItem("accessToken");
  if (!accessToken) {
    Rector.navigate("/login");
    return false;
  }

  return true;
});

Rector.renderApp();

import {
  Rector,
  createLayoutRoutes,
  defineRoutes,
  setProtectedRoutes,
  Elements as E,
  Query,
} from "./rector-js";
import { Login, SignUp } from "./src/auth/login.js";
import { Navbar, Footer } from "./src/components/Navbar.js";
import { Products, Welcome } from "./src/pages/index.js";
import NotFoundPage from "./src/components/NotFoundPage.js";
import axios from "axios";

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
  <E.div class="text-rose-500 p-4">ERROR: {error.message}</E.div>
));

const ProductPageLayout = createLayoutRoutes(
  {
    "/": Welcome,
    "/products": Products,
    "/products/:id": Products,
  },
  (CurrentRoute) => (
    <E.div class="bg-gray-800 min-h-[100vh]">
      <Navbar title="RectorJS" />
      <CurrentRoute />
      <Footer />
    </E.div>
  )
);

defineRoutes({
  "/login": Login,
  "/signup": SignUp,
  "/": ProductPageLayout,
  "/*": NotFoundPage,
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

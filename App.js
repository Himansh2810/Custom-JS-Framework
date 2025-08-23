import {
  Rector,
  Layout,
  Routes,
  ProtectedRoutes,
  Elements as E,
  Query,
} from "./rector-js";
import { Login, SignUp } from "./src/auth/login.js";
import { Navbar, Footer } from "./src/components/Navbar.js";
import { Products, Welcome } from "./src/pages/index.js";
import ErrorPage from "./src/components/ErrorPage.js";
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

const ProductPageLayout = Layout(
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

Routes({
  "/login": Login,
  "/signup": SignUp,
  "/": ProductPageLayout,
  "/*": ErrorPage,
});

ProtectedRoutes({
  routes: ["/", "/products"],
  grantAccess: () => {
    const accessToken = localStorage.getItem("accessToken");
    return !!accessToken;
  },
  onFallback: () => Rector.navigate("/login"),
});

Rector.renderApp();

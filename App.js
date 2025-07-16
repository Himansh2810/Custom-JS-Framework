import {
  Rector,
  Layout,
  route,
  Routes,
  ProtectedRoutes,
  Elements as E,
} from "./rector-js";
import { Login, SignUp } from "./src/auth/login.js";
import { Navbar, Footer } from "./src/components/Navbar.js";
import { Products, Welcome } from "./src/pages/index.js";
import ErrorPage from "./src/components/ErrorPage.js";

const ProductPageLayout = Layout(
  {
    "/": route(Welcome),
    "/products": route(Products),
  },
  (CurrentRoute) => (
    <E.div class="bg-gray-800 h-[100vh]">
      <Navbar title="RectorJS" />
      <CurrentRoute />
      <Footer />
    </E.div>
  )
);

Routes({
  "/login": route(Login),
  "/signup": route(SignUp),
  "/": ProductPageLayout,
  "/*": route(ErrorPage),
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

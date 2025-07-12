import { Rector } from "../rector-js/rector.js";
import { Login, SignUp } from "../src/auth/login.js";
import { Navbar, Footer } from "../src/components/Navbar.js";
import { Products, Welcome } from "../src/pages/index.js";

const E = Rector.elements;

const ProductPageLayout = Rector.Layout(
  {
    "/": Welcome,
    "/products": Products,
  },
  (currentRoute) =>
    E.div({ class: "bg-gray-800 h-[100vh]" })(
      Navbar("RectorJS"),
      currentRoute(),
      Footer()
    )
);

Rector.Routes({
  "/login": Login,
  "/signup": SignUp,
  "/": ProductPageLayout,
});

Rector.ProtectedRoutes({
  routes: ["/", "/products"],
  grantAccess: () => {
    const accessToken = localStorage.getItem("accessToken");
    return !!accessToken;
  },
  onFallback: () => Rector.navigate("/login"),
});

Rector.renderRoot();

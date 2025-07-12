import { Rector } from "../../rector-js/rector.js";

const E = Rector.elements;

function Welcome() {
  return E.div({ class: "p-5 " })(
    E.h1({ class: "text-white text-[36px]" })(
      "Welcome to Rector Products Page"
    ),
    E.button({
      class: "mt-4 bg-sky-500 p-2 rounded-md cursor-pointer",
      onclick: () => Rector.navigate("/products"),
    })("Products >")
  );
}

export default Welcome;

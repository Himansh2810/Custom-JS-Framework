import { Rector } from "../../rector-js/rector.js";

const E = Rector.elements;

function Products() {
  return E.div({ class: "p-2" })(
    E.h1({ class: "text-white text-[36px]" })("Products")
  );
}

export default Products;

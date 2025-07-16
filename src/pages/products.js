import {
  initState,
  RectorMap,
  Elements as E,
  setEffect,
} from "../../rector-js";

function Products() {
  initState("range", [0, 1, 2]);
  return (
    <E.div class="p-2">
      <E.h1 class="text-white text-[36px]">Products</E.h1>
      <RectorMap
        stateName="range"
        render={(item) => <E.div>{item + 1}</E.div>}
      />
    </E.div>
  );
}

export default Products;

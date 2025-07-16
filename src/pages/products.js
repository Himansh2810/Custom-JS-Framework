import { initState, RectorMap, Elements as E } from "../../rector-js";

function Products() {
  initState("range", [0, 1, 2]);
  return (
    <E.div class="p-2">
      <E.h1 class="text-white text-[36px]">Products</E.h1>
      {/* <RectorMap stateName="range" render={(item) => <div>{item + 1}</div>} /> */}
      {RectorMap({
        stateName: "range",
        render: (item) => <div>{item + 1}</div>,
      })}
    </E.div>
  );
}

export default Products;

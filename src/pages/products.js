import {
  initState,
  RectorMap,
  Elements as E,
  Condition,
  Query,
  setEffect,
} from "../../rector-js";

function Products() {
  const setLoading = initState("loading", true);
  const setProducts = initState("products", []);
  const apiCaller = initState("caller", true);

  setEffect(async () => {
    // const data = await Query.get("https://fakestoreapi.com/products", {
    //   cache: 30,
    // });
    const data = [{ title: "Soap", price: 139 }];
    setProducts(data);
    setLoading(false);
  }, ["caller"]);

  return (
    <E.div class="p-2">
      <E.div class="flex justify-between items-center mb-4">
        <E.h1 class="text-white text-[36px] px-2  border-b-2 w-fit rounded-b-md border-sky-600">
          Products [[$list.length]]
        </E.h1>
        <E.button
          onclick={() => apiCaller((prev) => !prev)}
          class="bg-blue-500 p-2"
        >
          Refresh
        </E.button>
      </E.div>
      <Condition
        expression="loading"
        onTrueRender={
          <E.div class="text-white text-[24px]">Getting your products...</E.div>
        }
        onFalseRender={
          <E.div class="flex flex-wrap gap-6 p-2">
            <RectorMap
              stateName="products"
              render={(item) => <ProductCard product={item} />}
              keyExtractor={(item) => item?.id}
            />
          </E.div>
        }
      />
    </E.div>
  );
}

function ProductCard({ product }) {
  return (
    <E.div class="text-white border-t border-sky-600 rounded-tl-[12px] border-b rounded-br-[12px] p-4 w-[30%] mt-3 hover:bg-sky-800">
      <E.img
        src={product?.image}
        class="w-full h-48"
        style={"object-fit:contain;"}
      />
      <E.h1 class="text-[20px] word-break mt-2">
        <E.span class="bg-sky-900 text-[14px] capitalize px-2 py-1 rounded-full mr-2">
          {product?.category}
        </E.span>
        {product?.title}
      </E.h1>
      <E.div class="flex justify-between items-center">
        <E.h1 class="text-[36px]">{product?.price}$</E.h1>
        <E.span>{product?.rating?.rate}/5.0</E.span>
      </E.div>
    </E.div>
  );
}

export default Products;

import {
  Elements as E,
  setEffect,
  Query,
  getRouterParams,
  defineState,
  navigate,
} from "../../rector-js";

let data = {
  category: "men's clothing",
  description:
    "Your perfect pack for everyday use and walks in the forest. Stash your laptop (up to 15 inches) in the padded sleeve, your everyday",
  id: 1,
  image: "https://fakestoreapi.com/img/81fPKd-2AYL._AC_SL1500_t.png",
  price: 109.95,
  rating: {
    rate: 3.9,
    count: 120,
  },
  title: "Fjallraven - Foldsack No. 1 Backpack, Fits 15 Laptops",
};

function ProductItem() {
  const { id: productId } = getRouterParams();

  const setProduct = defineState("product", {});

  setEffect(async () => {
    setProduct(data);
  });

  return (
    <E.div class="text-white border-t border-sky-600 rounded-tl-[12px] border-b rounded-br-[12px] p-4 w-[30%] mt-3 hover:bg-sky-800">
      <E.img
        src={{ _: "product.image" }}
        class="mb-3"
        style={{ objectFit: "cover", height: "150px", width: "150px" }}
        alt="product"
      />
      <E.button
        class="bg-amber-700 p-1"
        onclick={() => navigate(`/products/${productId}/description`)}
      >
        Description
      </E.button>
      <E.h1 class="text-[20px] word-break mt-2">
        <E.span class="bg-sky-900 text-[14px] capitalize px-2 py-1 rounded-full mr-2">
          [[product.category]]
        </E.span>
        [[product.title]]
      </E.h1>
      <E.div class="flex justify-between items-center">
        <E.h1 class="text-[36px]">[[product.price]]$</E.h1>
        <E.span>[[product.rating?.rate]]/5.0</E.span>
      </E.div>
    </E.div>
  );
}

function ProductDescription() {
  const { id: productId } = getRouterParams();

  const setProductDesc = defineState("productDesc", "");

  setEffect(async () => {
    // let data = await Query.get(
    //   `https://fakestoreapi.com/products/${productId}`,
    //   {
    //     cache: 60,
    //   }
    // );

    setProductDesc(data?.description);
  });

  return (
    <E.div class="text-white border-t border-sky-600 rounded-tl-[12px] border-b rounded-br-[12px] p-4 w-[30%] mt-3 hover:bg-sky-800">
      <E.h1 class="text-[20px] word-break mt-2">[[productDesc]]</E.h1>
    </E.div>
  );
}

export { ProductDescription, ProductItem };

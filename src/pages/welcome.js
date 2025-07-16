import {
  Rector,
  Elements as E,
  initState,
  setEffect,
  useElementRef,
} from "../../rector-js";

function Welcome() {
  const divRefs = useElementRef("div");
  const setCount = initState("count", 3);

  setEffect(() => {
    const x = divRefs.state_div.textContent;
    console.log("x: ", x);
  }, ["count"]);

  return (
    <E.div class="p-5">
      <E.h1 class="text-white text-[36px]" ref="head">
        Welcome to Rector Products Page
      </E.h1>

      <E.div ref="state_div" class="text-[28px] text-white">
        <state expr="count" />
      </E.div>

      <E.button
        class="mt-4 bg-sky-500 p-2 rounded-md cursor-pointer"
        onclick={() => setCount((prev) => prev + 1)}
      >
        Increment
      </E.button>

      <E.button
        class="mt-4 block bg-sky-500 p-2 rounded-md cursor-pointer"
        onclick={() => Rector.navigate("/products")}
      >
        Products &gt;
      </E.button>
    </E.div>
  );
}

export default Welcome;

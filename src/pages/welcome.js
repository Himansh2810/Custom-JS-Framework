import {
  Rector,
  Elements as E,
  initState,
  setEffect,
  useElementRef,
  initGlobalState,
  globalState,
  Condition,
  RectorMap,
} from "../../rector-js";

const setList = initGlobalState("list", [1, 2, 3, 4, 5]);

function TrueRender() {
  return (
    <E.div class="text-[28px] text-white">
      [[ShowCount.greet + Welcome.count]] from True
    </E.div>
  );
}

function ShowCount() {
  initState("greet", "hey greet");

  return (
    <E.div class="text-[28px] text-white flex flex-col">
      <E.span>[[Welcome.count]]</E.span>
      <Condition
        expression="Welcome.count > 4"
        onTrueRender={<TrueRender />}
        onFalseRender={<E.span>[[greet]]</E.span>}
      />
      <E.div>
        <RectorMap
          stateName="$.list"
          render={(item) => <E.span>{item}</E.span>}
        />
      </E.div>
    </E.div>
  );
}

function Welcome() {
  const setCount = initState("count", 3);

  setEffect(() => {
    setList((prev) => [...prev, 6]);
  }, ["count"]);

  return (
    <E.div class="p-5">
      <E.h1 class="text-white text-[36px]" ref="head">
        Welcome to Rector Products Page
      </E.h1>

      <E.span class="text-white text-xl block">
        List length + count: [[ count + $.list.length]]
      </E.span>
      <ShowCount />

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

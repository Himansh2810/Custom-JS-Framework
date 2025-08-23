import {
  navigate,
  Elements as E,
  initState,
  Condition,
  RectorMap,
  setEffect,
} from "../../rector-js";

const fruitcolormap = {
  Apple: "coral",
  Mango: "orange",
  Watermelon: "green",
};

function MapCard({ item }) {
  return (
    <E.div class="p-3" style={{ backgroundColor: fruitcolormap[item] }}>
      {item}[[Welcome.count]][[Test.test1]]
    </E.div>
  );
}

function Test() {
  initState("test1", "THE TEST");
  return (
    <>
      <E.div>[[test1]]</E.div>
      <E.div>[[Welcome.count]]</E.div>
      <E.div class="flex gap-3">
        <Condition
          expression="Welcome.count >= 0"
          onTrueRender={() => (
            <RectorMap
              stateName="Welcome.list"
              render={(item) => <MapCard item={item} />}
            />
          )}
        />
      </E.div>
    </>
  );
}

function Welcome() {
  const setshow = initState("show", true);
  const setcount = initState("count", 0);
  const setList = initState("list", ["Apple"]);

  // setEffect(() => {
  //   setTimeout(() => {
  //     setList((prev) => [...prev, "Mango", "Watermelon"]);
  //   }, 4000);
  // });

  return (
    <E.div class="p-5">
      <E.h1 class="text-white text-[36px]" ref="head">
        Welcome to Rector Products Page
      </E.h1>

      <Condition expression="show" onTrueRender={() => <Test />} />
      <Test />
      <E.button
        class="mt-4 block bg-sky-500 p-2 rounded-md cursor-pointer"
        onclick={() => setshow((prev) => !prev)}
      >
        Change Show
      </E.button>
      <E.button
        class="mt-4 block bg-sky-500 p-2 rounded-md cursor-pointer"
        onclick={() => setcount((prev) => prev + 1)}
      >
        Change count
      </E.button>
      <E.button
        class="mt-4 block bg-sky-500 p-2 rounded-md cursor-pointer"
        onclick={() => navigate("/products")}
      >
        Products &gt;
      </E.button>
      <E.button
        class="mt-4 block bg-sky-500 p-2 rounded-md cursor-pointer"
        onclick={() => navigate("/products/1")}
      >
        First product &gt;
      </E.button>
    </E.div>
  );
}

export default Welcome;

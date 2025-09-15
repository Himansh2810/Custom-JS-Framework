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
  Lemon: "yellow",
};

const staticCards = ["Watermelon", "Lemon"];

function MapCard({ item }) {
  return (
    <E.div class="p-3" style={{ backgroundColor: fruitcolormap[item] }}>
      {item}
    </E.div>
  );
}

function Test() {
  initState("test1", "THE TEST");

  setEffect(() => {
    console.log("Effect run in Test component:)");
  }, ["Welcome.count"]);

  return (
    <>
      <E.div>[[test1]]</E.div>
      <E.div class="text-white">Count:[[Welcome.count]]</E.div>
      <E.div class="flex gap-3">
        <E.span>0</E.span>
        <Condition
          expression="Welcome.count <= 0"
          onTrueRender={() => (
            // <E.div>
            <RectorMap
              data="Welcome.list"
              render={(item) => <MapCard item={item} />}
            />
            // </E.div>
          )}
        />

        {staticCards.map((item) => (
          <MapCard item={item} />
        ))}

        <E.span>1</E.span>
      </E.div>
    </>
  );
}

function Welcome() {
  const setshow = initState("show", true);
  const setcount = initState("count", 0);
  const setList = initState("list", ["Mango", "Apple"]);

  // "Apple", "Mango", "Watermelon"

  // setEffect(() => {
  //   setTimeout(() => {
  //     setList((prev) => [...prev, "Mango", "Watermelon"]);
  //   }, 4000);
  // });

  return (
    <E.div class="p-5">
      <E.p class="text-white text-[36px]" ref="head">
        Welcome to Rector Products Page
      </E.p>

      <Condition expression="show" onTrueRender={() => <Test />} />
      {/* <Test /> */}
      <E.button
        class="mt-4 block bg-sky-500 p-2 rounded-md cursor-pointer"
        onclick={() => setshow((prev) => !prev)}
      >
        Change Show
      </E.button>

      <E.button
        class="mt-4 block bg-sky-500 p-2 rounded-md cursor-pointer"
        onclick={() => setList((prev) => [...prev, "Lemon"])}
      >
        Change List
      </E.button>

      <E.button
        class="mt-4 block bg-sky-500 p-2 rounded-md cursor-pointer"
        onclick={() => setList([])}
      >
        Empty List
      </E.button>
      <E.button
        class="mt-4 block bg-sky-500 p-2 rounded-md cursor-pointer"
        onclick={() => setcount((prev) => prev + 1)}
      >
        Inc count
      </E.button>
      <E.button
        class="mt-4 block bg-sky-500 p-2 rounded-md cursor-pointer"
        onclick={() => setcount((prev) => prev - 1)}
      >
        Dec count
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

// nav.defineRoutes([
//   {
//     path: "/",
//     component: App,
//   },
//   {
//     path: "/home",
//     layout: (CrrRoute) => (
//       <>
//         <Navbar />
//         <CrrRoute />
//         <Footer />
//       </>
//     ),
//     children: [
//       { path: "", component: Home },
//       { path: "/about", component: About },
//     ],
//   },
//   {
//     path: "/*",
//     component: Fallback,
//   },
// ]);

// nav.defineRoutes({
//   "/": App,
//   "/home": {
//     layout: (CrrRoute) => (
//       <>
//         <Navbar />
//         <CrrRoute />
//         <Footer />
//       </>
//     ),
//     children: {
//       "": Home,
//       "/about": About,
//     },
//   },
//   "/*": Fallback,
// });

// HomeLayout = Layout({
//     "":Home,
//     "/about":About
//   }, (CrrRoute) => (
//     <>
//       <Navbar />
//       <CrrRoute />
//       <Footer />
//     </>
//   ));

import {
  Rector,
  defineRoutes,
  Dom as E,
  Query,
  defineState,
  getRouterParams,
  For,
  setEffect,
  createGlobalStore,
  defineList,
  useGlobal,
  useStateOf,
  useElementRef,
  Portal,
  useParentState,
} from "./rector-js";

import { Login } from "./src/auth/login.js";
import NotFoundPage from "./src/components/NotFoundPage.js";
// import { Navbar, Footer } from "./src/components/Navbar.js";
// import { Products, Welcome } from "./src/pages/index.js";
// import NotFoundPage from "./src/components/NotFoundPage.js";
// import axios from "axios";
// import { ProductItem, ProductDescription } from "./src/pages/productItem.js";

// Query.context = {
//   get: async (url) => {
//     const res = await axios.get(url);
//     return res.data;
//   },
//   post: async (url, data) => {
//     const res = await axios.post(url, data);
//     return res.data;
//   },
// };

// function Home({ display, onLoad = () => {} }) {
//   const { user } = Rector.useStateOf("MyComp");
//   const fullName = (name, l) => "Black " + name + "::" + l;
//   return (
//     <>
//       <E.div>Home:{fullName(user.name, display.length)}</E.div>
//       <E.p>Loader: {user.name + onLoad("true")}</E.p>
//     </>
//   );
// }

Rector.setElementInterceptors({
  button: (el) => el.classList.add("cursor-pointer", "block"),
});

Rector.setErrorBoundary(({ error }) => (
  <E.div class="text-rose-400 h-screen bg-gray-900 p-4">
    <E.div>ERROR: {error.message}</E.div>
    <E.button
      onclick={() => window.location.reload()}
      class="bg-emerald-400 px-3 py-1 text-black rounded cursor-pointer mt-4"
    >
      Refresh
    </E.button>
  </E.div>
));

const delay = async (sec) =>
  new Promise((res) => {
    setTimeout(() => res("After mount!!"), sec);
    // res("After mount!!");
  });

const asyncFun = async () => {
  const x = await delay();
  console.log("::", x);
};

const store = createGlobalStore({
  count: 1,
  books: Rector.list([]),
  profile: {
    user: { name: "john" },
    token: "66fhfu898d",
    timeout: 234,
  },
});

function Welcome() {
  const { books } = useGlobal(store);

  const { count } = useStateOf("MyComp");
  const age = defineState(18);

  return (
    <E.div class="bg-sky-600 p-2">
      <E.p>Welcome to RectorJS {books.value.length}</E.p>
      <E.div>
        {count.value} : {age.value}
      </E.div>
      <E.button
        class="m-2 p-2 bg-blue-600"
        onclick={() => count.set((prev) => prev + 1)}
      >
        Count ++
      </E.button>
      <E.button
        class="m-2 p-2 bg-blue-600"
        onclick={() => {
          age.set((prev) => prev + 1);
          books.push(1);
        }}
      >
        Age ++
      </E.button>
    </E.div>
  );
}

const debounce = (fn, delay) => {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
};

function MyComp() {
  const count = defineState(1, "count");
  const tempList = defineList(["a", "b", "c"]);

  const users = defineState([{ name: "Alice", id: 1 }]);
  const filteredUsers = defineState([]);

  const handleSearch = (e) => {
    const searchTerm = e.target.value;
    const filtered = users.value.filter((u) => u.name.includes(searchTerm));
    console.log("filtered: ", filtered);
    filteredUsers.set(filtered);
  };

  setEffect(() => {
    filteredUsers.set(users.value);
  }, [users]);

  const divRef = useElementRef("div"); // THINK OF REMPVELA

  setEffect(
    () => {
      console.log(":::", divRef);
    },
    [count],
    { phase: "layout" },
  );

  const show = defineState(false, "show");

  return (
    <E.div class="bg-gray-900 p-3 h-screen text-white">
      <E.input
        class="block border border-gray-200 mb-4 py-2"
        oninput={debounce(handleSearch, 500)}
      />

      <E.div style={{ backgroundColor: "orange", padding: "10px" }}>
        <For each={filteredUsers.value}>
          {(item) => (
            <E.span class="bg-cyan-500 px-4 text-xl mr-1">{item.name}</E.span>
          )}
        </For>
      </E.div>
      <E.div>
        <For each={tempList.value} keyExtractor={(item) => item}>
          {(item) => (
            <E.span class="bg-emerald-500 px-4 text-xl mr-1">{item}</E.span>
          )}
        </For>
      </E.div>
      <E.div class="mt-4">
        {count.value > 0 ? (
          <>
            <Welcome />
            <E.div ref={divRef}>DIVED Ref</E.div>
          </>
        ) : (
          <E.div ref={divRef}>
            <E.p>Loading..</E.p>
            <E.p>wait..{count.value}...</E.p>
          </E.div>
        )}
      </E.div>
      <E.div class="flex gap-2">
        <E.button class=" m-2 p-2 bg-amber-600" onclick={() => show.set(true)}>
          Show Model
        </E.button>
        <E.button class=" m-2 p-2 bg-amber-600" onclick={() => show.set(false)}>
          close Model
        </E.button>
      </E.div>
      <Portal>
        <Modal stateName="show" />
      </Portal>
      <E.button
        class=" m-2 p-2 bg-blue-600"
        onclick={() => users.set((prev) => [...prev, { id: 2, name: "Bob" }])}
      >
        Add users
      </E.button>
      <E.button
        class=" m-2 p-2 bg-blue-600"
        onclick={(e) => {
          // tempList.unshift("p", "q");
          tempList.push("w");
          // tempList.shift();
          // tempList.pop();
          // profile.set((prev) => ({ ...prev, timeout: 253 }));
        }}
      >
        Update List
      </E.button>
      <E.button
        class="m-2 p-2 bg-blue-600"
        onclick={() => count.set((prev) => prev + 1)}
      >
        Count ++
      </E.button>
      <E.button
        class=" m-2 p-2 bg-blue-600"
        onclick={() => count.set((prev) => prev - 1)}
      >
        Count --
      </E.button>
      <E.button class=" m-2 p-2 bg-blue-600" onclick={() => Rector.print(true)}>
        PRINT
      </E.button>

      <E.button
        class="m-2 p-2 bg-amber-600"
        onclick={() => Rector.navigate("/home")}
      >
        Home..
      </E.button>
    </E.div>
  );
}

function Modal({ stateName }) {
  const show = useParentState(stateName);
  return (
    <E.div>
      {show.value ? (
        <E.div class="bg-white/80  absolute top-0 left-0 bottom-0 right-0">
          <E.button
            class=" m-2 p-2 bg-blue-600"
            onclick={() => Rector.print(true)}
          >
            PRINT
          </E.button>
          <E.button
            class=" m-2 p-2 bg-rose-600"
            onclick={() => show.set(false)}
          >
            Close X
          </E.button>
          Hey
        </E.div>
      ) : null}
    </E.div>
  );
}

function Home() {
  const { books } = useGlobal(store);
  const params = getRouterParams();
  console.log("params: ", params);

  return (
    <E.div class="bg-sky-600 p-2">
      <E.p>Welcome to RectorJS {books.value.length}</E.p>
      <E.button class="m-2 p-2 bg-blue-600">Count ++</E.button>
      <E.button
        class="m-2 p-2 bg-blue-600"
        onclick={() => {
          books.push(1);
        }}
      >
        books ++
      </E.button>
    </E.div>
  );
}

const checkAuth = ({ redirect }) => {
  const accessToken = localStorage.getItem("accessToken");
  if (!accessToken) {
    redirect("/login");
  }
};

const isAlreadyLoggedIn = ({ abort }) => {
  const accessToken = localStorage.getItem("accessToken");
  if (accessToken) {
    abort();
  }
};

defineRoutes({
  "/": {
    layout: (Child) => (
      <E.div class="p-2 bg-stone-800">
        <Child />
      </E.div>
    ),
    children: {
      "/": {
        component: MyComp,
        middleware: checkAuth,
        config: {
          documentTitle: "Rector Demo",
        },
      },
      "/home": {
        component: Home,
        config: { documentTitle: "Welcome Home Bro" },
        middleware: checkAuth,
      },
      "/home/:id": {
        component: Home,
        config: { documentTitle: "Welcome Home with ID" },
        middleware: checkAuth,
      },
    },
  },
  "/login": {
    component: Login,
    middleware: isAlreadyLoggedIn,
  },
  "*": { component: NotFoundPage, config: { documentTitle: "Page Not Found" } },
});

// setMiddleware((path,context)=>{
//   if(['/','/home','/home/:id'].includes(path)){
//      checkAuth(context);
//   }

//   if(path === "/login"){
//      isAlreadyLoggedIn(context);
//   }
// })

// const productLayoutComponent = (Child) => (
//   <E.div class="bg-gray-800 min-h-[100vh]">
//     <Navbar title="RectorJS" />
//     <Child />
//     <Footer />
//   </E.div>
// );

// const productItemLayoutComponent = (Child) => (
//   <E.div class="bg-gray-700 p-3">
//     <E.div class="bg-gray-800 p-2 text-white rounded">Product Details</E.div>
//     <Child />
//   </E.div>
// );

// defineRoutes({
//   "/login": Login,
//   "/signup": SignUp,
//   "/": {
//     layout: productLayoutComponent,
//     children: {
//       "/": {
//         component: Welcome,
//         config: { documentTitle: "RectorJS | Welcome" },
//       },
//       "/products": {
//         component: Products,
//         config: { documentTitle: "RectorJS | Products" },
//       },
//       "/products/:id": {
//         layout: productItemLayoutComponent,
//         children: {
//           "/": ProductItem,
//           "/description": ProductDescription,
//         },
//       },
//     },
//   },
//   "*": { component: NotFoundPage, config: { documentTitle: "Page Not Found" } },
// });

// setProtectedRoutes(["/", "/products/*"], () => {
//   const accessToken = localStorage.getItem("accessToken");
//   if (!accessToken) {
//     Rector.navigate("/login");
//     return false;
//   }

//   return true;
// });

Rector.renderApp();

// "dataaa.user.name.length + data.name.length + x(7).val + count1;"

// "o(dataa,o(user,o(name,length))) op(+) o(data,o(name,length)) op(+) o(f(x,[7]),val) op(+) count1";

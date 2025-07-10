import {
  initGlobalState,
  initState,
  Rector,
  useValue,
} from "../rector-js/rector.js";
import { Login, SignUp } from "../src/product-list/login.js";

const E = Rector.elements;

Rector.Routes({
  "/login": Login,
  "/signup": SignUp,
  "/": {
    layout: App,
    "/": Dahsboard,
    "/chat": Chat,
  },
});

function Dahsboard() {
  return E.div(
    E.h1({ class: "text-white text-[24px] m-3" })("Dashboard"),
    E.button({
      class: "bg-gray-500 p-2",
      onclick: () => Rector.navigate("/chat"),
    })("Chat >")
  );
}

function Chat() {
  return E.div(
    E.h1({ class: "text-white text-[24px] m-3" })("Chat"),
    E.button({
      class: "bg-gray-500 p-2",
      onclick: () => Rector.navigate("/"),
    })("< Back")
  );
}

function App(layoutRoute) {
  return E.div({ class: "bg-gray-800 h-[100vh]" })(
    Navbar("RectorJS"),
    layoutRoute(),
    E.footer({ class: "p-3 bg-gray-600 fixed bottom-0" })(
      "Copyright: RectorJS @2025"
    )
  );
}

Rector.renderRoot();

// initGlobalState("user", { firstname: "john" });

// const setTaskLength = initGlobalState("tasklen", 0);

function Navbar(title) {
  // Rector.component();
  // initState("user", { lastname: "ariek" });

  return E.nav({
    class: "p-3 bg-blue-300 w-full  flex justify-between items-center",
  })(
    E.h1(".text-[24px] font-medium tracking-wider", title),
    // E.h2("Welcome {{$user.firstname + '   ' + user.lastname}}"),
    E.button(".px-3 py-1 bg-gray-100 rounded-md", "Debug", {
      onclick: () => Rector.print(true),
    }),
    E.button(".px-3 py-1 bg-gray-100 rounded-md", "Login", {
      onclick: () => Rector.navigate("/login"),
    })
  );
}

// function Box() {
//   Rector.component();
//   const S = initState("show", false);
//   return E.div(
//     ".bg-gray-500 mt-4 w-[200px] h-[200px] flex flex-col items-center justify-center"
//   )(
//     E.p("{{$tasklen}}"),
//     Rector.if(
//       "show",
//       E.h1(".text-white text-[20px] font-bold", "TRUE"),
//       E.h1(".text-white text-[20px] font-bold", "FALSE")
//     ),
//     E.button(".px-3 py-1 bg-gray-100 rounded-md", "< back", {
//       onclick: () => {
//         Rector.navigate("/");
//       },
//     }),
//     E.button({
//       class: "mt-2 cursor-pointer bg-sky-500 p-1 rounded-md text-white",
//       onclick: () => {
//         S((prev) => !prev);
//       },
//     })("Change Val")
//   );
// }

// Rector.Routes({
//   "/": TodoList,
//   "/box": Box,
// });

// function App() {
//   return E.div(".bg-gray-800 h-[100vh]")(
//     Navbar("TodoList"),
//     Rector.routeComponent()
//   );
// }

// Rector.renderRoot(Rector.Layout(App), {
//   logLoadingTime: true,
// });

import { Rector } from "../../rector-js";

const E = Rector.elements;

function Navbar({ title = "" }) {
  return (
    <E.nav class="p-3 bg-blue-300 w-full  flex justify-between items-center">
      <E.h1 class="text-[24px] font-medium tracking-wider">{title}</E.h1>
      <E.button
        class="px-3 py-1 bg-gray-100 rounded-md"
        onclick={() => Rector.print(true)}
      >
        Debug
      </E.button>
      <E.button
        class="px-3 py-1 bg-gray-100 rounded-md"
        onclick={() => {
          localStorage.setItem("accessToken", "");
          Rector.navigate("/login");
        }}
      >
        Logout
      </E.button>
    </E.nav>
  );
}

const Footer = () => (
  <E.footer class="px-3 py-1 bg-sky-400 fixed bottom-0 w-full">
    @RectorJS, 2025
  </E.footer>
);

// function Footer() {
//   return (
//     <E.footer class="px-3 py-1 bg-sky-400 fixed bottom-0 w-full">
//       @RectorJS, 2025
//     </E.footer>
//   );
// }

export { Navbar, Footer };

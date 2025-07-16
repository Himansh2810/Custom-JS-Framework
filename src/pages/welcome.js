import { Rector } from "../../rector-js";

const E = Rector.elements;

function Welcome() {
  return (
    <E.div class="p-5">
      <E.h1 class="text-white text-[36px]">
        Welcome to Rector Products Page
      </E.h1>
      <E.button
        class="mt-4 bg-sky-500 p-2 rounded-md cursor-pointer"
        onclick={() => Rector.navigate("/products")}
      >
        Products &gt;
      </E.button>
    </E.div>
  );
}

export default Welcome;

import { Elements as E, navigate } from "../../rector-js";

function NotFoundPage() {
  return (
    <E.div class="bg-gray-900 text-rose-700 h-[100vh] flex flex-col items-center justify-center">
      <E.div class="flex items-end gap-5">
        <E.h1 class="text-[100px] font-bold m-0">404</E.h1>
        <E.h2 class="text-[24px] m-0 mb-7">Page not found.</E.h2>
      </E.div>
      <E.button
        class="mt-6 bg-emerald-500 hover:bg-emerald-600 cursor-pointer text-white px-4 py-2 rounded-md"
        onclick={() => navigate("/")}
      >
        Go Home &gt;
      </E.button>
    </E.div>
  );
}

export default NotFoundPage;

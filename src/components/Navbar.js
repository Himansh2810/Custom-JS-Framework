import { navigate } from "../../rector-js";

function Navbar() {
  return (
    <div className="relative w-full z-2">
      <div className="absolute top-10 left-10 rounded-full">
        <h2 className="text-[28px] font-medium flex items-center">
          <span className="block  shadow bg-amber-500 text-white pl-3 pr-1 rounded-l-[8px]">
            Rector
          </span>
          <span className="block shadow text-amber-500 bg-white p-1 rounded-r-[8px]">
            JS
          </span>
        </h2>
      </div>
      <div className="absolute top-10 right-10">
        <button
          className="bg-amber-500 text-white pl-4 pr-3 font-medium py-2 rounded-full text-[20px] font-mono cursor-pointer hover:underline"
          onClick={() => navigate("/docs")}
        >
          Docs
        </button>
      </div>
    </div>
  );
}

export { Navbar };

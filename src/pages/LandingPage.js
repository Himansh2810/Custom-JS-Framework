import { state } from "../../rector-js";

import { Navbar } from "../components";

function LandingPage() {
  return (
    <div className="">
      <Navbar />
      <div className="h-screen bg-gray-900 flex justify-center items-center">
        <div
          class="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle, #fee000ff 1.5px, transparent 1.5px)",
            backgroundSize: "60px 60px",
            opacity: 0.4,
          }}
        ></div>
        <h2 className="text-white text-[32px] mb-8 mr-4 font-mono z-1">
          Introducing <span className="text-amber-400 mx-2">RectorJS</span> to
          world !
        </h2>
      </div>
    </div>
  );
}

export default LandingPage;

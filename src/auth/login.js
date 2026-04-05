// import {
//   Rector,
//   defineGlobalState,
//   defineState,
//   globalState,
//   Elements as E,
//   componentState,
// } from "../../rector-js";
// import { isAlreadyLogin } from "../utils";

import { Rector, Dom as E, state, createStore } from "../../rector-js";
import { store } from "../store";

const LoginUtils = () => {
  const { user } = Rector.useGlobal(store);
  const loginData = state({
    username: "",
    password: "",
  });

  const errorMessage = state("");

  const handleLogin = () => {
    user.set({
      username: loginData().username,
      password: loginData().password,
    });
    if (
      loginData().username === user().username &&
      loginData().password === user().password
    ) {
      localStorage.setItem("accessToken", "RectorJS");
      Rector.navigate("/");
    } else {
      errorMessage.set("INVALID Username or Password.");
    }
  };

  return {
    loginData,
    handleLogin,
    errorMessage,
  };
};

function Login({ sache = "No" }) {
  const { handleLogin, loginData, errorMessage } = LoginUtils();

  return (
    <E.div className="bg-gray-100 p-4 flex flex-col text-gray-700">
      <E.h1>Welcome to Login {sache}</E.h1>
      <E.input
        className="p-2 border border-gray-400 m-1"
        type="text"
        placeholder="Username"
        oninput={(e) =>
          loginData.set((prev) => ({ ...prev, username: e.target.value }))
        }
      />
      <E.input
        className="p-2 border border-gray-400 m-1"
        type="password"
        placeholder="Password"
        oninput={(e) =>
          loginData.set((prev) => ({ ...prev, password: e.target.value }))
        }
      />
      <E.button className="bg-indigo-500 p-2 rounded-md" onclick={handleLogin}>
        Login
      </E.button>
      <E.button
        className="text-indigo-500 underline"
        onclick={() => Rector.navigate("/signup")}
      >
        Don't have account ? Create
      </E.button>
      <E.p className="text-rose-500">{errorMessage()}</E.p>
    </E.div>
  );
}

export default Login;
// export { Login };

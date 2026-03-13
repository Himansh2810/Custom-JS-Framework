// import {
//   Rector,
//   defineGlobalState,
//   defineState,
//   globalState,
//   Elements as E,
//   componentState,
// } from "../../rector-js";
// import { isAlreadyLogin } from "../utils";

import { Rector, Dom as E, defineState } from "../../rector-js";

const store2 = Rector.createGlobalStore({
  user: { name: "", username: "", password: "" },
});

const LoginUtils = () => {
  const { user } = Rector.useGlobal(store2);
  const loginData = defineState({
    username: "",
    password: "",
  });

  const errorMessage = defineState("");

  const handleLogin = () => {
    user.set({
      username: loginData.value.username,
      password: loginData.value.password,
    });
    if (
      loginData.value.username === user.value.username &&
      loginData.value.password === user.value.password
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

function Login() {
  const { handleLogin, loginData, errorMessage } = LoginUtils();

  return (
    <E.div className="bg-gray-100 p-4 flex flex-col">
      <E.h1>Welcome to Login</E.h1>
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
      <E.p className="text-rose-500">{errorMessage.value}</E.p>
    </E.div>
  );
}

export { Login };

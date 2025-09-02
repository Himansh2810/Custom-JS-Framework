import {
  Rector,
  initGlobalState,
  initState,
  globalState,
  Elements as E,
} from "../../rector-js";
import { isAlreadyLogin } from "../utils";

const LoginUtils = () => {
  const state = Rector.getComponentState();
  const setLoginData = initState("loginData", {
    username: "",
    password: "",
  });

  const setErrorMessage = initState("errorMes", "");

  const handleLogin = () => {
    const loginData = state.loginData;
    const user = globalState.user;
    console.log(user, loginData);

    if (
      loginData.username === user.username &&
      loginData.password === user.password
    ) {
      localStorage.setItem("accessToken", "RectorJS");
      Rector.navigate("/");
    } else {
      setErrorMessage("INVALID Username or Password.");
    }
  };

  return {
    setLoginData,
    handleLogin,
  };
};

function Login() {
  if (isAlreadyLogin()) {
    Rector.navigate("/");
    return;
  }

  const { handleLogin, setLoginData } = LoginUtils();

  return (
    <E.div className="bg-gray-100 p-4 flex flex-col">
      <E.h1>Welcome to Login</E.h1>
      <E.input
        className="p-2 border border-gray-400 m-1"
        type="text"
        placeholder="Username"
        oninput={(e) =>
          setLoginData((prev) => ({ ...prev, username: e.target.value }))
        }
      />
      <E.input
        className="p-2 border border-gray-400 m-1"
        type="password"
        placeholder="Password"
        oninput={(e) =>
          setLoginData((prev) => ({ ...prev, password: e.target.value }))
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
      <E.p className="text-rose-500">[[errorMes]]</E.p>
    </E.div>
  );
}

const setGlobUSer = initGlobalState("user", {
  name: "",
  username: "",
  password: "",
});

function SignUp() {
  if (isAlreadyLogin()) {
    Rector.navigate("/");
    return;
  }
  const setUSerData = initState("data", {
    name: "",
    username: "",
    password: "",
  });

  return (
    <E.div className="bg-gray-100 p-4 flex flex-col">
      <E.h1>Welcome to Signup</E.h1>
      <E.input
        className="p-2 border border-gray-400 m-1"
        type="text"
        placeholder="Name"
        name="name"
        oninput={(e) =>
          setUSerData((prev) => ({ ...prev, name: e.target.value }))
        }
      />
      <E.input
        className="p-2 border border-gray-400 m-1"
        type="text"
        placeholder="Username"
        name="username"
        oninput={(e) =>
          setUSerData((prev) => ({ ...prev, username: e.target.value }))
        }
      />
      <E.input
        className="p-2 border border-gray-400 m-1"
        type="password"
        placeholder="Password"
        name="password"
        oninput={(e) =>
          setUSerData((prev) => ({ ...prev, password: e.target.value }))
        }
      />
      <E.button
        className="bg-indigo-500 p-2 rounded-md"
        onclick={() => {
          setGlobUSer(state.data);
          Rector.navigate("/login");
        }}
      >
        SignUp
      </E.button>
      <E.button
        className="text-indigo-500"
        onclick={() => Rector.navigate("/login")}
      >
        Already have an account ? LOGIN
      </E.button>
    </E.div>
  );
}

export { Login, SignUp };

import { Rector, initGlobalState, initState } from "../../rector-js/rector";

const E = Rector.elements;

function Login() {
  const { state, globalState } = Rector.component();
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
      Rector.navigate("/");
    } else {
      setErrorMessage("INVALID Username or Password.");
    }
  };
  return E.div({ class: "bg-gray-100 p-4 flex flex-col" })(
    E.h1("Welcome to Login"),
    E.input({
      class: "p-2 border border-gray-400 m-1",
      name: "Username",
      placeholder: "Username",
      oninput: (e) =>
        setLoginData((prev) => ({ ...prev, username: e.target.value })),
    }),
    E.input({
      class: "border border-gray-400 p-2 m-1",
      type: "password",
      placeholder: "Password",
      oninput: (e) =>
        setLoginData((prev) => ({ ...prev, password: e.target.value })),
    }),
    E.button({
      class: "bg-indigo-500 p-2 rounded-md",
      onclick: handleLogin,
    })("Login"),
    E.button({
      class: "text-indigo-500",
      onclick: () => Rector.navigate("/signup"),
    })("Dont have account ? CREATE"),

    E.button({
      class: "text-indigo-500",
      onclick: () => Rector.navigate("/login/demo"),
    })("Demo"),

    E.p({ class: "text-rose-500" })("{{errorMes}}")
  );
}

const setGlobUSer = initGlobalState("user", {
  name: "",
  username: "",
  password: "",
});

function SignUp() {
  const { state } = Rector.component();
  const setUSerData = initState("data", {
    name: "",
    username: "",
    password: "",
  });

  return E.div({ class: "bg-gray-100 p-4 flex flex-col" })(
    E.h1("Welcome to Signup"),
    E.input({
      class: "p-2 border border-gray-400 m-1",
      name: "Name",
      placeholder: "Name",
      oninput: (e) =>
        setUSerData((prev) => ({ ...prev, name: e.target.value })),
    }),
    E.input({
      class: "p-2 border border-gray-400 m-1",
      name: "Username",
      placeholder: "Username",
      oninput: (e) =>
        setUSerData((prev) => ({ ...prev, username: e.target.value })),
    }),
    E.input({
      class: "p-2 border border-gray-400 m-1",
      type: "password",
      placeholder: "Password",
      oninput: (e) =>
        setUSerData((prev) => ({ ...prev, password: e.target.value })),
    }),
    E.button({
      class: "bg-indigo-500 p-2 rounded-md",
      onclick: () => {
        setGlobUSer(state.data);
        Rector.navigate("/login");
      },
    })("SignUp"),
    E.button({
      class: "text-indigo-500",
      onclick: () => Rector.navigate("/login"),
    })("Already have an account ? LOGIN")
  );
}

export { Login, SignUp };

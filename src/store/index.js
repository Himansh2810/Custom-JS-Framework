import { createStore, list } from "../../rector-js";

export const store = createStore({
  user: { name: "Kevin", username: "", password: "" },
  posts: list([]),
});

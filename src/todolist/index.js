import {
  initGlobalState,
  initState,
  Rector,
  setEffect,
} from "../../rector-js/rector.js";
// import { handleRemoveItem, handleToggle, handleKeyPress } from "./app-data.js";

const E = Rector.elements;

function TodoItem({ id, title, isCompleted, handleToggle, handleRemoveItem }) {
  return E.div({
    class: `flex hover:bg-slate-500 text-gray-200 ${
      isCompleted ? "line-through text-gray-400" : ""
    } text-[18px] px-4 py-3 gap-3 rounded-full mb-2`,
  })(
    E.input({
      type: "checkbox",
      class: "w-4 cursor-pointer",
      checked: isCompleted,
      onchange: () => handleToggle(id),
    }),
    E.span({ class: "font-bold" })(`${id}.`),
    E.p(`${title}`),
    E.button({
      class:
        "rounded-full bg-gray-400 text-gray-900 px-3 py-0.5 text-[15px] cursor-pointer",
      onclick: () => handleRemoveItem(id),
    })("Remove")
  );
}

// const setTasks = initGlobalState("tasks", []);

function TodoList() {
  Rector.component();

  const setTasks = initState("tasks", []);

  const setShow = initState("show", true);
  const input = Rector.useRef("my-input");

  let crrId = 1;

  const handleToggle = (id) => {
    setTasks((prev) => {
      const oldTasks = [...prev];
      const fd = oldTasks.findIndex((itm) => itm.id === id);
      if (fd + 1) {
        oldTasks[fd] = {
          ...oldTasks[fd],
          isCompleted: !oldTasks[fd].isCompleted,
        };
      }
      return oldTasks;
    });
  };

  const handleRemoveItem = (id) => {
    setTasks((prev) => {
      const oldTasks = [...prev];
      const fd = oldTasks.findIndex((itm) => itm.id === id);
      if (fd + 1) {
        oldTasks.splice(fd, 1);
      }
      return oldTasks;
    });
  };

  const handleKeyPress = (ev) => {
    if (ev.key === "Enter") {
      let title = ev.target.value;
      if (title) {
        setTasks((prev) => {
          const ptasks = [...prev];
          ptasks.push({
            id: crrId,
            title,
            isCompleted: false,
          });
          return ptasks;
        });

        crrId++;
        ev.target.value = "";
      }
    }
  };

  setEffect(
    () => {
      input.current()?.focus();
    },
    {
      runAfterRender: true,
    }
  );

  return E.div({ class: "p-3 pt-5" })(
    E.input({
      type: "text",
      class:
        "w-full text-white rounded-full px-4 py-2 bg-gray-600 mb-5 placeholder:text-gray-300",
      placeholder: "Enter task description",
      onkeydown: handleKeyPress,
      ref: "my-input",
    }),
    E.button({
      class: "px-3 py-1 bg-gray-100 rounded-md",
      onclick: () => setShow((prev) => !prev),
    })("{{ show ? 'Hide' : 'Show' }}"),

    Rector.if(
      "tasks.length > 0 && show",
      E.div({
        id: "loop",
        class: "bg-gray-600 p-3 pb-1 rounded-xl",
      })(
        Rector.map("tasks", (task) =>
          TodoItem({ ...task, handleRemoveItem, handleToggle })
        )
      )
    )
  );
}

export { TodoList };

// import { initState } from "../../rector-js/rector.js";

// const setTasks = initState("tasks", []);

// let crrId = 1;

// const handleToggle = (id) => {
//   setTasks((prev) => {
//     const oldTasks = [...prev];
//     const fd = oldTasks.findIndex((itm) => itm.id === id);
//     if (fd + 1) {
//       oldTasks[fd] = {
//         ...oldTasks[fd],
//         isCompleted: !oldTasks[fd].isCompleted,
//       };
//     }
//     return oldTasks;
//   });
// };

// const handleRemoveItem = (id) => {
//   setTasks((prev) => {
//     const oldTasks = [...prev];
//     const fd = oldTasks.findIndex((itm) => itm.id === id);
//     if (fd + 1) {
//       oldTasks.splice(fd, 1);
//     }
//     return oldTasks;
//   });
// };

// const handleKeyPress = (ev) => {
//   if (ev.key === "Enter") {
//     let title = ev.target.value;
//     if (title) {
//       setTasks((prev) => {
//         const ptasks = [...prev];
//         ptasks.push({
//           id: crrId,
//           title,
//           isCompleted: false,
//         });
//         return ptasks;
//       });

//       crrId++;
//       ev.target.value = "";
//     }
//   }
// };

// export { handleKeyPress, handleRemoveItem, handleToggle };

const LIST_MARKER = Symbol("RECTOR_LIST");
// type RectorRefs = {
//   [K in keyof HTMLElementTagNameMap]: {
//     [refName: string]: HTMLElementTagNameMap[K];
//   };
// };
export { LIST_MARKER, };
// in future
// interface GlobalAttributes {
//   id?: string;
//   class?: string;
//   style?: string;
//   title?: string;
//   hidden?: boolean;
//   children?: HTMLElement | HTMLElement[];
//   [key: string]: any; // allow data-*, aria-*
// }
// interface ElementAttributesMap {
//   div: GlobalAttributes & {
//     // no innerHTML, innerText
//   };
//   input: GlobalAttributes & {
//     type?: string;
//     name?: string;
//     value?: string;
//     placeholder?: string;
//     disabled?: boolean;
//   };
//   // Add more as needed
// }
// type Attrs<T extends keyof ElementAttributesMap> = ElementAttributesMap[T];

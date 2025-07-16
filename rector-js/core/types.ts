type Attrs<T extends keyof HTMLElementTagNameMap> = Partial<
  HTMLElementTagNameMap[T]
> & {
  /** CSS classes to apply to the element */
  class?: string;
  /** Unique reference name of the element. You can select this element later by using useElementRef. */
  ref?: string;
  children?: HTMLElement | HTMLElement[];
};

type TagName = keyof HTMLElementTagNameMap;
type RectorElements = {
  [K in TagName]: (attributes: Attrs<K>) => HTMLElement;
};

type StateUseObj = {
  element: HTMLElement;
  pos?: number;
  rawString?: string;
  scope?: string;
};

type StateUsage = {
  [scope: string]: {
    [state: string]: StateUseObj[];
  };
};

type StateBlockConfig = {
  expType: "if" | "map";
  exp?: string;
  trueElement?: HTMLElement | ChildNode;
  falseElement?: HTMLElement | ChildNode;
  renderElement?: (item, index: number) => HTMLElement;
  firstNode?: HTMLElement | ChildNode;
  parentNode?: ParentNode;
  commentRef?: Comment;
  keyExtractor?: (item: any, index: number) => string | number;
  scope?: string;
};

type StateBlocks = {
  [scope: string]: {
    [state: string]: StateBlockConfig[];
  };
};

type RectorElementRef<T extends keyof HTMLElementTagNameMap> = {
  [refName: string]: HTMLElementTagNameMap[T];
};

// type RectorRefs = {
//   [K in keyof HTMLElementTagNameMap]: {
//     [refName: string]: HTMLElementTagNameMap[K];
//   };
// };

export {
  Attrs,
  RectorElements,
  StateBlocks,
  StateBlockConfig,
  StateUsage,
  RectorElementRef,
  // RectorRefs,
};

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

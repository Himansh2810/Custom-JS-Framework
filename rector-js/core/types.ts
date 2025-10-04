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
  pos: number;
  rawExp: JSXExpressionObj;
  cmpId: string;
};

type StateUsage = {
  [state: string]: StateUseObj[];
};

type AttrUseObj = {
  element: HTMLElement;
  rawExp: JSXExpressionObj;
  attribute: string;
};

type AttrsUsage = {
  [state: string]: AttrUseObj[];
};

type StateLoopBlockConfig = {
  renderElement?: (item: any, index: number) => HTMLElement;
  firstNode?: HTMLElement | ChildNode;
  parentNode?: ParentNode;
  commentRef?: Comment;
  keyExtractor?: (item: any, index: number) => string | number;
  cmpId?: string;
  positionIndex?: number;
};

type StateIfBlockConfig = {
  exp: string;
  trueElement?: () => HTMLElement | ChildNode;
  falseElement?: () => HTMLElement | ChildNode;
  placeholder?: () => Range;
  cmpId?: string;
  blockId?: string;
};

type StateLoopBlocks = {
  [stateName: string]: string[];
};

type StateIfBlocks = {
  [scope: string]: {
    [stateName: string]: string[];
  };
};

type RectorElementRef<T extends keyof HTMLElementTagNameMap> = {
  [refName: string]: HTMLElementTagNameMap[T];
};
interface IfBlockConfig {
  rawExp: JSXExpressionObj;
  trueElement?: () => HTMLElement | ChildNode;
  falseElement?: () => HTMLElement | ChildNode;
  placeholder?: Range;
  cmpId?: string;
  childBlock?: string;
}

interface LoopBlockConfig {
  renderElement?: (item: any, index: number) => HTMLElement;
  firstNode?: HTMLElement | ChildNode;
  parentNode?: ParentNode;
  commentRef?: Comment;
  keyExtractor?: (item: any, index: number) => string | number;
  cmpId?: string;
  positionIndex?: number;
  childBlocks?: Set<string>;
  stateData?: string[];
}

type EffectFunction = () =>
  | (() => void)
  | void
  | Promise<void>
  | Promise<() => void>;

interface EffectConfig {
  [id: string]: {
    depends: boolean;
    scope: string;
    extDeps: string[];
    fn: EffectFunction;
  };
}

type ElementInterceptors = {
  [Tag in keyof HTMLElementTagNameMap]?: (
    el: HTMLElementTagNameMap[Tag]
  ) => void;
};

type ComponentElement = () => HTMLElement | ChildNode;

type RouteKeyPair = {
  [path: string]: ComponentElement | RouteConfig;
};

type MetaConfig = {
  meta?: { description?: string };
  documentTitle?: string;
};

type RouteConfig = {
  layout?: (child: ComponentElement) => HTMLElement;
  children?: RouteKeyPair;
  component?: ComponentElement;
  config?: MetaConfig;
};

type Route =
  | ComponentElement
  | {
      lid?: number | number[];
      component: ComponentElement;
      config?: MetaConfig;
    };
interface JSXExpressionObj {
  expression: string;
  vars: (string | string[])[];
}

// type RectorRefs = {
//   [K in keyof HTMLElementTagNameMap]: {
//     [refName: string]: HTMLElementTagNameMap[K];
//   };
// };

export {
  Attrs,
  EffectConfig,
  RectorElements,
  StateIfBlocks,
  StateIfBlockConfig,
  StateLoopBlocks,
  StateLoopBlockConfig,
  StateUsage,
  RectorElementRef,
  IfBlockConfig,
  LoopBlockConfig,
  ElementInterceptors,
  Route,
  RouteKeyPair,
  RouteConfig,
  JSXExpressionObj,
  MetaConfig,
  EffectFunction,
  ComponentElement,
  AttrsUsage,
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

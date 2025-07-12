type Attrs = { [key: string]: any };
type Child = HTMLElement | string | number;

type ElementFunction = (
  attributes: Attrs | HTMLElement
) => HTMLElement | ((...children: Child[]) => HTMLElement);

type TagName = keyof HTMLElementTagNameMap;
type RectorElement = {
  [K in TagName]: ElementFunction;
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

export { Attrs, RectorElement, StateBlocks, StateBlockConfig, StateUsage };

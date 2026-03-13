// your-framework/jsx-runtime.d.ts

export namespace JSX {
  interface IntrinsicElements {
    p: {
      onclick?: (e: MouseEvent) => void;
      class?: string;
    };
  }
}

type JSXX = {
  p: {
    class: string;
  };
};

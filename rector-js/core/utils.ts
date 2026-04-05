import { JSXExpressionObj, JSXConditionObj, RectorJS } from "./types";

class BiMap {
  private fwd = {};
  private bwd = {};
  constructor() {}
  set(key: string, value: string) {
    this.fwd[key] = value;
    this.bwd[value] = key;
  }

  clear() {
    this.fwd = {};
    this.bwd = {};
  }

  getByKey(key: string): string {
    return this.fwd[key];
  }

  getByVal(value: string): string {
    return this.bwd[value];
  }
}

const reservedJSKeys = new Set([
  "true",
  "false",
  "null",
  "undefined",
  "if",
  "else",
  "return",
  "for",
  "while",
  "do",
  "break",
  "continue",
  "function",
  "let",
  "const",
  "var",
  "new",
  "typeof",
  "instanceof",
  "switch",
  "case",
  "default",
  "try",
  "catch",
  "finally",
  "throw",
  "this",
  "with",
  "Math",
  "Date",
  "Array",
  "Object",
  "JSON",
  "console",
  "Number",
  "String",
  "Boolean",
  "window",
  "document",
  "Function",
  "constructor",
  "alert",
  "eval",
]);

const selfClosingTags = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

const isEqual = (a, b) => {
  const seen = new WeakMap();

  function deepEqual(x, y) {
    // Fast path for strict equality
    if (x === y) return true;

    // Handle null & undefined
    if (x == null || y == null) return x === y;

    // Handle Date
    if (x instanceof Date && y instanceof Date)
      return x.getTime() === y.getTime();

    // Handle primitive types and functions
    if (typeof x !== "object" || typeof y !== "object") return x === y;

    // Avoid circular reference infinite loops
    if (seen.has(x)) return seen.get(x) === y;
    seen.set(x, y);

    // Compare array length and object keys
    const xKeys = Object.keys(x);
    const yKeys = Object.keys(y);
    if (xKeys.length !== yKeys.length) return false;

    // Deep compare all keys
    for (const key of xKeys) {
      if (!yKeys.includes(key) || !deepEqual(x[key], y[key])) {
        return false;
      }
    }

    return true;
  }

  return deepEqual(a, b);
};

function estimateObjectSize(...args): string {
  let totalSize = 0;
  args.forEach((obj) => {
    const seen = new WeakSet();

    function sizeOf(value: any): number {
      if (value === null || value === undefined) return 0;

      const type = typeof value;

      // Primitives
      if (type === "boolean") return 4;
      if (type === "number") return 8;
      if (type === "string") return value.length * 2;
      if (type === "symbol") return 0;
      if (type === "function") return 0;

      // If already seen, skip (avoid circular references)
      if (seen.has(value)) return 0;
      seen.add(value);

      // Arrays
      if (Array.isArray(value)) {
        return value.map(sizeOf).reduce((acc, cur) => acc + cur, 0);
      }

      // Objects
      if (type === "object") {
        let size = 0;
        for (let key in value) {
          if (value.hasOwnProperty(key)) {
            size += key.length * 2; // key size (as string)
            size += sizeOf(value[key]);
          }
        }
        return size;
      }

      return 0;
    }

    totalSize += sizeOf(obj);
  });

  return `${(totalSize / 1024).toFixed(3)} KB`;
}

function isComponentFunction(
  fn: Function,
  callback: (error: string) => void,
): string | false {
  const fnSource = fn?.toString();
  const fnName = fn?.name;

  // if (
  //   fnName === "Fragment" &&
  //   (fnSource?.includes(`function Fragment(`) ||
  //     !fnSource?.includes(`Rector.fragment`))
  // ) {
  //   callback(
  //     `Restricted component name: "Fragment" is reserved for internal use (<>...</>). Please choose a different name.`
  //   );
  // }

  if (
    fnSource.trim() === "attributes => this.createElement(tag, attributes)" &&
    !fnName
  ) {
    return false;
  }

  return fnName;
}

function isPlainObject(obj: any): boolean {
  return typeof obj === "object" && obj !== null && obj.constructor === Object;
}

function isJSXExpressionObj(x: any): x is JSXExpressionObj {
  return x != null && typeof x === "object" && "eval" in x && "states" in x;
}

function isJSXConditionObj(x: any): x is JSXConditionObj {
  return (
    x != null &&
    typeof x === "object" &&
    "eval" in x &&
    "states" in x &&
    "then" in x &&
    "else" in x
  );
}

function isCamelCase(str: string) {
  return str[0] === str[0].toUpperCase();
}

const unitLessProps = new Set([
  "opacity",
  "z-index",
  "font-weight",
  "line-height",
  "zoom",
  "flex",
  "order",
]);

function styleObjectToCss(obj: { [key: string]: string | number }) {
  return (
    Object.entries(obj)
      .map(([key, value]) => {
        // convert camelCase to kebab-case
        const cssKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();

        const cssValue =
          typeof value === "number" && !unitLessProps.has(cssKey)
            ? value + "px"
            : value;

        return `${cssKey}:${cssValue}`;
      })
      .join(";") + ";"
  );
}

function removeValueFromObject(o: any, target: string) {
  if (Array.isArray(o)) {
    // remove the target value
    return o.filter((item) => item !== target);
  } else if (o && typeof o === "object") {
    for (const key in o) {
      o[key] = removeValueFromObject(o[key], target);

      // OPTIONAL: delete key if its array became empty
      if (Array.isArray(o[key]) && o[key].length === 0) {
        delete o[key];
      }
    }
  }
  return o;
}

type DynamicVars = (string | string[])[];
type StaticVars = { [name: string]: any };

const OPERATOR_IMPL = {
  // -------------------------
  // Arithmetic
  // -------------------------
  "+": (a, b) => a + b,
  "-": (a, b) => a - b,
  "*": (a, b) => a * b,
  "/": (a, b) => a / b,
  "%": (a, b) => a % b,
  "**": (a, b) => a ** b,

  // -------------------------
  // Comparison
  // -------------------------
  "<": (a, b) => a < b,
  "<=": (a, b) => a <= b,
  ">": (a, b) => a > b,
  ">=": (a, b) => a >= b,

  "==": (a, b) => a == b,
  "!=": (a, b) => a != b,
  "===": (a, b) => a === b,
  "!==": (a, b) => a !== b,

  // -------------------------
  // Bitwise
  // -------------------------
  "&": (a, b) => a & b,
  "|": (a, b) => a | b,
  "^": (a, b) => a ^ b,
  "<<": (a, b) => a << b,
  ">>": (a, b) => a >> b,
  ">>>": (a, b) => a >>> b,

  // -------------------------
  // Relational
  // -------------------------
  in: (a, b) => a in b,
  instanceof: (a, b) => a instanceof b,

  // -------------------------
  // Logical (safe ONLY when both operands are static)
  // -------------------------
  "&&": (a, b) => a && b,
  "||": (a, b) => a || b,
  "??": (a, b) => a ?? b,
};

// function parseAndEvaluateExpr(
//   exprTokens: any[],
//   states: DynamicVars,
//   vars: StaticVars
// ) {
//   // EVOLUTION //

//   let dataKeeper = {};

//   function evalExpressionTokens(
//     tokens: any[],
//     dynamicVars: DynamicVars,
//     staticVars: StaticVars
//   ) {
//     return tokens
//       .map((tok) => evalToken(tok, dynamicVars, staticVars).value)
//       .join(" ");
//   }

//   function evalToken(
//     tok,
//     dynamicVars: DynamicVars,
//     staticVars: StaticVars
//   ): { value: string; confident: boolean } {
//     switch (tok.type) {
//       case "identifier":
//         return {
//           value: resolveIdentifier(tok.value, dynamicVars, staticVars),
//           confident: true,
//         };

//       case "number":
//       case "string":
//         return {
//           value: tok.value,
//           confident: true,
//         };

//       case "operator":
//         return {
//           value: tok.value,
//           confident: true,
//         };

//       case "group":
//         return {
//           value: `(${evalExpressionTokens(
//             tok.value,
//             dynamicVars,
//             staticVars
//           )})`,
//           confident: true,
//         };

//       case "function_call": {
//         const calleeName = tok.callee.value;
//         const callee = getStaticValue(calleeName, staticVars);

//         const argStrs = tok.arguments.map((arg) =>
//           evalExpressionTokens(arg, dynamicVars, staticVars)
//         );

//         const hasDynamic = argStrs.some((a) => containsDynamic(a, dynamicVars));

//         if (hasDynamic) {
//           dataKeeper[calleeName] = callee;
//         }

//         if (typeof callee === "function" && !hasDynamic) {
//           const args = argStrs.map((a) => safeEval(a));
//           try {
//             const res = callee(...args);
//             return { value: stringifyValue(res), confident: true };
//           } catch {
//             return {
//               value: `${calleeName}(${argStrs.join(", ")})`,
//               confident: false,
//             };
//           }
//         } else {
//           // Keep symbolic
//           return {
//             value: `${calleeName}(${argStrs.join(", ")})`,
//             confident: false,
//           };
//         }
//       }

//       case "member": {
//         const objValue = evalToken(tok.object, dynamicVars, staticVars);
//         if (objValue.confident) {
//           if (isDynamic(objValue.value, dynamicVars)) {
//             // If it's dynamic — reconstruct the full expression
//             return {
//               value: `${objValue.value}${tok.optional ? "?." : "."}${
//                 tok.property.value
//               }`,
//               confident: true,
//             };
//           }
//           const resolved = safeGet(objValue.value, tok.property.value);
//           return { value: stringifyValue(resolved), confident: true };
//         } else {
//           return {
//             value: `${objValue.value}${tok.optional ? "?." : "."}${
//               tok.property.value
//             }`,
//             confident: false,
//           };
//         }
//       }

//       case "member_index": {
//         const objValue = evalToken(tok.object, dynamicVars, staticVars);
//         if (objValue.confident) {
//           if (isDynamic(objValue.value, dynamicVars)) {
//             const indexExpr = evalExpressionTokens(
//               tok.index,
//               dynamicVars,
//               staticVars
//             );
//             return {
//               value: `${objValue.value}[${indexExpr}]`,
//               confident: true,
//             };
//           }
//           const idx = safeEval(
//             evalExpressionTokens(tok.index, dynamicVars, staticVars)
//           );
//           const resolved = safeGet(objValue.value, idx);
//           return { value: stringifyValue(resolved), confident: true };
//         } else {
//           const indexExpr = evalExpressionTokens(
//             tok.index,
//             dynamicVars,
//             staticVars
//           );
//           return {
//             value: `${objValue.value}[${indexExpr}]`,
//             confident: false,
//           };
//         }
//       }

//       case "template_literal":
//         const x = tok.value
//           .map((part) => {
//             if (part.type === "string") return part.value;
//             if (part.type === "template_expr")
//               return (
//                 "${" +
//                 evalExpressionTokens(part.value, dynamicVars, staticVars) +
//                 "}"
//               );
//             return "";
//           })
//           .join("");
//         return { value: "`" + x + "`", confident: true };

//       default:
//         return { value: "", confident: true };
//     }
//   }

//   // ------------------ HELPERS ------------------

//   function resolveIdentifier(
//     name: string,
//     dynamicVars: DynamicVars,
//     staticVars: StaticVars
//   ) {
//     if (dynamicVars.includes(name)) {
//       return name;
//     } else {
//       for (let dVar of dynamicVars) {
//         if (Array.isArray(dVar) && dVar[0]?.startsWith(name)) {
//           return name;
//         }
//       }
//     }
//     const val = getStaticValue(name, staticVars);
//     return stringifyValue(val);
//   }

//   function stringifyValue(value: any) {
//     if (value === undefined) return "undefined";
//     if (value === null) return "null";
//     if (typeof value === "string") return `"${value}"`;
//     if (typeof value === "object" || typeof value === "function")
//       return tryEvalToString(value);
//     return String(value);
//   }

//   function tryEvalToString(value: any) {
//     try {
//       return safeEval(value);
//     } catch {
//       return value.toString?.() || "";
//     }
//   }

//   function getStaticValue(path: string, obj: StaticVars) {
//     try {
//       if (!obj) return undefined;
//       return path.split(".").reduce((acc, k) => acc?.[k], obj);
//     } catch {
//       return undefined;
//     }
//   }

//   function safeEval(expr: string | any) {
//     if (typeof expr === "string") {
//       try {
//         // eslint-disable-next-line no-new-func
//         return Function(`"use strict"; return (${expr});`)();
//       } catch {
//         return expr;
//       }
//     }
//     return expr;
//   }

//   function safeGet(obj, key) {
//     try {
//       if (typeof obj === "string") obj = safeEval(obj);
//       return obj?.[key];
//     } catch {
//       return undefined;
//     }
//   }

//   function isDynamic(name: string, dynamicVars: DynamicVars) {
//     if (typeof name !== "string") return false;
//     for (let dVar of dynamicVars) {
//       if (typeof dVar === "string") {
//         const isDyn = name.startsWith(dVar);
//         if (isDyn) return true;
//       } else {
//         const isDyn = name?.startsWith(dVar[0]?.split("-")[0]);
//         if (isDyn) return true;
//       }
//     }
//     return false;
//   }

//   function containsDynamic(expr: string, dynamicVars: DynamicVars) {
//     if (typeof expr !== "string") return false;

//     const testExpr = (str: string) => {
//       const regex = new RegExp(`\\b${str}\\b`);
//       return regex.test(expr) && !/['"`]/.test(expr);
//     };

//     return dynamicVars.some((v) => {
//       if (typeof v === "string") {
//         return testExpr(v);
//       } else {
//         return testExpr(v[0].split("-")[0]);
//       }
//     });
//   }

//   const expr = evalExpressionTokens(exprTokens, states, vars);

//   return { expr, dataKeeper };
// }

// function parseAndEvaluateExpr(exprTokens, dynamicVars, staticVars) {
//   // ------------------ HELPERS ------------------

//   function resolveIdentifier(name) {
//     if (dynamicVars.includes(name)) {
//       return name;
//     } else {
//       for (let dVar of dynamicVars) {
//         if (Array.isArray(dVar) && dVar[0]?.startsWith(name)) {
//           return name;
//         }
//       }
//     }
//     const val = getStaticValue(name, staticVars);
//     return stringifyValue(val);
//   }

//   function stringifyValue(value) {
//     if (value === undefined) return "undefined";
//     if (value === null) return "null";
//     if (typeof value === "string") return `"${value}"`;
//     if (typeof value === "object" || typeof value === "function")
//       return tryEvalToString(value);
//     return String(value);
//   }

//   function tryEvalToString(value) {
//     try {
//       return safeEval(value);
//     } catch {
//       return value.toString?.() || "";
//     }
//   }

//   function getStaticValue(path, obj) {
//     try {
//       if (!obj) return undefined;
//       return path.split(".").reduce((acc, k) => acc?.[k], obj);
//     } catch {
//       return undefined;
//     }
//   }

//   function safeEval(expr) {
//     if (typeof expr === "string") {
//       try {
//         // eslint-disable-next-line no-new-func
//         return Function(`"use strict"; return (${expr});`)();
//       } catch {
//         return expr;
//       }
//     }
//     return expr;
//   }

//   function safeGet(obj, key) {
//     try {
//       if (typeof obj === "string") obj = safeEval(obj);
//       return obj?.[key];
//     } catch {
//       return undefined;
//     }
//   }

//   function isDynamic(name, dynamicVars) {
//     if (typeof name !== "string") return false;
//     for (let dVar of dynamicVars) {
//       if (typeof dVar === "string") {
//         const isDyn = name.startsWith(dVar);
//         if (isDyn) return true;
//       } else {
//         const isDyn = name?.startsWith(dVar[0]?.split("-")[0]);
//         if (isDyn) return true;
//       }
//     }
//     return false;
//   }

//   function containsDynamic(expr, dynamicVars) {
//     if (typeof expr !== "string") return false;

//     const testExpr = (str) => {
//       const regex = new RegExp(`\\b${str}\\b`);
//       return regex.test(expr) && !/['"`]/.test(expr);
//     };

//     return dynamicVars.some((v) => {
//       if (typeof v === "string") {
//         return testExpr(v);
//       } else {
//         return testExpr(v[0].split("-")[0]);
//       }
//     });
//   }

//   function buildObject(mainValue, properties = []) {
//     let propVal = "";
//     properties?.forEach((prp) => {
//       if (prp[0] === "i") {
//         propVal += `${prp[2] ? "?." : "."}${prp[1]}`;
//       } else if (prp[0] === "f") {
//         //["f", "x", [[["i", "count1"]]]]
//         const argStr = prp[2].map((arg) => evalExpressionTokens(arg));

//         propVal += `${prp[3] ? "?." : "."}${prp[1]}(${argStr.join(", ")})`;
//       }
//     });
//     return `${mainValue}${propVal}`;
//   }

//   // EVOLUTION //

//   let dataKeeper = {};

//   function evalExpressionTokens(tokens) {
//     return tokens.map((tok) => evalToken(tok).value).join(" ");
//   }

//   function evalToken(tok) {
//     const key = tok[0];
//     switch (key) {
//       case "i":
//         return {
//           value: resolveIdentifier(tok[1]),
//           confident: true,
//         };

//       case "n":
//       case "s":
//         return {
//           value: tok[1],
//           confident: true,
//         };

//       case "op":
//         return {
//           value: tok[1],
//           confident: true,
//         };

//       case "g":
//         return {
//           value: `(${evalExpressionTokens(tok[1])})`,
//           confident: true,
//         };
//       //["f", "x", [[["i", "count1"]]]]
//       case "f": {
//         const calleeName = tok[1];
//         const callee = getStaticValue(calleeName, staticVars);

//         const argStrs = tok[2].map((arg) => evalExpressionTokens(arg));

//         const hasDynamic = argStrs.some((a) => containsDynamic(a, dynamicVars));

//         if (hasDynamic) {
//           dataKeeper[calleeName] = callee;
//         }

//         if (typeof callee === "function" && !hasDynamic) {
//           const args = argStrs.map((a) => safeEval(a));
//           try {
//             const res = callee(...args);
//             return { value: stringifyValue(res), confident: true };
//           } catch {
//             return {
//               value: `${calleeName}(${argStrs.join(", ")})`,
//               confident: false,
//             };
//           }
//         } else {
//           // Keep symbolic
//           return {
//             value: `${calleeName}(${argStrs.join(", ")})`,
//             confident: false,
//           };
//         }
//       }
//       // ["ob", ["f", "x", [[["i", "count1"]]]], ["i", "val", false]],
//       case "ob": {
//         const objValue = evalToken(tok[1]);
//         const properties = tok.slice(2);

//         if (objValue.confident) {
//           if (isDynamic(objValue.value, dynamicVars)) {
//             // If it's dynamic — reconstruct the full expression
//             return {
//               value: buildObject(objValue.value, properties),
//               confident: true,
//             };
//           }

//           let vval = objValue.value;

//           properties?.forEach((prp) => {
//             if (prp[0] === "i") {
//               const v = prp[2] ? vval?.[prp[1]] : vval[prp[1]];
//               vval = v;
//             } else if (prp[0] === "f") {
//               //["f", "x", [[["i", "count1"]]]]
//               const argStr = prp[2].map((arg) => evalExpressionTokens(arg));

//               const v = prp[3]
//                 ? vval?.[prp[1]].apply(vval, argStr)
//                 : vval[prp[1]].apply(vval, argStr);
//               vval = v;
//             }
//           });

//           // const resolved = safeGet(objValue.value, tok.property.value);
//           return {
//             value: stringifyValue(vval),
//             confident: true,
//           };
//         } else {
//           return {
//             value: buildObject(objValue.value, properties),
//             confident: false,
//           };
//         }
//       }

//       case "oi": {
//         const objValue = evalToken(tok[1]);
//         if (objValue.confident) {
//           if (isDynamic(objValue.value, dynamicVars)) {
//             const indexExpr = evalExpressionTokens(tok[2]);
//             return {
//               value: `${objValue.value}[${indexExpr}]`,
//               confident: true,
//             };
//           }
//           const idx = safeEval(evalExpressionTokens(tok[2]));
//           const resolved = safeGet(objValue.value, idx);
//           return { value: stringifyValue(resolved), confident: true };
//         } else {
//           const indexExpr = evalExpressionTokens(tok[2]);
//           return {
//             value: `${objValue.value}[${indexExpr}]`,
//             confident: false,
//           };
//         }
//       }

//       case "tl":
//         const x = tok[1]
//           .map((part) => {
//             if (part[0] === "s") return part[1];
//             if (part[0] === "tx")
//               return "${" + evalExpressionTokens(part[1]) + "}";
//             return "";
//           })
//           .join("");
//         return { value: "`" + x + "`", confident: true };

//       default:
//         return { value: "", confident: true };
//     }
//   }

//   const expr = evalExpressionTokens(exprTokens);

//   return { expr, dataKeeper };
// }

function parseAndEvaluateAST(
  exprTokens,
  localContext,
  dynamicContext,
  extDynamicContext,
) {
  // const dynamicVars = new Set();
  // let dataKeeper = {};
  // let staticRefs = {};

  // function storeRef(rootKey) {
  //   dataKeeper[rootKey] = localContext[rootKey];
  // }

  // ------------------ HELPERS ------------------

  function resolveIdentifier(token) {
    const [, scope, name] = token;
    switch (scope) {
      case "d":
        if (!(name in dynamicContext)) {
          throw new Error(`Undefined Keyword: '${name}' is not defined.`);
        }
        return {
          value: dynamicContext[name],
        };
      case "g":
        const value = globalThis[name];

        if (value === undefined) {
          throw new Error(`Undefined Global Keyword: "${name}" is not defined`);
        }

        return {
          value,
        };
      case "l": {
        if (!(name in localContext)) {
          throw new Error(`Undefined Keyword: '${name}' is not defined.`);
        }

        return {
          value: localContext[name],
        };
      }
      case "p": {
        return {
          value: extDynamicContext[name],
        };
      }
      case "k": {
        return {
          value: name,
        };
      }
      default:
        return { value: undefined };
    }
  }

  function reconstructObjectChain(token) {
    const [, base, ...props] = token;

    // resolve base
    let result = evalToken(base);

    for (const prop of props) {
      const [, propName, optional] = prop;

      // local evaluation
      const current = result.value;

      if (current == null) {
        if (optional) {
          result.value = undefined;
          continue;
        }
        throw new Error(`Cannot access property '${propName}' of ${current}`);
      }

      result.value = current[propName];
    }

    return result;
  }

  // function isInlineable(v) {
  //   return (
  //     v === null ||
  //     typeof v === "string" ||
  //     typeof v === "number" ||
  //     typeof v === "boolean"
  //   );
  // }

  // function toExpr(node) {
  //   if (!node.dynamic && node.value !== null) {
  //     if (isInlineable(node.value)) {
  //       return JSON.stringify(node.value);
  //     }

  //     storeRef(node.root);

  //     return node.exp;
  //   }

  //   return node?.hasOp ? `(${node.exp})` : node.exp;
  // }

  function reconstructOperator(token) {
    const [, operator, leftNode, rightNode] = token;

    const L = evalToken(leftNode);
    const R = evalToken(rightNode);
    console.log(":::", L, R);
    // const exp = `${toExpr(L)} ${operator} ${toExpr(R)}`;

    const fn = OPERATOR_IMPL[operator];
    if (!fn) {
      throw new Error(`Unsupported operator: ${operator}`);
    }

    return {
      value: fn(L.value, R.value),
    };
  }

  const UNARY_IMPL = {
    "!": (a) => !a,
    "~": (a) => ~a,
    "+": (a) => +a,
    "-": (a) => -a,
    typeof: (a) => typeof a,
    void: () => undefined,
  };
  // const UNARY_NO_SPACE = new Set(["!", "~", "+", "-"]);

  function reconstructUnary(token) {
    const [, operator, argNode] = token;

    const A = evalToken(argNode);

    const fn = UNARY_IMPL[operator];
    if (!fn) {
      throw new Error(`Unsupported unary operator: ${operator}`);
    }

    return {
      value: fn(A.value),
    };
  }

  function reconstructUpdate(token) {
    // const [, operator, argNode, prefix] = token;

    // const A = evalToken(argNode);

    return {
      value: null,
    };
  }

  function reconstructFunctionCall(token) {
    const [, calleeNode, argNodes] = token;

    const callee = evalToken(calleeNode);
    console.log("callee: ", callee);

    if (typeof callee.value !== "function") {
      throw new Error(`${callee.value} is not a function`);
    }

    // const argStrs = [];

    const argValues = argNodes?.map((argRaw) => {
      const arg = evalToken(argRaw);
      return arg.value;
    });
    console.log("argValues: ", argValues);

    // const exp = `${callee.exp}(${argStrs.join(", ")})`;

    // if (callee.receiverContext) {
    //   const value = callee.value.apply(callee.receiverContext, argValues);

    //   return { value, dynamic: false, exp, root: callee.root };
    // }

    const value = callee.value(...argValues);
    return { value };
  }

  function reconstructArrayExpression(node) {
    const [, elements] = node;

    const values = elements.map((e) => evalToken(e).value);

    return {
      value: values,
    };
  }

  function reconstructObjectExpression(node) {
    const [, props] = node;

    const objValue = {};

    for (const prop of props) {
      if (prop[0] === "sp") {
        const spread = evalToken(prop[1]);
        Object.assign(objValue, spread.value);
        continue;
      }

      const [, keyNode, valueNode, kind, computed, method, shorthand] = prop;

      const key = evalToken(keyNode);
      console.log("keyNode: ", keyNode);
      const val = evalToken(valueNode);

      objValue[key.value] = val.value;
      // if (kind === "init") {
      // }
    }

    return {
      value: objValue,
    };
  }

  function reconstructTemplateLiteral(node) {
    let valueStr = "";

    for (let i = 1; i < node.length; i++) {
      const part = node[i];

      if (part[0] === "s") {
        const str = part[1];
        valueStr += str;
        continue;
      }

      if (part[0] === "tx") {
        const exprRes = evalToken(part[1]);

        valueStr += String(exprRes.value);

        continue;
      }
    }

    return {
      value: valueStr,
    };
  }

  // EVOLUTION //

  function evalToken(token): { value: any } {
    const key = token[0];
    switch (key) {
      case "i":
        return resolveIdentifier(token);
      case "s":
        return {
          value: token[1],
        };

      case "n":
      case "b":
        return { value: token[1] };
      case "null":
        return { value: null };
      case "big":
        return {
          value: BigInt(token[1]),
        };
      case "rx": {
        const [, pattern, flags] = token;
        return {
          value: new RegExp(pattern, flags),
        };
      }
      case "this":
        return {
          value: null,
        };
      case "sp": {
        const [, argNode] = token;
        const arg = evalToken(argNode);

        return {
          value: arg.value,
        };
      }

      case "op":
        return reconstructOperator(token);
      case "oc":
        return reconstructObjectChain(token);
      case "un":
        return reconstructUnary(token);
      case "up":
        return reconstructUpdate(token);
      case "f":
        return reconstructFunctionCall(token);
      case "ar":
        return reconstructArrayExpression(token);
      case "ob":
        return reconstructObjectExpression(token);
      case "nw":
      case "ngl": {
        const [, calleeNode, argNodes] = token;

        const callee = evalToken(calleeNode);
        const args = argNodes.map((a) => evalToken(a).value);

        return {
          value: new callee.value(...args),
        };
      }

      case "tl":
        return reconstructTemplateLiteral(token);
    }
  }

  return evalToken(exprTokens);
}

function isDOMStructure(value: any) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.nodeType === "number" &&
    [1, 3, 8, 11].includes(value.nodeType)
  );
}

function isLazyChildren(value: any): value is RectorJS.AsyncComponent {
  return (
    value !== null &&
    typeof value === "object" &&
    "importFn" in value &&
    "props" in value
  );
}

const delay = (time: number) =>
  new Promise((res) => {
    setTimeout(() => res(1), time);
  });

export {
  isEqual,
  reservedJSKeys,
  selfClosingTags,
  estimateObjectSize,
  isComponentFunction,
  isPlainObject,
  isCamelCase,
  styleObjectToCss,
  removeValueFromObject,
  isJSXExpressionObj,
  isJSXConditionObj,
  parseAndEvaluateAST,
  isDOMStructure,
  isLazyChildren,
  delay,
};

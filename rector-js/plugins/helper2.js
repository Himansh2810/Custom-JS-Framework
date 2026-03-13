function extractGroup(tokens, endSymbol) {
  const group = [];
  let depth = 1;
  while (tokens.length) {
    const t = tokens.shift();
    if (t === "(" || t === "[") depth++;
    else if (t === endSymbol) depth--;
    if (depth === 0) break;
    group.push(t);
  }
  return group;
}

function splitArgs(tokens) {
  const result = [];
  let current = [],
    depth = 0;
  for (const t of tokens) {
    if (t === "(" || t === "[") depth++;
    else if (t === ")" || t === "]") depth--;
    if (t === "," && depth === 0) {
      result.push(current);
      current = [];
    } else current.push(t);
  }
  if (current.length) result.push(current);
  return result;
}

function isIdentifier(t) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(t);
}
function isNumber(t) {
  return /^[0-9.]+$/.test(t);
}
function isStringLiteral(t) {
  return /^(['"`]).*\1$/.test(t);
}
function isOperator(t) {
  return [
    "+",
    "-",
    "*",
    "/",
    "%",
    "**",
    ">",
    "<",
    ">=",
    "<=",
    "==",
    "!=",
    "!==",
    "&&",
    "||",
    "??",
    "?",
    ":",
    "===",
    ">>>",
    ">>>=",
    "<<=",
    ">>=",
  ].includes(t);
}

function parseJSExpression(expression) {
  const { valid, error } = validateExpression(expression);
  if (valid) {
    const tokens = tokenizeExpression(expression);
    return parseExpression(tokens);
  } else {
    console.error(error);
    return null;
  }
}

function validateExpression(expr) {
  const stack = [];
  const pairs = { "(": ")", "[": "]", "{": "}" };
  const openers = Object.keys(pairs);
  const closers = Object.values(pairs);

  let inQuote = null;
  let prevChar = "";

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];

    // handle string literals
    if ((ch === '"' || ch === "'" || ch === "`") && prevChar !== "\\") {
      if (inQuote === ch) {
        inQuote = null; // closing quote
      } else if (!inQuote) {
        inQuote = ch; // opening quote
      }
    }

    // skip brackets check inside quotes
    if (inQuote) {
      prevChar = ch;
      continue;
    }

    // openers
    if (openers.includes(ch)) {
      stack.push(ch);
    }
    // closers
    else if (closers.includes(ch)) {
      const last = stack.pop();
      if (pairs[last] !== ch) {
        return {
          valid: false,
          error: `Mismatched bracket near '${ch}' at ${i}`,
        };
      }
    }

    prevChar = ch;
  }

  if (inQuote) return { valid: false, error: `Unclosed quote ${inQuote}` };
  if (stack.length > 0)
    return { valid: false, error: `Unclosed bracket '${stack.at(-1)}'` };

  return { valid: true };
}

// ---------------- TOKENIZER ----------------
function tokenizeExpression(expr) {
  const tokens = [];
  let cur = "";
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    const next = expr[i + 1];

    // Handle string or template literals
    if (ch === '"' || ch === "'" || ch === "`") {
      let quote = ch;
      let str = ch;
      i++;

      let depth = 0; // For `${}` nesting in template literals
      while (i < expr.length) {
        const curCh = expr[i];
        const nextCh = expr[i + 1];

        // Handle escapes
        if (curCh === "\\") {
          str += curCh + nextCh;
          i += 2;
          continue;
        }

        // For template literals only
        if (quote === "`") {
          // Detect start of ${ expression
          if (curCh === "$" && nextCh === "{") {
            str += "${";
            i += 2;
            depth++;
            continue;
          }

          // Detect nested expression end
          if (curCh === "}" && depth > 0) {
            str += "}";
            depth--;
            i++;
            continue;
          }

          // Only close the backtick when *not inside* nested ${}
          if (curCh === "`" && depth === 0) {
            str += "`";
            i++;
            break;
          }

          str += curCh;
          i++;
          continue;
        }

        // For normal strings (" or ')
        if (curCh === quote) {
          str += quote;
          i++;
          break;
        }

        str += curCh;
        i++;
      }

      tokens.push(str);
      i--;
      continue;
    }

    // Handle numbers
    if (/[0-9]/.test(ch)) {
      cur += ch;
      if (!/[0-9.]/.test(next)) {
        tokens.push(cur);
        cur = "";
      }
      continue;
    }

    // Identifiers or keywords
    if (/[A-Za-z_$]/.test(ch)) {
      cur += ch;
      if (!/[A-Za-z0-9_$]/.test(next)) {
        tokens.push(cur);
        cur = "";
      }
      continue;
    }

    // Skip spaces
    if (/\s/.test(ch)) {
      if (cur) {
        tokens.push(cur);
        cur = "";
      }
      continue;
    }

    // Handle two-character operators (e.g. &&, ||, ??, >=, <=, ==, !=, **, ?., etc.)

    const threeCharOps = ["===", "!==", ">>>", ">>>=", "<<=", ">>="];
    const three = ch + next + expr[i + 2];
    if (threeCharOps.includes(three)) {
      tokens.push(three);
      i += 2;
      continue;
    }

    const twoCharOps = ["&&", "||", ">=", "<=", "==", "!=", "**", "?.", "??"];
    const two = ch + next;
    if (twoCharOps.includes(two)) {
      tokens.push(two);
      i++;
      continue;
    }

    // Single-char operators and symbols
    if ("+-*/%(){}[]<>=!?:.,".includes(ch)) {
      if (cur) {
        tokens.push(cur);
        cur = "";
      }
      tokens.push(ch);
      continue;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

// ---------------- PARSER ----------------
// function parseExpression(tokens) {
//   const output = [];

//   while (tokens.length) {
//     const token = tokens.shift();

//     // Handle group: ( ... )
//     if (token === "(") {
//       const inner = extractGroup(tokens, ")");
//       output.push({ type: "group", value: parseExpression(inner) });
//       continue;
//     }

//     // Handle function call: identifier (...)
//     if (isIdentifier(token) && tokens[0] === "(") {
//       tokens.shift(); // remove '('
//       const argsTokens = extractGroup(tokens, ")");
//       const args = splitArgs(argsTokens);
//       output.push({
//         type: "function_call",
//         callee: { type: "identifier", value: token },
//         arguments: args.map((arg) => parseExpression(arg)),
//       });
//       continue;
//     }

//     // Handle property access: ., ?.
//     if (token === "." || token === "?.") {
//       const prev = output.pop();
//       const next = tokens.shift();
//       if (tokens[0] === "(") {
//         tokens.shift(); // remove '('
//         const argsTokens = extractGroup(tokens, ")");
//         const args = splitArgs(argsTokens);

//         output.push({
//           type: "member",
//           object: prev,
//           property: {
//             type: "function_call",
//             callee: { type: "identifier", value: next },
//             arguments: args.map((a) => parseExpression(a)),
//           },
//           optional: token === "?.",
//         });
//       } else {
//         output.push({
//           type: "member",
//           object: prev,
//           property: { type: "identifier", value: next },
//           optional: token === "?.",
//         });
//       }

//       continue;
//     }

//     // Handle array indexing: obj[expr]
//     if (token === "[") {
//       const prev = output.pop();
//       const inner = extractGroup(tokens, "]");
//       output.push({
//         type: "member_index",
//         object: prev,
//         index: parseExpression(inner),
//       });
//       continue;
//     }

//     // Handle operators
//     if (isOperator(token)) {
//       output.push({ type: "operator", value: token });
//       continue;
//     }

//     // Identifiers / literals
//     if (isIdentifier(token)) {
//       output.push({ type: "identifier", value: token });
//       continue;
//     }
//     if (isNumber(token)) {
//       output.push({ type: "number", value: token });
//       continue;
//     }
//     if (isStringLiteral(token) && !token.startsWith("`")) {
//       output.push({ type: "string", value: token });
//       continue;
//     }

//     // --- 🧩 Handle Template Literals ---
//     if (token.startsWith("`") && token.endsWith("`")) {
//       const templateContent = token.slice(1, -1); // remove ` `
//       const parts = [];
//       let buffer = "";
//       for (let i = 0; i < templateContent.length; i++) {
//         const ch = templateContent[i];

//         // handle escaped char
//         if (ch === "\\" && i + 1 < templateContent.length) {
//           buffer += ch + templateContent[++i];
//           continue;
//         }

//         // detect ${ expression }
//         if (ch === "$" && templateContent[i + 1] === "{") {
//           if (buffer) {
//             parts.push({ type: "string", value: buffer });
//             buffer = "";
//           }
//           i += 2;
//           let depth = 1;
//           let inner = "";
//           while (i < templateContent.length && depth > 0) {
//             if (templateContent[i] === "{") depth++;
//             else if (templateContent[i] === "}") depth--;
//             if (depth > 0) inner += templateContent[i];
//             i++;
//           }

//           i--;

//           parts.push({
//             type: "template_expr",
//             value: parseJSExpression(inner.trim()), // recursive parse
//           });
//           continue;
//         }

//         buffer += ch;
//       }

//       if (buffer) parts.push({ type: "string", value: buffer });

//       output.push({
//         type: "template_literal",
//         value: parts,
//       });
//     }
//   }

//   return output;
// }

function parseExpression(tokens) {
  const out = [];

  while (tokens.length) {
    const token = tokens.shift();

    // ----------------------
    // ( ... ) → group
    // ----------------------
    if (token === "(") {
      const inner = extractGroup(tokens, ")");
      out.push(["g", parseExpression(inner)]);
      continue;
    }

    // ----------------------
    // identifier(...)
    // ----------------------
    if (isIdentifier(token) && tokens[0] === "(") {
      tokens.shift(); // remove '('
      const argsTokens = extractGroup(tokens, ")");
      const args = splitArgs(argsTokens).map((a) => parseExpression(a));
      out.push(["f", token, args]);
      continue;
    }

    // ----------------------
    // property access .  or ?.
    // ----------------------
    if (token === "." || token === "?.") {
      const prev = out.pop();
      const next = tokens.shift();

      const nextProp = [];

      if (token === "?." && next === "[") {
        const inner = extractGroup(tokens, "]");
        const idx = parseExpression(inner);
        out.push(["oi", prev, idx, true]);
        continue;
      }

      if (tokens[0] === "(") {
        tokens.shift(); // remove '('
        const argsTokens = extractGroup(tokens, ")");
        const args = splitArgs(argsTokens).map((a) => parseExpression(a));

        nextProp.push("f", next, args, token === "?.");
      } else {
        nextProp.push("i", next, token === "?.");
      }

      // Convert existing node to a "chain"
      // If previous is already chain → continue it
      if (prev && prev[0] === "ob") {
        prev.push(nextProp);
        out.push(prev);
      } else {
        // Start a new chain
        out.push([
          "ob",
          prev, // may be ["id",name] or something else
          nextProp,
        ]);
      }
      continue;
    }

    // ----------------------
    // array index: obj[expr]
    // ----------------------
    if (token === "[") {
      const prev = out.pop();
      const inner = extractGroup(tokens, "]");
      const idx = parseExpression(inner);

      out.push(["oi", prev, idx]);

      // convert to chain with index
      // if (prev && prev[0] === "chain") {
      //   prev.push(["idx", idx]);
      //   out.push(prev);
      // } else {
      //   out.push(["chain", prev, ["idx", idx]]);
      // }
      continue;
    }

    // ----------------------
    // operators
    // ----------------------
    if (isOperator(token)) {
      out.push(["op", token]);
      continue;
    }

    // ----------------------
    // identifiers / numbers / strings
    // ----------------------
    if (isIdentifier(token)) {
      out.push(["i", token]);
      continue;
    }
    if (isNumber(token)) {
      out.push(["n", token]);
      continue;
    }
    if (isStringLiteral(token) && !token.startsWith("`")) {
      out.push(["s", token]);
      continue;
    }

    // ----------------------
    // template literal
    // ----------------------
    if (token.startsWith("`") && token.endsWith("`")) {
      const templateContent = token.slice(1, -1);
      const parts = [];
      let buf = "";

      for (let i = 0; i < templateContent.length; i++) {
        const ch = templateContent[i];
        if (ch === "\\" && i + 1 < templateContent.length) {
          buf += ch + templateContent[++i];
          continue;
        }
        if (ch === "$" && templateContent[i + 1] === "{") {
          if (buf) {
            parts.push(["s", buf]);
            buf = "";
          }
          i += 2;
          let depth = 1;
          let inner = "";
          while (i < templateContent.length && depth > 0) {
            if (templateContent[i] === "{") depth++;
            else if (templateContent[i] === "}") depth--;
            if (depth > 0) inner += templateContent[i];
            i++;
          }
          i--;
          parts.push(["tx", parseJSExpression(inner.trim())]);
          continue;
        }
        buf += ch;
      }
      if (buf) parts.push(["s", buf]);

      out.push(["tl", parts]);
      continue;
    }
  }

  return out;
}

function parseAndEvaluateExpr(exprTokens, states, vars, props, imported = []) {
  // EVOLUTION //

  let dataKeeper = {};
  let propsKeeper = {};

  function evalExpressionTokens(tokens, dynamicVars, staticVars) {
    return tokens
      .map((tok) => evalToken(tok, dynamicVars, staticVars).value)
      .join(" ");
  }

  function evalToken(tok, dynamicVars, staticVars) {
    switch (tok.type) {
      case "identifier":
        return {
          value: resolveIdentifier(tok.value, dynamicVars, staticVars),
          confident: true,
        };

      case "number":
      case "string":
        return {
          value: tok.value,
          confident: true,
        };

      case "operator":
        return {
          value: tok.value,
          confident: true,
        };

      case "group":
        return {
          value: `(${evalExpressionTokens(
            tok.value,
            dynamicVars,
            staticVars,
          )})`,
          confident: true,
        };

      case "function_call": {
        const calleeName = tok.callee.value;
        if (Object.hasOwn(props, calleeName)) {
          const argStrs = tok.arguments.map((arg) =>
            evalExpressionTokens(arg, dynamicVars, staticVars),
          );

          propsKeeper[calleeName] = props[calleeName];

          return {
            value: `${calleeName}(${argStrs.join(", ")})`,
            confident: false,
          };
        }
        const callee = getStaticValue(calleeName, staticVars);

        const argStrs = tok.arguments.map((arg) =>
          evalExpressionTokens(arg, dynamicVars, staticVars),
        );

        const hasDynamic = argStrs.some((a) => containsDynamic(a, dynamicVars));

        if (hasDynamic) {
          dataKeeper[calleeName] = callee;
        }

        if (typeof callee === "function" && !hasDynamic) {
          const args = argStrs.map((a) => safeEval(a));
          try {
            const res = callee(...args);
            return { value: stringifyValue(res), confident: true };
          } catch {
            return {
              value: `${calleeName}(${argStrs.join(", ")})`,
              confident: false,
            };
          }
        } else {
          // Keep symbolic
          return {
            value: `${calleeName}(${argStrs.join(", ")})`,
            confident: false,
          };
        }
      }

      case "member": {
        const objValue = evalToken(tok.object, dynamicVars, staticVars);
        if (objValue.confident) {
          if (isDynamic(objValue.value, dynamicVars)) {
            // If it's dynamic — reconstruct the full expression
            return {
              value: `${objValue.value}${tok.optional ? "?." : "."}${
                tok.property.value
              }`,
              confident: true,
            };
          }

          if (isPropValue(objValue.value)) {
            return {
              value: `${objValue.value}${tok.optional ? "?." : "."}${
                tok.property.value
              }`,
              confident: true,
            };
          }

          if (isImported(objValue.value)) {
            return {
              value: `${objValue.value}${tok.optional ? "?." : "."}${
                tok.property.value
              }`,
              confident: true,
            };
          }

          const resolved = safeGet(objValue.value, tok.property.value);
          return { value: stringifyValue(resolved), confident: true };
        } else {
          return {
            value: `${objValue.value}${tok.optional ? "?." : "."}${
              tok.property.value
            }`,
            confident: false,
          };
        }
      }

      case "member_index": {
        const objValue = evalToken(tok.object, dynamicVars, staticVars);
        if (objValue.confident) {
          if (isDynamic(objValue.value, dynamicVars)) {
            const indexExpr = evalExpressionTokens(
              tok.index,
              dynamicVars,
              staticVars,
            );
            return {
              value: `${objValue.value}[${indexExpr}]`,
              confident: true,
            };
          }

          if (Object.hasOwn(props, objValue.value)) {
            propsKeeper[objValue.value] = props[objValue.value];
            const indexExpr = evalExpressionTokens(
              tok.index,
              dynamicVars,
              staticVars,
            );
            return {
              value: `${objValue.value}[${indexExpr}]`,
              confident: true,
            };
          }

          if (isImported(objValue.value)) {
            const indexExpr = evalExpressionTokens(
              tok.index,
              dynamicVars,
              staticVars,
            );
            return {
              value: `${objValue.value}[${indexExpr}]`,
              confident: true,
            };
          }

          const idx = safeEval(
            evalExpressionTokens(tok.index, dynamicVars, staticVars),
          );
          const resolved = safeGet(objValue.value, idx);
          return { value: stringifyValue(resolved), confident: true };
        } else {
          const indexExpr = evalExpressionTokens(
            tok.index,
            dynamicVars,
            staticVars,
          );
          return {
            value: `${objValue.value}[${indexExpr}]`,
            confident: false,
          };
        }
      }

      case "template_literal":
        const x = tok.value
          .map((part) => {
            if (part.type === "string") return part.value;
            if (part.type === "template_expr")
              return (
                "${" +
                evalExpressionTokens(part.value, dynamicVars, staticVars) +
                "}"
              );
            return "";
          })
          .join("");
        return { value: "`" + x + "`", confident: true };

      default:
        return { value: "", confident: true };
    }
  }

  // ------------------ HELPERS ------------------

  function resolveIdentifier(name, dynamicVars, staticVars) {
    console.log("name: ", name);
    if (dynamicVars.includes(name)) {
      return name;
    } else {
      for (let dVar of dynamicVars) {
        if (Array.isArray(dVar) && dVar[0]?.startsWith(name)) {
          return name;
        }
      }
    }

    if (Object.hasOwn(props, name)) {
      console.log("props[name]: ", props[name]);
      return name;
    }

    if (imported.includes(name)) {
      return name;
    }

    const val = getStaticValue(name, staticVars);
    return stringifyValue(val);
  }

  function stringifyValue(value) {
    if (value === undefined) return "undefined";
    if (value === null) return "null";
    if (typeof value === "string") return `"${value}"`;
    if (typeof value === "object" || typeof value === "function")
      return tryEvalToString(value);
    return String(value);
  }

  function tryEvalToString(value) {
    try {
      return safeEval(value);
    } catch {
      return value.toString?.() || "";
    }
  }

  function getStaticValue(path, obj) {
    try {
      if (!obj) return undefined;
      return path.split(".").reduce((acc, k) => acc?.[k], obj);
    } catch {
      return undefined;
    }
  }

  function safeEval(expr) {
    if (typeof expr === "string") {
      try {
        // eslint-disable-next-line no-new-func
        return Function(`"use strict"; return (${expr});`)();
      } catch {
        return expr;
      }
    }
    return expr;
  }

  function safeGet(obj, key) {
    try {
      if (typeof obj === "string") obj = safeEval(obj);
      return obj?.[key];
    } catch {
      return undefined;
    }
  }

  function isDynamic(name, dynamicVars) {
    if (typeof name !== "string") return false;
    for (let dVar of dynamicVars) {
      if (typeof dVar === "string") {
        const isDyn = name.startsWith(dVar);
        if (isDyn) return true;
      } else {
        const isDyn = name?.startsWith(dVar[0]?.split("-")[0]);
        if (isDyn) return true;
      }
    }
    return false;
  }

  function isImported(name) {
    if (typeof name !== "string") return false;
    return imported.some((imp) => name.startsWith(imp));
  }

  function isPropValue(name) {
    if (typeof name !== "string") return false;
    if (Object.hasOwn(props, name)) return true;
    const idf = name.split(".")[0];
    if (idf && Object.hasOwn(props, idf)) return true;
    return false;
  }

  function containsDynamic(expr, dynamicVars) {
    if (typeof expr !== "string") return false;

    const testExpr = (str) => {
      const regex = new RegExp(`\\b${str}\\b`);
      return regex.test(expr) && !/['"`]/.test(expr);
    };

    return dynamicVars.some((v) => {
      if (typeof v === "string") {
        return testExpr(v);
      } else {
        return testExpr(v[0].split("-")[0]);
      }
    });
  }

  const expr = evalExpressionTokens(exprTokens, states, vars);

  return { expr, dataKeeper, propsKeeper };
}

const plugins = [
  "jsx",
  "typescript",
  "optionalChaining",
  "nullishCoalescingOperator",
  "objectRestSpread",
  "classProperties",
  "classPrivateProperties",
  "classPrivateMethods",
  "numericSeparator",
  "logicalAssignment",
  "topLevelAwait",
  "importAssertions",
  "decorators",
  "exportDefaultFrom",
  "throwExpressions",
];

// import { Parser } from "acorn";
// import stage3 from "acorn-stage3";

// const Acorn = Parser.extend(stage3);

// /**
//  * Parse + compress any JS expression into compact AST
//  */
// export function compressExpression(expr) {
//   const ast = Acorn.parse(expr, {
//     ecmaVersion: "latest",
//     sourceType: "module",
//   });

//   return compress(ast.body[0].expression);
// }

const JS_GLOBALS = new Set([
  "Math",
  "Date",
  "Promise",
  "Array",
  "Object",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "BigInt",
  "JSON",
  "Reflect",
  "Intl",
  "Atomics",
  "Number",
  "String",
  "Boolean",
  "Error",
  "RegExp",
  "Function",
  "Symbol",
  "Proxy",
  "URL",
  "URLSearchParams",
]);

/**
 * Recursively compress AST node → compact encoding
 */

function compressAST(nodeAST, states, staticVars) {
  const localVals = new Set(staticVars);

  /**
   * Flatten nested MemberExpressions into a single chain
   * Example:
   *    data.name?.length
   * → ['chain', ['id','data'], ['id','name',0], ['id','length',1]]
   */
  function compressChain(node) {
    const steps = [];

    let current = node;

    // Walk until we reach the root object
    while (
      current.type === "MemberExpression" ||
      current.type === "ChainExpression"
    ) {
      // If ChainExpression → unwrap
      if (current.type === "ChainExpression") {
        current = current.expression;
        continue;
      }

      // PROPERTY PART
      const prop =
        current.property.type === "Identifier"
          ? ["i", current.property.name, current.optional ? 1 : 0]
          : ["l", current.property.value, current.optional ? 1 : 0];

      steps.unshift(prop); // prepend step

      // Go deeper
      current = current.object;
    }

    // Now current is the base (Identifier, Literal, CallExpression, anything!)
    const base = compress(current);

    return ["oc", base, ...steps];
  }

  function compress(node) {
    if (!node) return null;

    switch (node.type) {
      // -----------------------------------------
      // SIMPLE / PRIMITIVE NODES
      // -----------------------------------------
      case "Identifier":
        const idfName = node.name;
        const statesArr = [...states];

        for (let st of statesArr) {
          if (Array.isArray(st) && st[0] === idfName) {
            return ["i", "p", st[0]];
          }

          if (st === idfName) {
            return ["i", "d", idfName];
          }
        }

        if (localVals.has(idfName)) {
          return ["i", "l", idfName];
        }

        if (JS_GLOBALS.has(idfName)) {
          return ["i", "g", idfName];
        }

        return ["i", "k", idfName];

      case "Literal": {
        // Number
        if (typeof node.value === "number") {
          return ["n", node.value];
        }

        // String
        if (typeof node.value === "string") {
          return ["s", node.value];
        }

        // Boolean
        if (typeof node.value === "boolean") {
          return ["b", node.value];
        }

        // Null
        if (node.value === null) {
          return ["null"];
        }

        // BigInt
        if (typeof node.value === "bigint") {
          return ["big", String(node.value)]; // keep exact representation
        }

        // RegExp literal
        if (node.regex) {
          return ["rx", node.regex.pattern, node.regex.flags];
        }

        // Fallback (should never happen)
        return ["l", node.value];
      }

      case "ThisExpression":
        return ["this"];

      case "Super":
        throw new Error(
          "'super' is not supported inside JSX. Move this logic outside the JSX expression.",
        );

      case "ImportExpression":
        throw new Error(
          "'import()' expressions are not allowed inside JSX. Use dynamic imports outside JSX expression.",
        );

      // -----------------------------------------
      // UNARY
      // -----------------------------------------
      case "UnaryExpression":
        if (node.operator === "delete") {
          throw new Error(
            "Restricted Keyword 'delete': JSX expressions must be pure. Side effects (mutation, deletion, assignment) are not allowed.",
          );
        }
        return ["un", node.operator, compress(node.argument)];

      case "UpdateExpression":
        return ["up", node.operator, compress(node.argument), node.prefix];

      // -----------------------------------------
      // BINARY / LOGICAL
      // -----------------------------------------
      case "BinaryExpression":
      case "LogicalExpression":
        return ["op", node.operator, compress(node.left), compress(node.right)];

      // -----------------------------------------
      // ASSIGNMENT
      // -----------------------------------------
      case "AssignmentExpression":
        throw new Error(
          "AssignmentExpression is not allowed inside JSX. Move this logic outside the JSX expression.",
        );
      // return ["as", node.operator, compress(node.left), compress(node.right)];

      // -----------------------------------------
      // CONDITIONAL (ternary)
      // -----------------------------------------
      case "ConditionalExpression":
        return [
          "cn",
          compress(node.test),
          compress(node.consequent),
          compress(node.alternate),
        ];

      // -----------------------------------------
      // CHAIN (optional chaining wrapper)
      // -----------------------------------------
      case "ChainExpression":
        return compressChain(node.expression);

      // -----------------------------------------
      // MEMBER ACCESS
      // -----------------------------------------
      case "MemberExpression":
        return compressChain(node);

      // -----------------------------------------
      // CALL
      // -----------------------------------------
      case "CallExpression":
        return [
          "f",
          compress(node.callee),
          node.arguments.map((a) => compress(a)),
          node.optional ? 1 : 0,
        ];

      // -----------------------------------------
      // ARRAY
      // -----------------------------------------
      case "ArrayExpression":
        return ["ar", node.elements.map((e) => compress(e))];

      // -----------------------------------------
      // OBJECT
      // -----------------------------------------
      case "ObjectExpression":
        return ["ob", node.properties.map((p) => compressProperty(p))];

        function compressProperty(prop) {
          if (prop.type === "SpreadElement")
            return ["sp", compress(prop.argument)];

          if (prop.type === "Property")
            return [
              "pr",
              compress(prop.key),
              compress(prop.value),
              prop.kind, // init / get / set
              prop.computed ? 1 : 0,
              prop.method ? 1 : 0,
              prop.shorthand ? 1 : 0,
            ];
        }

      // -----------------------------------------
      // FUNCTION
      // -----------------------------------------
      case "ArrowFunctionExpression":
        return [
          "af",
          node.async ? 1 : 0,
          node.generator ? 1 : 0,
          node.params.map((p) => compress(p)),
          compress(node.body),
        ];

      case "FunctionExpression":
        return [
          "fe",
          node.id ? compress(node.id) : null,
          node.generator ? 1 : 0,
          node.async ? 1 : 0,
          node.params.map((p) => compress(p)),
          compress(node.body),
        ];
      case "NewExpression":
        if (JS_GLOBALS.has(node.callee.name)) {
          return [
            "ngl",
            ["i", "g", node.callee.name],
            node.arguments.map((a) => compress(a)),
          ];
        }
        return [
          "nw",
          compress(node.callee),
          node.arguments.map((a) => compress(a)),
        ];

      // -----------------------------------------
      // BLOCK & RETURN
      // -----------------------------------------
      case "BlockStatement":
        return ["block", node.body.map((b) => compress(b))];

      case "ReturnStatement":
        return ["return", compress(node.argument)];

      // -----------------------------------------
      // TEMPLATE LITERAL
      // -----------------------------------------
      case "TemplateLiteral":
        const out = ["tl"];

        const quasis = node.quasis;
        const exprs = node.expressions;

        for (let i = 0; i < quasis.length; i++) {
          // Add static string part
          out.push(["s", quasis[i].value.raw]);

          // After every quasi except the last, add expression
          if (i < exprs.length) {
            out.push(["tx", compress(exprs[i])]);
          }
        }

        return out;

      // -----------------------------------------
      // SPREAD
      // -----------------------------------------
      case "SpreadElement":
        return ["sp", compress(node.argument)];

      // -----------------------------------------
      // SEQUENCE: a, b, c
      // -----------------------------------------
      case "SequenceExpression":
        return ["sq", node.expressions.map((e) => compress(e))];
      case "JSXElement":
        console.log(";JSX;", node);
        return ["jsx"];

      default:
        console.warn("Unhandled node:", node.type);
        return ["unknown", node.type];
    }
  }

  return compress(nodeAST);
}

module.exports = {
  plugins,
  parseJSExpression,
  compressAST,
};

/**
 

  const generate = require("@babel/generator").default;

module.exports = function ({ types: t }) {
  function isStateCallee(path, t) {
    const init = path.node.init;
    if (t.isCallExpression(init)) {
      const node = init.callee;

      if (t.isIdentifier(node, { name: "defineState" })) return true;
      if (t.isIdentifier(node, { name: "defineList" })) return true;

      if (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) {
        const isRectorObj = t.isIdentifier(node.object, { name: "Rector" });

        let isDefine =
          (!node.computed &&
            t.isIdentifier(node.property, { name: "defineState" })) ||
          (node.computed &&
            t.isStringLiteral &&
            t.isStringLiteral(node.property, { value: "defineState" }));

        if (!isDefine) {
          isDefine =
            (!node.computed &&
              t.isIdentifier(node.property, { name: "defineList" })) ||
            (node.computed &&
              t.isStringLiteral &&
              t.isStringLiteral(node.property, { value: "defineList" }));
        }

        return isRectorObj && isDefine;
      }
    }
    return false;
  }

  function isUseStateOfCallee(init, t) {
    if (!t.isCallExpression(init)) return;

    const node = init.callee;
    // useStateOf(...)
    if (t.isIdentifier(node, { name: "useStateOf" })) return true;

    // Rector.useStateOf(...)  or Rector["useStateOf"]
    if (t.isMemberExpression(node)) {
      const objOK = t.isIdentifier(node.object, { name: "Rector" });
      const propOK =
        (!node.computed &&
          t.isIdentifier(node.property, { name: "useStateOf" })) ||
        (node.computed &&
          t.isStringLiteral(node.property, { value: "useStateOf" }));
      return objOK && propOK;
    }

    return false;
  }

  function isUseGlobalStateOfCallee(init, t) {
    if (!t.isCallExpression(init)) return;

    const node = init.callee;
    // useStateOf(...)
    if (t.isIdentifier(node, { name: "useGlobalState" })) return true;

    // Rector.useStateOf(...)  or Rector["useStateOf"]
    if (t.isMemberExpression(node)) {
      const objOK = t.isIdentifier(node.object, { name: "Rector" });
      const propOK =
        (!node.computed &&
          t.isIdentifier(node.property, { name: "useGlobalState" })) ||
        (node.computed &&
          t.isStringLiteral(node.property, { value: "useGlobalState" }));
      return objOK && propOK;
    }

    return false;
  }

  function isUpperCamel(name) {
    if (!name) return false;
    return /^[A-Z]/.test(name || "");
  }
  function functionHasJSX(fnPath) {
    let has = false;
    fnPath.traverse({
      JSXElement() {
        has = true;
        // fnPath.stop();
      },
    });
    return has;
  }
  function isComponentFunction(path) {
    // function Comp() {}  OR  const Comp = () => {}
    if (path.isFunctionDeclaration() && isUpperCamel(path.node?.id?.name))
      return true;
    if (path.isFunctionExpression() || path.isArrowFunctionExpression()) {
      // try to read binding name if assigned: const Comp = () => {}
      const parent = path.parentPath;
      const name =
        parent.isVariableDeclarator() && t.isIdentifier(parent.node.id)
          ? parent.node.id.name
          : null;

      return isUpperCamel(name); // functionHasJSX
    }
    return false;
  }

  function getStateConfig(stateVars) {
    let prevSv = new Set();

    const stateArr = stateVars.reduce((acc, crr) => {
      if (Array.isArray(crr)) {
        acc.push(t.arrayExpression(crr.map((ss) => t.stringLiteral(ss))));
      }

      if (typeof crr === "string") {
        if (!prevSv.has(crr)) {
          acc.push(t.stringLiteral(crr));
          prevSv.add(crr);
        }
      }
      return acc;
    }, []);

    return stateArr;
  }

  function traverseNode(path, localStates, extStates) {
    let stateVars = [];
    path.traverse({
      Identifier(innerPath) {
        const { node, parent, parentPath } = innerPath;
        const name = node.name;

        // skip property identifiers (obj.prop) and JSX identifiers
        // if (
        //   (t.isMemberExpression(parent) ||
        //     parent.type === "OptionalMemberExpression") &&
        //   parent.property === innerPath.node &&
        //   !parent.computed
        // )
        //   return;
        if (parentPath && parentPath.isJSXAttribute()) return;

        let isAccessible =
          parentPath?.isMemberExpression() &&
          parentPath.node.object === node &&
          t.isIdentifier(parentPath.node.property, { name: "value" });

        // If it's a tracked state var, note it and DON'T try to inline/replace it
        if (localStates && localStates[name]) {
          if (isAccessible) {
            const statName = localStates[name];
            stateVars.push(statName);
            return;
          }
        }

        if (extStates && extStates[name]) {
          const propDetail = extStates[name];
          if (propDetail?.type === "declare") {
            if (
              (innerPath.parentPath.isMemberExpression() ||
                innerPath.parentPath.isOptionalMemberExpression()) &&
              parent.object === node // means we are the object part, not the property
            ) {
              const prop = parent.property;

              const grandParent = innerPath.parentPath.parentPath;

              const isValueAccess =
                (grandParent?.isMemberExpression() ||
                  grandParent?.isOptionalMemberExpression()) &&
                grandParent.node.object === parent &&
                t.isIdentifier(grandParent.node.property, { name: "value" });

              if (!isValueAccess) return;

              // non-computed: data.name / data?.name
              if (t.isIdentifier(prop)) {
                const propertyName = prop.name;
                stateVars.push([propDetail?.parentName, propertyName]);
                return;
              }

              // computed: data["name"]
              if (t.isStringLiteral(prop)) {
                const propertyName = prop.value;
                stateVars.push([propDetail?.parentName, propertyName]);
                return;
              }
            }
          }

          if (propDetail?.type === "destruct") {
            if (isAccessible) stateVars.push([propDetail?.parentName, name]);
            return;
          }

          return;
        }
      },
    });

    return stateVars;
  }

  function isComponentPropExpression(path, systemComponents) {
    const attrPath = path.parentPath;
    if (!attrPath?.isJSXAttribute()) return false;

    const openingEl = attrPath.parentPath;
    if (!openingEl?.isJSXOpeningElement()) return false;

    const tagIdentifier = openingEl.node.name;
    const tagName = tagIdentifier?.name;

    if (!tagName) return false;

    if (systemComponents && systemComponents?.includes(tagName)) {
      return false;
    } else {
      return t.isJSXIdentifier(tagIdentifier) && /^[A-Z]/.test(tagName);
    }
  }

  return {
    pre() {
      this.stateTable = null;
      this.systemComponents = [];
    },
    visitor: {
      ImportDeclaration(path, state) {
        const importPath = path.node.source.value;
        if (importPath && importPath?.endsWith("rector-js")) {
          path.node.specifiers.forEach((spec) => {
            if (spec.imported.name === "For") {
              state.systemComponents?.push(spec.local.name);
            }
          });
        }
      },
      FunctionDeclaration: {
        enter(path, state) {
          if (!isComponentFunction(path)) return;

          path.setData("isComponent", true);

          state.stateTable = {
            localStates: {},
            extStates: {},
          };
        },
        exit(path, state) {
          if (path?.getData("isComponent")) state.stateTable = null;
        },
      },
      FunctionExpression: {
        enter(path, state) {
          if (!isComponentFunction(path)) return;

          path.setData("isComponent", true);
          state.stateTable = {
            localStates: {},
            extStates: {},
          };
        },
        exit(path, state) {
          if (path?.getData("isComponent")) state.stateTable = null;
        },
      },
      ArrowFunctionExpression: {
        enter(path, state) {
          if (!isComponentFunction(path)) return;

          path.setData("isComponent", true);
          state.stateTable = {
            localStates: {},
            extStates: {},
          };
        },
        exit(path, state) {
          if (path?.getData("isComponent")) state.stateTable = null;
        },
      },

      VariableDeclarator(path, state) {
        // Track: const count = defineState("mycount", 0);

        if (isStateCallee(path, t)) {
          const [nameNode] = path.node.init.arguments;

          if (t.isStringLiteral(nameNode)) {
            const stateVar = path.node.id.name; // "count"
            state.stateTable.localStates[stateVar] = nameNode.value; // "mycount"
          }
        }

        const node = path.node;
        if (isUseStateOfCallee(node.init, t)) {
          const args = node.init.arguments;
          const parentName = t.isStringLiteral(args[0]) ? args[0].value : null;

          // Case 1: const { s1, s2 } = useStateOf("Parent")
          if (t.isObjectPattern(node.id)) {
            let vars = {};
            node.id.properties.forEach((prop) => {
              if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                const localName = prop.key.name; // s1, s2
                // ✅ Do your logic here (register state usage)
                // example
                vars[localName] = {
                  type: "destruct",
                  parentName,
                };
              }
            });

            Object.assign(state.stateTable.extStates, vars);
          }

          // Case 2: const state = useStateOf("Parent")
          else if (t.isIdentifier(node.id)) {
            const localName = node.id.name;
            state.stateTable.extStates[localName] = {
              type: "declare",
              parentName,
            };
          }
        }

        if (isUseGlobalStateOfCallee(node.init, t)) {
          // const args = node.init.arguments;
          // const parentName = t.isStringLiteral(args[0]) ? args[0].value : null;

          // Case 1: const { s1, s2 } = useStateOf("Parent")
          if (t.isObjectPattern(node.id)) {
            let vars = {};
            node.id.properties.forEach((prop) => {
              if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                const localName = prop.key.name; // s1, s2
                // ✅ Do your logic here (register state usage)
                // example
                vars[localName] = {
                  type: "destruct",
                  parentName: "$",
                };
              }
            });

            Object.assign(state.stateTable.extStates, vars);
          }

          // Case 2: const state = useStateOf("Parent")
          else if (t.isIdentifier(node.id)) {
            const localName = node.id.name;
            state.stateTable.extStates[localName] = {
              type: "declare",
              parentName: "$",
            };
          }
        }
      },

      // inside your plugin visitor
      JSXExpressionContainer: {
        enter(path, state) {
          const exprPath = path.get("expression");

          if (!exprPath || !exprPath.node) return;

          if (t.isJSXEmptyExpression(exprPath)) return;

          if (exprPath?.isConditionalExpression()) return;

          if (isComponentPropExpression(path, this.systemComponents)) return;

          const stateProps = (state && state.stateTable) || this.stateTable;
          const { localStates = {}, extStates = {} } = stateProps ?? {};

          const node = exprPath.node;
          // 🟢 Handle simple {count} or {someState} expressions directly
          if (t.isIdentifier(node)) {
            const name = node.name;
            // console.log("name: ", name);
            if (localStates && localStates[name]) {
              const statName = localStates[name];
              node.name = statName;

              const stateArr = getStateConfig([statName]);

              const wrappedExpression = t.objectExpression([
                t.objectProperty(
                  t.identifier("states"),
                  t.arrayExpression(stateArr),
                ),
                t.objectProperty(
                  t.identifier("exprEval"),
                  t.arrowFunctionExpression(
                    [], // t.objectPattern(stateContext)
                    node,
                  ),
                ),
              ]);

              path.replaceWith(t.jsxExpressionContainer(wrappedExpression));
              path.skip();
              return; // ✅ handled, no need to continue
            }

            if (extStates && extStates[name]) {
              const propDetail = extStates[name];

              if (propDetail?.type === "destruct") {
                const stateArr = getStateConfig([
                  [propDetail?.parentName, name],
                ]);
                node.name = propDetail?.parentName + "." + name;
                const objExpr = t.objectExpression([
                  t.objectProperty(
                    t.identifier("exprEval"),
                    t.arrowFunctionExpression([], node),
                  ),
                  t.objectProperty(
                    t.identifier("states"),
                    t.arrayExpression(stateArr),
                  ),
                ]);
                path.replaceWith(t.jsxExpressionContainer(objExpr));
                path.skip();
                return;
              }

              return;
            }

            return;
          }

          // Traverse only the expression subtree with correct scope/parent info
          const stateVars = traverseNode(exprPath, localStates, extStates);
          const code = generate(node).code;
          console.log("code: ", code, localStates, stateVars, "\n\n");
          if (!stateVars.length) return;
          // console.log(":::", tempVars);

          const stateArr = getStateConfig(stateVars);

          const wrappedExpression = t.objectExpression([
            t.objectProperty(
              t.identifier("states"),
              t.arrayExpression(stateArr),
            ),
            t.objectProperty(
              t.identifier("exprEval"),
              t.arrowFunctionExpression([], node),
            ),
            t.objectProperty(
              t.identifier("dy_states"),
              t.objectExpression(
                stateVars.map((s) => {
                  if (typeof s === "string") {
                    return t.objectProperty(t.identifier(s), t.identifier(s));
                  } else {
                    return t.objectProperty(
                      t.identifier(s[1]),
                      t.identifier(s[1]),
                    );
                  }
                }),
              ),
            ),
          ]);

          // Replace the JSXExpressionContainer with the object wrapped in a JSXExpressionContainer
          path.replaceWith(t.jsxExpressionContainer(wrappedExpression));

          // CRITICAL: skip traversing the just-created node to avoid re-entering plugin logic
          path.skip();
        },
        exit(path, state) {
          const exprPath = path.get("expression");

          if (!exprPath || !exprPath.node) return;

          if (!exprPath.isConditionalExpression()) return;

          if (t.isJSXEmptyExpression(exprPath)) return;

          if (isComponentPropExpression(path, this.systemComponents)) return;

          const stateProps = (state && state.stateTable) || this.stateTable;
          const { localStates = {}, extStates = {} } = stateProps ?? {};

          const { test, consequent, alternate } = exprPath.node;

          const testPath = path.get("expression.test");
          const testStateVars = traverseNode(testPath, localStates, extStates);

          if (!testStateVars.length) return;

          const stateArr = getStateConfig(testStateVars);

          let conditionData = [
            t.objectProperty(
              t.identifier("condition"),
              t.objectExpression([
                t.objectProperty(
                  t.identifier("eval"),
                  t.arrowFunctionExpression([], test),
                ),
                t.objectProperty(
                  t.identifier("states"),
                  t.arrayExpression(stateArr),
                ),
              ]),
            ),
          ];

          const CONDITION_KEYS = [
            { identifier: "then", value: consequent },
            { identifier: "else", value: alternate },
          ];

          CONDITION_KEYS.forEach((type) => {
            conditionData.push(
              t.objectProperty(
                t.identifier(type.identifier),
                t.arrowFunctionExpression([], type.value),
              ),
            );
          });

          const wrappedExpression = t.objectExpression(conditionData);

          path.replaceWith(t.jsxExpressionContainer(wrappedExpression));

          // CRITICAL: skip traversing the just-created node to avoid re-entering plugin logic
          path.skip();

          // return;
        },
      },
    },
  };
};

 */

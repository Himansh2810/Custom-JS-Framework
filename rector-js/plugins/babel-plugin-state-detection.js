const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;

module.exports = function ({ types: t }) {
  return {
    pre() {
      this.stateTable = new Map(); // track state vars from defineState
    },
    visitor: {
      VariableDeclarator(path, state) {
        // Track: const [count, setCount] = defineState("mycount", 0);
        if (
          t.isArrayPattern(path.node.id) &&
          t.isCallExpression(path.node.init) &&
          t.isIdentifier(path.node.init.callee, { name: "defineState" })
        ) {
          const [nameNode, initArg] = path.node.init.arguments;

          if (t.isStringLiteral(nameNode)) {
            const stateVar = path.node.id.elements[0].name; // "count"

            let initialValue = null;

            if (t.isIdentifier(initArg)) {
              // find binding of the identifier
              const binding = path.scope.getBinding(initArg.name);
              if (binding && binding.path.isVariableDeclarator()) {
                const initNode = binding.path.node.init;
                try {
                  const code = path.hub.file.code.slice(
                    initNode.start,
                    initNode.end
                  );
                  initialValue = Function(`"use strict";return (${code})`)();
                } catch {
                  initialValue = null;
                }
              }
            } else {
              // literal or object/array expression
              try {
                const code = path.hub.file.code.slice(
                  initArg.start,
                  initArg.end
                );
                initialValue = Function(`"use strict";return (${code})`)();
              } catch {
                initialValue = null;
              }
            }

            state.stateTable.set(stateVar, {
              stateName: nameNode.value,
              initialValue,
            }); // "mycount"
          }
        }
      },

      JSXExpressionContainer(path, state) {
        const exprPath = path.get("expression");
        const exprNode = exprPath.node;

        // Collect identifiers inside this expression
        const stateVars = new Set();
        const replacements = new Map();

        exprPath.traverse({
          Identifier(idPath) {
            const idName = idPath.node.name;
            // console.log("idName: ", idName);

            if (state.stateTable.has(idName)) {
              // It's a tracked state variable
              const statName = state.stateTable.get(idName).stateName;
              stateVars.add(statName);
              idPath.node.name = statName;
            } else {
              // Try to resolve static variables
              const binding = idPath.scope.getBinding(idName);
              if (binding) {
                const init = binding.path.get("init");
                if (init) {
                  const ev = init.evaluate();
                  if (ev.confident) {
                    // replace in output expression with value
                    replacements.set(idName, ev.value);
                  }
                }
              }
            }
          },
        });

        // Generate code string
        let code = generate(exprNode).code;
        // console.log("code: ", code);

        // Replace static identifiers with their evaluated value
        for (const [id, val] of replacements.entries()) {
          const re = new RegExp(`\\b${id}\\b`, "g");
          code = code.replace(re, JSON.stringify(val));
        }

        // Evaluate whole expression if possible
        let evaluated = null;
        try {
          const args = [];
          const values = [];
          [...state.stateTable.values()].forEach((st) => {
            args.push(st.stateName);
            values.push(st.initialValue);
          });
          evaluated = new Function(...args, `return ${code};`)(...values);
        } catch {}

        // let evaluatedx = null;
        // try {
        //   const ev = exprPath.evaluate();
        //   if (ev.confident) evaluatedx = ev.value;
        // } catch {}

        if (stateVars.size) {
          console.log(code, evaluated, stateVars, "\n\n");
        }

        // Only transform if state variables are used
        // if (stateVars.length) {
        //   path.replaceWith(
        //     t.jSXExpressionContainer(
        //       t.objectExpression([
        //         t.objectProperty(
        //           t.identifier("expression"),
        //           t.stringLiteral(code)
        //         ),
        //         t.objectProperty(
        //           t.identifier("eval"),
        //           evaluated !== null
        //             ? t.valueToNode(evaluated)
        //             : t.nullLiteral()
        //         ),
        //         t.objectProperty(
        //           t.identifier("stateVars"),
        //           t.arrayExpression(stateVars.map((v) => t.stringLiteral(v)))
        //         ),
        //       ])
        //     )
        //   );
        // }
      },
    },
  };
};

// module.exports = function ({ types: t }) {
//   return {
//     name: "state-expr-plugin",

//     pre() {
//       // Symbol table for states
//       this.stateTable = new Map();
//     },

//     visitor: {
//       // Step 1: Track defineState calls
//       VariableDeclarator(path) {
//         // Look for: const [count, setCount] = defineState("mycount", 0);
//         if (!t.isArrayPattern(path.node.id)) return;

//         const init = path.node.init;

//         if (
//           t.isCallExpression(init) &&
//           t.isIdentifier(init.callee, { name: "defineState" })
//         ) {
//           const [nameNode] = init.arguments;

//           if (t.isStringLiteral(nameNode)) {
//             const varName = path.node.id.elements[0].name; // "count"
//             const stateName = nameNode.value; // "mycount"
//             console.log("stateName: ", stateName, varName);

//             this.stateTable.set(varName, {
//               frameworkName: stateName,
//             });
//           }
//         }
//       },

//       // Step 2: Rewrite JSXExpression `{ count + 1 }`
//       JSXExpressionContainer(path, state) {
//         const expr = path.node.expression;

//         // Only handle BinaryExpressions for now
//         if (!t.isBinaryExpression(expr)) return;

//         // Collect identifiers in the expression
//         const identifiers = [];
//         path.traverse({
//           Identifier(innerPath) {
//             const idName = innerPath.node.name;

//             if (state.stateTable?.has(idName)) {
//               identifiers.push(idName);
//             }
//           },
//         });

//         if (identifiers.length > 0) {
//           // Convert original AST -> source string
//           const code = path.get("expression").toString();

//           console.log("::", identifiers, code);

//           // Replace with __expr("...", ["var1","var2"])
//           // path.replaceWith(
//           //   t.jSXExpressionContainer(
//           //     t.callExpression(t.identifier("__expr"), [
//           //       t.stringLiteral(code),
//           //       t.arrayExpression(identifiers.map((id) => t.stringLiteral(id))),
//           //     ])
//           //   )
//           // );
//         }
//       },
//     },

//     // Persist stateTable across visitor runs
//     post(file) {
//       file.opts.pluginState = { stateTable: this.stateTable };
//       // Optional: debug log
//       // console.log("Tracked states:", [...this.stateTable.keys()]);
//     },
//   };
// };

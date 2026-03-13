// const generate = require("@babel/generator").default;
// const extractVarsFromExprString = require("./helper");
// const PARSER_PLUGINS = ["jsx"];

// module.exports = function ({ types: t }) {
//   return {
//     visitor: {
//       JSXOpeningElement(path) {
//         const tag = path.node.name;

//         if (tag?.name === "Condition") {
//           const exprAttr = path.node.attributes.find(
//             (a) => t.isJSXAttribute(a) && a.name.name === "expression"
//           );

//           if (!exprAttr || !exprAttr.value) return;

//           let rawExpr;

//           if (t.isStringLiteral(exprAttr.value)) {
//             rawExpr = exprAttr.value.value;
//           } else if (t.isJSXExpressionContainer(exprAttr.value)) {
//             const inner = exprAttr.value.expression;

//             if (t.isStringLiteral(inner)) {
//               // <Condition expression={'count > 2'} />
//               rawExpr = inner.value;
//             } else if (t.isTemplateLiteral(inner)) {
//               // Evaluate each ${...} if it's a constant
//               rawExpr = inner.quasis
//                 .map((q, i) => {
//                   const expr = inner.expressions[i];
//                   if (!expr) return q.value.cooked; // last tail
//                   let evaluated = null;

//                   // Try to evaluate expression from scope (like a const)
//                   try {
//                     const binding = path.scope.getBinding(expr.name);
//                     if (binding) {
//                       const init = binding.path.get("init");
//                       const ev = init.evaluate();
//                       if (ev.confident) evaluated = ev.value;
//                     }
//                   } catch {}

//                   // If evaluated use value, else leave as ${code}
//                   const exprCode =
//                     evaluated !== null
//                       ? evaluated
//                       : `\${${generate(expr).code}}`;

//                   return q.value.cooked + exprCode;
//                 })
//                 .join("");
//             } else {
//               // fallback for any other expression
//               rawExpr = generate(inner).code;
//             }
//           } else {
//             // unexpected node (rare)
//             rawExpr = generate(exprAttr.value).code;
//           }

//           const vars = extractVarsFromExprString(rawExpr, PARSER_PLUGINS);

//           exprAttr.value = t.jsxExpressionContainer(
//             t.objectExpression([
//               t.objectProperty(
//                 t.identifier("expression"),
//                 t.stringLiteral(rawExpr)
//               ),
//               t.objectProperty(
//                 t.identifier("vars"),
//                 t.arrayExpression(
//                   vars.map((v) => {
//                     if (Array.isArray(v)) {
//                       // nested array like ['user','name']
//                       return t.arrayExpression(
//                         v.map((item) => t.stringLiteral(item))
//                       );
//                     }
//                     // simple string
//                     return t.stringLiteral(v);
//                   })
//                 )
//               ),
//             ])
//           );
//         }
//       },
//     },
//   };
// };

// ***********************

const generate = require("@babel/generator").default;
const { parseJSExpression, parseAndEvaluateExpr } = require("./helper2.js");

module.exports = function ({ types: t }) {
  function convertToAstNode(value) {
    if (value === null) return t.nullLiteral();
    if (typeof value === "boolean") return t.booleanLiteral(value);
    if (typeof value === "number") return t.numericLiteral(value);
    if (typeof value === "string") return t.stringLiteral(value);

    if (Array.isArray(value)) {
      return t.arrayExpression(value.map(convertToAstNode));
    }

    if (typeof value === "object") {
      const props = Object.entries(value).map(([key, val]) =>
        t.objectProperty(t.identifier(key), convertToAstNode(val))
      );
      return t.objectExpression(props);
    }

    // fallback (e.g. undefined)
    return t.identifier("undefined");
  }

  function isStateCallee(path, t) {
    if (!t.isArrayPattern(path.node.id)) return;

    const init = path.node.init;
    if (t.isCallExpression(init)) {
      const node = init.callee;
      // console.log("::here");
      if (t.isIdentifier(node, { name: "defineState" })) return true;
      // console.log("::here22");

      if (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) {
        const isDefine =
          (!node.computed &&
            t.isIdentifier(node.property, { name: "defineState" })) ||
          (node.computed &&
            t.isStringLiteral &&
            t.isStringLiteral(node.property, { value: "defineState" }));

        // console.log("isDefine: ", isDefine);
        const isRectorObj = t.isIdentifier(node.object, { name: "Rector" });
        // console.log("isRectorObj: ", isRectorObj);

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

  function isUpperCamel(name) {
    return /^[A-Z]/.test(name || "");
  }
  function functionHasJSX(fnPath) {
    let has = false;
    fnPath.traverse({
      JSXElement() {
        has = true;
        fnPath.stop();
      },
    });
    return has;
  }
  function isComponentFunction(path) {
    // function Comp() {}  OR  const Comp = () => {}
    if (
      path.isFunctionDeclaration() &&
      isUpperCamel(path.node.id && path.node.id.name)
    )
      return true;
    if (path.isFunctionExpression() || path.isArrowFunctionExpression()) {
      // try to read binding name if assigned: const Comp = () => {}
      const parent = path.parentPath;
      const name =
        parent.isVariableDeclarator() && t.isIdentifier(parent.node.id)
          ? parent.node.id.name
          : null;
      if (isUpperCamel(name)) return true;
      // fallback: detect JSX inside body
      return functionHasJSX(path);
    }
    return false;
  }

  function astToJsValue(node) {
    switch (node.type) {
      case "StringLiteral":
      case "NumericLiteral":
      case "BooleanLiteral":
      case "NullLiteral":
        return node.value;

      case "ArrayExpression":
        return node.elements.map((el) => astToJsValue(el));

      case "ObjectExpression":
        const obj = {};
        node.properties.forEach((prop) => {
          const key = prop.key.name || prop.key.value;
          obj[key] = astToJsValue(prop.value);
        });
        return obj;

      // Unsupported → must evaluate at runtime
      default:
        return node;
    }
  }

  function extractPropsFromComponentParam(path, t) {
    const param = path.node.params[0];
    // Case 1: function MyComp(props)
    if (t.isIdentifier(param)) {
      // return {
      //   type: "direct",
      //   value: param.name,
      // };

      return {
        [param.name]: { type: "direct", value: undefined },
      };
    }

    // CASE 3: function MyComp(props = { name: "op" })
    if (t.isAssignmentPattern(param) && t.isIdentifier(param.left)) {
      const propName = param.left.name;
      const defaultNode = param.right;

      // Compute default object literal if possible
      // const defaultValPath = path.get("params.0.right");
      // let resolved = null;

      // try {
      //   const ev = defaultValPath.evaluate();
      //   if (ev.confident) {
      //     resolved = ev.value; // real JS value
      //   } else {
      //     // fallback: static literal object convert
      //     resolved = t.cloneNode(defaultNode, true);
      //   }
      // } catch {
      //   resolved = t.cloneNode(defaultNode, true);
      // }

      // return {
      //   type: "directDefault",
      //   value: [propName, astToJsValue(resolved)],
      // };

      return {
        [propName]: {
          type: "directDefault",
          value: t.cloneNode(defaultNode, true),
        },
      };
    }

    // Case 2: function MyComp({ name, age = 18 })
    if (t.isObjectPattern(param)) {
      const propsList = {};

      param.properties.forEach((prop, index) => {
        if (!t.isObjectProperty(prop)) return;

        const key = prop.key.name;

        // CASE: name = defaultValue
        if (t.isAssignmentPattern(prop.value)) {
          const defaultNode = prop.value.right;

          // ✅ Get the *path* to the default value
          // const defaultValuePath = path.get(
          //   `params.0.properties.${index}.value.right`
          // );

          // let resolved;
          // try {
          //   const ev = defaultValuePath.evaluate();
          //   if (ev.confident) {
          //     resolved = t.valueToNode(ev.value); // ✅ store real literal value
          //   } else {
          //     resolved = t.cloneNode(defaultNode, true); // fallback AST
          //   }
          // } catch {
          //   resolved = t.cloneNode(defaultNode, true); // fallback AST
          // }

          // propsList.push([key, astToJsValue(resolved)]);

          propsList[key] = {
            type: "destruct",
            value: t.cloneNode(defaultNode, true),
          };
        }

        // CASE: { name }
        else {
          // propsList.push(key);
          propsList[key] = { type: "destruct", value: undefined };
        }
      });

      // return {
      //   type: "destruct",
      //   value: propsList,
      // };

      return propsList;
    }

    // No props declared → still return valid
    return {};
  }

  return {
    pre() {
      this.stateTable = null;
    },
    visitor: {
      FunctionDeclaration: {
        enter(path, state) {
          if (!isComponentFunction(path)) return;

          const propsInfo = extractPropsFromComponentParam(path, t);

          state.stateTable = { local: {}, props: {}, staticProps: propsInfo };
        },
        exit(path, state) {
          if (isComponentFunction(path)) {
            state.stateTable = null;
          }
        },
      },
      FunctionExpression: {
        enter(path, state) {
          if (!isComponentFunction(path)) return;

          const propsInfo = extractPropsFromComponentParam(path, t);

          state.stateTable = { local: {}, props: {}, staticProps: propsInfo };
        },
        exit(path, state) {
          if (isComponentFunction(path)) state.stateTable = null;
        },
      },
      ArrowFunctionExpression: {
        enter(path, state) {
          if (!isComponentFunction(path)) return;

          const propsInfo = extractPropsFromComponentParam(path, t);

          state.stateTable = { local: {}, props: {}, staticProps: propsInfo };
        },
        exit(path, state) {
          if (isComponentFunction(path)) state.stateTable = null;
        },
      },

      VariableDeclarator(path, state) {
        // Track: const [count, setCount] = defineState("mycount", 0);
        if (isStateCallee(path, t)) {
          const [nameNode, initArg] = path.node.init.arguments;

          if (t.isStringLiteral(nameNode)) {
            const stateVar = path.node.id.elements[0].name; // "count"

            // let initialValue = null;

            // if (t.isIdentifier(initArg)) {
            //   // find binding of the identifier
            //   const binding = path.scope.getBinding(initArg.name);
            //   if (binding && binding.path.isVariableDeclarator()) {
            //     const initNode = binding.path.node.init;
            //     try {
            //       const code = path.hub.file.code.slice(
            //         initNode.start,
            //         initNode.end
            //       );
            //       initialValue = Function(`"use strict";return (${code})`)();
            //     } catch {
            //       initialValue = null;
            //     }
            //   }
            // } else {
            //   // literal or object/array expression
            //   try {
            //     const code = path.hub.file.code.slice(
            //       initArg.start,
            //       initArg.end
            //     );
            //     initialValue = Function(`"use strict";return (${code})`)();
            //   } catch {
            //     initialValue = null;
            //   }
            // }

            state.stateTable.local[stateVar] = nameNode.value; // "mycount"

            // state.stateTable.set(stateVar, {
            //   stateName: nameNode.value,
            //   initialValue,
            // });
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
                // example:
                console.log(
                  "\nuseStateOf state:",
                  localName,
                  "from",
                  parentName,
                  "\n"
                );

                vars[localName] = {
                  type: "destruct",
                  parentName,
                };
              }
            });

            Object.assign(state.stateTable.props, vars);
          }

          // Case 2: const state = useStateOf("Parent")
          else if (t.isIdentifier(node.id)) {
            const localName = node.id.name;
            console.log("\nuseStateOf single:", localName, "from", parentName);
            state.stateTable.props[localName] = {
              type: "declare",
              parentName,
            };
          }
        }
      },

      // inside your plugin visitor
      JSXExpressionContainer(path, state) {
        const exprPath = path.get("expression");

        if (exprPath.isConditionalExpression()) {
          const { test, consequent, alternate } = exprPath.node;

          const conditionStr = generate(test).code;
          const replacement = t.jsxExpressionContainer(
            t.objectExpression([
              t.objectProperty(
                t.identifier("condition"),
                t.stringLiteral(conditionStr)
              ),
              t.objectProperty(t.identifier("onTrue"), consequent),
              t.objectProperty(t.identifier("onFalse"), alternate),
            ])
          );

          path.replaceWith(replacement);
          return;
        }

        if (!exprPath || !exprPath.node) return;

        if (t.isJSXEmptyExpression(exprPath)) return;

        const node = exprPath.node;

        const stateProps = (state && state.stateTable) || this.stateTable;
        const { local: stateTable, props, staticProps } = stateProps;
        // console.log("staticProps: ", JSON.stringify(staticProps, null, 2));

        const stateVars = new Set();
        const varsObjectProps = [];
        const tempVars = {};
        const staticPropsData = {};
        const importedIdf = [];

        // 🟢 Handle simple {count} or {someState} expressions directly
        if (t.isIdentifier(node)) {
          const name = node.name;
          // console.log("name: ", name);
          if (stateTable && stateTable[name]) {
            const statName = stateTable[name];
            stateVars.add(statName);
            node.name = statName;
            const objExpr = t.objectExpression([
              t.objectProperty(
                t.identifier("expression"),
                t.arrayExpression([
                  t.objectExpression([
                    t.objectProperty(
                      t.identifier("type"),
                      t.stringLiteral("identifier")
                    ),
                    t.objectProperty(
                      t.identifier("value"),
                      t.stringLiteral(statName)
                    ),
                  ]),
                ])
              ),
              t.objectProperty(
                t.identifier("states"),
                t.arrayExpression([...stateVars].map((s) => t.stringLiteral(s)))
              ),
              t.objectProperty(t.identifier("vars"), t.objectExpression([])),
            ]);
            path.replaceWith(t.jsxExpressionContainer(objExpr));
            path.skip();
            return; // ✅ handled, no need to continue
          }

          if (props && props[name]) {
            const propDetail = props[name];

            if (propDetail?.type === "destruct") {
              const objExpr = t.objectExpression([
                t.objectProperty(
                  t.identifier("expression"),
                  convertToAstNode([
                    {
                      type: "member",
                      object: {
                        type: "identifier",
                        value: propDetail?.parentName,
                      },
                      property: { type: "identifier", value: name },
                      optional: true,
                    },
                  ])
                ),
                t.objectProperty(
                  t.identifier("states"),
                  t.arrayExpression([
                    t.arrayExpression([
                      t.stringLiteral(propDetail?.parentName),
                      t.stringLiteral(name),
                    ]),
                  ])
                ),
                t.objectProperty(t.identifier("vars"), t.objectExpression([])),
              ]);
              path.replaceWith(t.jsxExpressionContainer(objExpr));
              path.skip();
              return;
            }

            return;
          }

          if (staticProps & staticProps[name]) {
            staticPropsData[name] = staticProps[name].value;
            return;
          }

          return;
        }

        // Traverse only the expression subtree with correct scope/parent info
        exprPath.traverse({
          Identifier(innerPath) {
            const { node, parent } = innerPath;
            const name = node.name;

            // skip property identifiers (obj.prop) and JSX identifiers
            if (
              (t.isMemberExpression(parent) ||
                parent.type === "OptionalMemberExpression") &&
              parent.property === innerPath.node &&
              !parent.computed
            )
              return;
            if (innerPath.parentPath && innerPath.parentPath.isJSXAttribute())
              return;

            // If it's a tracked state var, note it and DON'T try to inline/replace it
            if (stateTable && stateTable[name]) {
              const statName = stateTable[name];
              stateVars.add(statName);
              innerPath.node.name = statName;
              return;
            }

            if (props && props[name]) {
              const propDetail = props[name];
              if (propDetail?.type === "declare") {
                if (
                  (innerPath.parentPath.isMemberExpression() ||
                    innerPath.parentPath.isOptionalMemberExpression()) &&
                  parent.object === node // means we are the object part, not the property
                ) {
                  const prop = parent.property;

                  // non-computed: data.name / data?.name
                  if (t.isIdentifier(prop)) {
                    const propertyName = prop.name;
                    console.log("Base:", name, "Property:", propertyName);
                    innerPath.node.name = propDetail?.parentName;
                    stateVars.add([propDetail?.parentName, propertyName]);
                    return;
                  }

                  // computed: data["name"]
                  if (t.isStringLiteral(prop)) {
                    const propertyName = prop.value;
                    innerPath.node.name = propDetail?.parentName;
                    console.log("Base:", name, "Property:", propertyName);
                    stateVars.add([propDetail?.parentName, propertyName]);
                    return;
                  }
                }
              }

              if (propDetail?.type === "destruct") {
                innerPath.node.name = propDetail?.parentName + "." + name;
                stateVars.add([propDetail?.parentName, name]);
                return;
              }

              return;
            }

            if (staticProps && staticProps[name]) {
              staticPropsData[name] = staticProps[name].value;
              return;
            }

            // Otherwise, try to capture the actual value/node from local binding
            const binding = innerPath.scope.getBinding(name);
            if (!binding) return;

            if (binding.kind === "module") {
              // ⭐ THIS IS AN IMPORTED IDENTIFIER
              // console.log("Imported identifier:", name);
              importedIdf.push(name);
            }

            const bindingPath = binding.path;

            // we only handle variable declarators (const/let/var) safely
            if (bindingPath.isVariableDeclarator()) {
              const initPath = bindingPath.get("init");
              if (!initPath.node) return;

              try {
                const ev = initPath.evaluate();
                if (ev && ev.confident) {
                  // inline actual primitive / object value as literal node
                  varsObjectProps.push(
                    t.objectProperty(
                      t.identifier(name),
                      t.valueToNode(ev.value)
                    )
                  );
                  tempVars[name] = ev.value;
                } else {
                  // Not confidently evaluable — clone the initializer AST and include it
                  // IMPORTANT: cloneNode to avoid re-using the same AST node (prevents cycles)
                  const clonedInit = t.cloneNode(
                    initPath.node,
                    /* deep */ true
                  );
                  varsObjectProps.push(
                    t.objectProperty(t.identifier(name), clonedInit)
                  );
                  tempVars[name] = clonedInit;
                }
              } catch (e) {
                // fallback: clone init AST (safe)
                const clonedInit = t.cloneNode(initPath.node, /* deep */ true);
                varsObjectProps.push(
                  t.objectProperty(t.identifier(name), clonedInit)
                );
                tempVars[name] = clonedInit;
              }
            }
          },
        });

        if (stateVars.size === 0) {
          return;
        }
        // console.log(":::", tempVars);
        const code = generate(node).code;
        console.log("code: ", code);
        console.log("imported", importedIdf);

        const tree = parseJSExpression(code);

        const val = parseAndEvaluateExpr(
          tree,
          [...stateVars],
          tempVars,
          staticPropsData,
          importedIdf
        );
        console.log("val: ", val, "\n\n");

        // Build the replacement object: { expression: "...", stateVars: [...], vars: { ... } }
        const objExpr = t.objectExpression([
          t.objectProperty(
            t.identifier("context"),
            t.objectExpression([
              t.objectProperty(t.identifier("data"), t.identifier("data")),
            ])
          ),
          t.objectProperty(
            t.identifier("expression"),
            t.stringLiteral(val.expr)
          ),
          t.objectProperty(
            t.identifier("states"),
            t.arrayExpression(
              [...stateVars].map((s) => {
                if (typeof s === "string") {
                  return t.stringLiteral(s);
                }

                return t.arrayExpression(s.map((ss) => t.stringLiteral(ss)));
              })
            )
          ),
          t.objectProperty(
            t.identifier("vars"),
            t.objectExpression(
              Object.entries(val.dataKeeper).map(([key, value]) =>
                t.objectProperty(
                  t.identifier(key),
                  value ?? t.identifier("undefined")
                )
              )
            )
          ),
          t.objectProperty(
            t.identifier("staticProps"),
            t.objectExpression(
              Object.entries(val.propsKeeper).map(([key, value]) =>
                t.objectProperty(
                  t.identifier(key),
                  value ?? t.identifier("undefined")
                )
              )
            )
          ),
        ]);

        // Replace the JSXExpressionContainer with the object wrapped in a JSXExpressionContainer
        path.replaceWith(t.jsxExpressionContainer(objExpr));

        // CRITICAL: skip traversing the just-created node to avoid re-entering plugin logic
        path.skip();
      },
    },
  };
};

/*

 const jsxEl = path.findParent((p) => p.isJSXElement());
        if (!jsxEl) return;

        const crrEl = jsxEl.node.openingElement;

        let metaAttr = crrEl.attributes.find(
          (a) =>
            t.isJSXAttribute(a) &&
            t.isJSXIdentifier(a.name, { name: "__exprMeta" })
        );

        const newEntry = t.objectProperty(
          t.numericLiteral(exprIndex),
          objExpr // the object you already build { expression, vars, evaluated }
        );

        if (!metaAttr) {
          metaAttr = t.jsxAttribute(
            t.jsxIdentifier("__exprMeta"),
            t.jsxExpressionContainer(
              t.objectExpression([newEntry]) // start object
            )
          );
          crrEl.attributes.push(metaAttr);
        } else if (
          t.isJSXExpressionContainer(metaAttr.value) &&
          t.isObjectExpression(metaAttr.value.expression)
        ) {
          metaAttr.value.expression.properties.push(newEntry);
        }

function buildNode(node) {
          if (t.isIdentifier(node)) {
            const name = node.name;
            // if (stateTable && stateTable.has(name)) {
            //   const statName = state.stateTable.get(name).stateName;
            //   stateVars.add(statName);
            //   innerPath.node.name = statName;
            //   return;
            // }
            // if (stateVarsList.includes(name)) {
            //   result.stateVars.push(name);
            // } else {
            //   result.staticVars.push(name);
            // }
            return { type: "identifier", value: name };
          }

          if (t.isCallExpression(node)) {
            return {
              type: "functionCall",
              callee: buildNode(node.callee),
              args: node.arguments.map(buildNode),
            };
          }

          if (t.isMemberExpression(node)) {
            return {
              type: "member",
              object: buildNode(node.object),
              property: buildNode(node.property),
            };
          }

          if (t.isBinaryExpression(node)) {
            return {
              type: "binary",
              operator: node.operator,
              left: buildNode(node.left),
              right: buildNode(node.right),
            };
          }

          if (t.isNumericLiteral(node))
            return { type: "literal", value: node.value };
          if (t.isStringLiteral(node))
            return { type: "literal", value: node.value };

          return { type: "unknown", raw: node.type };
        }

        const ast = parser.parseExpression(code, {
          plugins: ["jsx"],
        });

        const tree = buildNode(ast);
        console.log("tree: ", JSON.stringify(tree, null, 2));

JSXExpressionContainer(path, state) {
        const exprPath = path.get("expression");
        const exprNode = exprPath.node;

        // Collect identifiers inside this expression
        const stateVars = new Set();
        const replacements = new Map();

        exprPath.traverse({
          Identifier(idPath) {
            const idName = idPath.node.name;
            console.log("idName: ", idName);
            // console.log("idName: ", idName);

            console.log("state.stateTable: ", state.stateTable);
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

        if (stateVars.size) {
          console.log(code, evaluated, stateVars, "\n\n");
          path.replaceWith(
            t.jSXExpressionContainer(
              t.objectExpression([
                t.objectProperty(
                  t.identifier("expression"),
                  t.stringLiteral(code)
                ),
                t.objectProperty(
                  t.identifier("eval"),
                  evaluated !== null
                    ? t.valueToNode(evaluated)
                    : t.nullLiteral()
                ),
                t.objectProperty(
                  t.identifier("vars"),
                  t.arrayExpression(
                    [...stateVars].map((v) => t.stringLiteral(v))
                  )
                ),
              ])
            )
          );
        }

        // Only transform if state variables are used
        // if (stateVars.length) {

        // }
      },

*/

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

const generate = require("@babel/generator").default;

module.exports = function ({ types: t }) {
  const ALLOWED_STATE_PROPERTY = ["size"];
  function isStateCallee(path, t) {
    const init = path.node.init;
    if (t.isCallExpression(init)) {
      const node = init.callee;

      if (t.isIdentifier(node, { name: "state" })) return true;

      if (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) {
        const isRectorObj = t.isIdentifier(node.object, { name: "Rector" });

        let isDefine =
          (!node.computed &&
            t.isIdentifier(node.property, { name: "state" })) ||
          (node.computed &&
            t.isStringLiteral &&
            t.isStringLiteral(node.property, { value: "state" }));

        return isRectorObj && isDefine;
      }
    }
    return false;
  }

  function isFromParentCallee(node, t) {
    // ensure destructuring
    if (!t.isObjectPattern(node.id)) return;

    const init = node.init;

    if (!t.isMemberExpression(init)) return;

    // detect .state / .list
    if (!t.isIdentifier(init.property)) return;
    const prop = init.property.name;

    if (prop !== "state" && prop !== "list") return;

    // detect from()
    if (!t.isCallExpression(init.object)) return;
    const call = init.object;

    if (!t.isIdentifier(call.callee, { name: "from" })) return;

    const vars = [];

    node.id.properties.forEach((p) => {
      if (t.isRestElement(p)) return;

      // const { state1 }
      if (t.isIdentifier(p.key) && t.isIdentifier(p.value)) {
        vars.push(p.value.name);
      }

      // const { state1: state2 }
      else if (t.isIdentifier(p.value)) {
        vars.push(p.value.name);
      }

      // const { [stateName]: state3 }
      else if (t.isComputedPropertyName && t.isIdentifier(p.value)) {
        vars.push(p.value.name);
      }
    });

    return vars;
  }

  function isUseGlobalCallee(init, t) {
    if (!t.isCallExpression(init)) return;

    const node = init.callee;
    if (t.isIdentifier(node, { name: "useGlobal" })) return true;

    if (t.isMemberExpression(node)) {
      const objOK = t.isIdentifier(node.object, { name: "Rector" });
      const propOK =
        (!node.computed &&
          t.isIdentifier(node.property, { name: "useGlobal" })) ||
        (node.computed &&
          t.isStringLiteral(node.property, { value: "useGlobal" }));
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
      if (!prevSv.has(crr)) {
        // acc.push(t.objectProperty(t.identifier(crr), t.identifier(crr)));
        acc.push(t.identifier(crr));
        prevSv.add(crr);
      }

      return acc;
    }, []);

    return stateArr;
  }

  function traverseNode2(path, stateRef) {
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
        if (stateRef.has(name) && isAccessible) {
          stateVars.push(name);
          return;
        }

        // if (stateRef.has(name)) {
        //   const propDetail = extStates[name];
        //   if (propDetail?.type === "declare") {
        //     if (
        //       (innerPath.parentPath.isMemberExpression() ||
        //         innerPath.parentPath.isOptionalMemberExpression()) &&
        //       parent.object === node // means we are the object part, not the property
        //     ) {
        //       const prop = parent.property;

        //       const grandParent = innerPath.parentPath.parentPath;

        //       const isValueAccess =
        //         (grandParent?.isMemberExpression() ||
        //           grandParent?.isOptionalMemberExpression()) &&
        //         grandParent.node.object === parent &&
        //         t.isIdentifier(grandParent.node.property, { name: "value" });

        //       if (!isValueAccess) return;

        //       // non-computed: data.name / data?.name
        //       if (t.isIdentifier(prop)) {
        //         const propertyName = prop.name;
        //         stateVars.push([propDetail?.parentName, propertyName]);
        //         return;
        //       }

        //       // computed: data["name"]
        //       if (t.isStringLiteral(prop)) {
        //         const propertyName = prop.value;
        //         stateVars.push([propDetail?.parentName, propertyName]);
        //         return;
        //       }
        //     }
        //   }

        //   if (propDetail?.type === "destruct") {
        //     if (isAccessible) stateVars.push([propDetail?.parentName, name]);
        //     return;
        //   }

        //   return;
        // }
      },
    });

    return stateVars;
  }

  function traverseStateProperty(path, stateRef) {
    const { node } = path;
    const obj = node.object;

    if (t.isIdentifier(obj)) {
      if (!stateRef.has(obj.name)) return;
      // console.log("obj.name: ", obj.name);
      const prop = node.property;
      let propName = null;

      if (!node.computed && t.isIdentifier(prop)) {
        // posts.size
        propName = prop.name;
      }

      if (node.computed && t.isStringLiteral(prop)) {
        // posts['size']
        propName = prop.value;
      }

      if (!propName) return;
      if (ALLOWED_STATE_PROPERTY.includes(propName)) {
        return obj.name;
      }
    }
  }

  function traverseNode(path, stateRef) {
    let stateVars = [];

    if (path.isCallExpression()) {
      const { callee, arguments: args } = path.node;
      if (!t.isIdentifier(callee)) return;
      const stateName = callee.name;
      if (stateRef.has(stateName)) {
        if (args.length !== 0) {
          throw path.buildCodeFrameError(
            `${callee.name}() is a reactive state, it does not accept arguments.`,
          );
        }
        stateVars.push(stateName);
      }
      return stateVars;
    }

    if (path.isMemberExpression()) {
      const memberProp = traverseStateProperty(path, stateRef);
      if (memberProp) {
        stateVars.push(memberProp);
      }
      return stateVars;
    }

    path.traverse({
      MemberExpression(mbPath) {
        const memberProp = traverseStateProperty(mbPath, stateRef);
        if (memberProp) {
          stateVars.push(memberProp);
        }
        return;
      },
      CallExpression(callPath) {
        const { callee, arguments: args } = callPath.node;
        if (!t.isIdentifier(callee)) return;
        const stateName = callee.name;
        if (stateRef.has(stateName)) {
          if (args.length !== 0) {
            throw path.buildCodeFrameError(
              `${callee.name}() is a reactive state, it does not accept arguments.`,
            );
          }
          stateVars.push(stateName);
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
            if (t.isImportSpecifier(spec)) {
              if (spec.imported.name === "For") {
                state.systemComponents?.push(spec.local.name);
              }
            }

            // if (spec.imported.name === "For") {
            //   state.systemComponents?.push(spec.local.name);
            // }
          });
        }
      },
      FunctionDeclaration: {
        enter(path, state) {
          if (!isComponentFunction(path)) return;

          path.setData("isComponent", true);

          state.stateTable = new Set();
        },
        exit(path, state) {
          if (path?.getData("isComponent")) state.stateTable = null;
        },
      },
      FunctionExpression: {
        enter(path, state) {
          if (!isComponentFunction(path)) return;

          path.setData("isComponent", true);
          state.stateTable = new Set();
        },
        exit(path, state) {
          if (path?.getData("isComponent")) state.stateTable = null;
        },
      },
      ArrowFunctionExpression: {
        enter(path, state) {
          if (!isComponentFunction(path)) return;

          path.setData("isComponent", true);
          state.stateTable = new Set();
        },
        exit(path, state) {
          if (path?.getData("isComponent")) state.stateTable = null;
        },
      },

      VariableDeclarator(path, state) {
        // Track: const count = state("mycount", 0);

        if (isStateCallee(path, t)) {
          state.stateTable.add(path.node.id.name);
        }

        const node = path.node;
        const tempVars = isFromParentCallee(node, t);
        if (tempVars) {
          tempVars?.forEach((stateName) => {
            state.stateTable.add(stateName);
          });
        }

        if (isUseGlobalCallee(node.init, t)) {
          // Case 1: const { s1, s2 } = useGlobal()
          if (t.isObjectPattern(node.id)) {
            node.id.properties.forEach((p) => {
              if (t.isRestElement(p)) return;

              // const { state1 }
              if (t.isIdentifier(p.key) && t.isIdentifier(p.value)) {
                state.stateTable.add(p.value.name);
              }

              // const { state1: state2 }
              else if (t.isIdentifier(p.value)) {
                state.stateTable.add(p.value.name);
              }

              // const { [stateName]: state3 }
              else if (t.isComputedPropertyName && t.isIdentifier(p.value)) {
                state.stateTable.add(p.value.name);
              }
            });
          } else {
            throw path.buildCodeFrameError(
              `Extract state from useGlobal() as destructured properties. const { state1, state2 } = useGlobal().`,
            );
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

          const statesRef = (state && state.stateTable) || this.stateTable;
          if (!statesRef) return;
          // console.log("statesRef: ", statesRef);
          // const { localStates = {}, extStates = {} } = stateProps ?? {};

          const node = exprPath.node;

          // Traverse only the expression subtree with correct scope/parent info
          const stateVars = traverseNode(exprPath, statesRef);
          const code = generate(node).code;
          console.log("code: ", code, "\n\n");
          if (!stateVars.length) return;
          // console.log(":::", tempVars);

          const stateArr = getStateConfig(stateVars);

          const wrappedExpression = t.objectExpression([
            t.objectProperty(
              t.identifier("states"),
              t.arrayExpression(stateArr),
            ),
            t.objectProperty(
              t.identifier("eval"),
              t.arrowFunctionExpression([], node),
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

          const stateRef = (state && state.stateTable) || this.stateTable;
          if (!stateRef) return;

          const { test, consequent, alternate } = exprPath.node;

          const testPath = path.get("expression.test");
          const testStateVars = traverseNode(testPath, stateRef);
          const code = generate(exprPath.node).code;
          console.log("code: ", code, "\n\n");

          if (!testStateVars.length) return;

          const stateArr = getStateConfig(testStateVars);

          let conditionData = [
            t.objectProperty(
              t.identifier("eval"),
              t.arrowFunctionExpression([], test),
            ),
            t.objectProperty(
              t.identifier("states"),
              t.arrayExpression(stateArr),
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

/*

  // 🟢 Handle simple {count} or {someState} expressions directly
          if (t.isIdentifier(node)) {
            const name = node.name;
            // console.log("name: ", name);
            if (statesRef.has(name)) {
              const stateArr = getStateConfig([name]);

              const wrappedExpression = t.objectExpression([
                t.objectProperty(
                  t.identifier("states"),
                  t.arrayExpression(stateArr),
                ),
                t.objectProperty(
                  t.identifier("eval"),
                  t.arrowFunctionExpression(
                    [], // t.objectPattern(stateContext)
                    node,
                  ),
                ),
              ]);

              path.replaceWith(t.jsxExpressionContainer(wrappedExpression));
              path.skip();
              return;
            }

            return;
          }

 JSXExpressionContainer(path, state) {
        const exprPath = path.get("expression");

        if (!exprPath || !exprPath.node) return;

        if (t.isJSXEmptyExpression(exprPath)) return;

        const stateProps = (state && state.stateTable) || this.stateTable;
        const { localStates = {}, extStates = {} } = stateProps ?? {};

        if (exprPath.isConditionalExpression()) {
          const { test, consequent, alternate } = exprPath.node;

          const testPath = path.get(`expression.test`);
          const testStateVars = traverseNode(testPath, localStates, extStates);

          if (!testStateVars.length) return;

          const CONDITION_KEYS = [
            { identifier: "condition", value: test, stateVars: testStateVars },
            { key: "consequent", identifier: "then", value: consequent },
            { key: "alternate", identifier: "else", value: alternate },
          ];

          const conditionData = CONDITION_KEYS.map((type) => {
            if (type.stateVars) {
              const { stateArr, stateContext } = getStateConfig(type.stateVars);

              return t.objectProperty(
                t.identifier(type.identifier),
                t.objectExpression([
                  t.objectProperty(
                    t.identifier("eval"),
                    t.arrowFunctionExpression(
                      [t.objectPattern(stateContext)],
                      type.value
                    )
                  ),
                  t.objectProperty(
                    t.identifier("states"),
                    t.arrayExpression(stateArr)
                  ),
                ])
              );
            }

            const tempPath = path.get(`expression.${type.key}`);
            const stateVars = traverseNode(tempPath, localStates, extStates);
            const { stateArr, stateContext } = getStateConfig(stateVars);

            return t.objectProperty(
              t.identifier(type.identifier),
              t.objectExpression([
                t.objectProperty(
                  t.identifier("eval"),
                  t.arrowFunctionExpression(
                    [t.objectPattern(stateContext)],
                    type.value
                  )
                ),
                t.objectProperty(
                  t.identifier("states"),
                  t.arrayExpression(stateArr)
                ),
              ])
            );
          });

          const wrappedExpression = t.objectExpression(conditionData);

          path.replaceWith(t.jsxExpressionContainer(wrappedExpression));

          // CRITICAL: skip traversing the just-created node to avoid re-entering plugin logic
          path.skip();

          return;
        }

        const node = exprPath.node;
        // 🟢 Handle simple {count} or {someState} expressions directly
        if (t.isIdentifier(node)) {
          const name = node.name;
          // console.log("name: ", name);
          if (localStates && localStates[name]) {
            const statName = localStates[name];
            node.name = statName;

            const { stateArr, stateContext } = getStateConfig([statName]);

            const wrappedExpression = t.objectExpression([
              t.objectProperty(
                t.identifier("states"),
                t.arrayExpression(stateArr)
              ),
              t.objectProperty(
                t.identifier("exprEval"),
                t.arrowFunctionExpression([t.objectPattern(stateContext)], node)
              ),
            ]);

            path.replaceWith(t.jsxExpressionContainer(wrappedExpression));
            path.skip();
            return; // ✅ handled, no need to continue
          }

          if (extStates && extStates[name]) {
            const propDetail = extStates[name];

            if (propDetail?.type === "destruct") {
              const { stateArr, stateContext } = getStateConfig([
                [propDetail?.parentName, name],
              ]);
              node.name = propDetail?.parentName + "." + name;
              const objExpr = t.objectExpression([
                t.objectProperty(
                  t.identifier("exprEval"),
                  t.arrowFunctionExpression(
                    [t.objectPattern(stateContext)],
                    node
                  )
                ),
                t.objectProperty(
                  t.identifier("states"),
                  t.arrayExpression(stateArr)
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

        if (!stateVars.length) return;

        // console.log(":::", tempVars);
        const code = generate(node).code;
        console.log("code: ", code, "\n\n");

        const { stateArr, stateContext } = getStateConfig(stateVars);

        const wrappedExpression = t.objectExpression([
          t.objectProperty(t.identifier("states"), t.arrayExpression(stateArr)),
          t.objectProperty(
            t.identifier("exprEval"),
            t.arrowFunctionExpression([t.objectPattern(stateContext)], node)
          ),
        ]);

        // Replace the JSXExpressionContainer with the object wrapped in a JSXExpressionContainer
        path.replaceWith(t.jsxExpressionContainer(wrappedExpression));

        // CRITICAL: skip traversing the just-created node to avoid re-entering plugin logic
        path.skip();
      },

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

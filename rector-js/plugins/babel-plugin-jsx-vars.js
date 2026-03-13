const generate = require("@babel/generator").default;
const extractVarsFromExprString = require("./helper");
const PARSER_PLUGINS = [
  "optionalChaining",
  "nullishCoalescingOperator",
  "logicalAssignment",
  // add more if your code uses them
];

module.exports = function ({ types: t }) {
  function tryInlineExpressionContainer(exprNode, jsxPath) {
    // exprNode is a Node (child.expression)
    if (!exprNode) return { inlined: false };

    // String, Number, Boolean, Null
    if (
      t.isStringLiteral(exprNode) ||
      t.isNumericLiteral(exprNode) ||
      t.isBooleanLiteral(exprNode) ||
      t.isNullLiteral(exprNode)
    ) {
      // get code representation (strings keep quotes)

      // const code = generate(exprNode, { concise: true }).code; ********

      let code;
      if (t.isStringLiteral(exprNode)) {
        code = exprNode.value; // raw, no quotes
      } else {
        code = generate(exprNode, { concise: true }).code;
      }
      return { inlined: true, code };
    }

    // Identifier => maybe a const in same scope
    if (t.isIdentifier(exprNode)) {
      const name = exprNode.name;
      const binding = jsxPath.scope.getBinding(name);

      if (binding && binding.kind === "param") {
        return { inlined: false };
      }

      if (binding) {
        try {
          const initPath = binding.path.get("init");
          if (initPath) {
            const ev = initPath.evaluate();
            if (ev && ev.confident) {
              // inline value using JSON.stringify (strings will have quotes)
              if (typeof ev.value === "string") {
                // keep plain text without wrapping quotes
                return { inlined: true, code: ev.value };
              } else {
                // numbers/booleans/null → keep JSON form
                return { inlined: true, code: JSON.stringify(ev.value) };
              }
            }
          }
        } catch {
          // ignore
        }
      }
      // Not inlinable, return identifier name (no braces) so it parses as an identifier later
      return { inlined: true, code: name };
    }

    return { inlined: false };
  }

  return {
    name: "flatten-and-extract-double-bracket",
    visitor: {
      JSXElement(path) {
        const oldChildren = path.node.children;
        const newChildren = [];
        let buffer = "";
        const pushBufferedChunks = () => {
          if (buffer === "") return;

          // Now we have a concatenated string (constants inlined).
          // Find all [[ ... ]] markers inside it and replace them with objects.
          const regex = /\[\[([\s\S]+?)\]\]/g;
          let lastIndex = 0;
          let m;
          while ((m = regex.exec(buffer)) !== null) {
            const before = buffer.slice(lastIndex, m.index);
            if (before) {
              newChildren.push(t.jsxText(before));
            }

            // inner expression text (should already have inlined constants)
            const innerRaw = m[1].trim();

            // compute vars using parser + traverse (build-time)
            const vars = extractVarsFromExprString(innerRaw, PARSER_PLUGINS);

            // produce object { expression: "...", vars: [...] }
            const objExpr = t.objectExpression([
              t.objectProperty(
                t.identifier("expression"),
                t.stringLiteral(innerRaw)
              ),
              t.objectProperty(
                t.identifier("vars"),
                t.arrayExpression(
                  vars.map((v) => {
                    if (Array.isArray(v)) {
                      // nested array like ['user','name']
                      return t.arrayExpression(
                        v.map((item) => t.stringLiteral(item))
                      );
                    }
                    // simple string
                    return t.stringLiteral(v);
                  })
                )
              ),
            ]);

            newChildren.push(t.jsxExpressionContainer(objExpr));

            lastIndex = regex.lastIndex;
          }

          // trailing tail after last match
          if (lastIndex < buffer.length) {
            newChildren.push(t.jsxText(buffer.slice(lastIndex)));
          }

          buffer = "";
        };

        // iterate over children; merge consecutive text/simple-expression nodes into `buffer`.
        for (const child of oldChildren) {
          if (t.isJSXText(child)) {
            buffer += child.value;
            continue;
          }

          if (t.isJSXExpressionContainer(child)) {
            // try to inline if simple literal or same-file const; else treat as complex expression
            const inline = tryInlineExpressionContainer(child.expression, path);
            if (inline.inlined) {
              buffer += inline.code;
              continue;
            } else {
              // complex expression -> flush buffer first, then keep the complex expression node as-is
              pushBufferedChunks();
              newChildren.push(child);
              continue;
            }
          }

          // any other child (JSXElement, JSXFragment, etc.) -> flush buffer and push child
          pushBufferedChunks();
          newChildren.push(child);
        }

        // flush remaining buffer
        pushBufferedChunks();

        // replace children
        path.node.children = newChildren;
      },
    },
  };
};

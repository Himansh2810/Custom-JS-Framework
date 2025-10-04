const generate = require("@babel/generator").default;
const extractVarsFromExprString = require("./helper");
const PARSER_PLUGINS = ["jsx"];

module.exports = function ({ types: t }) {
  return {
    visitor: {
      JSXOpeningElement(path) {
        const tag = path.node.name;

        if (tag?.name === "Condition") {
          const exprAttr = path.node.attributes.find(
            (a) => t.isJSXAttribute(a) && a.name.name === "expression"
          );

          if (!exprAttr || !exprAttr.value) return;

          let rawExpr;

          if (t.isStringLiteral(exprAttr.value)) {
            rawExpr = exprAttr.value.value;
          } else if (t.isJSXExpressionContainer(exprAttr.value)) {
            const inner = exprAttr.value.expression;

            if (t.isStringLiteral(inner)) {
              // <Condition expression={'count > 2'} />
              rawExpr = inner.value;
            } else if (t.isTemplateLiteral(inner)) {
              // Evaluate each ${...} if it's a constant
              rawExpr = inner.quasis
                .map((q, i) => {
                  const expr = inner.expressions[i];
                  if (!expr) return q.value.cooked; // last tail
                  let evaluated = null;

                  // Try to evaluate expression from scope (like a const)
                  try {
                    const binding = path.scope.getBinding(expr.name);
                    if (binding) {
                      const init = binding.path.get("init");
                      const ev = init.evaluate();
                      if (ev.confident) evaluated = ev.value;
                    }
                  } catch {}

                  // If evaluated use value, else leave as ${code}
                  const exprCode =
                    evaluated !== null
                      ? evaluated
                      : `\${${generate(expr).code}}`;

                  return q.value.cooked + exprCode;
                })
                .join("");
            } else {
              // fallback for any other expression
              rawExpr = generate(inner).code;
            }
          } else {
            // unexpected node (rare)
            rawExpr = generate(exprAttr.value).code;
          }

          const vars = extractVarsFromExprString(rawExpr, PARSER_PLUGINS);

          exprAttr.value = t.jsxExpressionContainer(
            t.objectExpression([
              t.objectProperty(
                t.identifier("expression"),
                t.stringLiteral(rawExpr)
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
            ])
          );
        }
      },
    },
  };
};

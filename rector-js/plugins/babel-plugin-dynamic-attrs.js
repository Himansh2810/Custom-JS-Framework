const generate = require("@babel/generator").default;
const extractVarsFromExprString = require("./helper");
const PARSER_PLUGINS = ["jsx"];

module.exports = function ({ types: t }) {
  return {
    visitor: {
      JSXAttribute(path) {
        const attrValue = path.node.value;

        // we only care about JSXExpressionContainer
        if (!t.isJSXExpressionContainer(attrValue)) return;
        if (!t.isObjectExpression(attrValue.expression)) return;

        // find `{ _: "..." }`
        const obj = attrValue.expression;
        const underscoreProp = obj.properties.find(
          (p) => t.isObjectProperty(p) && t.isIdentifier(p.key, { name: "_" })
        );

        if (!underscoreProp) return;

        const exprNode = underscoreProp.value;

        let rawExpr = "";

        // const firstVar = rawExpression.split(".")[0]; // e.g. "product"

        if (t.isTemplateLiteral(exprNode)) {
          if (t.isTemplateLiteral(exprNode)) {
            rawExpr = exprNode.quasis
              .map((q, i) => {
                let exprVal = "";
                const expr = exprNode.expressions[i];
                if (expr) {
                  if (t.isIdentifier(expr)) {
                    const binding = path.scope.getBinding(expr.name);
                    if (binding) {
                      try {
                        const ev = binding.path.get("init").evaluate();
                        if (ev.confident) {
                          exprVal = ev.value; // <-- this is actual evaluated value
                        } else {
                          exprVal = expr.name; // fallback
                        }
                      } catch {
                        exprVal = expr.name;
                      }
                    } else {
                      exprVal = expr.name;
                    }
                  } else {
                    // fallback for other expression types
                    exprVal = generate(expr).code;
                  }
                }
                return q.value.cooked + exprVal;
              })
              .join("");
          }
        }
        // Plain string
        else if (t.isStringLiteral(exprNode)) {
          rawExpr = exprNode.value;
        } else {
          // fallback for any other expressions
          rawExpr = generate(exprNode).code;
        }

        const vars = extractVarsFromExprString(rawExpr, PARSER_PLUGINS);

        path.node.value = t.jsxExpressionContainer(
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
      },
    },
  };
};

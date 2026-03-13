const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

function extractVarsFromExprString(exprStr, PARSER_PLUGINS) {
  try {
    const ast = parser.parse(`(${exprStr})`, {
      sourceType: "module",
      plugins: PARSER_PLUGINS,
    });

    const vars = new Set();

    traverse(ast, {
      Identifier(path) {
        const { node, parent } = path;
        const name = node.name;

        // Skip keys in object literals
        if (
          parent.type === "ObjectProperty" &&
          parent.key === node &&
          !parent.computed
        )
          return;

        // Skip property identifiers (user.name → skip 'name')
        if (
          (parent.type === "MemberExpression" ||
            parent.type === "OptionalMemberExpression") &&
          parent.property === node &&
          !parent.computed
        )
          return;

        if (name === "undefined") return;

        // If this identifier is object of a member chain, collect only the first property
        if (
          parent.type === "MemberExpression" ||
          parent.type === "OptionalMemberExpression"
        ) {
          if (parent.property.type === "Identifier" && !parent.computed) {
            vars.add(JSON.stringify([name, parent.property.name]));
          } else {
            vars.add(name);
          }
          return;
        }

        vars.add(name);
      },
    });

    return Array.from(vars).map((v) => {
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    });
  } catch {
    return [];
  }
}

module.exports = extractVarsFromExprString;

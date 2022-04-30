import { TreeCursor } from 'lezer';
import { parser } from 'lezer-python';
import { Parameter, Stmt, Expr, Type, UniOp, BinOp, Literal } from './ast';

export function parseProgram(source: string): Array<Stmt<Type>> {
  const t = parser.parse(source).cursor();
  return traverseStmts(source, t);
}

export function traverseStmts(s: string, t: TreeCursor) {
  // The top node in the program is a Script node with a list of children
  // that are various statements
  t.firstChild();
  const stmts = [];
  do {
    stmts.push(traverseStmt(s, t));

  } while (t.nextSibling()); // t.nextSibling() returns false when it reaches
  //  the end of the list of children
  return stmts;
}

/*
  Invariant – t must focus on the same node at the end of the traversal
*/
export function traverseStmt(s: string, t: TreeCursor): Stmt<any> {
  switch (t.type.name) {
    case "ReturnStatement":
      t.firstChild();  // Focus return keyword
      t.nextSibling(); // Focus expression
      var value = traverseExpr(s, t);
      t.parent();
      return { tag: "return", value };
    case "AssignStatement":
      t.firstChild(); // focused on name (the first child)
      var name = s.substring(t.from, t.to);
      t.firstChild();
      t.nextSibling();
      const isObject = s.substring(t.from, t.to); // check if object

      if (isObject.charAt(0) == ".") {
        t.prevSibling();
        t.nextSibling();
        t.nextSibling();
        name = s.substring(t.from, t.to);
        var clsvar: Expr<any> = { tag: "clsvar", name, expr: traverseExpr(s, t) };
        t.parent();
      }
      else {
        t.prevSibling();
      }

      t.nextSibling(); // focused on = sign. May need this for complex tasks, like +=!
      var type = "none";
      if (s.substring(t.from, t.to) != "=") {
        t.firstChild();
        t.nextSibling();
        type = s.substring(t.from, t.to);
        t.parent();
        t.nextSibling();
      }
      t.nextSibling(); // focused on the value expression
      var value = traverseExpr(s, t);
      if (value.tag == "object") {
        value.name = name;
      }
      t.parent();
      if (type !== "none") {
        if (type !== "int" && type !== "bool") {
          return { tag: "vardef", name, value, a: { tag: "object", class: type } };
        }
        return { tag: "vardef", name, value, a: type };
      }

      if (isObject.charAt(0) == ".") {
        return { tag: "assign", name: clsvar, value };
      }

      return { tag: "assign", name, value };
    case "ExpressionStatement":
      t.firstChild();
      var expr = traverseExpr(s, t);
      t.parent();
      return { tag: "expr", expr: expr };
    case "IfStatement":
      t.firstChild();
      t.nextSibling();

      const ifcond = traverseExpr(s, t);
      t.nextSibling();
      t.firstChild();
      const ifbody = [];
      while (t.nextSibling()) {
        ifbody.push(traverseStmt(s, t));
      }
      t.parent();

      t.nextSibling();
      var elifbody = [];
      var elifcond;
      if (s.substring(t.from, t.to) == "elif") {
        t.nextSibling();
        elifcond = traverseExpr(s, t);
        t.nextSibling();
        t.firstChild();
        while (t.nextSibling()) {
          elifbody.push(traverseStmt(s, t));
        }
        t.parent();
      }
      if (elifbody.length > 0) {
        t.nextSibling();
      }

      var elsebody = [];
      if (s.substring(t.from, t.to) == "else") {
        t.nextSibling();
        t.nextSibling();
        t.firstChild();
        while (t.nextSibling()) {
          elsebody.push(traverseStmt(s, t));
        }
        t.parent();
      }
      t.parent();
      return { tag: "if", ifcond, ifbody, elifcond, elifbody, elsebody }
    case "WhileStatement":
      t.firstChild();
      t.nextSibling();

      const cond = traverseExpr(s, t);
      t.nextSibling();
      t.firstChild();
      const whilebody = [];
      while (t.nextSibling()) {
        whilebody.push(traverseStmt(s, t));
      }
      t.parent();
      t.parent();
      return { tag: "while", cond, body: whilebody }
    case "FunctionDefinition":
      t.firstChild();  // Focus on def
      t.nextSibling(); // Focus on name of function
      var name = s.substring(t.from, t.to);
      t.nextSibling(); // Focus on ParamList
      var params = traverseParameters(s, t);
      t.nextSibling(); // Focus on Body or TypeDef
      let ret: Type = "none";
      let maybeTD = t;
      if (maybeTD.type.name === "TypeDef") {
        t.firstChild();
        ret = traverseType(s, t);
        t.parent();
      }
      t.nextSibling(); // Focus on single statement (for now)
      t.firstChild();  // Focus on :
      const body = [];
      while (t.nextSibling()) {
        body.push(traverseStmt(s, t));
      }
      t.parent();      // Pop to Body
      t.parent();      // Pop to FunctionDefinition
      return {
        tag: "funcdef",
        name, params, body, ret
      }
    case "ClassDefinition":
      t.firstChild();
      t.nextSibling(); // class name
      const class_name = s.substring(t.from, t.to);
      t.nextSibling(); // object parameter in class
      t.nextSibling(); // colon
      t.nextSibling(); // entire function body
      t.firstChild(); // colon

      const class_methods = []
      const class_vars = []

      while (t.nextSibling()) {
        var stmt = traverseStmt(s, t);
        if (stmt.tag == "vardef") {
          class_vars.push(stmt);
        }
        if (stmt.tag == "funcdef") {
          class_methods.push(stmt);
        }
      }

      t.parent();
      t.parent();
      return { tag: "clsdef", name: class_name, varDefs: class_vars, methodDefs: class_methods };
    case "PassStatement":
      return { tag: "pass" }
  }
}

export function traverseType(s: string, t: TreeCursor): Type {
  switch (t.type.name) {
    case "VariableName":
      const name = s.substring(t.from, t.to);
      if (!(name == "int" || name == "bool")) {
        return { tag: "object", class: name };
      }
      return name;
  }
}

export function traverseParameters(s: string, t: TreeCursor): Array<Parameter> {
  t.firstChild();  // Focuses on open paren
  const parameters = []
  t.nextSibling(); // Focuses on a VariableName
  while (t.type.name !== ")") {
    let name = s.substring(t.from, t.to);
    t.nextSibling(); // Focuses on "TypeDef", hopefully, or "," if mistake

    let nextTagName = t.type.name;
    if (nextTagName !== "TypeDef") { throw new Error("ParseError: Parameter type not mentioned " + name) };
    t.firstChild();  // Enter TypeDef
    t.nextSibling(); // Focuses on type itself
    var type = traverseType(s, t);
    t.parent();
    t.nextSibling(); // Move on to comma or ")"
    parameters.push({ name, type });
    t.nextSibling(); // Focuses on a VariableName
  }
  t.parent();       // Pop to ParamList
  return parameters;
}

export function traverseExpr(s: string, t: TreeCursor): Expr<any> {
  switch (t.type.name) {
    case "Number":
    case "Boolean":
    case "None":
      return { tag: "literal", value: traverseLiteral(s, t) };
    case "VariableName":
      return { tag: "id", name: s.substring(t.from, t.to) };
    case "UnaryExpression":
      t.firstChild(); // op
      const uniOpName = s.substring(t.from, t.to);
      var uniOp: UniOp;
      switch (uniOpName) {
        case "not":
          uniOp = UniOp.Not;
          break;
        case "-":
          uniOp = UniOp.Neg;
          break;
        default:
          throw new Error("ParseError: Could not parse unary expr at " + t.node.from + " " + t.node.to);
      }
      t.nextSibling(); // expr
      const uniExpr = traverseExpr(s, t);
      t.parent();
      return { tag: "uniop", op: uniOp, expr: uniExpr };
    case "BinaryExpression":
      t.firstChild(); // left
      const left = traverseExpr(s, t);
      t.nextSibling(); // op
      const binOpName = s.substring(t.from, t.to);
      var binOp: BinOp;
      switch (binOpName) {
        case "+":
          binOp = BinOp.Plus;
          break;
        case "-":
          binOp = BinOp.Minus;
          break;
        case "*":
          binOp = BinOp.Mul;
          break;
        case "//":
          binOp = BinOp.Div;
          break;
        case "%":
          binOp = BinOp.Mod;
          break;
        case "==":
          binOp = BinOp.Eq;
          break;
        case "!=":
          binOp = BinOp.Neq;
          break;
        case "<=":
          binOp = BinOp.Lte;
          break;
        case ">=":
          binOp = BinOp.Gte;
          break;
        case "<":
          binOp = BinOp.Lt;
          break;
        case ">":
          binOp = BinOp.Gt;
          break;
        case "is":
          binOp = BinOp.Is;
          break;
        default:
          throw new Error("ParseError: Could not parse binary expr at " + t.node.from + " " + t.node.to);
      }
      t.nextSibling(); // right
      const right = traverseExpr(s, t);
      t.parent();
      return { tag: "binop", op: binOp, left, right };
    case "ParenthesizedExpression":
      t.firstChild();
      t.nextSibling();
      const expr = traverseExpr(s, t);
      t.parent()
      return expr;
    case "CallExpression":
      t.firstChild();
      t.firstChild(); // expr
      var name = s.substring(t.from, t.to);
      t.nextSibling(); //args or last method
      if (s.substring(t.from, t.to).startsWith("(")) {
        var args = traverseArguments(t, s);
        if (name !== "print") {
          t.parent();
          return { tag: "constructor", name };
        }
        var args = traverseArguments(t, s);
        t.parent();
        return { tag: "print", args };
      }
      else {
        t.prevSibling();
        var exp = traverseExpr(s, t);
        t.nextSibling();
        t.nextSibling();
        var name = s.substring(t.from, t.to);
        t.nextSibling();
        t.parent();
        t.nextSibling();
        var args = traverseArguments(t, s);
        t.parent();
        return { tag: "clsmethod", name, args, expr: exp };
      }
    case "MemberExpression":
      t.firstChild();
      var exp = traverseExpr(s, t);
      t.nextSibling();
      t.nextSibling();
      var name = s.substring(t.from, t.to);
      t.parent();
      return { tag: "clsvar", name: name, expr: exp };
  }
}

export function traverseArguments(c: TreeCursor, s: string): Expr<any>[] {
  c.firstChild();  // Focuses on open paren
  const args = [];
  c.nextSibling();
  while (c.type.name !== ")") {
    let expr = traverseExpr(s, c);
    args.push(expr);
    c.nextSibling(); // Focuses on either "," or ")"
    c.nextSibling(); // Focuses on a VariableName
  }
  c.parent();       // Pop to ArgList
  return args;
}

export function traverseLiteral(s: string, c: TreeCursor): Literal {
  switch (c.type.name) {
    case "Number":
      const num = Number(s.substring(c.from, c.to));
      return { tag: "number", value: num };
    case "Boolean":
      const bool = s.substring(c.from, c.to) === "True";
      return { tag: "bool", value: bool };
    default:
      throw new Error("ParseError: Could not parse literal at " + c.node.from + " " + c.node.to);
  }
}
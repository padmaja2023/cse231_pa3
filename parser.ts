import { TreeCursor } from 'lezer';
import { parser } from 'lezer-python';
import { Parameter, Stmt, Expr, Type } from './ast';

var binops = ["+", "-", "*", "//", "%", "==", "!=", "<=", ">=", "<", ">", "is"]
var uniops = ["+", "-", "not"]

export function parseProgram(source: string): Array<Stmt<any>> {
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
      const nxt = s.substring(t.from, t.to);

      if (nxt.charAt(0) == ".") {
        t.prevSibling();
        var exp = traverseExpr(s, t);
        t.nextSibling();
        t.nextSibling();
        name = s.substring(t.from, t.to);
        var class_var_exp: Expr<any> = { tag: "clsvar", name, expr: exp };
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

      if (nxt.charAt(0) == ".") {
        return { tag: "assign", name: class_var_exp, value };
      }

      return { tag: "assign", name, value };
    case "ExpressionStatement":
      t.firstChild(); // The child is some kind of expression, the
      // ExpressionStatement is just a wrapper with no information
      var expr = traverseExpr(s, t);
      t.parent();
      return { tag: "expr", expr: expr };
    case "IfStatement":
      t.firstChild();
      t.nextSibling();
      const ifcondition = traverseExpr(s, t);
      t.nextSibling();
      t.firstChild();
      const ifbody = [];
      while (t.nextSibling()) {
        ifbody.push(traverseStmt(s, t));
      }
      t.parent();

      t.nextSibling();
      var elifbody = [];
      var elifcondition;
      if (s.substring(t.from, t.to) == "elif") {
        t.nextSibling();;
        elifcondition = traverseExpr(s, t);
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
      let else_body = [];
      if (s.substring(t.from, t.to) == "else") {
        t.nextSibling();
        t.nextSibling();
        t.firstChild();

        while (t.nextSibling()) {
          else_body.push(traverseStmt(s, t));
        }
        t.parent();
      }
      t.parent();
      var result: Stmt<any> = {
        tag: "if", if_condition: ifcondition, elif_condition: elifcondition, if_body: ifbody,
        else_body: else_body, elif_body: elifbody
      }
      return result
    case "FunctionDefinition":
      t.firstChild();  // Focus on def
      t.nextSibling(); // Focus on name of function
      var name = s.substring(t.from, t.to);
      t.nextSibling(); // Focus on ParamList
      var params = traverseParameters(s, t)
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
        tag: "define",
        name, params, body, ret
      }

    case "PassStatement":
      return { tag: "pass" }
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
        if (stmt.tag == "define") {
          class_methods.push(stmt);
        }
      }

      t.parent();
      t.parent();
      return { tag: "clsdef", name: class_name, varDefs: class_vars, methodDefs: class_methods };

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
    default:
      return "object"

  }
}

export function traverseParameters(s: string, t: TreeCursor): Parameter[] {
  t.firstChild();  // Focuses on open paren
  const parameters = []
  t.nextSibling(); // Focuses on a VariableName
  while (t.type.name !== ")") {
    let name = s.substring(t.from, t.to);
    t.nextSibling(); // Focuses on "TypeDef", hopefully, or "," if mistake
    let nextTagName = t.type.name; // NOTE(joe): a bit of a hack so the next line doesn't if-split
    if (nextTagName !== "TypeDef") { throw new Error("TYPE ERROR: Parameter type not given " + name) };
    t.firstChild();  // Enter TypeDef
    t.nextSibling(); // Focuses on type itself
    let typ = traverseType(s, t);
    t.parent();
    t.nextSibling(); // Move on to comma or ")"
    parameters.push({ name, typ });
    t.nextSibling(); // Focuses on a VariableName
  }
  t.parent();       // Pop to ParamList
  return parameters;
}

export function traverseExpr(s: string, t: TreeCursor): Expr<any> {
  switch (t.type.name) {
    case "Boolean":
      if (s.substring(t.from, t.to) === "True") { return { tag: "true" }; }
      else { return { tag: "false" }; }
    case "None":
      return { tag: "id", name: "none", a: "none" };
    case "Number":
      return { tag: "number", value: Number(s.substring(t.from, t.to)) };
    case "VariableName":
      return { tag: "id", name: s.substring(t.from, t.to) };
    case "MemberExpression":
      t.firstChild();
      var exp = traverseExpr(s, t);
      t.nextSibling();
      t.nextSibling();
      var name = s.substring(t.from, t.to);
      t.parent();
      return { tag: "clsvar", name: name, expr: exp };
    case "CallExpression":
      t.firstChild();
      t.firstChild(); // expr
      var exp1 = s.substring(t.from, t.to);
      t.nextSibling(); //args or last method
      var exp2 = s.substring(t.from, t.to);
      if (exp2.startsWith("(")) {
        var args = traverseArguments(t, s);
        if (exp1 !== "print") {
          var result: Expr<any> = { tag: "constructor", name: exp1 };
          t.parent();
          return result;
        }
        var args = traverseArguments(t, s);
        var result: Expr<any> = { tag: "print", args: args };
        t.parent();
        return result;
      }
      else {
        t.prevSibling();
        var exp = traverseExpr(s, t);
        t.nextSibling();
        t.nextSibling();
        exp2 = s.substring(t.from, t.to);
        t.nextSibling();
        t.parent();
        t.nextSibling();
        var args = traverseArguments(t, s);
        t.parent();
        var result: Expr<any> = { tag: "clsmethod", expr: exp, name: exp2, args: args };
        return result;
      }
    case "ParenthesizedExpression":
      t.firstChild();
      t.nextSibling();
      const expr = traverseExpr(s, t);
      t.parent()
      return expr;
    case "UnaryExpression":
      t.firstChild();
      const unaryop = s.substring(t.from, t.to);
      t.nextSibling();
      const val = traverseExpr(s, t);
      if (!uniops.includes(unaryop)) {
        throw new Error("TYPE ERROR: Invalid unary operation (not, +, -)")
      }
      t.parent();
      return {
        tag: "uniop", expr: val, op: unaryop
      }
    case "BinaryExpression":
      t.firstChild(); // go to lhs
      const lhsExpr = traverseExpr(s, t);
      t.nextSibling(); // go to op
      var opStr = s.substring(t.from, t.to);
      if (!binops.includes(opStr)) {
        throw new Error(`TYPE ERROR: Invalid binary operation (+,-,*,//,%,==,!=,<=,>=,<,> is)`);
      }
      t.nextSibling(); // go to rhs
      const rhsExpr = traverseExpr(s, t);
      t.parent();
      return {
        tag: "binop",
        op: opStr,
        lhs: lhsExpr,
        rhs: rhsExpr
      };

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
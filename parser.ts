import { TreeCursor } from 'lezer';
import { parser } from 'lezer-python';
import { BinOp, Expr, FuncDef, If, Literal, Parameter, Program, Stmt, Type, UniOp, VarDef } from './ast';
// import { stringifyTree } from "./treeprint";

export function parse(source: string): Program<any> {
  const t = parser.parse(source);
  return traverse(t.cursor(), source);
}

export function traverse(c: TreeCursor, s: string): Program<any> {
  switch (c.node.type.name) {
    case "Script":
      const varDefs: VarDef<any>[] = [];
      const funcDefs: FuncDef<any>[] = [];
      const stmts: Stmt<any>[] = [];

      var hasChild = c.firstChild();
      while (hasChild) {
        if (isVarDef(c, s)) {
          varDefs.push(traverseVarDef(c, s));
        } else if (isFuncDef(c, s)) {
          funcDefs.push(traverseFuncDef(c, s));
        } else {
          break;
        }
        hasChild = c.nextSibling();
      }

      while (hasChild) {
        stmts.push(traverseStmt(c, s));
        hasChild = c.nextSibling();
      }

      c.parent();
      console.log("traversed " + stmts.length + " statements ", stmts, "stopped at ", c.node);
      console.log("parsed: ", { varDefs, funcDefs, stmts });
      return { varDefs, funcDefs, stmts };
    default:
      throw new Error("Could not parse program at " + c.node.from + " " + c.node.to);
  }
}

export function isVarDef(c: TreeCursor, s: string): boolean {
  if (c.type.name === "AssignStatement") {
    c.firstChild();
    c.nextSibling();
    const isDef = (c.type.name as any) === "TypeDef";
    c.parent();
    return isDef;
  } else {
    return false;
  }
}

export function isFuncDef(c: TreeCursor, s: string): boolean {
  return c.type.name === "FunctionDefinition";
}

export function traverseVarDef(c: TreeCursor, s: string): VarDef<any> {
  c.firstChild(); // name
  const name = s.substring(c.from, c.to);
  c.nextSibling(); // type def
  c.firstChild(); // :
  c.nextSibling(); // type
  const type = traverseType(c, s);
  c.parent();
  c.nextSibling(); // =
  c.nextSibling(); // value
  const value = traverseLiteral(c, s);
  c.parent();
  return { name, type, value };
}

export function traverseType(c: TreeCursor, s: string): Type {
  if (c.type.name !== "VariableName") {
    throw new Error("Could not parse type at " + c.node.from + " " + c.node.to);
  }
  const typName = s.substring(c.from, c.to);
  switch (typName) {
    case "int":
      return Type.Int;
    case "bool":
      return Type.Bool;
    default:
      throw new Error("Unsupported type " + typName + " at " + c.node.from + " " + c.node.to);
  }
}

export function traverseLiteral(c: TreeCursor, s: string): Literal {
  switch (c.type.name) {
    case "Number":
      const num = Number(s.substring(c.from, c.to));
      return { tag: "number", value: num };
    case "Boolean":
      const bool = s.substring(c.from, c.to) === "True";
      return { tag: "bool", value: bool };
    default:
      throw new Error("Could not parse literal at " + c.node.from + " " + c.node.to);
  }
}

export function traverseFuncDef(c: TreeCursor, s: string): FuncDef<any> {
  c.firstChild(); // def
  c.nextSibling(); // name
  const name = s.substring(c.from, c.to);
  c.nextSibling(); // params
  const params = traverseParams(c, s);
  c.nextSibling(); // body or return type
  var ret: Type = Type.None;
  if (c.type.name === "TypeDef") {
    c.firstChild();
    ret = traverseType(c, s);
    c.parent();
    c.nextSibling();
  }
  c.firstChild(); // :
  const varDefs: VarDef<any>[] = [];
  const stmts: Stmt<any>[] = [];
  var hasChild = c.nextSibling();
  while (hasChild) {
    if (isVarDef(c, s)) {
      varDefs.push(traverseVarDef(c, s));
    } else {
      break;
    }
    hasChild = c.nextSibling();
  }
  while (hasChild) {
    stmts.push(traverseStmt(c, s));
    hasChild = c.nextSibling();
  }
  c.parent();
  c.parent();
  return { name, params, ret, varDefs, stmts };
}

export function traverseParams(c: TreeCursor, s: string): Parameter[] {
  c.firstChild(); // (
  const params: Parameter[] = [];
  c.nextSibling(); // var name
  while (c.type.name !== ")") {
    const name = s.substring(c.from, c.to);
    c.nextSibling(); // type def
    c.firstChild(); // :
    c.nextSibling(); // type
    const typ = traverseType(c, s);
    params.push({ name, typ });
    c.parent();
    c.nextSibling(); // , or )
    c.nextSibling(); // next var or )
  }
  c.parent();
  return params;
}

export function traverseStmt(c: TreeCursor, s: string): Stmt<any> {
  switch (c.node.type.name) {
    case "AssignStatement":
      c.firstChild(); // name
      const name = s.substring(c.from, c.to);
      c.nextSibling(); // =
      c.nextSibling(); // value
      const value = traverseExpr(c, s);
      c.parent();
      return { tag: "assign", name, value };
    case "IfStatement":
      c.firstChild(); // if
      c.nextSibling(); // cond
      const ifCond = traverseExpr(c, s);
      c.nextSibling(); // then
      c.firstChild(); // :
      const ifThn: Stmt<any>[] = [];
      c.nextSibling();
      do {
        ifThn.push(traverseStmt(c, s));
      } while (c.nextSibling());
      const iff: If<any> = { tag: "ifBlock", cond: ifCond, thn: ifThn }
      c.parent();
      const elif: If<any>[] = [];
      c.nextSibling() // elif or else or end
      if (c.name === "elif") {
        c.nextSibling(); // cond
        const elifCond = traverseExpr(c, s);
        c.nextSibling(); // then
        c.firstChild(); // :
        const elifThn: Stmt<any>[] = [];
        c.nextSibling();
        do {
          elifThn.push(traverseStmt(c, s));
        } while (c.nextSibling());
        c.parent();
        elif.push({ tag: "ifBlock", cond: elifCond, thn: elifThn })
      }
      // todo check
      const els: Stmt<any>[] = [];
      if (c.name === "else" || (c.nextSibling() && c.name === "else")) { // else or end
        c.nextSibling(); // else
        c.firstChild(); // :
        c.nextSibling();
        do {
          els.push(traverseStmt(c, s));
        } while (c.nextSibling());
        c.parent();
      }
      c.parent();
      return { tag: "if", iff, elif, els };
    case "WhileStatement":
      c.firstChild(); // while
      c.nextSibling(); // cond
      const cond = traverseExpr(c, s);
      c.nextSibling(); // stmts

      const stmts: Stmt<any>[] = [];
      c.firstChild(); // :
      c.nextSibling();
      do {
        stmts.push(traverseStmt(c, s));
      } while (c.nextSibling());
      c.parent();
      c.parent();
      return { tag: "while", cond, stmts };
    case "PassStatement":
      return { tag: "pass" };
    case "ReturnStatement":
      c.firstChild(); // return
      var ret: Expr<any>;
      if (c.nextSibling())
        ret = traverseExpr(c, s);
      else
        ret = { tag: "literal", value: { tag: "none" } };
      c.parent();
      return { tag: "return", value: ret };
    case "ExpressionStatement":
      c.firstChild(); // expr
      const expr = traverseExpr(c, s);
      c.parent();
      return { tag: "expr", expr };
    default:
      throw new Error("Could not parse stmt at " + c.node.from + " " + c.node.to);
  }
}

export function traverseExpr(c: TreeCursor, s: string): Expr<any> {
  switch (c.type.name) {
    case "Number":
    case "Boolean":
      return { tag: "literal", value: traverseLiteral(c, s) };
    case "VariableName":
      return { tag: "id", name: s.substring(c.from, c.to) };
    case "UnaryExpression":
      c.firstChild(); // op
      const uniOpName = s.substring(c.from, c.to);
      var uniOp: UniOp;
      switch (uniOpName) {
        case "not":
          uniOp = UniOp.Not;
          break;
        case "-":
          uniOp = UniOp.Neg;
          break;
        default:
          throw new Error("Could not parse uni expr at " + c.node.from + " " + c.node.to);
      }
      c.nextSibling(); // expr
      const uniExpr = traverseExpr(c, s);
      c.parent();
      return { tag: "uniop", op: uniOp, expr: uniExpr };
    case "BinaryExpression":
      c.firstChild(); // left
      const left = traverseExpr(c, s);
      c.nextSibling(); // op
      const binOpName = s.substring(c.from, c.to);
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
          throw new Error("Could not parse bin expr at " + c.node.from + " " + c.node.to);
      }
      c.nextSibling(); // right
      const right = traverseExpr(c, s);
      c.parent();
      return { tag: "binop", op: binOp, left, right };
    case "ParenthesizedExpression":
      c.firstChild(); // (
      c.nextSibling(); // expr
      const inner = traverseExpr(c, s);
      c.parent();
      return inner;
    case "CallExpression":
      c.firstChild(); // func name
      const funcName = s.substring(c.from, c.to);
      c.nextSibling(); // argList
      const args = traverseArgs(c, s);
      c.parent();

      if (funcName === "print" || funcName === "abs") {
        return { tag: "builtin1", name: funcName, arg: args[0] };
      } else if (funcName === "max" || funcName === "min" || funcName === "pow") {
        return { tag: "builtin2", name: funcName, arg1: args[0], arg2: args[1] };
      } else {
        return { tag: "call", name: funcName, args };
      }
    default:
      throw new Error("Could not parse expr at " + c.node.from + " " + c.node.to);
  }
}

export function traverseArgs(c: TreeCursor, s: string): Expr<any>[] {
  c.firstChild(); // (
  const args: Expr<any>[] = [];
  c.nextSibling(); // arg or )
  while (c.type.name !== ")") {
    args.push(traverseExpr(c, s));
    c.nextSibling(); // , or )
    c.nextSibling(); // arg or )
  }
  c.parent();
  return args;
}

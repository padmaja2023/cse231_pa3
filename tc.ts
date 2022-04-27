import { BinOp, Expr, FuncDef, Literal, Program, Stmt, Type, UniOp, VarDef } from "./ast";

export type GlobalTypeEnv = {
  vars: Map<string, Type>,
  funcs: Map<string, [Type[], Type]>,
}

export type LocalTypeEnv = {
  vars: Map<string, Type>,
  inFunc: boolean,
  ret: Type,
}

export function newLocalTypeEnv(): LocalTypeEnv {
  return { vars: new Map(), inFunc: false, ret: Type.None };
}

export function newGlobalTypeEnv(): GlobalTypeEnv {
  return { vars: new Map(), funcs: new Map() };
}

export function tc(p: Program<any>): [Program<Type>, GlobalTypeEnv] {
  const lEnv = newLocalTypeEnv();
  const gEnv = newGlobalTypeEnv();
  p.varDefs.forEach((v) => {
    if (gEnv.vars.has(v.name)) {
      throw new Error(`Duplicate var name ${v.name}`);
    }
    gEnv.vars.set(v.name, v.type);
  });
  p.funcDefs.forEach((f) => {
    if (gEnv.funcs.has(f.name)) {
      throw new Error(`Duplicate func name ${f.name}`);
    }
    gEnv.funcs.set(f.name, [f.params.map((p) => p.typ), f.ret]);
  })
  const varDefs = p.varDefs.map((v) => tcVarDef(v));
  const funcDefs = p.funcDefs.map((f) => tcFuncDef(f, gEnv));
  const stmts = tcStmts(p.stmts, gEnv, lEnv);
  var lastTyp = Type.None;
  if (stmts.length > 0) {
    lastTyp = stmts[stmts.length - 1].a;
  }

  return [{ a: lastTyp, varDefs, funcDefs, stmts }, gEnv];
}

export function tcVarDef(varDef: VarDef<any>): VarDef<Type> {
  const typ = tcLiteral(varDef.value);
  if (typ === varDef.type) {
    return { ...varDef, a: varDef.a };
  } else {
    throw new Error(`Type mismatch ${varDef}`);
  }
}

export function tcFuncDef(funcDef: FuncDef<any>, gEnv: GlobalTypeEnv): FuncDef<Type> {
  const lEnv = newLocalTypeEnv();
  lEnv.inFunc = true;
  lEnv.ret = funcDef.ret;

  funcDef.params.forEach((p) => {
    if (lEnv.vars.has(p.name)) {
      throw new Error(`Duplicate param name ${p.name}`);
    }
    lEnv.vars.set(p.name, p.typ);
  });

  funcDef.varDefs.forEach((v) => {
    if (lEnv.vars.has(v.name)) {
      throw new Error(`Duplicate var name ${v.name}`);
    }
    lEnv.vars.set(v.name, tcVarDef(v).type);
  });

  const varDefs = funcDef.varDefs.map((v) => tcVarDef(v));
  const stmts = tcStmts(funcDef.stmts, gEnv, lEnv);
  return { ...funcDef, varDefs, stmts };
}

export function tcStmts(stmts: Stmt<any>[], gEnv: GlobalTypeEnv, lEnv: LocalTypeEnv): Stmt<Type>[] {
  return stmts.map((s) => tcStmt(s, gEnv, lEnv));
}

export function tcStmt(stmt: Stmt<any>, gEnv: GlobalTypeEnv, lEnv: LocalTypeEnv): Stmt<Type> {
  switch (stmt.tag) {
    case "assign":
      const value = tcExpr(stmt.value, gEnv, lEnv);
      return { ...stmt, value, a: Type.None };
    case "if":
      const ifCond = tcExpr(stmt.iff.cond, gEnv, lEnv);
      if (ifCond.a !== Type.Bool) {
        throw new Error(`Type error of if cond`);
      }
      const ifThn = tcStmts(stmt.iff.thn, gEnv, lEnv);
      const els = tcStmts(stmt.els, gEnv, lEnv);

      if (stmt.elif.length === 0) {
        return {
          ...stmt,
          iff: { ...stmt.iff, cond: ifCond, thn: ifThn, a: ifThn[ifThn.length - 1].a },
          els,
          a: ifThn[ifThn.length - 1].a,
        }
      } else {
        const elifCond = tcExpr(stmt.elif[0].cond, gEnv, lEnv);
        if (elifCond.a !== Type.Bool) {
          throw new Error(`Type error of elif cond`);
        }
        const elifThn = tcStmts(stmt.elif[0].thn, gEnv, lEnv);
        return {
          ...stmt,
          iff: { ...stmt.iff, cond: ifCond, thn: ifThn, a: ifThn[ifThn.length - 1].a },
          elif: [{ ...stmt.elif[0], cond: elifCond, thn: elifThn, a: elifThn[elifThn.length - 1].a }],
          els,
          a: ifThn[ifThn.length - 1].a,
        }
      }
    case "while":
      const whileCond = tcExpr(stmt.cond, gEnv, lEnv);
      if (whileCond.a !== Type.Bool) {
        throw new Error(`Type error of while cond`);
      }
      const whileStmts = tcStmts(stmt.stmts, gEnv, lEnv);
      return { ...stmt, cond: whileCond, stmts: whileStmts, a: Type.None };
    case "pass":
      return { ...stmt, a: Type.None };
    case "return":
      if (!lEnv.inFunc) {
        throw new Error(`Not in func`);
      }
      const ret = tcExpr(stmt.value, gEnv, lEnv);
      if (ret.a !== lEnv.ret) {
        throw new Error(`Mismatch return type`);
      }
      return { ...stmt, value: ret, a: ret.a };
    case "expr":
      const expr = tcExpr(stmt.expr, gEnv, lEnv);
      return { ...stmt, expr, a: expr.a };
  }
}

export function tcExpr(expr: Expr<any>, gEnv: GlobalTypeEnv, lEnv: LocalTypeEnv): Expr<Type> {
  switch (expr.tag) {
    case "literal":
      const lit = tcLiteral(expr.value);
      return { ...expr, a: lit };
    case "id":
      if (lEnv.vars.has(expr.name)) {
        return { ...expr, a: lEnv.vars.get(expr.name) };
      } else if (gEnv.vars.has(expr.name)) {
        return { ...expr, a: gEnv.vars.get(expr.name) };
      } else {
        throw new Error(`Unknown var ${expr.name}`);
      }
    case "uniop":
      const uniExpr = tcExpr(expr.expr, gEnv, lEnv);
      const uniOp = { ...expr, a: uniExpr.a, expr: uniExpr }
      switch (expr.op) {
        case UniOp.Neg:
          if (uniExpr.a !== Type.Int) {
            throw new Error(`Unsupported operand type ${uniExpr.a} for Neg`);
          }
          return uniOp;
        case UniOp.Not:
          if (uniExpr.a !== Type.Bool) {
            throw new Error(`Unsupported operand type ${uniExpr.a} for Not`);
          }
          return uniOp;
        default:
          throw new Error(`Unsupported uni op`);
      }
    case "binop":
      const left = tcExpr(expr.left, gEnv, lEnv);
      const right = tcExpr(expr.right, gEnv, lEnv);
      const binOp = { ...expr, a: left, right };
      switch (expr.op) {
        case BinOp.Plus:
        case BinOp.Minus:
        case BinOp.Mul:
        case BinOp.Div:
        case BinOp.Mod:
          if (left.a !== Type.Int || right.a !== Type.Int) {
            throw new Error(`Unsupported operand`);
          }
          return { ...binOp, a: Type.Int };
        case BinOp.Eq:
        case BinOp.Neq:
          if (left.a !== right.a) {
            throw new Error(`Operand type mismatch`);
          }
          return { ...binOp, a: Type.Bool };
        case BinOp.Lte:
        case BinOp.Gte:
        case BinOp.Lt:
        case BinOp.Gt:
          if (left.a !== Type.Int || right.a !== Type.Int) {
            throw new Error(`Unsupported operand`);
          }
          return { ...binOp, a: Type.Bool };
        case BinOp.Is:
          if (left.a !== Type.None || right.a !== Type.None) {
            throw new Error(`Unsupported operand`);
          }
          return { ...binOp, a: Type.Bool };
        default:
          new Error(`Unsupported bin op`);
      }
    case "call":
      if (!gEnv.funcs.has(expr.name)) {
        throw new Error(`Unknown func ${expr.name}`);
      }
      var [argTyps, retTyp] = gEnv.funcs.get(expr.name);
      const args = expr.args.map((a) => tcExpr(a, gEnv, lEnv));
      if (argTyps.length !== args.length) {
        throw new Error(`Mismatch arg number of func ${expr.name}`);
      }
      args.forEach((arg, idx) => {
        if (arg.a !== argTyps[idx]) {
          throw new Error(`Mismatch arg type of func ${expr.name}`);
        }
      });
      return { ...expr, args, a: retTyp};
    case "builtin1":
      if (expr.name === "print") {
        const arg = tcExpr(expr.arg, gEnv, lEnv);
        return { ...expr, arg, a: arg.a };
      }
      // todo
      return { ...expr };
    case "builtin2":
      // todo
      return { ...expr };
    // const arg1 = tcExpr(expr.arg1);
    // const arg2 = tcExpr(expr.arg2);
    // if (arg1.a !== Type.Int)
    //   throw new Error("Type error: arg1 must be int");
    // if (arg2.a !== Type.Int)
    //   throw new Error("Type error: arg2 must be int");
    // return { ...expr, arg1, arg2, a: Type.Int };
  }
}

export function tcLiteral(literal: Literal): Type {
  switch (literal.tag) {
    case "number":
      return Type.Int;
    case "bool":
      return Type.Bool;
    case "none":
      return Type.None;
    default:
      throw new Error(`Unhandled literal ${literal}`);
  }
}
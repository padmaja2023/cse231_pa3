import wabt from 'wabt';
import { Stmt, Expr, Type, BinOp, Literal, FuncDef } from './ast';
import { parse } from './parser';
import { tc } from './tc';

type Env = Map<string, boolean>;

// function variableNames(stmts: Stmt<Type>[]): string[] {
//   const vars: Array<string> = [];
//   stmts.forEach((stmt) => {
//     if (stmt.tag === "assign") { vars.push(stmt.name); }
//   });
//   return vars;
// }

export async function run(watSource: string, config: any): Promise<number> {
  const wabtApi = await wabt();

  const parsed = wabtApi.parseWat("example", watSource);
  const binary = parsed.toBinary({});
  const wasmModule = await WebAssembly.instantiate(binary.buffer, config);
  return (wasmModule.instance.exports as any)._start();
}

export function opStmts(binOP: BinOp) {
  switch (binOP) {
    case "+": return [`i32.add`];
    case "-": return [`i32.sub`];
    case "*": return [`i32.mul`];
    case "//": return [`i32.div_s`];
    case "%": return [`i32.rem_s`];
    case "==": return [`i32.eq`];
    case "!=": return [`i32.ne`];
    case ">=": return [`i32.ge_s`];
    case "<=": return [`i32.le_s`];
    case ">": return [`i32.gt_s`];
    case "<": return [`i32.lt_s`];
    case "is": return [`i32.eq`];
    default:
      throw new Error(`CompileError: Unhandled or unknown op: ${binOP}`);
  }
}

function codeGenLiteral(l: Literal, locals: Env): Array<string> {
  switch (l.tag) {
    case "number": return [`(i32.const ${l.value})`];
    case "bool":
      if (l.value === true) {
        return [`(i32.const 1)`];
      } else {
        return [`(i32.const 0)`];
      }
    case "none": return [`(i32.const 0)`];
  }
}

export function codeGenExpr(expr: Expr<Type>, locals: Env): Array<string> {
  switch (expr.tag) {
    case "literal": return codeGenLiteral(expr.value, locals);
    case "id":
      // Since we type-checked for making sure all variable exist, here we
      // just check if it's a local variable and assume it is global if not
      if (locals.has(expr.name)) { return [`(local.get $${expr.name})`]; }
      else { return [`(global.get $${expr.name})`]; }
    case "uniop":
      if (expr.op === "not") {
        return [`(i32.const 1)`, ...codeGenExpr(expr.expr, locals), ...opStmts(BinOp.Minus)];
      }
      if (expr.op === "-") {
        return [`(i32.const -1)`, ...codeGenExpr(expr.expr, locals), ...opStmts(BinOp.Mul)];
      }
      throw new Error("CompileError: uniOp")
    case "binop": {
      const lhsExprs = codeGenExpr(expr.left, locals);
      const rhsExprs = codeGenExpr(expr.right, locals);
      const opstmts = opStmts(expr.op);
      return [...lhsExprs, ...rhsExprs, ...opstmts];
    }
    case "call":
      const valStmts = expr.args.map(e => codeGenExpr(e, locals)).flat();
      let toCall = expr.name;
      valStmts.push(`(call $${toCall})`);
      return valStmts;
    case "builtin1":
      const valStmt = codeGenExpr(expr.arg, locals);
      toCall = expr.name;
      if (expr.name === "print") {
        switch (expr.arg.a) {
          case "bool": toCall = "print_bool"; break;
          case "int": toCall = "print_num"; break;
          case "none": toCall = "print_none"; break;
        }
      }
      valStmt.push(`(call $${toCall})`);
      return valStmt;
  }
}

export function codeGenStmt(stmt: Stmt<Type>, locals: Env): Array<string> {
  switch (stmt.tag) {
    case "while": // todo
      var whileCond = codeGenExpr(stmt.cond, locals);;
      var whileStmts = stmt.stmts.map(s => codeGenStmt(s, locals)).flat();;
      return [`(block
        (loop
          ${whileCond.join("\n")}
          i32.eqz
          br_if 1
          ${whileStmts.join("\n")}
          br 0
        ))`];
    case "if": // todo
      var ifCond = codeGenExpr(stmt.iff.cond, locals);
      var out = ifCond.concat([`(if
        (then `]);
      var ifStmts = stmt.iff.thn.map(s => codeGenStmt(s, locals)).flat();
      var out = out.concat(ifStmts).concat([`) `]).concat([`(else `]);
      if (stmt.elif.length > 0) {
        var elifCond = codeGenExpr(stmt.elif[0].cond, locals);
        var out = out.concat(elifCond).concat([`(if (then `])
        var elifStmts = stmt.elif[0].thn.map(s => codeGenStmt(s, locals)).flat();
        var out = out.concat(elifStmts).concat([`) `]).concat([`(else `]);
      }
      if (stmt.els.length > 0) {
        var els = stmt.els.map(s => codeGenStmt(s, locals)).flat();
        var out = out.concat(els).concat([`) )`])
      } else {
        var out = out.concat([`(nop)`]).concat([`) )`])
      }
      if (stmt.elif.length > 0) {
        var out = out.concat([`) )`]);
      }
      return out;
    case "pass":
      return [`(nop)`];
    case "return":
      var valStmts = codeGenExpr(stmt.value, locals);
      valStmts.push("return");
      return valStmts;
    case "assign":
      var valStmts = codeGenExpr(stmt.value, locals);
      if (locals.has(stmt.name)) { valStmts.push(`(local.set $${stmt.name})`); }
      else { valStmts.push(`(global.set $${stmt.name})`); }
      return valStmts;
    case "expr":
      const result = codeGenExpr(stmt.expr, locals);
      result.push("(local.set $scratch)");
      return result;
  }
}

export function codeGenFuncDef(stmt: FuncDef<Type>, locals: Env): Array<string> {
  const withParamsAndVariables = new Map<string, boolean>(locals.entries());

  // Construct the environment for the function body
  stmt.varDefs.forEach(v => withParamsAndVariables.set(v.name, true));
  stmt.params.forEach(p => withParamsAndVariables.set(p.name, true));

  // Construct the code for params and variable declarations in the body
  const params = stmt.params.map(p => `(param $${p.name} i32)`).join(" ");
  const varDecls = stmt.varDefs.map(v => `(local $${v.name} i32)\n
  ${codeGenLiteral(v.value, locals)[0]}\n
  (local.set $${v.name})`).join("\n");

  const stmts = stmt.stmts.map(s => codeGenStmt(s, withParamsAndVariables)).flat();
  const stmtsBody = stmts.join("\n");
  return [`(func $${stmt.name} ${params} (result i32)
        (local $scratch i32)
        ${varDecls}
        ${stmtsBody}
        (i32.const 0))`];
}

export function compile(source: string): string {
  const ast = parse(source);
  const typed = tc(ast)[0];
  const emptyEnv = new Map<string, boolean>();
  const funsCode: string[] = typed.funcDefs.map(f => codeGenFuncDef(f, emptyEnv)).map(f => f.join("\n"));
  const allFuns = funsCode.join("\n\n");
  const varDecls = typed.varDefs.map(v => `(global $${v.name} (mut i32) ${codeGenLiteral(v.value, emptyEnv)[0]})`).join("\n");
  const allStmts = typed.stmts.map(s => codeGenStmt(s, emptyEnv)).flat();
  const main = [`(local $scratch i32)`, ...allStmts].join("\n");
  const lastStmt = typed.stmts[typed.stmts.length - 1];
  const isExpr = lastStmt.tag === "expr";
  const isPrint = lastStmt.tag === "expr" && lastStmt.expr.tag === "builtin1" && lastStmt.expr.name === "print"
  var retType = "";
  var retVal = "";
  if (isExpr && !isPrint) {
    retType = "(result i32)";
    retVal = "(local.get $scratch)"
  }

  return `
    (module
      (func $print_num (import "imports" "print_num") (param i32) (result i32))
      (func $print_bool (import "imports" "print_bool") (param i32) (result i32))
      (func $print_none (import "imports" "print_none") (param i32) (result i32))
      ${varDecls}
      ${allFuns}
      (func (export "_start") ${retType}
        ${main}
        ${retVal}
      )
    ) 
  `;
}

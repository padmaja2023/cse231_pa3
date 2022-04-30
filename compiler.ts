import wabt from 'wabt';
import { Stmt, Expr, Type, BinOp, UniOp } from './ast';
import { parseProgram } from './parser';
import { tcProgram } from './tc';

type Env = Map<string, boolean>;
type ClsEnv = {
  clsVars: Map<string, Map<string, [number, Expr<any>]>>,
  clsLen: Map<string, number>
}

const clsEnv: ClsEnv = {
  clsVars: new Map(),
  clsLen: new Map()
}

function variableNames(stmts: Stmt<Type>[]) : string[] {
  const vars : string[] = [];
  stmts.forEach((stmt) => {
    if(stmt.tag === "vardef") { vars.push(stmt.name); }
  });
  return vars;
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

export async function runCompiler(watSource: string, config: any): Promise<number> {
  const wabtApi = await wabt();

  const parsed = wabtApi.parseWat("example", watSource);
  const binary = parsed.toBinary({});
  const wasmModule = await WebAssembly.instantiate(binary.buffer, config);
  return (wasmModule.instance.exports as any)._start();
}


export function codeGenExpr(expr: Expr<Type>, locals: Env): Array<string> {
  switch (expr.tag) {
    case "number": return [`(i32.const ${expr.value})`];
    case "true": return [`(i32.const 1)`];
    case "false": return [`(i32.const 0)`];
    case "id":
      if (expr.name == "none") {
        return [];
      }
      if (locals.has(expr.name)) {
        return [`(local.get $${expr.name})`];
      }
      else {
        return [`(global.get $${expr.name})`];
      }
    case "uniop": {
      if (expr.op === "not") {
        return [`(i32.const 1)`, ...codeGenExpr(expr.expr, locals), ...opStmts(BinOp.Minus)];
      }
      if (expr.op === "-") {
        return [`(i32.const -1)`, ...codeGenExpr(expr.expr, locals), ...opStmts(BinOp.Mul)];
      }
      throw new Error("CompileError: uniOp")
    }
    case "binop": {
      const lhsExprs = codeGenExpr(expr.left, locals);
      const rhsExprs = codeGenExpr(expr.right, locals);
      const opstmts = opStmts(expr.op);
      return [...lhsExprs, ...rhsExprs, ...opstmts];
    }
    case "clsvar": {
      var val_exp: Array<string> = codeGenExpr(expr.expr, locals);
      var member_name = expr.name;
      var index = 0;
      if (typeof expr.expr.a == "object") {
        index = clsEnv.clsVars.get(expr.expr.a.class).get(member_name)[0] * 4;
      }
      val_exp.push(`(i32.add (i32.const ${index}))`);
      val_exp.push(`i32.load`);
      return val_exp
    }
    case "clsmethod":
      {
        var val_exp = codeGenExpr(expr.expr, locals);
        val_exp = val_exp.concat(expr.args.map(e => codeGenExpr(e, locals)).flat());
        var method_name = expr.name;
        var class_name = "";
        if (typeof expr.expr.a == "object") {
          class_name = expr.expr.a.class;
        }
        val_exp.push(`(call $${method_name}_${class_name})`);
        return val_exp;
      }
    case "constructor": {
      var classname = expr.name;
      var wasm_stmts: Array<string> = [];
      var size = clsEnv.clsLen.get(classname);
      clsEnv.clsVars.get(classname).forEach((value: [number, Expr<any>], key: string) => {
        var index = value[0] * 4;
        var varr_value: any = value[1];
        // if (value[1].a == "number") {
          // varr_value = value[1].value;
        // }
        wasm_stmts.push(`(global.get $heap)`);
        wasm_stmts.push(`(i32.add (i32.const ${index}))`);
        wasm_stmts.push(`(i32.const ${varr_value})`);
        wasm_stmts.push(`i32.store`);
      });
      wasm_stmts.push(`(global.get $heap)`);
      wasm_stmts.push(`(global.get $heap)`);
      wasm_stmts.push(`(i32.add (i32.const ${size * 4}))`);
      wasm_stmts.push(`(global.set $heap)`);
      return wasm_stmts;
    }
    case "print":
      const valStmts = expr.args.map(e => codeGenExpr(e, locals)).flat();
      var toCall = "print_bool";
      switch (expr.args[0].a) {
        case "bool": toCall = "print_bool"; break;
        case "int": toCall = "print_num"; break;
        case "none": toCall = "print_none"; break;
      }
      valStmts.push(`(call $${toCall})`);
      return valStmts;
  }
}
export function codeGenStmt(stmt: Stmt<Type>, locals: Env, classname: string, allFuns: string): Array<string> {

  switch (stmt.tag) {
    case "if": {
      var ifcond = codeGenExpr(stmt.ifcond, locals).flat().join("\n");
      var if_body: Array<string> = [];
      stmt.ifbody.forEach((b) => {
        var st = codeGenStmt(b, locals, classname, allFuns);
        if_body = if_body.concat(st);
      });
      const ifbody = if_body.flat().join("\n");
      var elifExists = false;
      var elseExists = false;
      if (stmt.elifcond != undefined) {
        var elifcond = codeGenExpr(stmt.elifcond, locals).flat().join("\n");
        var elif_body: Array<string> = [];
        stmt.elifbody.forEach((b) => {
          elif_body = elif_body.concat(codeGenStmt(b, locals, classname, allFuns));
        });
        var elifbody = elif_body.flat().join("\n");
        elifExists = true;
      }
      if (stmt.elsebody.length > 0) {
        var else_body: Array<string> = [];
        stmt.elsebody.forEach((b) => {
          var st = codeGenStmt(b, locals, classname, allFuns);
          else_body = else_body.concat(st);
        });
        var elsebody = else_body.flat().join("\n");
        elseExists = true;
      }
      if (elifExists && elseExists) {
        return [`${ifcond} ( if  
        (then
          ${ifbody}
        )
        (else
          
          ${elifcond} ( if
            (then
              ${elifbody}
            )
            (else
              ${elsebody} 
            )
          )
        )
      )`]
      }
      else if (elifExists) {
        return [`${ifcond} ( if  
        (then
          ${ifbody}
        )
        (else
          
          ${elsebody} 
        )
      )`]
      }
      else {
        return [`${ifcond} ( if  
      (then
        ${ifbody}
      ))`]
      }
    }
    case "clsdef": {
      let methods: Array<string> = []
      stmt.methodDefs.forEach(s => {
        if (s.tag == "funcdef") {
          methods = methods.concat(codeGenStmt(s, locals, stmt.name, allFuns));
        }
      });
      return methods;
    }
    case "funcdef":
      const withParamsAndVariables = new Map<string, boolean>(locals.entries());

      // Construct the environment for the function body
      const variables = variableNames(stmt.body);
      variables.forEach(v => withParamsAndVariables.set(v, true));
      stmt.params.forEach(p => withParamsAndVariables.set(p.name, true));

      // Construct the code for params and variable declarations in the body
      const params = stmt.params.map(p => `(param $${p.name} i32)`).join(" ");
      const varDecls = variables.map(v => `(local $${v} i32)`).join("\n");

      const stmts = stmt.body.map(s => codeGenStmt(s, withParamsAndVariables, classname, allFuns)).flat();
      if (stmt.name == "__init__") {
        stmts.push(`(local.get $self)`);
        stmts.push(`return`);
      }
      const stmtsBody = stmts.join("\n");
      return [`(func $${stmt.name}_${classname} ${params} (result i32)
        (local $scratch i32)
        ${varDecls}
        ${stmtsBody}
        (i32.const 0))`];
    case "return":
      var valStmts = codeGenExpr(stmt.value, locals);
      valStmts.push("return");
      return valStmts;
    case "vardef":
      var valStmts = codeGenExpr(stmt.value, locals);
      if (locals.has(stmt.name)) { valStmts.push(`(local.set $${stmt.name})`); }
      else { valStmts.push(`(global.set $${stmt.name})`); }
    case "assign":
      var valStmts = codeGenExpr(stmt.value, locals);
      if (valStmts.length == 0)
        return []; // in case of none assignments
      if (typeof stmt.name == "string") {
        var end = ""
        var start = ""
        if (locals.has(stmt.name)) {
          end = `(local.set $${stmt.name})`;
          start = `(local.get $${stmt.name})`;
        }
        else {
          end = `(global.set $${stmt.name})`;
          start = `(global.get $${stmt.name})`;
        }
        valStmts.push(end);
        if (stmt.value.tag === "constructor") {
          if (allFuns.includes("__init___" + stmt.value.name)) {
            var init = "__init__";
            valStmts.push(start);
            valStmts.push(`(call $${init}_${stmt.value.name})`);
            valStmts.push(end);
          }

        }
      }
      else {
        if (stmt.name.tag == "clsvar" && typeof stmt.name.expr.a == "object") {
          var tmp = valStmts;
          valStmts = codeGenExpr(stmt.name.expr, locals);
          var member_name = stmt.name.name;
          var index = clsEnv.clsVars.get(stmt.name.expr.a.class).get(member_name)[0] * 4;
          valStmts.push(`(i32.add (i32.const ${index}))`);
          valStmts = valStmts.concat(tmp);
          valStmts.push('i32.store');
        }
      }

      return valStmts;
    case "expr":
      const result = codeGenExpr(stmt.expr, locals);
      result.push("(local.set $scratch)");
      return result;
  }
}


export function setClsEnv(stmts: Stmt<Type>[]) {
  stmts.forEach(s => {
    if (s.tag == "clsdef") {
      let vars = new Map<string, [number, Expr<any>]>();
      let varnum = 0;
      s.varDefs.forEach(v => {
        if (v.tag == "vardef") {
          vars.set(v.name, [varnum, v.value]);
          varnum = varnum + 1;
        }
      });
      clsEnv.clsVars.set(s.name, vars);
      clsEnv.clsLen.set(s.name, varnum);
    }
  });
}

function traverseVarDefs(stmts: Stmt<Type>[]): string[] {
  const vars: string[] = [];
  stmts.forEach((stmt) => {
    if (stmt.tag === "vardef") { vars.push(stmt.name); }
  });
  return vars;
}
function traverseClassDefs(stmts: Stmt<Type>[]): Stmt<Type>[] {
  return stmts.filter(stmt => stmt.tag === "clsdef");
}
function traverseStmts(stmts: Stmt<Type>[]): [string[], Stmt<Type>[], Stmt<Type>[]] {
  return [traverseVarDefs(stmts), traverseClassDefs(stmts), traverseClassDefs(stmts)];
}

export function compile(source: string): string {
  let ast = parseProgram(source);
  ast = tcProgram(ast);
  setClsEnv(ast);

  const emptyEnv = new Map<string, boolean>();
  const [vars, classdefs, nonclassdefs] = traverseStmts(ast);
  const funsCode: string[] = classdefs.map(f => codeGenStmt(f, emptyEnv, "none", "")).map(f => f.join("\n"));
  const allFuns = funsCode.join("\n\n");
  var varDecls = vars.map(v => `(global $${v} (mut i32) (i32.const 0))`).join("\n");

  const allStmts = nonclassdefs.map(s => codeGenStmt(s, emptyEnv, "none", allFuns)).flat();
  const main = [`(local $scratch i32)`, ...allStmts].join("\n");

  const lastStmt = ast[ast.length - 1];
  const isExpr = lastStmt.tag === "expr";
  var retType = "";
  var retVal = "";
  if (isExpr) {
    retType = "(result i32)";
    retVal = "(local.get $scratch)"
  }

  return `
    (module
      (import "imports" "mem" (memory 100))
      (func $print_num (import "imports" "print_num") (param i32) (result i32))
      (func $print_bool (import "imports" "print_bool") (param i32) (result i32))
      (func $print_none (import "imports" "print_none") (param i32) (result i32))
      (func $not_operator (import "imports" "not_operator") (param i32) (result i32))
      (global $heap (mut i32) (i32.const 4))
      ${varDecls}
      ${allFuns}
      (func (export "_start") ${retType}
        ${main}
        ${retVal}
      )
    ) 
  `;
}

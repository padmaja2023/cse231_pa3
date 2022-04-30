import wabt from 'wabt';
import { Stmt, Expr, Type } from './ast';
import { parseProgram } from './parser';
import { tcProgram } from './tc';


type Env = Map<string, boolean>;

let classvars = new Map<string, Map<string, [number, Expr<any>]>>();
let classvarcount = new Map<string, number>();

export const codeGenOps = new Map<string, string>();
codeGenOps.set("+", "(i32.add)");
codeGenOps.set("-", "(i32.sub)");
codeGenOps.set("*", "(i32.mul)");
codeGenOps.set("%", "(i32.rem_s)");
codeGenOps.set("<=", "(i32.le_s)");
codeGenOps.set(">=", "(i32.ge_s)");
codeGenOps.set("<", "(i32.lt_s)");
codeGenOps.set(">", "(i32.gt_s)");
codeGenOps.set("not", "(i32.not)");
codeGenOps.set("==", "(i32.eq)");
codeGenOps.set("!=", "(i32.ne)");
codeGenOps.set("is", "(i32.eq)");
codeGenOps.set("not", "(i32.xnor)");

function variableNames(stmts: Stmt<Type>[]): string[] {
  const vars: string[] = [];
  stmts.forEach((stmt) => {
    if (stmt.tag === "vardef") { vars.push(stmt.name); }
  });
  return vars;
}

export async function run_compiler(watSource: string, config: any): Promise<number> {
  const wabtApi = await wabt();
  try {
    const parsed = wabtApi.parseWat("example", watSource);
    const binary = parsed.toBinary({});
    const wasmModule = await WebAssembly.instantiate(binary.buffer, config);
    return (wasmModule.instance.exports as any)._start();
  } catch (e) {
    throw new Error("RUNTIME ERROR:" + e);
  }
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
      var opstmts = codeGenOps.get(expr.op);
      var stmts = codeGenExpr(expr.expr, locals);
      if (expr.op === "not") {
        return stmts.concat(`(call $not_operator)`);
      }
      return [`(i32.const 0)`].concat(stmts, opstmts);
    }
    case "binop": {
      const lhsExprs = codeGenExpr(expr.lhs, locals);
      const rhsExprs = codeGenExpr(expr.rhs, locals);
      const opstmts = codeGenOps.get(expr.op);
      if (expr.op === "is") {
        if (lhsExprs.length == 0) {
          lhsExprs.push(`(i32.const 0)`);
        }
        if (rhsExprs.length == 0) {
          rhsExprs.push(`(i32.const 0)`);
        }
      }
      return [...lhsExprs, ...rhsExprs, ...[opstmts]];
    }
    case "clsvar": {
      var val_exp: Array<string> = codeGenExpr(expr.expr, locals);
      var member_name = expr.name;
      var index = 0;
      if (typeof expr.expr.a == "object") {
        index = classvars.get(expr.expr.a.class).get(member_name)[0] * 4;
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
      var size = classvarcount.get(classname);
      classvars.get(classname).forEach((value: [number, Expr<any>], key: string) => {
        var index = value[0] * 4;
        var varr_value: any = value[1];
        if (value[1].tag == "number") {
          varr_value = value[1].value;
        }
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
      var if_condition = codeGenExpr(stmt.if_condition, locals);
      var ifcondition = if_condition.flat().join("\n");
      var if_body: Array<string> = [];
      stmt.if_body.forEach((b, i) => {
        var st = codeGenStmt(b, locals, classname, allFuns);
        if_body = if_body.concat(st);
      });
      const ifbody = if_body.flat().join("\n");
      var elif_present = false;
      var else_present = false;
      if (stmt.elif_condition != undefined) {
        var elif_condition = codeGenExpr(stmt.elif_condition, locals);
        var elifcondition = elif_condition.flat().join("\n");
        var elif_body: Array<string> = [];
        stmt.elif_body.forEach((b, i) => {
          elif_body = elif_body.concat(codeGenStmt(b, locals, classname, allFuns));
        });
        var elifbody = elif_body.flat().join("\n");
        elif_present = true;
      }

      if (stmt.else_body.length > 0) {
        var else_body: Array<string> = [];
        stmt.else_body.forEach((b, i) => {
          var st = codeGenStmt(b, locals, classname, allFuns);
          else_body = else_body.concat(st);
        });
        var elsebody = else_body.flat().join("\n");
        else_present = true;
      }

      if (elif_present && else_present) {
        return [`${ifcondition} ( if  
        (then
          ${ifbody}
        )
        (else
          
          ${elifcondition} ( if
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
      else if (else_present) {
        return [`${ifcondition} ( if  
        (then
          ${ifbody}
        )
        (else
          
          ${elsebody} 
        )
      )`]
      }
      else {
        return [`${ifcondition} ( if  
      (then
        ${ifbody}
      ))`]
      }
    }
    case "clsdef": {
      let methods: Array<string> = []
      stmt.methodDefs.forEach(s => {
        if (s.tag == "define") {
          methods = methods.concat(codeGenStmt(s, locals, stmt.name, allFuns));
        }
      });
      return methods;
    }
    case "define":
      const withParamsAndVariables = new Map<string, boolean>(locals.entries());
      const variables = variableNames(stmt.body);
      variables.forEach(v => withParamsAndVariables.set(v, true));
      stmt.params.forEach(p => withParamsAndVariables.set(p.name, true));
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
          console.log(allFuns, allFuns.includes("__init___" + stmt.value.name), "__init___" + stmt.value.name);
          if (allFuns.includes("__init___" + stmt.value.name)) {
            console.log("true", "__init__" + stmt.value.name);
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
          var index = classvars.get(stmt.name.expr.a.class).get(member_name)[0] * 4;
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


export function setClassVars(stmts: Stmt<Type>[]) {
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
      classvars.set(s.name, vars);
      classvarcount.set(s.name, varnum);
    }
  });
}

function getGlobals(stmts: Stmt<Type>[]): [string[], Stmt<Type>[], Stmt<Type>[]] {
  const varDefs = variableNames(stmts)
  const classDefs = stmts.filter(stmt => stmt.tag === "clsdef");
  const globDefs = stmts.filter(stmt => stmt.tag === "clsdef");
  return [varDefs, classDefs, globDefs];
}

export function compile(source: string): string {
  let ast = parseProgram(source);
  ast = tcProgram(ast);
  setClassVars(ast);

  const emptyEnv = new Map<string, boolean>();
  const [vars, classdefs, nonclassdefs] = getGlobals(ast);
  const funsCode: string[] = classdefs.map(f => codeGenStmt(f, emptyEnv, "none", "")).map(f => f.join("\n"));
  const allFuns = funsCode.join("\n\n");

  let globvars: string[] = []
  nonclassdefs.forEach(s => {
    if (s.tag == "vardef") {
      if (typeof s.a == "string")
        globvars.push(`(global $${s.name} (mut i32) (i32.const 0))`);
      else
        globvars.push(`(global $${s.name} (mut i32) (i32.const -8))`);
    }
  });
  var varDecls = globvars.join("\n");


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

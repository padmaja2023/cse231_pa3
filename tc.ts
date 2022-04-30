import { Expr, Stmt, Type, Literal, BinOp, UniOp } from "./ast";

var classes : string[] = [];
type VarEnv = Map<string, Type>;
type clsVar = { name: string, type: Type }
type clsMethod = { name: string, arguments: Array<Type>, return_type: Type }
type ClassEnv = {
  clsName: string,
  clsVars: Map<string, Array<clsVar>>
  clsMethods: Map<string, Array<clsMethod>>
}

export function tcProgram(p: Array<Stmt<any>>): Array<Stmt<Type>> {
  var clsVars = new Map<string, Array<clsVar>>();
  var clsMethods = new Map<string, Array<clsMethod>>();
  const globalFuncs = new Map<string, [Array<Type>, Type]>();
  p.forEach(s => {
    if (s.tag === "clsdef") {
      let methods = traverseMethod(s.methodDefs, s.varDefs);
      clsMethods.set(s.name, methods);
    }
  });
  p.forEach(s => {
    if (s.tag === "funcdef") {
      globalFuncs.set(s.name, [s.params.map(p => p.type), s.ret]);
    }
  });

  const globalVars = new Map<string, Type>();
  const clsEnv: ClassEnv = { clsName: "none", clsVars, clsMethods }
  return p.map(s => {
    if (s.tag === "vardef") {
      const rhs = tcExpr(s.value, new Map<string, Type>(), globalVars, clsEnv);
      if (s.a !== rhs.a && typeof s.a !== "object" && typeof rhs.a !== "object") {
        throw new Error("TypeError: Data type of object doesn't match class");
      }
      // if (typeof s.a == "object" && rhs.a !== "none") {
      //   throw new Error("Typ4::assignment error");
      // }
      globalVars.set(s.name, s.a);
      return { ...s, value: rhs };
    }
    else {
      const res = tcStmt(s, new Map<string, Type>(), globalVars, clsEnv, "none");
      return res;
    }
  });
}

export function tcExpr(e: Expr<any>, locals: VarEnv, globals: VarEnv, clsEnv: ClassEnv): Expr<Type> {
  switch (e.tag) {
    case "number": return { ...e, a: "int" };
    case "true": return { ...e, a: "bool" };
    case "false": return { ...e, a: "bool" };
    case "id": {
      if (!locals.has(e.name)) {
        throw new Error("TypeError: " + e.name + " has not been defined.");
      }
      return { ...e, a: locals.get(e.name) };
    }
    case "binop": {
      const operator = e.op;
      const left = tcExpr(e.left, locals, globals, clsEnv);
      const right = tcExpr(e.right, locals, globals, clsEnv);
      const binOp = { ...e, a: left, right };
      switch (e.op) {
        case BinOp.Plus:
        case BinOp.Minus:
        case BinOp.Mul:
        case BinOp.Div:
        case BinOp.Mod:
          if (left.a !== "int" || right.a !== "int") {
            throw new Error(`TypeError: Unsupported operand`);
          }
          return { ...binOp, a: "int" };
        case BinOp.Eq:
        case BinOp.Neq:
          if (left.a !== right.a) {
            throw new Error(`TypeError: Operand type mismatch`);
          }
          return { ...binOp, a: "bool" };
        case BinOp.Lte:
        case BinOp.Gte:
        case BinOp.Lt:
        case BinOp.Gt:
          if (left.a !== "int" || right.a !== "int") {
            throw new Error(`TypeError: Unsupported operand`);
          }
          return { ...binOp, a: "bool" };
        case BinOp.Is:
          if (left.a !== "none" || right.a !== "none") {
            throw new Error(`TypeError: Unsupported operand`);
          }
          return { ...binOp, a: "bool" };
        default:
          new Error(`TypeError: Unsupported bin op`);
      }
    }
    case "uniop": {
      const uniExpr = tcExpr(e, locals, globals, clsEnv);
      const uniOp = { ...e, a: uniExpr.a, expr: uniExpr }
      switch (e.op) {
        case UniOp.Neg:
          if (uniExpr.a !== "int") {
            throw new Error(`TypeError: Unsupported operand type ${uniExpr.a} for Neg`);
          }
          return uniOp;
        case UniOp.Not:
          if (uniExpr.a !== "bool") {
            throw new Error(`TypeError: Unsupported operand type ${uniExpr.a} for Not`);
          }
          return uniOp;
        default:
          throw new Error(`TypeError: Unsupported uni op`);
      }
    }
    case "clsvar": {
      e.expr = tcExpr(e.expr, locals, globals, clsEnv);
      if (e.expr.a.tag !== "object") {
        throw new Error("TypeError: Invalid object for this class");
      }
      let curr_class = e.expr.a.class;
      if (!clsEnv.clsVars.has(curr_class)) {
        throw new Error("TypeError: Invalid object for this class");
      }
      var isPresent = false;
      clsEnv.clsVars.get(curr_class).forEach(c => {
        if (c.name == e.name)
          isPresent = true;
      });
      if (!isPresent) {
        throw new Error("TypeError: Variable not present in this class");
      }
      var type: Type = "int";
      clsEnv.clsVars.get(e.expr.a.class).forEach(v => {
        if (v.name == e.name) {
          type = v.type;
        }
      });
      e.a = "int";
      clsEnv.clsVars.get(e.expr.a.class).forEach(v => {
        if (v.name == e.name) {
          e.a = v.type;
        }
      });
      return e;
    }
    case "id": {
      if (e.name == "self") {
        return { ...e, a: { tag: "object", class: clsEnv.clsName } };
      }
      if (e.name == "none" || e.name == "None") {
        return { ...e, a: "none" };
      }
      if (!locals.has(e.name) && !globals.has(e.name)) {
        throw new Error("TypeError: Variable not defined");
      }
      if (locals.has(e.name)) {
        var typ = locals.get(e.name);
      } else {
        var typ = globals.get(e.name);
      }
      e.a = typ;
      return e;
    }
    case "constructor": {
      if (!clsEnv.clsVars.has(e.name)) {
        throw new Error("TypeError: This class not present");
      }
      e.a = { tag: "object", class: e.name }
      return e;
    }
    case "clsmethod": {
      e.expr = tcExpr(e.expr, locals, globals, clsEnv)
      if (e.expr.tag == "id" && !clsEnv.clsMethods.has(e.expr.a.class)) {
        throw new Error("TypeError: Invalid method for this class");
      }
      if (e.expr.tag == "id" || e.expr.tag == "constructor") {
        let cls_name = e.expr.a.class;
        var args: Array<Expr<any>> = []
        e.args.forEach(a => {
          a = tcExpr(a, locals, globals, clsEnv);
          args.push(a);
        });
        e.args = args;
        var return_type = tcFunc(clsEnv.clsMethods, e.name, cls_name, args);
        e.a = return_type;
        return e;
      }
      var ret: Type = "int";
      clsEnv.clsMethods.get(e.expr.a.class).forEach(m => {
        if (m.name == e.name) {
          ret = m.return_type;
        }
      });
      e.a = ret;
      return e;
    }
    case "print": {
      if (e.args.length != 1) {
        throw new Error("TypeError: Print function needs 1 argument");
      }
      var args: Array<Expr<any>> = []
      e.args.forEach(a => {
        args.push(tcExpr(a, locals, globals, clsEnv));
      });
      e.args = args;
      return e;
    }
  }
}

var isreturn: boolean = false;

export function tcStmt(s: Stmt<any>, locals: VarEnv, globals: VarEnv, clsEnv: ClassEnv, currentReturn: Type): Stmt<Type> {
  switch (s.tag) {
    case "if": {
      if (tcExpr(s.ifcond, locals, globals, clsEnv).a != "bool") {
        throw new Error("TypeError: if condition must be boolean");
      }
      if (s.elifcond != undefined && tcExpr(s.elifcond, locals, globals, clsEnv).a != "bool") {
        throw new Error("TypeError: elif condition must be boolean");
      }
      var if_body: Array<Stmt<any>> = [];
      s.ifbody.forEach(i => {
        if_body.push(tcStmt(i, locals, globals, clsEnv, currentReturn));
      });
      s.ifbody = if_body;

      var elif_body: Array<Stmt<any>> = [];
      s.elifbody.forEach(i => {
        elif_body.push(tcStmt(i, locals, globals, clsEnv, currentReturn));
      });
      s.elifbody = elif_body;

      var else_body: Array<Stmt<any>> = [];
      s.elsebody.forEach(i => {
        else_body.push(tcStmt(i, locals, globals, clsEnv, currentReturn));
      });
      s.elsebody = else_body;

      return { ...s };
    }
    case "assign": {
      s.value = tcExpr(s.value, locals, globals, clsEnv);
      s.a = s.value.a;
      if (typeof s.name === "string") {

        if (!(checkEqual(locals, s) || checkEqual(globals, s))) {
          throw new Error("TypeError: Variable types do not match");
        }
      }
      else if (s.name.tag == "clsvar") {
        s.name.expr = tcExpr(s.name.expr, locals, globals, clsEnv);
        s.name.a = s.name.expr.a;
      }
      if (typeof s.a == "object" && typeof s.name == "string") {
        classes.push(s.name);
      }
      return s;
    }
    case "vardef": {
      if (locals.has(s.name)) {
        throw new Error("TypeError: " + s.name + " has defined more than once");
      }
      s.value = tcExpr(s.value, locals, globals, clsEnv);
      if (s.a !== s.value.a && typeof s.a !== "object" && typeof s.value.a !== "object") {
        throw new Error("TypeError: Variable types do not match");
      }
      s.a = s.value.a;
      locals.set(s.name, s.a);
      return s;
    }
    case "funcdef": {
      s.params.forEach(v => {
        locals.set(v.name, v.type);
      });
      if (!locals.has("self")) {
        throw new Error("TypeError: self is not present");
      }

      isreturn = false;
      const newStmts = s.body.map(bs => tcStmt(bs, locals, globals, clsEnv, s.ret));
      if (s.name !== "__init__" && s.ret !== "none" && !isreturn) {
        if (typeof s.ret == "object" && s.ret.class !== "none") {
          throw new Error("TypeError: Return expected to be " + s.ret.class);
        }
        else if (typeof s.ret !== "object") {
          throw new Error("TypeError: Return expected to be " + s.ret);
        }
      }
      if (s.name == "__init__") {
        if (s.ret == "none") {
          throw new Error("TypeError: Return value expected");
        }
        if (typeof s.ret === "object" && s.ret.class !== clsEnv.clsName) {
          throw new Error("TypeError: Return value expected");
        }
      }
      if (s.ret !== "int" && s.ret !== "bool" && s.ret !== "none") {
        s.ret = { tag: "object", class: clsEnv.clsName };
      }

      if (s.name !== "__init__" && s.ret !== "none" && !isreturn) {
        if (typeof s.ret == "object" && s.ret.class !== "none") {
          throw new Error("TypeError: Return expected to be " + s.ret.class);
        }
        else if (typeof s.ret !== "object") {
          throw new Error("TypeError: Return expected to be " + s.ret);
        }
      }
      if (s.name == "__init__") {
        if (s.ret == "none") {
          throw new Error("TypeError: Return value expected");
        }
        if (s.ret !== "int" && s.ret !== "bool" && s.ret.class !== clsEnv.clsName) {
          throw new Error("TypeError: Return value expected");
        }
      }
      isreturn = false;
      locals.clear();
      return { ...s, body: newStmts };

    }
    case "expr": {
      const ret = tcExpr(s.expr, locals, globals, clsEnv);
      s.a = ret.a;
      return { ...s, expr: ret };
    }
    case "return": {
      const valTyp = tcExpr(s.value, locals, globals, clsEnv);
      if (valTyp.a !== currentReturn) {
        if (typeof valTyp.a !== "string" && typeof currentReturn !== "string") {
          if (valTyp.a.class !== currentReturn.class) {
            throw new Error(`TypeError: ${valTyp.a} returned, ${currentReturn} expected.`);
          }
        }
        else if (typeof valTyp.a == "string" && typeof currentReturn == "string") {
          throw new Error(`TypeError: ${valTyp.a} returned, ${currentReturn} expected.`);
        }
        else {
          if (typeof currentReturn == "object" && valTyp.a !== "none") {
            throw new Error(`${valTyp.a} returned, ${currentReturn} expected.`);
          }
        }
      }
      isreturn = true;
      return { ...s, value: valTyp };
    }
    case "clsdef": {
      let cv: Array<clsVar> = []
      s.varDefs.forEach(v => {
        if (v.tag == "vardef") {
          v.value = tcExpr(v.value, locals, globals, clsEnv);
          cv.push({ name: v.name, type: v.a })
        }
      });
      clsEnv.clsVars.set(s.name, cv);
      clsEnv.clsName = s.name
      s.methodDefs.forEach(m => {
        if (m.tag == "funcdef") {
          m = tcStmt(m, locals, globals, clsEnv, currentReturn);
        }
      });
      return s;
    }
  }
}

export function checkEqual(vars: VarEnv, s: Stmt<any>): boolean {
  if (s.tag === "assign" && typeof s.name === "string") {
    if (!vars.has(s.name)) {
      return false;
    }
    if (vars.has(s.name)) {
      let typ = vars.get(s.name);
      if (typeof typ === "string") {
        if (typ !== s.a) {
          return false;
        }
      }
      else {
        if (s.a == "none") {
          return true;
        }
        if (typeof s.a !== "string") {
          if (s.a.class !== typ.class) {
            return false;
          }
        }
        return false;
      }
    }
  }
  return true;
}

export function tcFunc(class_methods: Map<string, Array<clsMethod>>, method_name: string, class_name: string, args: Array<Expr<any>>): Type {
  let result: Type = "none";
  class_methods.get(class_name).forEach(s => {
    if (s.name === method_name) {
      var num_args = s.arguments.length;
      var i: number;
      if (num_args - 1 !== args.length) {
        throw new Error("TypeError: Argument types do not match");
      }
      for (i = 1; i < num_args; i++) {
        if (typeof args[i - 1].a == "object" && typeof s.arguments[i] == "object") {
          if (!(JSON.stringify(s.arguments[i]) === JSON.stringify(args[i - 1].a))) {
            throw new Error("TypeError: Argument types do not match");
          }
        }
        else if (args[i - 1].a !== s.arguments[i]) {
          throw new Error("TypeError: Argument types do not match");
        }
      }
      result = s.return_type;
    }
  });
  return result;
}

export function traverseMethod(methodDefs: Array<Stmt<any>>, varDefs: Array<Stmt<any>>): Array<clsMethod> {
  var methods: Array<clsMethod> = [];
  methodDefs.forEach(s => {
    if (s.tag == "funcdef") {
      var name = s.name;
      var args: Array<Type> = [];
      s.params.forEach(s => {
        args.push(s.type);
      })
      methods.push({ name, arguments: args, return_type: s.ret });
    }
  });
  return methods;
}

export function tcLiteral(literal: Literal): Type {
  switch (literal.type) {
    case "int":
      return "int";
    case "bool":
      return "bool";
    default:
      throw new Error(`Unhandled literal ${literal}`);
  }
}
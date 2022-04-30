import { Expr, Stmt, Type, ClsField, ClsMethod, opType } from "./ast";

type VarEnv = Map<string, Type>;
var classes: string[] = [];


export function tcExpr(e: Expr<any>, class_name: string, class_methods: Map<string, ClsMethod[]>,
  class_variables: Map<string, ClsField[]>, locals: VarEnv, globals: VarEnv): Expr<Type> {

  switch (e.tag) {
    case "number": return { ...e, a: "int" };
    case "true": return { ...e, a: "bool" };
    case "false": return { ...e, a: "bool" };
    case "name": {
      if (!locals.has(e.name)) {
        throw new Error(e.name + " is not defined");
      }
      return { ...e, a: locals.get(e.name) };
    }
    case "binop": {
      var operator = e.op;
      var left = tcExpr(e.lhs, class_name, class_methods, class_variables, locals, globals);
      var right = tcExpr(e.rhs, class_name, class_methods, class_variables, locals, globals);
      e.lhs = left;
      e.rhs = right;
      if (opType.get(operator)[0] != left.a || opType.get(operator)[0] != right.a) {
        if (operator != "is") {
          throw new Error("TYPE ERROR: Incompatible operator types.");
        }
      }
      return { ...e, a: opType.get(operator)[1] };
    }
    case "uniop": {
      var operator = e.op;
      var operand = tcExpr(e.expr, class_name, class_methods, class_variables, locals, globals);
      if (opType.get(operator)[0] != operand.a) {
        throw new Error("TYPE ERROR: Incompatible operator types.");
      }
      return { ...e, a: opType.get(operator)[1] };
    }
    case "clsvar": {
      e.expr = tcExpr(e.expr, class_name, class_methods, class_variables, locals, globals);
      if (e.expr.a.tag !== "object") {
        throw new Error("TYPE ERROR: Incorrect object for this class");
      }
      let curr_class = e.expr.a.class;
      if (!class_variables.has(curr_class)) {
        throw new Error("TYPE ERROR: Incorrect object for this class");
      }
      var isPresent = false;
      class_variables.get(curr_class).forEach(c => {
        if (c.name == e.name)
          isPresent = true;
      });
      if (!isPresent) {
        throw new Error("TYPE ERROR: Field not present in class");
      }
      var type: Type = "int";
      class_variables.get(e.expr.a.class).forEach(v => {
        if (v.name == e.name) {
          type = v.type;
        }
      });
      e.a = "int";
      class_variables.get(e.expr.a.class).forEach(v => {
        if (v.name == e.name) {
          e.a = v.type;
        }
      });
      return e;
    }
    case "id": {
      if (e.name == "self") {
        return { ...e, a: { tag: "object", class: class_name } };
      }
      if (e.name == "none" || e.name == "None") {
        return { ...e, a: "none" };
      }
      if (!locals.has(e.name) && !globals.has(e.name)) {
        throw new Error("TYPE ERROR: variable not defined");
      }
      if (locals.has(e.name)) {
        var typ = locals.get(e.name);
      }
      else {
        var typ = globals.get(e.name);
      }
      e.a = typ;
      return e;

    }
    case "constructor": {
      if (!class_variables.has(e.name)) {
        throw new Error("class not present");
      }
      e.a = { tag: "object", class: e.name }
      return e;
    }
    case "print": {
      if (e.args.length != 1) {
        throw new Error("TYPE ERROR: print function needs 1 argument");
      }
      var args: Expr<any>[] = []
      e.args.forEach(a => {
        args.push(tcExpr(a, class_name, class_methods, class_variables, locals, globals));
      });
      e.args = args;
      return e;
    }
    case "clsmethod": {
      e.expr = tcExpr(e.expr, class_name, class_methods, class_variables, locals, globals)
      if (e.expr.tag == "id" && !class_methods.has(e.expr.a.class)) {
        throw new Error("TYPE ERROR: Incorrect method for this class");
      }
      if (e.expr.tag == "id" || e.expr.tag == "constructor") {
        let cls_name = e.expr.a.class;
        var args: Expr<any>[] = []
        e.args.forEach(a => {
          a = tcExpr(a, class_name, class_methods, class_variables, locals, globals);
          args.push(a);
        });
        e.args = args;
        var return_type = checkEquals(class_methods, e.name, cls_name, args);
        e.a = return_type;
        return e;
      }
      var ret: Type = "int";
      class_methods.get(e.expr.a.class).forEach(m => {
        if (m.name == e.name) {
          ret = m.return_type;
        }
      });
      e.a = ret;
      return e;

    }
  }
}

var isreturn: boolean = false;

export function tcStmt(s: Stmt<any>, classname: string, class_vars: Map<string, ClsField[]>,
  class_methods: Map<string, ClsMethod[]>,
  locals: Map<string, Type>, globals: Map<string, Type>, currentReturn: Type): Stmt<Type> {
  switch (s.tag) {
    case "if": {
      if (tcExpr(s.if_condition, classname, class_methods, class_vars, locals, globals).a != "bool") {
        throw new Error("TYPE ERROR: if condition must be boolean");
      }
      if (s.elif_condition != undefined && tcExpr(s.elif_condition, classname, class_methods, class_vars, locals, globals).a != "bool") {
        throw new Error("TYPE ERROR: elif condition must be boolean");
      }
      var if_body: Stmt<any>[] = [];
      s.if_body.forEach(i => {
        if_body.push(tcStmt(i, classname, class_vars, class_methods, locals, globals,
          currentReturn));
      });
      s.if_body = if_body;

      var elif_body: Stmt<any>[] = [];
      s.elif_body.forEach(i => {
        elif_body.push(tcStmt(i, classname, class_vars, class_methods, locals, globals,
          currentReturn));
      });
      s.elif_body = elif_body;

      var else_body: Stmt<any>[] = [];
      s.else_body.forEach(i => {
        elif_body.push(tcStmt(i, classname, class_vars, class_methods, locals, globals,
          currentReturn));
      });
      s.else_body = else_body;

      return { ...s };
    }
    case "assign": {
      s.value = tcExpr(s.value, classname, class_methods, class_vars, locals, globals);
      s.a = s.value.a;
      if (typeof s.name === "string") {

        if (!(checkTypes(locals, s) || checkTypes(globals, s))) {
          throw new Error("TYPE ERROR: RUNTIME ERROR: Incorrect type assignment");
        }
      }
      else if (s.name.tag == "clsvar") {
        s.name.expr = tcExpr(s.name.expr, classname, class_methods, class_vars, locals, globals);
        s.name.a = s.name.expr.a;
      }
      if (typeof s.a == "object" && typeof s.name == "string") {
        classes.push(s.name);
      }
      return s;
    }
    case "vardef": {
      if (locals.has(s.name)) {
        throw new Error("TYPE ERROR: " + s.name + " already defined");
      }
      s.value = tcExpr(s.value, classname, class_methods, class_vars, locals, globals);
      if (s.a !== s.value.a && typeof s.a !== "object" && typeof s.value.a !== "object") {
        throw new Error("TYPE ERROR: Incorrect data types");
      }
      s.a = s.value.a;
      locals.set(s.name, s.a);
      return s;
    }
    case "define": {
      s.params.forEach(v => {
        locals.set(v.name, v.typ);
      });
      if (!locals.has("self")) {
        throw new Error("TYPE ERROR: self parameter is not present in method: " + s.name);
      }

      isreturn = false;
      const newStmts = s.body.map(bs => tcStmt(bs, classname, class_vars, class_methods, locals, globals, s.ret));
      if (s.name !== "__init__" && s.ret !== "none" && !isreturn) {
        if (typeof s.ret == "object" && s.ret.class !== "none") {
          throw new Error("TYPE ERROR: Incorrect return value, expected" + s.ret.class);
        }
        else if (typeof s.ret !== "object") {
          throw new Error("TYPE ERROR: Incorrect return value, expected" + s.ret);
        }
      }
      if (s.name == "__init__") {
        if (s.ret == "int" || s.ret == "bool") {
          throw new Error("TYPE ERROR: Incorrect return value");
        }
        if (typeof s.ret === "object" && s.ret.class !== classname) {
          throw new Error("TYPE ERROR: Incorrect return value");
        }
      }
      if (s.ret === "object") {
        s.ret = { tag: "object", class: classname };
      } else {
        s.ret = "none"
      }

      isreturn = false;
      locals.clear();
      return { ...s, body: newStmts };

    }
    case "expr": {
      const ret = tcExpr(s.expr, classname, class_methods, class_vars, locals, globals);
      s.a = ret.a;
      return { ...s, expr: ret };
    }
    case "return": {
      const valTyp = tcExpr(s.value, classname, class_methods, class_vars, locals, globals);
      if (valTyp.a !== currentReturn) {
        if (typeof valTyp.a !== "string" && typeof currentReturn !== "string") {
          if (valTyp.a.class !== currentReturn.class) {
            throw new Error(`TYPE ERROR: ${valTyp.a} returned, ${currentReturn} expected.`);
          }
        }
        else if (typeof valTyp.a == "string" && typeof currentReturn == "string") {
          throw new Error(`TYPE ERROR: ${valTyp.a} returned, ${currentReturn} expected.`);
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

      let cv: ClsField[] = []
      s.varDefs.forEach(v => {
        if (v.tag == "vardef") {
          v.value = tcExpr(v.value, classname, class_methods, class_vars, locals, globals);
          cv.push({ name: v.name, type: v.a })
        }
      });
      class_vars.set(s.name, cv);
      s.methodDefs.forEach(m => {
        if (m.tag == "define") {
          m = tcStmt(m, s.name, class_vars, class_methods, locals, globals, currentReturn);
        }
      });
      return s;
    }
  }
}

export function checkTypes(variables: VarEnv, s: Stmt<any>): boolean {
  if (s.tag === "assign" && typeof s.name === "string") {
    if (!variables.has(s.name)) {
      return false;
    }
    if (variables.has(s.name)) {
      let typ = variables.get(s.name);
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
        else {
          return false;
        }
      }
    }
  }
  return true;
}

export function checkEquals(class_methods: Map<string, ClsMethod[]>, method_name: string,
  class_name: string, args: Expr<any>[]): Type {
  let result: Type = "none";
  class_methods.get(class_name).forEach(s => {
    if (s.name === method_name) {
      var num_args = s.arguments.length;
      var i: number;
      if (num_args - 1 !== args.length) {
        throw new Error("TYPE ERROR: RUNTIME ERROR: Incorrect type assignment");
      }
      for (i = 1; i < num_args; i++) {
        if (typeof args[i - 1].a == "object" && typeof s.arguments[i] == "object") {
          if (!(JSON.stringify(s.arguments[i]) === JSON.stringify(args[i - 1].a))) {
            throw new Error("TYPE ERROR: RUNTIME ERROR: Incorrect type assignment");
          }
        }
        else if (args[i - 1].a !== s.arguments[i]) {
          throw new Error("TYPE ERROR: RUNTIME ERROR: Incorrect type assignment");
        }
      }
      result = s.return_type;
    }
  });
  return result;
}

export function traverseMethod(methodDefs: Stmt<any>[], varDefs: Stmt<any>[]): ClsMethod[] {
  var methods: ClsMethod[] = [];
  methodDefs.forEach(s => {
    if (s.tag == "define") {
      var name = s.name;
      var args: Type[] = [];

      s.params.forEach(s => {
        args.push(s.typ);
      })

      var ret = s.ret;
      var result: ClsMethod = { name, arguments: args, return_type: ret };
      methods.push(result);
    }

  });

  return methods;
}

export function tcProgram(p: Stmt<any>[]): Stmt<Type>[] {
  var class_vars = new Map<string, ClsField[]>();
  var class_meth = new Map<string, ClsMethod[]>();
  const functions = new Map<string, [Type[], Type]>();
  p.forEach(s => {
    if (s.tag === "clsdef") {
      let methods = traverseMethod(s.methodDefs, s.varDefs);
      class_meth.set(s.name, methods);
    }
  });


  p.forEach(s => {
    if (s.tag === "define") {
      functions.set(s.name, [s.params.map(p => p.typ), s.ret]);
    }
  });
  const globals = new Map<string, Type>();
  return p.map(s => {
    if (s.tag === "vardef") {
      const rhs = tcExpr(s.value, "none", class_meth, class_vars, new Map<string, Type>(), globals);

      if (s.a !== rhs.a && typeof s.a !== "object" && typeof rhs.a !== "object") {
        throw new Error("TYPE ERROR: RUNTIME ERROR: Incorrect type assignment");
      }
      if (typeof s.a == "object" && rhs.a !== "none") {
        throw new Error("TYPE ERROR: RUNTIME ERROR: Incorrect type assignment");
      }

      globals.set(s.name, s.a);
      return { ...s, value: rhs };
    }
    else {
      const res = tcStmt(s, "none", class_vars, class_meth, new Map<string, Type>(),
        globals, "none");
      return res;
    }
  });
}


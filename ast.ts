
export type VarDef =
  | { name: TypedVar, value: Literal }

export type TypedVar =
  | { a: Type, name: string }

export type FuncDef<A> =
  | { a?: A, name: string, variables: Array<{ a?: A, tag: "name" }>, methodBody: FuncBody<A> }

export type FuncBody<A> =
  | { varDefs: [{ tag: "vardef", value: VarDef }], statements: [Stmt<A>] }

export type Parameter =
  | { name: string, typ: Type }

export type ClassDef<A> = {
  a?: A, name: string, varDefs: VarDef[], methodDefs: FuncDef<A>[]
}

export type ClsField = { name: string, type: Type }

export type ClsMethod = { name: string, arguments: Type[], return_type: Type }

export type Stmt<A> =
  | { a?: A, tag: "assign", name: Expr<A> | string, value: Expr<A> }
  | { a?: A, tag: "if", if_condition: Expr<A>, elif_condition: Expr<A>, if_body: Array<Stmt<A>>, elif_body: Array<Stmt<A>>, else_body: Array<Stmt<A>> }
  | { a?: A, tag: "while", cond: Expr<A>, body: Array<Stmt<A>> }
  | { a?: A, tag: "pass" }
  | { a?: A, tag: "return", value: Expr<A> }
  | { a?: A, tag: "expr", expr: Expr<A> }
  | { a?: A, tag: "define", name: string, params: Parameter[], ret: Type, body: Stmt<A>[] }
  | { a?: A, tag: "vardef", name: string, value: Expr<A> }
  | { a?: A, tag: "clsdef", name: string, varDefs: Stmt<A>[], methodDefs: Stmt<A>[] }



export type Expr<A> =
  | { a?: A, tag: "number", value: number }
  | { a?: A, tag: "true" }
  | { a?: A, tag: "false" }
  | { a?: A, tag: "name", name: string }
  | { a?: A, tag: "uniop", expr: Expr<A>, op: string }
  | { a?: A, tag: "binop", op: string, lhs: Expr<A>, rhs: Expr<A> }
  | { a?: A, tag: "id", name: string, global?: boolean }
  | { a?: A, tag: "par_exp", expr: Expr<A> }
  | { a?: A, tag: "print", args: Expr<A>[] }
  | { a?: A, tag: "constructor", name: string }
  | { a?: A, tag: "object", name: string, value: Expr<A>[] }
  | { a?: A, tag: "clsvar", name: string, expr: Expr<A> }
  | { a?: A, tag: "clsmethod", name: string, expr: Expr<A>, args: Expr<A>[] }


export type Type =
  | "int"
  | "bool"
  | "none"
  | "object"
  | { tag: "object", class: string }

export type Literal =
  | { type: Type, value: string }
  | { type: Type, value: number }


export const opType = new Map<string, [string, Type]>();
opType.set("+", ["int", "int"]);
opType.set("-", ["int", "int"]);
opType.set("*", ["int", "int"]);
opType.set("%", ["int", "int"]);
opType.set("<=", ["int", "bool"]);
opType.set(">=", ["int", "bool"]);
opType.set("<", ["int", "bool"]);
opType.set(">", ["int", "bool"]);
opType.set("not", ["bool", "bool"]);
opType.set("==", ["int", "bool"]);
opType.set("!=", ["int", "bool"]);
opType.set("is", ["none", "bool"]);
opType.set("not", ["bool", "bool"]);
export type Program<A> = {
  varDefs: Array<VarDef>,
  stmts: Array<Stmt<A>>,
  funcDefs: Array<FuncDef<A>>,
  classDefs: Array<ClassDef<A>>
}

export type VarDef =
  | { name: TypedVar, value: Literal }

export type TypedVar =
  | { a: Type, name: string }

export type FuncDef<A> =
  | { a?: A, name: string, vars: Array<TypedVar>, body: FuncBody<A> }

export type FuncBody<A> =
  | { varDefs: [{ tag: "vardef", value: VarDef }], statements: [Stmt<A>] }

export type ClassDef<A> =
  | { a?: A, name: string, fields: Array<VarDef>, methods: Array<FuncDef<A>> }

export type Stmt<A> =
  | { a?: A, tag: "assign", name: string | Expr<A>, value: Expr<A> }
  | { a?: A, tag: "if", ifcond: Expr<A>, elifcond: Expr<A>, ifbody: Array<Stmt<A>>, elifbody: Array<Stmt<A>>, elsebody: Array<Stmt<A>> }
  | { a?: A, tag: "while", cond: Expr<A>, body: Array<Stmt<A>> }
  | { a?: A, tag: "pass" }
  | { a?: A, tag: "return", value: Expr<A> }
  | { a?: A, tag: "expr", expr: Expr<A> }
  | { a?: A, tag: "funcdef", name: string, params: Array<Parameter>, ret: Type, body: Array<Stmt<A>> }
  | { a?: A, tag: "vardef", name: string, value: Expr<A> }
  | { a?: A, tag: "clsdef", name: string, varDefs: Array<Stmt<A>>, methodDefs: Array<Stmt<A>> }

export type Expr<A> =
  | { a?: A, tag: "literal", value: Literal }
  | { a?: A, tag: "uniop", expr: Expr<A>, op: string }
  | { a?: A, tag: "binop", left: Expr<A>, op: BinOp, right: Expr<A> }
  | { a?: A, tag: "paranexpr", expr: Expr<A> }
  | { a?: A, tag: "id", name: string, global?: boolean }
  | { a?: A, tag: "object", name: string, value: Expr<A>[] }
  | { a?: A, tag: "constructor", name: string }
  | { a?: A, tag: "clsvar", name: string, expr: Expr<A> }
  | { a?: A, tag: "clsmethod", name: string, expr: Expr<A>, args: Expr<A>[] }
  | { a?: A, tag: "print", args: Array<Expr<A>> }


export type Parameter = {
  name: string, type: Type
}

export enum UniOp {
  Not = "not",
  Neg = "-",
}

export enum BinOp {
  Plus = "+",
  Minus = "-",
  Mul = "*",
  Div = "//",
  Mod = "%",
  Eq = "==",
  Neq = "!=",
  Lte = "<=",
  Gte = ">=",
  Lt = "<",
  Gt = ">",
  Is = "is"
}

export type Literal =
  | { tag: "bool", value: boolean }
  | { tag: "number", value: number }

export type Type =
  | "int"
  | "bool"
  | "none"
  | { tag: "object", class: string }


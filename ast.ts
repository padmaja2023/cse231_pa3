export type Program<A> = {
  a?: A,
  varDefs: VarDef<A>[],
  funcDefs: FuncDef<A>[],
  stmts: Stmt<A>[],
}

export type VarDef<A> = {
  a?: A,
  name: string,
  type: Type,
  value: Literal,
}

export type Parameter = {
  name: string,
  typ: Type,
}

export type FuncDef<A> = {
  a?: A,
  name: string,
  params: Parameter[],
  ret: Type,
  varDefs: VarDef<A>[],
  stmts: Stmt<A>[],
}

export type If<A> = { a?: A, tag: "ifBlock", cond: Expr<A>, thn: Stmt<A>[] }

export type Stmt<A> =
  | { a?: A, tag: "assign", name: string, value: Expr<A> }
  | { a?: A, tag: "if", iff: If<A>, elif: If<A>[], els: Stmt<A>[] }
  | { a?: A, tag: "while", cond: Expr<A>, stmts: Stmt<A>[] }
  | { a?: A, tag: "pass" }
  | { a?: A, tag: "return", value: Expr<A> }
  | { a?: A, tag: "expr", expr: Expr<A> }

export type Expr<A> =
  | { a?: A, tag: "literal", value: Literal }
  | { a?: A, tag: "id", name: string }
  | { a?: A, tag: "uniop", op: UniOp, expr: Expr<A> }
  | { a?: A, tag: "binop", op: BinOp, left: Expr<A>, right: Expr<A> }
  | { a?: A, tag: "call", name: string, args: Expr<A>[] }
  | { a?: A, tag: "builtin1", name: string, arg: Expr<A> }
  | { a?: A, tag: "builtin2", name: string, arg1: Expr<A>, arg2: Expr<A> }

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
  | { tag: "none"}
  | { tag: "bool", value: boolean }
  | { tag: "number", value: number }

export enum Type {
  Int = "int",
  Bool = "bool",
  None = "none",
}

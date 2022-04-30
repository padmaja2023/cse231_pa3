import wabt from 'wabt';
import {importObject} from './import-object.test';
import {compile, run_compiler} from '../compiler';
import {parseProgram} from '../parser';
import { tcProgram } from '../tc';
import { Expr, Stmt, Type } from "../ast";
import { none } from 'binaryen';





export function typeCheck(source: string) : Type {
  let ast = parseProgram(source);
  console.log("parsed program :: ",ast)
  ast = tcProgram(ast);
  var length = ast.length;
  try
  {
    return ast[length-1].a;
  }
  catch(Error){
    return "none";
  }
}




export async function run(source: string) {
  // source is python code
  const wat = compile(source);
  var memory = new WebAssembly.Memory({initial:20000, maximum:20000});
  importObject.imports = Object.assign({ not_operator: (arg : boolean) => {return !arg}}, importObject.imports);
  (importObject.imports as any).mem = memory
  const result = await run_compiler(wat,importObject);
  return result;
}

// type Type =
//   | "int"
//   | "bool"
//   | "none"
//   | { tag: "object", class: string }

export const NUM : Type = "int";
export const BOOL : Type = "bool";
export const NONE : Type = "none";
export function CLASS(name : string) : Type { 
  return { tag: "object", class: name }
};

// // This is a mashup of tutorials from:
// //
// // - https://github.com/AssemblyScript/wabt.js/
// // - https://developer.mozilla.org/en-US/docs/WebAssembly/Using_the_JavaScript_API

// import wabt from 'wabt';
// import { Type } from './ast';
// import * as compiler from './compiler';
// import { parse } from './parser';
// import { tc } from './tc';

// // NOTE(joe): This is a hack to get the CLI Repl to run. WABT registers a global
// // uncaught exn handler, and this is not allowed when running the REPL
// // (https://nodejs.org/api/repl.html#repl_global_uncaught_exceptions). No reason
// // is given for this in the docs page, and I haven't spent time on the domain
// // module to figure out what's going on here. It doesn't seem critical for WABT
// // to have this support, so we patch it away.
// if (typeof process !== "undefined") {
//   const oldProcessOn = process.on;
//   process.on = (...args: any): any => {
//     if (args[0] === "uncaughtException") { return; }
//     else { return oldProcessOn.apply(process, args); }
//   };
// }

// export async function run(source: string, config: any): Promise<number> {
//   const wabtInterface = await wabt();
//   const parsed = parse(source);
//   console.log(parsed);
//   const [typed, gEnv] = tc(parsed);
//   console.log(typed);
//   console.log(gEnv);
//   var returnType = "";
//   var returnExpr = "";
//   const pTyp = typed.a;
//   if (pTyp !== Type.None) {
//     returnType = "(result i32)";
//     returnExpr = "(local.get $$last)"
//   }
//   const compiled = compiler.compile(typed);
//   const importObject = config.importObject;
//   const wasmSource = `(module
//     (func $print_num (import "imports" "print_num") (param i32) (result i32))
//     (func $print_bool (import "imports" "print_bool") (param i32) (result i32))
//     ${compiled.vars}
//     ${compiled.funcs}
//     (func (export "exported_func") ${returnType}
//       ${compiled.wasmSource}
//       ${returnExpr}
//     )
//   )`;
//   console.log(wasmSource);
//   const myModule = wabtInterface.parseWat("test.wat", wasmSource);
//   var asBinary = myModule.toBinary({});
//   var wasmModule = await WebAssembly.instantiate(asBinary.buffer, importObject);
//   const result = (wasmModule.instance.exports.exported_func as any)();
//   console.log(result);
//   return result;
// }

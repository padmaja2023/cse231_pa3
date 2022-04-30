import {compile, run_compiler} from './compiler';
import { output } from './webpack.config';


document.addEventListener("DOMContentLoaded", async () => {
  function display(arg : string) {
    const output = document.getElementById("output");
    output.textContent += arg + "\n";
    // const elt = document.createElement("pre");
    // document.getElementById("output").appendChild(elt);
    // elt.innerText = arg + "\n";
  }
  const memory = new WebAssembly.Memory({ initial: 20000, maximum: 20000 });
  var importObject = {
    imports: {
      print_num: (arg : any) => {
        display(String(arg));
        return arg;
      },
      print_bool: (arg : any) => {
        if(arg === 0) { display("False"); }
        else { display("True"); }
        return arg;
      },
      not_operator: (arg : boolean) => {
        console.log("Logging from WASM: ", arg);
        console.log("Logging from WASM: ", arg);
        return !arg;
      },
      print_none: (arg: any) => {
        display("None");
        return arg;
      },
      mem: memory
    },
  };

  const runButton = document.getElementById("run");
  const userCode = document.getElementById("user-code") as HTMLTextAreaElement;
  runButton.addEventListener("click", async () => {
    const program = userCode.value;
    const output = document.getElementById("output");
    output.innerHTML = "";
    try {
      const wat = compile(program);
      const code = document.getElementById("generated-code");
      code.textContent = wat;
      console.log(typeof importObject.imports);
      const result = await run_compiler(wat, importObject);
      console.log("result",result);
      output.textContent += String(result);
      output.setAttribute("style", "color: black");
    }
    catch(e) {
      console.error(e)
      output.textContent = String(e);
      output.setAttribute("style", "color: red");
    }
  });

  userCode.value = localStorage.getItem("program");
  userCode.addEventListener("keypress", async() => {
    localStorage.setItem("program", userCode.value);
  });
});
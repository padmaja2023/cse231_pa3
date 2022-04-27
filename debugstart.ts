import { compile } from './compiler';
import { parse } from './parser';
import { tc } from './tc';

const py_1 = `
def f(a: int) -> int:
  if (a > 3):
    return a
  f(a + 1)

f(0)
`

const py_func_1 = `
def f(a: int):
  print(a)
f(3)
`

const py_func_2 = `
def f()->boolean:
  return 1 == 2
`

const py_if_1 = `
if x == 1:
  print(1)
elif x == 2:
  print(2)
else:
  print(3)
`

const py_if_2 = `
x: int = 2
if x == 1:
  print(1)
else:
  print(2)
`

const py_while_1 = `
i: int = 0
while (i < 3):
  print(false)
  i = i + 1
`

const p = parse(py_1);
console.log(JSON.stringify(p, null, 2))
var [typed, gEnv] = tc(p);
console.log(JSON.stringify(typed, null, 2))
// console.log(gEnv.funcs)
console.log(compile(py_1))


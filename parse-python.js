const python = require('lezer-python');

const input = "def f(a: int):\n  return\nprint(f(2))";

const tree = python.parser.parse(input);

const cursor = tree.cursor();

do {
  console.log(cursor.node.type.name);
  console.log(input.substring(cursor.node.from, cursor.node.to));
} while(cursor.next());


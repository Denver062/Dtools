import SevenZip from '7z-wasm'
import fs from 'node:fs'
import path from 'node:path'

const wasm = fs.readFileSync('node_modules/7z-wasm/7zz.wasm')
const bin = await SevenZip({
  wasmBinary: wasm,
  noExitRuntime: true,
  print: (l) => console.log('7z:', l),
  printErr: (l) => console.log('7z!:', l),
  stdin: () => null,
})
console.log('module loaded', typeof bin.callMain)

// create a tiny zip with bsdtar then list it
bin.FS.writeFile('/hello.txt', new TextEncoder().encode('hello 7z-wasm'))
bin.FS.chdir('/')
let code = bin.callMain(['a', '/t.7z', '-t7z', '-psecret', '/hello.txt'])
console.log('create code', code, 'size', bin.FS.readFile('/t.7z').byteLength)
bin.FS.mkdir('/out')
code = bin.callMain(['x', '/t.7z', '-o/out', '-psecret', '-y'])
console.log('extract code', code, fs.existsSync('/out'))
console.log('out', bin.FS.readdir('/out'))

import fs from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
const paths=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean)
const files=[]
for(const path of paths){
 const bytes=await fs.readFile(path)
 files.push({path,encoding:path.endsWith('.png')?'base64':'utf-8',content:bytes.toString(path.endsWith('.png')?'base64':'utf8')})
}
await fs.writeFile('.private/source-manifest.json',JSON.stringify(files))
console.log(`${files.length} source files prepared; ignored credentials and outputs excluded.`)

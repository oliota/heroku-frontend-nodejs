import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'

const app = express()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
app.use(express.static(__dirname))
app.get(['/elianeOrganizada','/elianeOrganizada/'],(_req,res)=>res.sendFile(path.join(__dirname,'elianeOrganizada','index.html')))
app.get('*',(_req,res)=>res.sendFile(path.join(__dirname,'index.html')))
const PORT=process.env.PORT||3000
app.listen(PORT)

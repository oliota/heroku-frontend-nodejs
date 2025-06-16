import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'

const app = express()
const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.use(express.static(__dirname))

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})

const PORT = process.env.PORT || 3000
app.listen(PORT)

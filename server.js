#!/usr/bin/env node

const jsonServer = require('json-server')
const server = jsonServer.create()
const router = jsonServer.router(__dirname + '/db.json')
const middlewares = jsonServer.defaults({
  static: __dirname + '/public'
})

server.use(middlewares)

router.db._.id = 'isbn'

server.use(router)
const port = process.env.PORT || 4730
server.listen(port, function () {
  console.log(`JSON Server is running on port ${port}`)
})

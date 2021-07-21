#!/usr/bin/env node

const jsonServer = require('json-server')
const guards = require('./middlewares/guards.js')
const bookValidation = require('./middlewares/book-validation.js')
const users = require('./users.js')
const fs = require('fs')
const path = require('path')

console.log(fs.readFileSync(path.join(__dirname, 'banner.txt'), {encoding: "ascii"}))

const server = jsonServer.create()
const router = jsonServer.router(__dirname + '/db.json')
const middlewares = jsonServer.defaults({
  static: __dirname + '/public'
})

// /!\ Bind the router db to the app
server.db = router.db

const authenticationMiddlewares = [users.router, guards.router]
Object.defineProperty(authenticationMiddlewares, 'rewriter', { value: guards.rewriter, enumerable: false })

server.use(middlewares)
server.use(authenticationMiddlewares)
server.use(bookValidation.middleware)
server.use(router)

const port = process.env.PORT || 4730
server.listen(port, function () {
  console.log(`JSON Server is running on port ${port}`)
})

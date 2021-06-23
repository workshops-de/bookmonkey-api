#!/usr/bin/env node

import jsonServer from 'json-server'
import path from 'path'
import { fileURLToPath } from 'url'
import guardsRouter, { rewriter } from './middlewares/guards.js'
import bookValidation from './middlewares/book-validation.js'
import usersRouter from './users.js'

//we need to change up how __dirname is used for ES6 purposes
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const server = jsonServer.create()
const router = jsonServer.router(__dirname + '/db.json')
const middlewares = jsonServer.defaults({
  static: __dirname + '/public'
})

// /!\ Bind the router db to the app
server.db = router.db

const authenticationMiddlewares = [usersRouter, guardsRouter]
Object.defineProperty(authenticationMiddlewares, 'rewriter', { value: rewriter, enumerable: false })

server.use(middlewares)
server.use(authenticationMiddlewares)
server.use(bookValidation)
server.use(router)

const port = process.env.PORT || 4730
server.listen(port, function () {
  console.log(`JSON Server is running on port ${port}`)
})
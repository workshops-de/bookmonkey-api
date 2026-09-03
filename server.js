#!/usr/bin/env node

const jsonServer = require('json-server')
const guards = require('./middlewares/guards.js')
const bookValidation = require('./middlewares/book-validation.js')
const users = require('./users.js')
const fs = require('fs')
const path = require('path')

/**
 * Build the configured json-server app without starting it.
 * Exposed so integration tests can drive the real middleware stack.
 *
 * @param {string} [dbPath] path to the lowdb JSON file. Falls back to the
 *   `DB_PATH` env var and finally the bundled `db.json`.
 */
function createServer(dbPath = process.env.DB_PATH || path.join(__dirname, 'db.json')) {
  const server = jsonServer.create()
  const router = jsonServer.router(dbPath)
  const middlewares = jsonServer.defaults({
    static: path.join(__dirname, 'public')
  })

  // /!\ Bind the router db to the app
  server.db = router.db

  const authenticationMiddlewares = [users.router, guards.router]
  Object.defineProperty(authenticationMiddlewares, 'rewriter', { value: guards.rewriter, enumerable: false })

  server.use(middlewares)
  server.use(authenticationMiddlewares)
  server.use(bookValidation.middleware)
  server.use(router)

  return server
}

module.exports = { createServer }

// Only boot a listening server when executed directly (`node server.js`),
// not when required from a test.
if (require.main === module) {
  console.log(fs.readFileSync(path.join(__dirname, 'banner.txt'), { encoding: 'ascii' }))

  const server = createServer()
  const port = process.env.PORT || 4730
  server.listen(port, function () {
    console.log(`JSON Server is running on port ${port}`)
  })
}

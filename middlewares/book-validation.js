const expressValidator = require('express-validator')
const conditional = require('express-conditional-middleware')
const compose = require('compose-middleware').compose

const requestMethods = ['POST', 'PUT']
const shouldValidateBody = (req) => req.path.includes('books') && requestMethods.includes(req.method)

const middleware = conditional(
  function (req) {
    return shouldValidateBody(req)
  },
  compose([
    expressValidator.body('isbn').exists().withMessage('Es muss eine ISBN angegeben werden.').isString().withMessage('Die ISBN muss als String übergeben werden.'),
    expressValidator.body('title').exists().withMessage('Es muss ein Titel angegeben werden.').isString().withMessage('Der Titel muss als String übergeben werden.'),
    (req, res, next) => {
      const result = expressValidator.validationResult(req)

      if (!result.isEmpty()) {
        return res.status(400).json({ errors: result.mapped() })
      }

      req.body.id = req.body.isbn;
      return next()
    }
  ]),
  null
)

module.exports = {
  middleware,
}
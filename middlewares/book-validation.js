import { body, validationResult } from 'express-validator'
import conditional from 'express-conditional-middleware'
import { compose } from 'compose-middleware'

const requestMethods = ['POST', 'PUT']
const shouldValidateBody = (req) => req.path.includes('books') && requestMethods.includes(req.method)

export const checkBookValidation = (req, _, next) => {
  req.useBookValidation = shouldValidateBody(req);
  return next();
}

export default conditional(
  function (req, res, next) {
    return shouldValidateBody(req)
  },
  compose([
    body('isbn').exists().withMessage('Es muss eine ISBN angegeben werden.').isString().withMessage('Die ISBN muss als String übergeben werden.'),
    body('title').exists().withMessage('Es muss ein Titel angegeben werden.').isString().withMessage('Der Titel muss als String übergeben werden.'),
    (req, res, next) => {
      const result = validationResult(req)

      if (!result.isEmpty()) {
        return res.status(400).json({ errors: result.mapped() })
      }

      req.body.id = req.body.isbn;
      return next()
    }
  ]),
  null
)
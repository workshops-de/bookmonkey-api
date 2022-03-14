const bcrypt = require('bcryptjs');
const Router = require('express').Router;
const jwt = require('jsonwebtoken');
const sharedMiddleware = require('./middlewares/shared.js');
const CONSTANTS = require('./constants.js');

/**
 * Validate email and password
 */
const validate =
  ({ required }) =>
  (req, res, next) => {
    const { email, password } = req.body;

    if (
      required &&
      (!email || !email.trim() || !password || !password.trim())
    ) {
      res.status(400).jsonp('Email and password are required');
      return;
    }

    if (email && !email.match(CONSTANTS.EMAIL_REGEX)) {
      res.status(400).jsonp('Email format is invalid');
      return;
    }

    if (password && password.length < CONSTANTS.MIN_PASSWORD_LENGTH) {
      res.status(400).jsonp('Password is too short');
      return;
    }

    next();
  };

/**
 * Register / Create a user
 */
const create = (req, res, next) => {
  const { email, password, ...rest } = req.body;
  const { db } = req.app;

  if (db == null) {
    // json-server CLI expose the router db to the app
    // (https://github.com/typicode/json-server/blob/master/src/cli/run.js#L74),
    // but if we use the json-server module API, we must do the same.
    throw Error('You must bind the router db to the app');
  }

  const existingUser = db.get('users').find({ email }).value();
  if (existingUser) {
    res.status(400).jsonp('Email already exists');
    return;
  }

  bcrypt
    .hash(password, CONSTANTS.SALT_LENGTH)
    .then((hash) => {
      // Create users collection if doesn't exist,
      // save password as hash and add any other field without validation
      try {
        return db
          .get('users')
          .insert({ email, password: hash, ...rest })
          .write();
      } catch (error) {
        throw Error('You must add a "users" collection to your db');
      }
    })
    .then((user) => {
      return new Promise((resolve, reject) => {
        jwt.sign(
          { email },
          CONSTANTS.JWT_SECRET_KEY,
          { expiresIn: CONSTANTS.JWT_EXPIRES_IN, subject: String(user.id) },
          (error, idToken) => {
            if (error) reject(error);
            else resolve({ idToken, user });
          }
        );
      });
    })
    .then(({ accessToken, user }) => {
      // Return an access token instead of the user record
      res.status(201).jsonp({ accessToken, user });
    })
    .catch(next);
};

/**
 * Login
 */
const login = (req, res, next) => {
  const { email, password } = req.body;
  const { db } = req.app;

  if (db == null) {
    throw Error('You must bind the router db to the app');
  }

  const user = db.get('users').find({ email }).value();

  if (!user) {
    res.status(400).jsonp('Cannot find user');
    return;
  }

  bcrypt
    .compare(password, user.password)
    .then((same) => {
      if (!same) throw 400;

      return new Promise((resolve, reject) => {
        jwt.sign(
          { email },
          CONSTANTS.JWT_SECRET_KEY,
          { expiresIn: CONSTANTS.JWT_EXPIRES_IN, subject: String(user.id) },
          (error, idToken) => {
            if (error) reject(error);
            else resolve(idToken);
          }
        );
      });
    })
    .then((accessToken) => {
      res.status(200).jsonp({ accessToken, user });
    })
    .catch((err) => {
      if (err === 400) res.status(400).jsonp('Incorrect password');
      else next(err);
    });
};

/**
 * Patch and Put user
 */
// TODO: create new access token when password or email changes
const update = (req, res, next) => {
  const { password } = req.body;

  if (!password) {
    next(); // Simply continue with json-server router
    return;
  }

  bcrypt
    .hash(password, CONSTANTS.SALT_LENGTH)
    .then((hash) => {
      req.body.password = hash;
      next();
    })
    .catch(next);
};

/**
 * Users router
 */
const router = Router()
  .use(sharedMiddleware.bodyParsingHandler)
  .post('/users|register|signup', validate({ required: true }), create)
  // Bypass eventual users guards to still allow creation
  .post('/[640]{3}/users', validate({ required: true }), create)
  .post('/login|signin', validate({ required: true }), login)
  .put('/users/:id', validate({ required: true }), update)
  .patch('/users/:id', validate({ required: false }), update)
  .use(sharedMiddleware.errorHandler);

module.exports = {
  router,
};

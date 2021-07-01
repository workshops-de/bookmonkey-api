const express = require('express')

/**
 * Use same body-parser options as json-server
 */
const bodyParsingHandler = [express.json({ limit: '10mb' }), express.urlencoded({ extended: false })]

/**
 * Json error handler
 */
const errorHandler = (err, req, res, next) => {
	console.error(err)
	res.status(500).jsonp(err.message)
}

/**
 * Just executes the next middleware,
 * to pass directly the request to the json-server router
 */
const goNext = (req, res, next) => {
	next()
}

/**
 * Look for a property in the request body and reject the request if found
 */
const forbidUpdateOn = (...forbiddenBodyParams) => {
	return (req, res, next) => {
		const bodyParams = Object.keys(req.body)
		const hasForbiddenParam = bodyParams.some(forbiddenBodyParams.includes)

		if (hasForbiddenParam) {
			res.status(403).jsonp(`Forbidden update on: ${forbiddenBodyParams.join(', ')}`)
		} else {
			next()
		}
	}
}

/**
 * Reject the request for a given method
 */
const forbidMethod = (method) => {
	return (req, res, next) => {
		if (req.method === method) {
			res.sendStatus(405)
		} else {
			next()
		}
	}
}

module.exports = {
	bodyParsingHandler,
	errorHandler,
	goNext,
	forbidUpdateOn,
	forbidMethod,
}
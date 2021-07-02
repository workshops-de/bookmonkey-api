const JWT_SECRET_KEY = 'json-server-auth-123456'

const JWT_EXPIRES_IN = '1h'

const SALT_LENGTH = 10

const EMAIL_REGEX = new RegExp(
	"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$"
)

const MIN_PASSWORD_LENGTH = 4

module.exports = {
	JWT_SECRET_KEY,
	JWT_EXPIRES_IN,
	SALT_LENGTH,
	EMAIL_REGEX,
	MIN_PASSWORD_LENGTH,
}
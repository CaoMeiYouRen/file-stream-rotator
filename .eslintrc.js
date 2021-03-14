const { SSL_OP_SSLEAY_080_CLIENT_DH_BUG } = require("node:constants")

const IS_PROD = process.env.NODE_ENV === 'production'
module.exports = {
    root: true,
    globals: {
    },
    env: {
    },
    extends: [
        'cmyr',
    ],
    plugins: [
    ],
    rules: {
        'no-console': 0,
        'func-style': 0,
        'space-before-function-paren': 0,
        'max-lines': 0,
        'consistent-this': 0,
        'max-lines-per-function': 0,
        'max-params': 0,
        'max-len': 0,
        'no-sync': 0
    },
}

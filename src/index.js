let pg = require('pg')
const assert = require('assert')

const types = pg.types

types.setTypeParser(1082, val => val)
types.setTypeParser(1700, val => Number(val))

module.exports = PgCrLayer

/**
 * Postgres common requests interface layer
 *
 *  @param config {object}
 * user: <username>,
 * password: <password>,
 * host: <host>,
 * pool: {
 *   max: <max pool size>,
 *   idleTimeout: <idle timeout in milliseconds>
 * },
 * native: <boolean>
 *
 * @returns {PgCrLayer}
 * @constructor
 */

function PgCrLayer(config) {
  if (!(this instanceof PgCrLayer)) {
    return new PgCrLayer(config)
  }
  if (config && config.native === true) {
    pg = pg.native
  }
  this.pool = new pg.Pool(config)
  this.pool.on('error', function(err, client) {
    console.error('idle client error in pool', client, err)
  })
}

PgCrLayer.prototype.dialect = 'postgres'

PgCrLayer.prototype.delimiters = '""'

PgCrLayer.prototype.connect = function() {
  return new Promise(function(resolve, reject) {
    this.pool.connect(function(err, client, done) {
      if (err) {
        return reject(err)
      }
      done()
      resolve()
    })
  }.bind(this))
}

/**
 * Detect if we're conncted to redshift, since that impacts compatibility
 * concerns of consumers of this API.
 */
PgCrLayer.prototype.isRedshift = function() {
  return new Promise(function(resolve, reject) {
    this.pool.connect(function(err, client, done) {
      if (err) {
        return reject(err)
      }
      client.query('SELECT version()', function(err, res) {
        if (err) {
          done(err)
          reject(err)
        }

        done()
        resolve(res.rows[0].version.includes('Redshift'))
      })
    })
  }.bind(this))
}

/**
 * Manage a transaction
 * @param fn(transaction)
 * fn should return a promise with commands that when resolved will be committed
 * or rolled back in case of an error. At each command you should pass
 * the transaction parameter as a transaction property in options
 * @returns {Promise} With the return of the last promise executed
 */
PgCrLayer.prototype.transaction = function(fn) {
  return new Promise(function(resolve, reject) {
    this.pool.connect(function(err, client, done) {
      if (err) {
        return reject(err)
      }
      client.query('BEGIN', function(err) {
        if (err) {
          client.query('ROLLBACK', function(err) {
            done(err)
            reject(err)
          })
          return
        }
        fn(client)
          .then(function(res) {
            client.query('COMMIT', function(err) {
              done(err)
              resolve(res)
            })
          })
          .catch(function(fnError) {
            client.query('ROLLBACK', function(err) {
              done(err)
              reject(fnError)
            })
          })
      })
    })
  }.bind(this))
}

const doneMap = new WeakMap()

PgCrLayer.prototype.beginTransaction = function() {
  return new Promise(function(resolve, reject) {
    this.pool.connect(function(err, transaction, done) {
      if (err) {
        return reject(err)
      }
      transaction.query('BEGIN', function(err) {
        if (err) {
          transaction.query('ROLLBACK', function(err) {
            done(err)
            reject(err)
          })
          return
        }
        doneMap.set(transaction, done)
        resolve(transaction)
      })
    })
  }.bind(this))
}

PgCrLayer.prototype.commit = function(transaction) {
  return new Promise(function(resolve, reject) {
    transaction.query('COMMIT', function(err) {
      doneMap.get(transaction)(err)
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

PgCrLayer.prototype.rollback = function(transaction) {
  return new Promise(function(resolve, reject) {
    transaction.query('ROLLBACK', function(err) {
      doneMap.get(transaction)(err)
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

/**
 * Execute a script
 * @param script {string}
 * @param options {object} Can contain the transaction connection
 * @returns {Promise}
 */
PgCrLayer.prototype.batch = function(script, options) {
  return this.query(script, null, options)
}

/**
 * Execute a command or a script
 * @param statement {string}
 * @param params {Array|object} If array it will replace $1, $2... for each
 * element of the array. If object it will replace @key1, @key2 with the value with
 * each correspondent key
 * @param options {object} Can contain the transaction connection
 * @returns {Promise}
 */
PgCrLayer.prototype.execute = function(statement, params, options) {
  return this.query(statement, params, options)
}

/**
 * Execute a query
 * @param statement {string}
 * @param params {Array|object} If array it will replace $1, $2... for each
 * element of the array. If object it will replace @key1, @key2 with the value with
 * each correspondent key
 * @param options {object} Can contain the transaction connection
 * @returns {Promise}
 */
PgCrLayer.prototype.query = function(statement, params, options) {

  var convertParams = function() {
    if (params && params !== null) {
      if (typeof params === 'object' && !Array.isArray(params)) {
        var match = statement.match(/(@\w*\b)/g)
        var i = 1
        params = match
          ? match.map(function(param) {
            statement = statement.replace(param, '$' + i)
            i++
            var key = param.substr(1)
            assert(params[key], 'Parameter ' + param
                                + ' not found in object params')
            return params[key]
          })
          : []
      }
      params = params.map(function(param) {
        if (typeof param === 'object' && !(param instanceof Date)) {
          return param && param.value !== void 0
            ? param.value
            : null
        } else {
          return param !== void 0
            ? param
            : null
        }
      })
    }
  }

  if (options && options.transaction) {
    return new Promise(function(resolve, reject) {
      convertParams()
      options.transaction.query(statement, params, function(err, result) {
        if (err) {
          return reject(err)
        }
        resolve(
          Array.isArray(result) // multiple statements
            ? result.map(({rows}) => rows)
            : result.rows
        )
      })
    })
  } else {
    return new Promise(function(resolve, reject) {
      convertParams()
      this.pool.query(statement, params, function(err, result) {
        if (err) {
          reject(err)
          return
        }
        resolve(
          Array.isArray(result) // multiple statements
            ? result.map(({rows}) => rows)
            : result.rows
        )
      })
    }.bind(this))
  }
}

/**
 * Close all connections in the poll
 * @returns {Promise}
 */
PgCrLayer.prototype.close = function() {
  return Promise.resolve(this.pool.end())
}

/**
 * Wrap the identifier within the appropriate delimiters
 * @param identifier {string}
 * @returns identifier {string}
 */
PgCrLayer.prototype.wrap = function(identifier) {
  return this.delimiters[0] + identifier + this.delimiters[1]
}

var pg = require('pg');
var assert = require('assert');

var connectionParams = new WeakMap(); // Hidden connection parameters

module.exports = PgCrLayer;

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
    return new PgCrLayer(config);
  }
  if (config && config.native === true) {
    pg = pg.native;
  }
  connectionParams.set(this, toPgConfig(config));
}

PgCrLayer.prototype.dialect = 'postgres';

PgCrLayer.prototype.delimiters = '""';

PgCrLayer.prototype.connect = function(config) {
  return new Promise(function(resolve, reject) {
    config = toPgConfig(config, connectionParams.get(this));
    pg.connect(config, function(err, client, done) {
      if (err) {
        return reject(err);
      }
      done();
      resolve();
    });
  }.bind(this));
};

/**
 * Manage a transaction
 * @param fn(transaction)
 * fn should return a promise with commands that when resolved will be committed
 * or rolled back in case of an error. At each command you should pass
 * the transaction parameter as a transaction property in options
 * @param options {object} - Optional database to connect
 * @returns {Promise} With the return of the last promise executed
 */
PgCrLayer.prototype.transaction = function(fn, options) {
  return new Promise(function(resolve, reject) {
    options = toPgConfig(options, connectionParams.get(this));
    pg.connect(options, function(err, client, done) {
      if (err) {
        return reject(err);
      }
      client.query('BEGIN', function(err) {
        if (err) {
          client.query('ROLLBACK', function(err) {
            done(err);
            reject(err);
          });
          return;
        }
        fn(client)
          .then(function(res) {
            client.query('COMMIT', function(err) {
              done(err);
              resolve(res);
            });
          })
          .catch(function(fnError) {
            client.query('ROLLBACK', function(err) {
              done(err);
              reject(fnError);
            });
          });
      });
    });
  }.bind(this));
};

/**
 * Execute a script
 * @param script {string}
 * @param options {object} Can contain the transaction connection
 * @returns {Promise}
 */
PgCrLayer.prototype.batch = function(script, options) {
  return this.query(script, null, options);
};

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
  return this.query(statement, params, options);
};

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
        var match = statement.match(/(@\w*\b)/g);
        var i = 1;
        params = match ? match.map(function(param) {
          statement = statement.replace(param, '$' + i);
          i++;
          var key = param.substr(1);
          assert(params[key], 'Parameter ' + param + ' not found in object params');
          return params[key];
        }) : [];
      }
      params = params.map(function(param) {
        if (typeof param === 'object' && !(param instanceof Date)) {
          return param && param.value !== void 0 ? param.value : null;
        } else {
          return param !== void 0 ? param : null;
        }
      });
    }
  };

  if (options && options.transaction) {
    return new Promise(function(resolve, reject) {
      convertParams();
      options.transaction.query(statement, params, function(err, result) {
        if (err) {
          return reject(err);
        }
        resolve(result.rows);
      });
    });
  } else {
    return new Promise(function(resolve, reject) {
      var config = toPgConfig(options, connectionParams.get(this));
      convertParams();
      pg.connect(config, function(err, client, done) {
        if (err) {
          return reject(err);
        }
        client.query(statement, params, function(err, result) {
          if (err) {
            done();
            reject(err);
            return;
          }
          done();
          resolve(result.rows);
        });
      });
    }.bind(this));
  }
};

/**
 * Close all connections in the poll
 * @returns {Promise}
 */
PgCrLayer.prototype.close = function() {
  return Promise.resolve(pg.end());
};

/**
 * Wrap the identifier within the appropriate delimiters
 * @param identifier {string}
 * @returns identifier {string}
 */
PgCrLayer.prototype.wrap = function(identifier) {
  return this.delimiters[0] + identifier + this.delimiters[1];
};

function toPgConfig(config, defaultConfig) {
  config = config || {};
  return {
    user: config.user || defaultConfig && defaultConfig.user || pg.defaults.user,
    database: config.database || defaultConfig && defaultConfig.database || pg.defaults.database,
    password: config.password || defaultConfig && defaultConfig.password || pg.defaults.password,
    port: config.port || defaultConfig && defaultConfig.port || pg.defaults.port || 5432,
    host: config.host || defaultConfig && defaultConfig.host || pg.defaults.host || 'localhost',
    poolSize: config.pool && config.pool.max || defaultConfig && defaultConfig.poolSize || pg.defaults.poolSize,
    poolIdleTimeout: config.pool && config.pool.idleTimeout || defaultConfig && defaultConfig.poolIdleTimeout || pg.defaults.poolIdleTimeout
  };
}

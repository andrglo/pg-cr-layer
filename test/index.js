'use strict';

var assert = require('assert');
var PgCrLayer = require('../src');
var pg = require('pg');
var chai = require('chai');
var expect = chai.expect;
chai.should();

var databaseName = [
  'tests-pg-cr-layer-1',
  'tests-pg-cr-layer-2',
  'tests-pg-cr-layer-3'
];

var config = {
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  pool: {
    max: 25,
    idleTimeout: 30000
  }
};

var log = console.log;

var createDbLayer = {};

function createPostgresDb(dbName) {
  config.database = 'postgres';
  createDbLayer[dbName] = new PgCrLayer(config); // do not close after creation
  return createDbLayer[dbName].connect()
    .then(function() {
      return createDbLayer[dbName].execute('DROP DATABASE IF EXISTS "' + dbName + '"')
        .then(function() {
          return createDbLayer[dbName].execute('CREATE DATABASE "' + dbName + '"');
        });
    });
}

before(function(done) {
  return createPostgresDb(databaseName[0])
    .then(function() {
      return createPostgresDb(databaseName[1])
    })
    .then(function() {
      return createPostgresDb(databaseName[2])
    })
    .then(function() {
      done();
    })
    .catch(function(error) {
      done(error);
    });
});

describe('postgres cr layer', function() {
  var layer0;
  var layer1;
  var layer2;
  before(function(done) {
    config.database = databaseName[0];
    layer0 = new PgCrLayer(config);
    config.database = databaseName[1];
    layer1 = new PgCrLayer(config);
    config.database = databaseName[2];
    layer2 = new PgCrLayer(config);
    layer0.connect()
      .then(function() {
        return layer1.connect();
      })
      .then(function() {
        return layer2.connect();
      })
      .then(function() {
        done();
      });
  });

  it('should create a table in layer 0', function(done) {
    layer0.execute('CREATE TABLE films (' +
      'code char(5) CONSTRAINT firstkey PRIMARY KEY, ' +
      'title       varchar(40) NOT NULL, ' +
      'did integer NOT NULL, ' +
      'date_prod   date, ' +
      'kind varchar(10), ' +
      'len interval hour to minute )')
      .then(function(res) {
        expect(res).to.be.a('array');
        expect(res.length).to.equal(0);
        done();
      })
      .catch(done);
  });
  it('film now exists in layer 0', function(done) {
    layer0.query('SELECT * FROM films')
      .then(function(recordset) {
        expect(recordset).to.be.a('array');
        expect(recordset.length).to.equal(0);
        done();
      })
      .catch(done);
  });
  it('film not exists in layer 1', function(done) {
    layer1.query('SELECT * FROM films')
      .then(function() {
        done(new Error('Table created in the wrong db'));
      })
      .catch(function(error) {
        expect(error.message.indexOf('does not exist') !== -1).to.equal(true);
        done();
      })
      .catch(done);
  });
  it('film not exists in layer 2', function(done) {
    layer1.query('SELECT * FROM films')
      .then(function() {
        done(new Error('Table created in the wrong db'));
      })
      .catch(function(error) {
        expect(error.message.indexOf('does not exist') !== -1).to.equal(true);
        done();
      })
      .catch(done);
  });
  it('should create a table in layer 1', function(done) {
    layer1.execute('CREATE TABLE products ( ' +
      'product_no integer, ' +
      'name varchar(10), ' +
      'price numeric )')
      .then(function(res) {
        expect(res).to.be.a('array');
        expect(res.length).to.equal(0);
        done();
      })
      .catch(done);
  });
  it('should not create any record if a transaction fails in layer 1', function(done) {
    layer1
      .transaction(function(t) {
        return layer1.execute('INSERT INTO products ' +
          'VALUES (1, \'Cheese\', 9.99)', null, {transaction: t})
          .then(function() {
            return layer1.execute('INSERT INTO products ' +
              'VALUES (2, \'Chicken\', 19.99)', null, {transaction: t})
          })
          .then(function() {
            throw new Error('Crash')
          });
      })
      .then(function() {
        done(new Error('Where is the crash'));
      })
      .catch(function(error) {
        expect(error.message.indexOf('Crash') !== -1).to.equal(true);
        done();
      })
      .catch(done);
  });
  it('products should be empty in layer 1', function(done) {
    layer1.query('SELECT * FROM products')
      .then(function(recordset) {
        expect(recordset).to.be.a('array');
        expect(recordset.length).to.equal(0);
        done();
      })
      .catch(done);
  });
  it('should create the two records when the transaction is ok in layer 1', function(done) {
    layer1
      .transaction(function(t) {
        return layer1.execute('INSERT INTO products ' +
          'VALUES (1, \'Cheese\', 9.99)', null, {transaction: t})
          .then(function() {
            return layer1.execute('INSERT INTO products ' +
              'VALUES (2, \'Chicken\', 19.99)', null, {transaction: t})
          });
      })
      .then(function(res) {
        expect(res).to.be.a('array');
        expect(res.length).to.equal(0);
        done();
      })
      .catch(done);
  });
  it('products should have two records in layer 1', function(done) {
    layer1.query('SELECT * FROM products')
      .then(function(recordset) {
        expect(recordset).to.be.a('array');
        expect(recordset.length).to.equal(2);
        done();
      })
      .catch(done);
  });
  it('should create more one records when no transaction and a fail occurs in layer 1', function(done) {
    layer1.execute('INSERT INTO products ' +
      'VALUES (3, \'Wine\', 99.99)')
      .then(function() {
        throw new Error('Crash')
      })
      .then(function() {
        done(new Error('Where is the crash'));
      })
      .catch(function(error) {
        expect(error.message.indexOf('Crash') !== -1).to.equal(true);
        done();
      })
      .catch(done);
  });
  it('products should have three records in layer 1', function(done) {
    layer1.query('SELECT * FROM products')
      .then(function(recordset) {
        expect(recordset).to.be.a('array');
        expect(recordset.length).to.equal(3);
        done();
      })
      .catch(done);
  });
  it('should not create any record if a transaction fails due the server in layer 1', function(done) {
    layer1
      .transaction(function(t) {
        return layer1.execute('INSERT INTO products ' +
          'VALUES (4, \'Corn\', 39.99)', null, {transaction: t})
          .then(function() {
            return layer1.execute('INSERT INTO products ' +
              'VALUES (5, \'Very long product name\', 19.99)', null, {transaction: t})
          });
      })
      .then(function() {
        done(new Error('The server accepted?'));
      })
      .catch(function(error) {
        expect(error.message.indexOf('value too long') !== -1).to.equal(true);
        done();
      })
      .catch(done);
  });
  it('products should still have three records in layer 1', function(done) {
    layer1.query('SELECT * FROM products')
      .then(function(recordset) {
        expect(recordset).to.be.a('array');
        expect(recordset.length).to.equal(3);
        done();
      })
      .catch(done);
  });
  it('should wrap a identifier with double quotes', function() {
    expect(layer0.wrap('abc')).to.equal('"abc"');
  });
  it('should have postgres as dialect', function() {
    expect(layer0.dialect).to.equal('postgres');
  });
  it('should create more one records using array parameters in layer 1', function(done) {
    layer1.execute('INSERT INTO products ' +
      'VALUES ($1, $2, $3)', [4, 'Corn', 59.99])
      .then(function(res) {
        expect(res).to.be.a('array');
        expect(res.length).to.equal(0);
        done();
      })
      .catch(done);
  });
  it('products should have four records in layer 1', function(done) {
    layer1.query('SELECT * FROM products')
      .then(function(recordset) {
        expect(recordset).to.be.a('array');
        expect(recordset.length).to.equal(4);
        done();
      })
      .catch(done);
  });
  it('should create more one record using object parameters in layer 1', function(done) {
    return layer1.execute('INSERT INTO products ' +
      'VALUES (@product_no, @name, @price)', {
      name: 'Duck',
      product_no: 5,
      price: 0.99
    }).then(function(res) {
      expect(res).to.be.a('array');
      expect(res.length).to.equal(0);
      done();
    })
      .catch(done);
  });
  it('products should have five records in layer 1', function(done) {
    layer1.query('SELECT * FROM products')
      .then(function(recordset) {
        expect(recordset).to.be.a('array');
        expect(recordset.length).to.equal(5);
        var record = recordset[0];
        expect(record.product_no).to.be.a('number');
        expect(record.price).to.be.a('string');
        done();
      })
      .catch(done);
  });
  it('should reject due parameters length not match in layer 1', function(done) {
    layer1.execute('INSERT INTO products ' +
      'VALUES (@product_no, @name, @price)', {
      name: 'Duck',
      product_no: 5,
      product_ref: '',
      price: 0.99
    }).then(function() {
      done(new Error('No error?'));
    })
      .catch(function(error) {
        expect(error.message.indexOf('not match parameters') !== -1).to.equal(true);
        done();
      })
      .catch(done);
  });
  it('should reject due parameters typo in layer 1', function(done) {
    layer1.execute('INSERT INTO products ' +
      'VALUES (@product_no, @name, @price)', {
      name: 'Duck',
      product_n: 5,
      price: 0.99
    }).then(function() {
      done(new Error('No error?'));
    })
      .catch(function(error) {
        expect(error.message.indexOf('not found') !== -1).to.equal(true);
        done();
      })
      .catch(done);
  });
  it('should reject due no parameters in statement in layer 1', function(done) {
    layer1.execute('INSERT INTO products ' +
      'VALUES (product_no, name, price)', {
      name: 'Duck',
      product_n: 5,
      price: 0.99
    }).then(function() {
      done(new Error('No error?'));
    })
      .catch(function(error) {
        expect(error.message.indexOf('No parameter is defined') !== -1).to.equal(true);
        done();
      })
      .catch(done);
  });
  it('should create a table in layer 2', function(done) {
    layer2.execute('CREATE TABLE products ( ' +
      'product_no integer, ' +
      'name varchar(10), ' +
      'price numeric,' +
      'lastSale date,' +
      'createdAt timestamp with time zone,' +
      'updatedAt timestamp)')
      .then(function(res) {
        expect(res).to.be.a('array');
        expect(res.length).to.equal(0);
        done();
      })
      .catch(done);
  });
  var now = new Date();
  it('should insert date and time', function(done) {
    layer2.execute('INSERT INTO products ' +
      'VALUES ($1, $2, $3, $4, $5, $6)', [1, 'Cheese', 59.99,
      now.toISOString().substr(0, 10),
      now,
      now])
      .then(function() {
        return layer2.execute('INSERT INTO products ' +
          'VALUES ($1, $2, $3, $4, $5, $6)', [2, 'Pasta', 49.99,
          '2014-12-31',
          '2014-12-31T00:00:00Z',
          new Date('2014-12-31T00:00:00')])
      })
      .then(function() {
        return layer2.execute('INSERT INTO products ' +
          'VALUES ($1, $2, $3, $4, $5, $6)', [2, 'Pasta', 49.99,
          '2015-01-01',
          '2015-01-01T00:00:00-01:00',
          new Date('2014-12-31T23:00:00')])
      })
      .then(function() {
        return layer2.execute('INSERT INTO products ' +
          'VALUES ($1, $2, $3, $4, $5, $6)', [2, 'Pasta', 49.99,
          '2015-01-02',
          '2015-01-01T00:00:00+01:00',
          new Date('2015-01-01T01:00:00')])
      })
      .then(function() {
        return layer2.execute('INSERT INTO products ' +
          'VALUES ($1, $2, $3, $4, $5, $6)', [2, 'Pasta', 49.99,
          '2015-01-03',
          '2015-01-01T00:00:00+02:00',
          new Date('2015-01-01T02:00:00')])
      })
      .then(function() {
        return layer2.execute('INSERT INTO products ' +
          'VALUES ($1, $2, $3, $4, $5, $6)', [2, 'Pasta', 49.99,
          '2015-01-04',
          '2015-01-01T00:00:00-02:00',
          new Date('2014-12-31T22:00:00')])
      })
      .then(function(res) {
        expect(res).to.be.a('array');
        expect(res.length).to.equal(0);
        done();
      })
      .catch(done);
  });
  it('lets check the data', function(done) {
    layer2.query('SELECT * FROM products ORDER BY lastSale')
      .then(function(recordset) {
        expect(recordset).to.be.a('array');
        expect(recordset.length).to.equal(6);
        var record = recordset[0];
        expect(record.lastsale).to.be.a('Date');
        expect(record.createdat).to.be.a('Date');
        expect(record.updatedat).to.be.a('Date');
        expect(record.lastsale.toISOString().substr(0, 10)).to.equal('2014-12-31');
        expect(record.createdat.toISOString()).to.equal('2014-12-31T00:00:00.000Z');
        expect(record.updatedat.toISOString()).to.equal((new Date('2014-12-31T00:00:00')).toISOString());
        record = recordset[1];
        expect(record.lastsale.toISOString().substr(0, 10)).to.equal('2015-01-01');
        expect(record.createdat.toISOString()).to.equal('2015-01-01T01:00:00.000Z');
        expect(record.updatedat.toISOString()).to.equal((new Date('2014-12-31T23:00:00')).toISOString());
        record = recordset[2];
        expect(record.lastsale.toISOString().substr(0, 10)).to.equal('2015-01-02');
        expect(record.createdat.toISOString()).to.equal('2014-12-31T23:00:00.000Z');
        expect(record.updatedat.toISOString()).to.equal((new Date('2015-01-01T01:00:00')).toISOString());
        record = recordset[3];
        expect(record.lastsale.toISOString().substr(0, 10)).to.equal('2015-01-03');
        expect(record.createdat.toISOString()).to.equal('2014-12-31T22:00:00.000Z');
        expect(record.updatedat.toISOString()).to.equal((new Date('2015-01-01T02:00:00')).toISOString());
        record = recordset[4];
        expect(record.lastsale.toISOString().substr(0, 10)).to.equal('2015-01-04');
        expect(record.createdat.toISOString()).to.equal('2015-01-01T02:00:00.000Z');
        expect(record.updatedat.toISOString()).to.equal((new Date('2014-12-31T22:00:00')).toISOString());
        record = recordset[5];
        expect(record.lastsale.toISOString().substr(0, 10)).to.equal(now.toISOString().substr(0, 10));
        expect(record.createdat.toISOString()).to.equal(now.toISOString());
        expect(record.updatedat.toISOString()).to.equal(now.toISOString());
        done();
      })
      .catch(done);
  });
  it('lets check the where in a date field', function(done) {
    layer2.query('SELECT * FROM products WHERE lastSale >= $1 ORDER BY lastSale', ['2015-01-01'])
      .then(function(recordset) {
        expect(recordset).to.be.a('array');
        expect(recordset.length).to.equal(5);
        var record = recordset[0];
        expect(record.lastsale.toISOString().substr(0, 10)).to.equal('2015-01-01');
        done();
      })
      .catch(done);
  });
  it('lets check the where in a datetime field with time zone', function(done) {
    layer2.query('SELECT * FROM products WHERE createdAt >= $1 ORDER BY createdAt', ['2014-12-31T23:00:00.000Z'])
      .then(function(recordset) {
        expect(recordset).to.be.a('array');
        expect(recordset.length).to.equal(4);
        var record = recordset[0];
        expect(record.createdat.toISOString()).to.equal('2014-12-31T23:00:00.000Z');
        done();
      })
      .catch(done);
  });
  it('lets check the where in a datetime field without time zone', function(done) {
    layer2.query('SELECT * FROM products WHERE updatedAt >= $1 ORDER BY updatedAt',
      [new Date('2015-01-01T00:00:00+01:00')])
      .then(function(recordset) {
        expect(recordset).to.be.a('array');
        expect(recordset.length).to.equal(4);
        var record = recordset[0];
        expect(record.updatedat.toISOString()).to.equal((new Date('2014-12-31T23:00:00')).toISOString());
        done();
      })
      .catch(done);
  });
  it('should use the exact type in object format in layer 1', function(done) {
    layer1.execute('INSERT INTO products ' +
      'VALUES (@product_no, @name, @price)', {
      name: {
        value: 'Iron',
        type: 'string',
        maxLength: 10
      },
      product_no: {
        value: 5,
        type: 'integer'
      },
      price: {
        value: 0.99,
        type: 'number',
        maxLength: 12,
        decimals: 2
      }
    }).then(function(res) {
      expect(res).to.be.a('array');
      expect(res.length).to.equal(0);
      done();
    }).catch(function(error) {
      done(error);
    })
  });
  it('should use the exact type in array format in layer 1', function(done) {
    layer1.execute('INSERT INTO products ' +
      'VALUES ($1, $2, $3)', [
      {
        value: 5,
        type: 'integer'
      },
      {
        value: 'Iron',
        type: 'string',
        maxLength: 10
      },
      {
        value: 0.99,
        type: 'number',
        maxLength: 12,
        decimals: 2
      }
    ]).then(function(res) {
      expect(res).to.be.a('array');
      expect(res.length).to.equal(0);
      done();
    }).catch(function(error) {
      done(error);
    })
  });
  after(function(done) {
    layer0.close()
      .then(function() {
        return layer1.close();
      })
      .then(function() {
        return layer2.close();
      })
      .then(function() {
        done();
      });
  });
});

after(function() {
  createDbLayer[databaseName[0]].close();
  createDbLayer[databaseName[1]].close();
  createDbLayer[databaseName[2]].close();
});

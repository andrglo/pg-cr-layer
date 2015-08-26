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
  return createDbLayer[dbName].execute('DROP DATABASE IF EXISTS "' + dbName + '"')
    .then(function() {
      return createDbLayer[dbName].execute('CREATE DATABASE "' + dbName + '"');
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
  before(function() {
    config.database = databaseName[0];
    layer0 = new PgCrLayer(config);
    config.database = databaseName[1];
    layer1 = new PgCrLayer(config);
    config.database = databaseName[2];
    layer2 = new PgCrLayer(config);
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
  it('should create more one records using object parameters in layer 1', function(done) {
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

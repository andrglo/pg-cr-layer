'use strict';

var assert = require('assert');
var PgCrLayer = require('../src');
var pg = require('pg');
var databaseName = 'tests-pg-cr-layer';

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

var createDbLayer;

function createPostgresDb() {
  config.database = 'postgres';
  createDbLayer = new PgCrLayer(config); // do not close after creation
  var dbName = process.env.POSTGRES_DATABASE || databaseName;
  return createDbLayer.execute('DROP DATABASE IF EXISTS "' + dbName + '"')
    .then(function() {
      return createDbLayer.execute('CREATE DATABASE "' + dbName + '"');
    });
}

before(function(done) {
  return createPostgresDb()
    .then(function() {
      done();
    })
    .catch(function(error) {
      done(error);
    });
});

describe('postgres', function() {
  var layer;
  before(function() {
    config.database = process.env.POSTGRES_DATABASE || databaseName;
    layer = new PgCrLayer(config);
  });

  it('should crate a table', function(done) {
    layer.execute('CREATE TABLE films (' +
      'code char(5) CONSTRAINT firstkey PRIMARY KEY, ' +
      'title       varchar(40) NOT NULL, ' +
      'did integer NOT NULL, ' +
      'date_prod   date, ' +
      'kind varchar(10), ' +
      'len interval hour to minute )')
      .then(function() {
        log(arguments);
        done();
      })
      .catch(done);
  });

  after(function(done) {
    layer.close().then(done);
  });
});

after(function(done) {
  createDbLayer.close().then(done);
});

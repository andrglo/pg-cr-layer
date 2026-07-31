const PgCrLayer = require('../src')

const databaseName = [
  'tests-pg-cr-layer-1',
  'tests-pg-cr-layer-2',
  'tests-pg-cr-layer-3'
]

const config = {
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
}

const createDbLayer = {}

function createPostgresDb(dbName) {
  config.database = 'postgres'
  createDbLayer[dbName] = new PgCrLayer(config) // do not close after creation
  return createDbLayer[dbName].connect().then(function() {
    return createDbLayer[dbName]
      .execute('DROP DATABASE IF EXISTS "' + dbName + '"')
      .then(function() {
        return createDbLayer[dbName].execute('CREATE DATABASE "' + dbName + '"')
      })
  })
}

let expect

before(function() {
  return import('chai').then(chai => {
    chai.should()
    expect = chai.expect
    return createPostgresDb(databaseName[0])
      .then(function() {
        return createPostgresDb(databaseName[1])
      })
      .then(function() {
        return createPostgresDb(databaseName[2])
      })
  })
})

describe('postgres cr layer', function() {
  let layer0
  let layer1
  let layer2
  before(function() {
    config.database = databaseName[0]
    layer0 = new PgCrLayer(config)
    config.database = databaseName[1]
    layer1 = new PgCrLayer(config)
    config.database = databaseName[2]
    layer2 = new PgCrLayer(config)
    return layer0
      .connect()
      .then(function() {
        return layer1.connect()
      })
      .then(function() {
        return layer2.connect()
      })
  })

  it('should identify vanilla postgres as not being redshift', function(done) {
    layer0.isRedshift().then(function(res) {
      expect(res).to.equal(false)
      done()
    })
  })
  it('should create a table in layer 0', function(done) {
    layer0
      .execute(
        'CREATE TABLE films (' +
          'code char(5) CONSTRAINT firstkey PRIMARY KEY, ' +
          'title       varchar(40) NOT NULL, ' +
          'did integer NOT NULL, ' +
          'date_prod   date, ' +
          'kind varchar(10), ' +
          'len interval hour to minute )'
      )
      .then(function(res) {
        expect(res).to.be.a('array')
        expect(res.length).to.equal(0)
        done()
      })
      .catch(done)
  })
  it('film now exists in layer 0', function(done) {
    layer0
      .query('SELECT * FROM films')
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(0)
        done()
      })
      .catch(done)
  })
  it('film not exists in layer 1', function(done) {
    layer1
      .query('SELECT * FROM films')
      .then(function() {
        done(new Error('Table created in the wrong db'))
      })
      .catch(function(error) {
        expect(error.message.indexOf('does not exist') !== -1).to.equal(true)
        done()
      })
      .catch(done)
  })
  it('film not exists in layer 2', function(done) {
    layer1
      .query('SELECT * FROM films')
      .then(function() {
        done(new Error('Table created in the wrong db'))
      })
      .catch(function(error) {
        expect(error.message.indexOf('does not exist') !== -1).to.equal(true)
        done()
      })
      .catch(done)
  })
  it('should create a table in layer 1', function(done) {
    layer1
      .execute(
        'CREATE TABLE products ( ' +
          'product_no integer, ' +
          'name varchar(10), ' +
          'price numeric )'
      )
      .then(function(res) {
        expect(res).to.be.a('array')
        expect(res.length).to.equal(0)
        done()
      })
      .catch(done)
  })
  it('should not create any record if a transaction fails in layer 1', function(done) {
    layer1
      .transaction(function(t) {
        return layer1
          .execute(
            'INSERT INTO products ' + 'VALUES (1, \'Cheese\', 9.99)',
            null,
            {transaction: t}
          )
          .then(function() {
            return layer1.execute(
              'INSERT INTO products ' + 'VALUES (2, \'Chicken\', 19.99)',
              null,
              {transaction: t}
            )
          })
          .then(function() {
            throw new Error('Crash')
          })
      })
      .then(function() {
        done(new Error('Where is the crash'))
      })
      .catch(function(error) {
        expect(error.message.indexOf('Crash') !== -1).to.equal(true)
        done()
      })
      .catch(done)
  })
  it('products should be empty in layer 1', function(done) {
    layer1
      .query('SELECT * FROM products')
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(0)
        done()
      })
      .catch(done)
  })
  it('should not create any record if we rollback a transaction in layer 1, using step by step control', function(done) {
    layer1
      .beginTransaction()
      .then(function(t) {
        return layer1
          .execute(
            'INSERT INTO products ' + 'VALUES (1, \'Cheese\', 9.99)',
            null,
            {transaction: t}
          )
          .then(function() {
            return layer1.execute(
              'INSERT INTO products ' + 'VALUES (2, \'Chicken\', 19.99)',
              null,
              {transaction: t}
            )
          })
          .then(function() {
            return layer1.rollback(t)
          })
          .then(function() {
            done()
          })
      })
      .catch(done)
  })
  it('products should be empty in layer 1', function(done) {
    layer1
      .query('SELECT * FROM products')
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(0)
        done()
      })
      .catch(done)
  })
  it('you can pass a empty params array', function(done) {
    layer1
      .query('SELECT * FROM products', [])
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(0)
        done()
      })
      .catch(done)
  })
  it('you can pass a empty params object', function(done) {
    layer1
      .query('SELECT * FROM products', {})
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(0)
        done()
      })
      .catch(done)
  })
  it('you can pass a params object with extra data', function(done) {
    layer1
      .query('SELECT * FROM products', {notuseful: false})
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(0)
        done()
      })
      .catch(done)
  })
  it('should create the two records when the transaction is ok in layer 1', function(done) {
    layer1
      .transaction(function(t) {
        return layer1
          .execute(
            'INSERT INTO products ' + 'VALUES (1, \'Cheese\', 9.99)',
            null,
            {transaction: t}
          )
          .then(function() {
            return layer1.execute(
              'INSERT INTO products ' + 'VALUES (2, \'Chicken\', 19.99)',
              null,
              {transaction: t}
            )
          })
      })
      .then(function(res) {
        expect(res).to.be.a('array')
        expect(res.length).to.equal(0)
        done()
      })
      .catch(done)
  })
  it('products should have two records in layer 1', function(done) {
    layer1
      .query('SELECT * FROM products')
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(2)
        done()
      })
      .catch(done)
  })
  it('should create more one record when no transaction and a fail occurs in layer 1', function(done) {
    layer1
      .execute('INSERT INTO products ' + 'VALUES (3, \'Wine\', 99.99)')
      .then(function() {
        throw new Error('Crash')
      })
      .then(function() {
        done(new Error('Where is the crash'))
      })
      .catch(function(error) {
        expect(error.message.indexOf('Crash') !== -1).to.equal(true)
        done()
      })
      .catch(done)
  })
  it('products should have three records in layer 1', function(done) {
    layer1
      .query('SELECT * FROM products')
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(3)
        done()
      })
      .catch(done)
  })
  it('products should return only one column', function(done) {
    layer1
      .query('SELECT name,name FROM products')
      .then(function(recordset) {
        recordset.forEach(record => {
          expect(Object.keys(record).length).to.equal(1)
          expect(record.name).to.be.a('string')
        })
        done()
      })
      .catch(done)
  })
  it('should not create any record if a transaction fails due the server in layer 1', function(done) {
    layer1
      .transaction(function(t) {
        return layer1
          .execute(
            'INSERT INTO products ' + 'VALUES (4, \'Corn\', 39.99)',
            null,
            {transaction: t}
          )
          .then(function() {
            return layer1.execute(
              'INSERT INTO products ' +
                'VALUES (5, \'Very long product name\', 19.99)',
              null,
              {transaction: t}
            )
          })
      })
      .then(function() {
        done(new Error('The server accepted?'))
      })
      .catch(function(error) {
        expect(error.message.indexOf('value too long') !== -1).to.equal(true)
        done()
      })
      .catch(done)
  })
  it('products should still have three records in layer 1', function(done) {
    layer1
      .query('SELECT * FROM products')
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(3)
        done()
      })
      .catch(done)
  })
  it('should wrap a identifier with double quotes', function() {
    expect(layer0.wrap('abc')).to.equal('"abc"')
  })
  it('should escape a double quote inside a identifier', function() {
    expect(layer0.wrap('we"ird')).to.equal('"we""ird"')
  })
  it('should not let a identifier break out of the delimiters', function() {
    expect(
      layer0.wrap('x" FROM films; DROP TABLE films --')
    ).to.equal('"x"" FROM films; DROP TABLE films --"')
  })
  it('should reject a identifier that is not a string', function() {
    expect(function() {
      return layer0.wrap(1)
    }).to.throw('Invalid identifier')
    expect(function() {
      return layer0.wrap(null)
    }).to.throw('Invalid identifier')
    expect(function() {
      return layer0.wrap(void 0)
    }).to.throw('Invalid identifier')
    expect(function() {
      return layer0.wrap({
        toString: function() {
          return 'abc'
        }
      })
    }).to.throw('Invalid identifier')
  })
  it('should reject a identifier containing a NUL character', function() {
    expect(function() {
      return layer0.wrap('a\0b')
    }).to.throw('Invalid identifier')
  })
  it('should select a column whose name contains a double quote', function() {
    const column = 'we"ird'
    return layer0
      .execute(
        'CREATE TABLE odd_identifiers (' +
          layer0.wrap(column) +
          ' varchar(10))'
      )
      .then(function() {
        return layer0.execute(
          'INSERT INTO odd_identifiers VALUES ($1)',
          ['ok']
        )
      })
      .then(function() {
        return layer0.query(
          'SELECT ' + layer0.wrap(column) + ' FROM odd_identifiers'
        )
      })
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(1)
        expect(recordset[0][column]).to.equal('ok')
      })
  })
  it('should not run sql injected through a wrapped identifier', function() {
    return layer0
      .query(
        'SELECT ' +
          layer0.wrap(
            'x" FROM odd_identifiers; DROP TABLE odd_identifiers --'
          ) +
          ' FROM odd_identifiers'
      )
      .then(function() {
        throw new Error('The server accepted?')
      })
      .catch(function(error) {
        expect(error.message.indexOf('does not exist') !== -1).to.equal(
          true
        )
      })
      .then(function() {
        return layer0.query('SELECT * FROM odd_identifiers')
      })
      .then(function(recordset) {
        expect(recordset.length).to.equal(1)
      })
  })
  it('should refuse to wrap when delimiters are not two characters', function() {
    const attack = 'x" FROM films; DROP TABLE films --'
    const oneChar = Object.create(PgCrLayer.prototype)
    oneChar.delimiters = '"'
    let rendered = null
    let thrown = null
    try {
      rendered = oneChar.wrap(attack)
    } catch (error) {
      thrown = error
    }
    expect(rendered).to.equal(null) // the break out was never rendered
    expect(thrown).to.be.a('error')
    expect(thrown.message.indexOf('Invalid delimiters') !== -1).to.equal(true)
    const notAString = Object.create(PgCrLayer.prototype)
    notAString.delimiters = [
      '"',
      {
        [Symbol.split]: function(identifier) {
          return [identifier]
        },
        toString: function() {
          return '"'
        }
      }
    ]
    rendered = null
    thrown = null
    try {
      rendered = notAString.wrap(attack)
    } catch (error) {
      thrown = error
    }
    expect(rendered).to.equal(null) // the break out was never rendered
    expect(thrown).to.be.a('error')
    expect(thrown.message.indexOf('Invalid delimiters') !== -1).to.equal(true)
  })
  it('should escape with any two character delimiters', function() {
    expect(layer0.wrap('we"ird')).to.equal('"we""ird"')
    const backticks = Object.create(PgCrLayer.prototype)
    backticks.delimiters = '``'
    expect(backticks.wrap('we`ird')).to.equal('`we``ird`')
    expect(backticks.wrap('abc')).to.equal('`abc`')
  })
  it('should have postgres as dialect', function() {
    expect(layer0.dialect).to.equal('postgres')
  })
  it('should create more one record using array parameters in layer 1', function(done) {
    layer1
      .execute('INSERT INTO products ' + 'VALUES ($1, $2, $3)', [
        4,
        'Corn',
        59.99
      ])
      .then(function(res) {
        expect(res).to.be.a('array')
        expect(res.length).to.equal(0)
        done()
      })
      .catch(done)
  })
  it('products should have four records in layer 1', function(done) {
    layer1
      .query('SELECT * FROM products')
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(4)
        done()
      })
      .catch(done)
  })
  it('should create more one record using object parameters in layer 1', function() {
    return layer1
      .execute(
        'INSERT INTO products ' + 'VALUES (@product_no, @name, @price)',
        {
          name: 'Duck',
          product_no: 5,
          price: 0.99
        }
      )
      .then(function(res) {
        expect(res).to.be.a('array')
        expect(res.length).to.equal(0)
      })
  })
  it('products should have five records in layer 1', function(done) {
    layer1
      .query('SELECT * FROM products')
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(5)
        var record = recordset[0]
        expect(record.product_no).to.be.a('number')
        expect(record.price).to.be.a('number')
        done()
      })
      .catch(done)
  })
  it('should reject due less parameters needed in layer 1', function(done) {
    layer1
      .execute('INSERT INTO products ' + 'VALUES ($1, $2, $3)', ['Duck', 5])
      .then(function() {
        done(new Error('No error?'))
      })
      .catch(function(error) {
        expect(
          error.message.indexOf('supplies 2 parameters, but') !== -1
        ).to.equal(true)
        done()
      })
      .catch(done)
  })
  it('should reject due parameters typo in layer 1', function(done) {
    layer1
      .execute(
        'INSERT INTO products ' + 'VALUES (@product_no, @name, @price)',
        {
          name: 'Duck',
          product_n: 5,
          price: 0.99
        }
      )
      .then(function() {
        done(new Error('No error?'))
      })
      .catch(function(error) {
        expect(error.message.indexOf('not found') !== -1).to.equal(true)
        done()
      })
      .catch(done)
  })
  it('should accept falsy object parameters in layer 1', function() {
    return layer1
      .query(
        'SELECT @zero::int AS zero, @empty::text AS empty, ' +
          '@untrue::boolean AS untrue, @nothing::text AS nothing',
        {zero: 0, empty: '', untrue: false, nothing: null}
      )
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(1)
        var record = recordset[0]
        expect(record.zero).to.equal(0)
        expect(record.empty).to.equal('')
        expect(record.untrue).to.equal(false)
        expect(record.nothing).to.equal(null)
      })
  })
  it('should reject a object parameter not informed in layer 1', function() {
    return layer1
      .query('SELECT @informed::int AS informed, @missing::int AS missing', {
        informed: 0
      })
      .then(function() {
        throw new Error('No error?')
      })
      .catch(function(error) {
        expect(
          error.message.indexOf('@missing not found') !== -1
        ).to.equal(true)
      })
  })
  it('should attach sql and params to a rejected query error in layer 1', function() {
    return layer1
      .query('SELECT * FROM products WHERE no_such_column = $1', [42])
      .then(function() {
        throw new Error('No error?')
      })
      .catch(function(error) {
        expect(error.message.indexOf('No error?')).to.equal(-1)
        expect(error.sql).to.be.a('string')
        expect(error.sql.indexOf('no_such_column') !== -1).to.equal(true)
        expect(error.params).to.deep.equal([42])
      })
  })
  it('should attach sql and params to a rejected query error inside a transaction in layer 1', function() {
    return layer1
      .transaction(function(t) {
        return layer1.query(
          'SELECT * FROM products WHERE no_such_column = $1',
          [42],
          {transaction: t}
        )
      })
      .then(function() {
        throw new Error('No error?')
      })
      .catch(function(error) {
        expect(error.message.indexOf('No error?')).to.equal(-1)
        expect(error.sql).to.be.a('string')
        expect(error.sql.indexOf('no_such_column') !== -1).to.equal(true)
        expect(error.params).to.deep.equal([42])
      })
  })
  it('should not add sql/params to a successful query in layer 1', function() {
    return layer1.query('SELECT * FROM products').then(function(recordset) {
      expect(recordset).to.be.a('array')
      expect(recordset.sql).to.equal(undefined)
      expect(recordset.params).to.equal(undefined)
    })
  })
  it('should not reject due extra parameters in statement in layer 1', function(done) {
    layer1
      .execute('INSERT INTO products ' + 'VALUES (8, \'Avocado\', 0.99)', {
        name: 'Duck',
        product_n: 5,
        price: 0.99
      })
      .then(function() {
        done()
      })
      .catch(done)
  })
  it('should create a table in layer 2', function(done) {
    layer2
      .execute(
        'CREATE TABLE products ( ' +
          'product_no integer, ' +
          'name varchar(10), ' +
          'price numeric(12, 2),' +
          'lastSale date,' +
          'createdAt timestamp with time zone,' +
          'updatedAt timestamp)'
      )
      .then(function(res) {
        expect(res).to.be.a('array')
        expect(res.length).to.equal(0)
        done()
      })
      .catch(done)
  })
  var now = new Date()
  it('should insert date and time', function(done) {
    layer2
      .execute('INSERT INTO products ' + 'VALUES ($1, $2, $3, $4, $5, $6)', [
        1,
        'Cheese',
        59.99,
        now.toISOString().substr(0, 10),
        now,
        now
      ])
      .then(function() {
        return layer2.execute(
          'INSERT INTO products ' + 'VALUES ($1, $2, $3, $4, $5, $6)',
          [
            2,
            'Pasta',
            49.99,
            '2014-12-31',
            '2014-12-31T00:00:00Z',
            new Date('2014-12-31T00:00:00-03:00')
          ]
        )
      })
      .then(function() {
        return layer2.execute(
          'INSERT INTO products ' + 'VALUES ($1, $2, $3, $4, $5, $6)',
          [
            2,
            'Pizza',
            49.99,
            '2015-01-01',
            '2015-01-01T00:00:00-01:00',
            new Date('2014-12-31T23:00:00-03:00')
          ]
        )
      })
      .then(function() {
        return layer2.execute(
          'INSERT INTO products ' + 'VALUES ($1, $2, $3, $4, $5, $6)',
          [
            2,
            'Lasagna',
            49.99,
            '2015-01-02',
            '2015-01-01T00:00:00+01:00',
            new Date('2015-01-01T01:00:00-03:00')
          ]
        )
      })
      .then(function() {
        return layer2.execute(
          'INSERT INTO products ' + 'VALUES ($1, $2, $3, $4, $5, $6)',
          [
            2,
            'Salada',
            49.99,
            '2015-01-03',
            '2015-01-01T00:00:00+02:00',
            new Date('2015-01-01T02:00:00-03:00')
          ]
        )
      })
      .then(function() {
        return layer2.execute(
          'INSERT INTO products ' + 'VALUES ($1, $2, $3, $4, $5, $6)',
          [
            2,
            'Sushi',
            49.99,
            '2015-01-04',
            '2015-01-01T00:00:00-02:00',
            new Date('2014-12-31T22:00:00-03:00')
          ]
        )
      })
      .then(function(res) {
        expect(res).to.be.a('array')
        expect(res.length).to.equal(0)
        done()
      })
      .catch(done)
  })
  it('lets check the data', function(done) {
    layer2
      .query('SELECT * FROM products ORDER BY lastSale')
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(6)
        var record = recordset[0]
        expect(record.lastsale).to.be.a('string')
        expect(record.createdat).to.be.a('Date')
        expect(record.updatedat).to.be.a('Date')
        expect(record.lastsale).to.equal('2014-12-31')
        expect(record.createdat.toISOString()).to.equal(
          '2014-12-31T00:00:00.000Z'
        )
        expect(record.updatedat.toISOString()).to.equal(
          new Date('2014-12-31T00:00:00-03:00').toISOString()
        )
        record = recordset[1]
        expect(record.lastsale).to.equal('2015-01-01')
        expect(record.createdat.toISOString()).to.equal(
          '2015-01-01T01:00:00.000Z'
        )
        expect(record.updatedat.toISOString()).to.equal(
          new Date('2014-12-31T23:00:00-03:00').toISOString()
        )
        record = recordset[2]
        expect(record.lastsale).to.equal('2015-01-02')
        expect(record.createdat.toISOString()).to.equal(
          '2014-12-31T23:00:00.000Z'
        )
        expect(record.updatedat.toISOString()).to.equal(
          new Date('2015-01-01T01:00:00-03:00').toISOString()
        )
        record = recordset[3]
        expect(record.lastsale).to.equal('2015-01-03')
        expect(record.createdat.toISOString()).to.equal(
          '2014-12-31T22:00:00.000Z'
        )
        expect(record.updatedat.toISOString()).to.equal(
          new Date('2015-01-01T02:00:00-03:00').toISOString()
        )
        record = recordset[4]
        expect(record.lastsale).to.equal('2015-01-04')
        expect(record.createdat.toISOString()).to.equal(
          '2015-01-01T02:00:00.000Z'
        )
        expect(record.updatedat.toISOString()).to.equal(
          new Date('2014-12-31T22:00:00-03:00').toISOString()
        )
        record = recordset[5]
        expect(record.lastsale).to.equal(now.toISOString().substr(0, 10))
        expect(record.createdat.toISOString()).to.equal(now.toISOString())
        expect(record.updatedat.toISOString()).to.equal(now.toISOString())
        done()
      })
      .catch(done)
  })
  it('lets check the numeric value', function(done) {
    layer2
      .query('SELECT * FROM products ORDER BY lastSale')
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(6)
        var record = recordset[5]
        expect(Number(record.price)).to.equal(59.99)
        done()
      })
      .catch(done)
  })
  it('lets check the where in a date field', function(done) {
    layer2
      .query('SELECT * FROM products WHERE lastSale >= $1 ORDER BY lastSale', [
        '2015-01-01'
      ])
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(5)
        var record = recordset[0]
        expect(record.lastsale).to.equal('2015-01-01')
        done()
      })
      .catch(done)
  })
  it('lets check the where in a datetime field with time zone', function(done) {
    layer2
      .query(
        'SELECT * FROM products WHERE createdAt >= $1 ORDER BY createdAt',
        ['2014-12-31T23:00:00.000Z']
      )
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(4)
        var record = recordset[0]
        expect(record.createdat.toISOString()).to.equal(
          '2014-12-31T23:00:00.000Z'
        )
        done()
      })
      .catch(done)
  })
  it('lets check the where in a datetime field without time zone', function(done) {
    layer2
      .query(
        'SELECT * FROM products WHERE updatedAt >= $1 ORDER BY updatedAt',
        [new Date('2015-01-01T01:00:00.000Z')]
      )
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(5)
        var record = recordset[0]
        expect(record.updatedat.toISOString()).to.equal(
          '2015-01-01T01:00:00.000Z'
        )
        done()
      })
      .catch(done)
  })
  it('should use the exact type in object format in layer 1', function(done) {
    layer1
      .execute(
        'INSERT INTO products ' + 'VALUES (@product_no, @name, @price)',
        {
          name: {
            value: 'Iron',
            type: 'string',
            maxLength: 10
          },
          product_no: {
            value: 6,
            type: 'integer'
          },
          price: {
            value: 0.99,
            type: 'number',
            maxLength: 12,
            decimals: 2
          }
        }
      )
      .then(function(res) {
        expect(res).to.be.a('array')
        expect(res.length).to.equal(0)
        done()
      })
      .catch(function(error) {
        done(error)
      })
  })
  it('should use the exact type in array format in layer 1', function(done) {
    layer1
      .execute('INSERT INTO products ' + 'VALUES ($1, $2, $3)', [
        {
          value: 7,
          type: 'integer'
        },
        {
          value: 'Gate',
          type: 'string',
          maxLength: 10
        },
        {
          value: 0.99,
          type: 'number',
          maxLength: 12,
          decimals: 2
        }
      ])
      .then(function(res) {
        expect(res).to.be.a('array')
        expect(res.length).to.equal(0)
        done()
      })
      .catch(function(error) {
        done(error)
      })
  })
  it('should insert null if parameter is null or undefined in layer 1', function(done) {
    layer1
      .execute(
        'UPDATE products ' + 'SET price=$1,name=$2 WHERE product_no=$3',
        [null, void 0, 6]
      )
      .then(function(res) {
        expect(res).to.be.a('array')
        expect(res.length).to.equal(0)
        done()
      })
      .catch(function(error) {
        done(error)
      })
  })
  it('lets check the if the columns are null', function(done) {
    layer1
      .query('SELECT * FROM products WHERE product_no=$1', [6])
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(1)
        var record = recordset[0]
        expect(record.name).to.equal(null)
        expect(record.price).to.equal(null)
        done()
      })
      .catch(done)
  })
  it('should insert null if parameter is null or undefined also in object format in layer 1', function(done) {
    layer1
      .execute(
        'UPDATE products ' + 'SET price=$1,name=$2 WHERE product_no=$3',
        [{value: null}, {}, 5]
      )
      .then(function(res) {
        expect(res).to.be.a('array')
        expect(res.length).to.equal(0)
        done()
      })
      .catch(function(error) {
        done(error)
      })
  })
  it('lets check product 5 the if the columns are null', function(done) {
    layer1
      .query('SELECT * FROM products WHERE product_no=$1', [5])
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(1)
        var record = recordset[0]
        expect(record.name).to.equal(null)
        expect(record.price).to.equal(null)
        done()
      })
      .catch(done)
  })
  it('should insert 0/\'\' if parameter is 0/\'\' in layer 1', function(done) {
    layer1
      .execute(
        'UPDATE products ' + 'SET price=$1,name=$2 WHERE product_no=$3',
        [0, '', 6]
      )
      .then(function(res) {
        expect(res).to.be.a('array')
        expect(res.length).to.equal(0)
        done()
      })
      .catch(function(error) {
        done(error)
      })
  })
  it('lets check the if the columns are 0/\'\'', function(done) {
    layer1
      .query('SELECT * FROM products WHERE product_no=$1', [6])
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(1)
        var record = recordset[0]
        expect(record.name).to.equal('')
        expect(record.price).to.equal(0)
        done()
      })
      .catch(done)
  })
  it('should insert 0/\'\' if parameter is 0/\'\' also in object format in layer 1', function(done) {
    layer1
      .execute(
        'UPDATE products ' + 'SET price=$1,name=$2 WHERE product_no=$3',
        [{value: 0}, {value: ''}, 5]
      )
      .then(function(res) {
        expect(res).to.be.a('array')
        expect(res.length).to.equal(0)
        done()
      })
      .catch(function(error) {
        done(error)
      })
  })
  it('lets check product 5 the if the columns are 0/\'\'', function(done) {
    layer1
      .query('SELECT * FROM products WHERE product_no=$1', [5])
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(1)
        var record = recordset[0]
        expect(record.name).to.equal('')
        expect(record.price).to.equal(0)
        done()
      })
      .catch(done)
  })
  it('check again if film exists in layer 0', function(done) {
    layer0
      .query('SELECT * FROM films')
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(0)
        done()
      })
      .catch(done)
  })
  it('should create the two records using commit in transaction step by step in layer 1', function(done) {
    layer1
      .beginTransaction()
      .then(function(t) {
        return layer1
          .execute(
            'INSERT INTO products ' + 'VALUES (100, \'Cheese\', 9.99)',
            null,
            {transaction: t}
          )
          .then(function() {
            return layer1.execute(
              'INSERT INTO products ' + 'VALUES (200, \'Chicken\', 19.99)',
              null,
              {transaction: t}
            )
          })
          .then(function() {
            return layer1.commit(t)
          })
      })
      .then(function() {
        done()
      })
      .catch(done)
  })
  it('products should have two records in layer 1', function(done) {
    layer1
      .query('SELECT * FROM products WHERE product_no >= 100')
      .then(function(recordset) {
        expect(recordset).to.be.a('array')
        expect(recordset.length).to.equal(2)
        done()
      })
      .catch(done)
  })
  it('should run the usage example', function(done) {
    config.database = databaseName[0]
    var layer = new PgCrLayer(config)

    layer
      .connect()
      .then(function() {
        return layer.execute(
          'CREATE TABLE products ( ' +
            'product_no integer, ' +
            'name varchar(10), ' +
            'price numeric(12,2) )'
        )
      })
      .then(function() {
        return layer.transaction(function(t) {
          return layer
            .execute('INSERT INTO products VALUES (1, \'Cheese\', 9.99)', null, {
              transaction: t
            })
            .then(function() {
              return layer.execute(
                'INSERT INTO products VALUES (2, \'Chicken\', 19.99)',
                null,
                {transaction: t}
              )
            })
            .then(function() {
              return layer.execute(
                'INSERT INTO products VALUES ($1, $2, $3)',
                [3, 'Duck', 0.99],
                {transaction: t}
              )
            })
        })
      })
      .then(function() {
        return layer
          .query('SELECT * FROM products WHERE product_no=@product_no', {
            product_no: {value: 1, type: 'integer'}
          }) // or just {product_no: 1}
          .then(function(recordset) {
            expect(recordset).to.be.a('array')
            expect(recordset.length).to.equal(1)
            var record = recordset[0]
            expect(record.product_no).to.equal(1)
          })
      })
      .then(function() {
        return layer.close()
      })
      .then(function() {
        done()
      })
      .catch(function(error) {
        done(error)
      })
  })
  describe('parameter markers are only recognized in code', function() {
    before(function() {
      return layer1.execute(
        'CREATE TABLE literals ( ' +
          'id integer, ' +
          'name varchar(100) )'
      )
    })
    it('should not bind a marker inside a string literal when its name is a key in the params object', function() {
      return layer1
        .execute(
          'INSERT INTO literals (id, name) ' +
            'VALUES (@id, \'vendas@name.com.br\')',
          {id: 1, name: 'Cadeira'}
        )
        .then(function() {
          return layer1.query(
            'SELECT name FROM literals WHERE id = $1',
            [1]
          )
        })
        .then(function(recordset) {
          expect(recordset).to.be.a('array')
          expect(recordset.length).to.equal(1)
          expect(recordset[0].name).to.equal('vendas@name.com.br')
        })
    })
    it('should not bind a marker inside a string literal when its name is not a key in the params object', function() {
      return layer1
        .execute(
          'INSERT INTO literals (id, name) ' +
            'VALUES (@id, \'contato@ayk.com.br\')',
          {id: 2}
        )
        .then(function() {
          return layer1.query(
            'SELECT name FROM literals WHERE id = $1',
            [2]
          )
        })
        .then(function(recordset) {
          expect(recordset).to.be.a('array')
          expect(recordset.length).to.equal(1)
          expect(recordset[0].name).to.equal('contato@ayk.com.br')
        })
    })
    it('should keep a dollar amount inside a string literal and still number the real marker as $1', function() {
      return layer1
        .execute(
          'INSERT INTO literals (id, name) ' +
            'VALUES (@id, \'Total R$100 a vista\')',
          {id: 3}
        )
        .then(function() {
          return layer1.query(
            'SELECT name FROM literals WHERE id = $1',
            [3]
          )
        })
        .then(function(recordset) {
          expect(recordset).to.be.a('array')
          expect(recordset.length).to.equal(1)
          expect(recordset[0].name).to.equal('Total R$100 a vista')
          // the rewritten statement is attached to a rejected query, so it
          // can be read back to prove how the marker was numbered
          return layer1.query(
            'SELECT no_such_column, \'Total R$100 a vista\' AS a, ' +
              '@id::int AS b',
            {id: 3}
          )
        })
        .then(function() {
          throw new Error('No error?')
        })
        .catch(function(error) {
          expect(error.message.indexOf('No error?')).to.equal(-1)
          expect(error.sql).to.equal(
            'SELECT no_such_column, \'Total R$100 a vista\' AS a, ' +
              '$1::int AS b'
          )
        })
    })
    it('should rewrite each marker at its own position, not at the first matching text', function() {
      return layer1
        .query(
          'SELECT \'contato@nome.com\' AS a, @nome::text AS b',
          {nome: 'Cadeira'}
        )
        .then(function(recordset) {
          expect(recordset.length).to.equal(1)
          expect(recordset[0].a).to.equal('contato@nome.com')
          expect(recordset[0].b).to.equal('Cadeira')
        })
    })
    it('should bind the same marker used twice as two positional parameters', function() {
      return layer1
        .query('SELECT @v::text AS a, @v::text AS b', {v: 'dois'})
        .then(function(recordset) {
          expect(recordset.length).to.equal(1)
          expect(recordset[0].a).to.equal('dois')
          expect(recordset[0].b).to.equal('dois')
        })
    })
    it('should bind several markers in order of appearance', function() {
      return layer1
        .query(
          'SELECT @first::text AS a, @second::text AS b, ' +
            '@third::text AS c',
          {first: 'um', second: 'dois', third: 'tres'}
        )
        .then(function(recordset) {
          expect(recordset.length).to.equal(1)
          expect(recordset[0].a).to.equal('um')
          expect(recordset[0].b).to.equal('dois')
          expect(recordset[0].c).to.equal('tres')
        })
    })
    it('should pass array parameters straight through, literals untouched', function() {
      return layer1
        .query('SELECT $1::text AS a, \'x@name.com\' AS b', ['v'])
        .then(function(recordset) {
          expect(recordset.length).to.equal(1)
          expect(recordset[0].a).to.equal('v')
          expect(recordset[0].b).to.equal('x@name.com')
        })
    })
    it('should not end a string literal at a doubled quote nor bind the marker inside it', function() {
      return layer1
        .execute(
          'INSERT INTO literals (id, name) ' +
            'VALUES (@id, \'it\'\'s R@name\')',
          {id: 4, name: 'Cadeira'}
        )
        .then(function() {
          return layer1.query(
            'SELECT name FROM literals WHERE id = $1',
            [4]
          )
        })
        .then(function(recordset) {
          expect(recordset.length).to.equal(1)
          expect(recordset[0].name).to.equal('it\'s R@name')
        })
    })
    it('should bind a marker placed right after a string literal closes', function() {
      return layer1
        .query('SELECT \'R$9\' AS a, @id::int AS b', {id: 5})
        .then(function(recordset) {
          expect(recordset.length).to.equal(1)
          expect(recordset[0].a).to.equal('R$9')
          expect(recordset[0].b).to.equal(5)
        })
    })
    it('should not bind a marker inside a line comment', function() {
      return layer1
        .query('SELECT @id::int AS a -- not a param @id\n', {id: 6})
        .then(function(recordset) {
          expect(recordset.length).to.equal(1)
          expect(recordset[0].a).to.equal(6)
        })
    })
    it('should not bind a marker inside a nested block comment', function() {
      return layer1
        .query('SELECT @id::int AS a /* a /* b @id */ c @id */', {id: 7})
        .then(function(recordset) {
          expect(recordset.length).to.equal(1)
          expect(recordset[0].a).to.equal(7)
        })
    })
    it('should not bind a marker inside a double quoted identifier', function() {
      return layer1
        .query(
          'SELECT @id::int AS a, 1 AS "e@id mail", ' +
            '2 AS "qu""ote @id"',
          {id: 8}
        )
        .then(function(recordset) {
          expect(recordset.length).to.equal(1)
          var record = recordset[0]
          expect(record.a).to.equal(8)
          expect(record['e@id mail']).to.equal(1)
          expect(record['qu"ote @id']).to.equal(2)
        })
    })
    it('should not bind a marker inside a dollar quoted string', function() {
      return layer1
        .query(
          'SELECT @id::int AS a, $$mail @name here$$::text AS b',
          {id: 9, name: 'Cadeira'}
        )
        .then(function(recordset) {
          expect(recordset.length).to.equal(1)
          expect(recordset[0].a).to.equal(9)
          expect(recordset[0].b).to.equal('mail @name here')
        })
    })
    it('should not bind a marker inside a tagged dollar quoted string', function() {
      return layer1
        .query(
          'SELECT @id::int AS a, ' +
            '$body$mail @name here$body$::text AS b',
          {id: 10, name: 'Cadeira'}
        )
        .then(function(recordset) {
          expect(recordset.length).to.equal(1)
          expect(recordset[0].a).to.equal(10)
          expect(recordset[0].b).to.equal('mail @name here')
        })
    })
    it('should not take a positional $1 as a dollar quote opener', function() {
      // a dollar quote tag cannot start with a digit, so $1 must not open
      // one - if it did, everything up to the next $...$ would be swallowed
      // and the marker in between would never be seen
      const scanMarkers = require('../src/scan-markers')
      let markers = scanMarkers(
        'SELECT $1 AS a, @real::text AS b, $1 AS c'
      )
      expect(markers.length).to.equal(1)
      expect(markers[0].name).to.equal('real')
      markers = scanMarkers(
        'SELECT $1$ AS a, @real::text AS b, $1$ AS c'
      )
      expect(markers.length).to.equal(1)
      expect(markers[0].name).to.equal('real')
    })
    it('should not end an E string at a backslash escaped quote nor bind the marker inside it', function() {
      return layer1
        .execute(
          'INSERT INTO literals (id, name) ' +
            'VALUES (@id, E\'it\\\'s @name\')',
          {id: 11, name: 'Cadeira'}
        )
        .then(function() {
          return layer1.query(
            'SELECT name FROM literals WHERE id = $1',
            [11]
          )
        })
        .then(function(recordset) {
          expect(recordset.length).to.equal(1)
          expect(recordset[0].name).to.equal('it\'s @name')
        })
        .then(function() {
          // both escapes at once: only handling one of them closes the
          // literal early and puts the marker back in code
          return layer1.execute(
            'INSERT INTO literals (id, name) ' +
              'VALUES (@id, E\'a\'\'\\\'@name\')',
            {id: 12, name: 'Cadeira'}
          )
        })
        .then(function() {
          return layer1.query(
            'SELECT name FROM literals WHERE id = $1',
            [12]
          )
        })
        .then(function(recordset) {
          expect(recordset.length).to.equal(1)
          expect(recordset[0].name).to.equal('a\'\'@name')
        })
    })
    it('should not take a bare at sign operator as a marker', function() {
      // postgres has real operators spelled with a bare @ (@>, <@, @@, @-@);
      // the sigil must be followed by at least one word character to be a
      // marker, or a containment expression like `a @> b` gets read as a
      // zero-length marker named '', which then mis-numbers every real
      // marker that follows it
      const scanMarkers = require('../src/scan-markers')
      const markers = scanMarkers('SELECT a @> b, @id::int AS x')
      expect(markers.length).to.equal(1)
      expect(markers[0].name).to.equal('id')
      expect(markers[0].index).to.equal(15)
      return layer1
        .query(
          'SELECT ARRAY[1,2] @> ARRAY[1] AS contains, @id::int AS id',
          {id: 7}
        )
        .then(function(recordset) {
          expect(recordset.length).to.equal(1)
          expect(recordset[0].contains).to.equal(true)
          expect(recordset[0].id).to.equal(7)
        })
    })
  })

  after(function() {
    return layer0
      .close()
      .then(function() {
        return layer1.close()
      })
      .then(function() {
        return layer2.close()
      })
  })
})

after(function() {
  createDbLayer[databaseName[0]].close()
  createDbLayer[databaseName[1]].close()
  createDbLayer[databaseName[2]].close()
})

# pg-cr-layer [![NPM version][npm-image]][npm-url] [![Build Status][travis-image]][travis-url] [![Dependency Status][daviddm-image]][daviddm-url] [![Coverage percentage][coveralls-image]][coveralls-url]
> A postgres interface layer for common requests. It uses [pg](https://github.com/brianc/node-postgres) to connect
and wraps it in a tiny layer using ES2015 promises with the goal to be simpler and compatible with [mssql](https://github.com/patriksimek/node-mssql)
via [mssql-cr-layer](https://github.com/andrglo/mssql-cr-layer)



## Install

```sh
$ npm install --save pg-cr-layer
```


## Usage

```js
var pgCrLayer = require('pg-cr-layer');

var config = {
  user: 'me',
  password: 'my password',
  host: 'localhost',
  port: 5432,
  pool: {
    max: 25,
    idleTimeout: 30000
  }
};

var layer = new PgCrLayer(config)

layer.connect()
  .then(function() {
    return layer.execute('CREATE TABLE products ( ' +
      'product_no integer, ' +
      'name varchar(10), ' +
      'price numeric(12,2) )');
  })
  .then(function() {
    return layer.transaction(function(t) {
      return layer
	      .execute('INSERT INTO products VALUES (1, \'Cheese\', 9.99)', null, {transaction: t})
          .then(function() {
            return layer.execute('INSERT INTO products VALUES (2, \'Chicken\', 19.99)', null, {transaction: t})
          })
		  .then(function() {
        return layer
          .execute('INSERT INTO products VALUES ($1, $2, $3)', [3, 'Duck', 0.99], {transaction: t})
       });
     })
  })
  .then(function() {
    return layer.query('SELECT * FROM products WHERE product_no=@product_no',
      {product_no: {value: 1, type: 'integer'}}) // or just {product_no: 1}
    .then(function(recordset) {
      console.log(recordset[0]); // => { product_no: 1, name: 'Cheese', price: '9.99' }
    })
  })
  .then(function() {
    return layer.close();
  })
  .catch(function(error) {
	  console.log(error);
  });

```

## License

MIT © [Andre Gloria](andrglo.com)


[npm-image]: https://badge.fury.io/js/pg-cr-layer.svg
[npm-url]: https://npmjs.org/package/pg-cr-layer
[travis-image]: https://travis-ci.org/andrglo/pg-cr-layer.svg?branch=master
[travis-url]: https://travis-ci.org/andrglo/pg-cr-layer
[daviddm-image]: https://david-dm.org/andrglo/pg-cr-layer.svg?theme=shields.io
[daviddm-url]: https://david-dm.org/andrglo/pg-cr-layer
[coveralls-image]: https://coveralls.io/repos/andrglo/pg-cr-layer/badge.svg
[coveralls-url]: https://coveralls.io/r/andrglo/pg-cr-layer

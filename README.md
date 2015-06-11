cauliflower-filter
==================

[![Build Status](https://travis-ci.org/caitp/cauliflower-filter.svg?branch=master)](https://travis-ci.org/caitp/cauliflower-filter)
[![Coverage Status](https://img.shields.io/coveralls/caitp/cauliflower-filter.svg)](https://coveralls.io/r/caitp/cauliflower-filter?branch=master)
[![dependencies](https://img.shields.io/david/caitp/cauliflower-filter.svg?style=flat)](https://david-dm.org/caitp/cauliflower-filter)
[![NPM Version](http://img.shields.io/npm/v/cauliflower-filter.svg)](https://www.npmjs.org/package/cauliflower-filter)

[broccoli-filter](https://github.com/broccolijs/broccoli-filter) built on the
new rebuild() api, ensuring stable outputs across builds. Also offers test
coverage to ensure that this plugin behaves as expected.

Cauliflower-filter aims to be 100% API compatible and suitable as a drop-in
replacement of broccoli-filter.

Key Differences                   | cauliflower-filter | broccoli-filter
--------------------------------- | ------------------ | ---------------
Output path stable across builds  | ✓                  | ✘
Test coverage                     | ✓                  | ✘

## API

```js
class Filter {
  /**
   * Abstract base-class for filtering purposes.
   *
   * Enforces that it is invoked on an instance of a class which prototypically
   * inherits from Filter, and which is not itself Filter.
   */
  constructor(inputTree: BroccoliTree, options: FilterOptions): Filter;

  /**
   * Virtual method `canProcessFile`: determine whether hard processing is used
   * to move the source file into the output directory, or whether a simple
   * symlinking approach should be sufficient.
   *
   * By default, this method returns true if the `extensions` option is a
   * non-empty list, and the relativePath ends with one of the extensions.
   *
   * The results of this operation are cached automatically, and it will not be
   * invoked again for a given relative path.
   */
  virtual canProcessFile(relativePath: string): boolean;

  /**
   * Virtual method `getDestFilePath`: optionally rename the output file when
   * processing occurs.
   *
   * By default, if the options passed into the Filter constructor contains a
   * property `extensions`, and `targetExtension` is supplied, the first matching
   * extension in the list is replaced with the `targetExtension` option's value.
   *
   * The results of this operation are cached automatically, and it will not be
   * invoked again for a given relative path.
   */
  virtual getDestFilePath(relativePath: string): string;

  /**
   * Abstract method `processString`: must be implemented on subclasses of
   * Filter.
   *
   * The return value is written as the contents of the output file
   */
  abstract processString(contents: string, relativePath: string): string;
}
```

### Example use:

```js
'use strict';
var Filter = require('cauliflower-filter');

function Awk(inputTree, search, replace) {
  Filter.call(this, inputTree);
  this.search = search;
  this.replace = replace;
}

Awk.prototype = Object.create(Filter.prototype, {
  constructor: {
    enumerable: false,
    configurable: true,
    writable: false,
    value: Awk
  }
});

Awk.prototype.canProcessFile = function(relativePath) {
  return true;
};

Awk.prototype.getDestFilePath = function(relativePath) {
  return relativePath;
};

Awk.prototype.processString = function(content, relativePath) {
  return content.replace(this.search, this.replace);
};

var funnel = new Funnel('', {
  files: [
    'foo.txt',
    'bar.txt',
    'baz.txt'
  ]
});
var tree = new Awk(funnel, 'ES6', 'ECMAScript 2015');

var builder = new require('broccoli').Builder(tree);
builder.build();

```

## License

The MIT License (MIT)

Copyright (c) 2015 Caitlin Potter & Contributors.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


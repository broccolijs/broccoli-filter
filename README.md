cauliflower-filter
==================

[broccoli-filter](https://github.com/broccolijs/broccoli-filter) built on the
new rebuild() api, ensuring stable outputs across builds. Also offers test
coverage to ensure that this plugin behaves as expected.

##API

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

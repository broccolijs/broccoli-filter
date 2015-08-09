# broccoli-filter

Helper base class for Broccoli plugins that map input files into output files
one-to-one.

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

## FAQ

### Upgrading from 0.1.x to 0.2.x

You must now call the base class constructor. For example:

```js
// broccoli-filter 0.1.x:
function MyPlugin(inputTree) {
  this.inputTree = inputTree;
}

// broccoli-filter 0.2.x:
function MyPlugin(inputNode) {
  Filter.call(this, inputNode);
}
```

Note that "node" is simply new terminology for "tree".

### Source Maps

**Can this help with compilers that are almost 1:1, like a minifier that takes
a `.js` and `.js.map` file and outputs a `.js` and `.js.map` file?**

Not at the moment. I don't know yet how to implement this and still have the
API look beautiful. We also have to make sure that caching works correctly, as
we have to invalidate if either the `.js` or the `.js.map` file changes. My
plan is to write a source-map-aware uglifier plugin to understand this use
case better, and then extract common code back into this `Filter` base class.

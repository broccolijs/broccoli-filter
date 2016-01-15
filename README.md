# broccoli-multi-filter

Helper base class for Broccoli plugins that map input files into output files
one-to-many. This class is a drop-in replacement for [`broccoli-filter`](https://github.com/broccolijs/broccoli-filter).

## API

```js
class MultiFilter {
  /**
   * Abstract base-class for filtering purposes.
   *
   * Enforces that it is invoked on an instance of a class which prototypically
   * inherits from Filter, and which is not itself Filter.
   */
  constructor(inputNode: BroccoliNode, options: FilterOptions): MultiFilter;

  /**
   * Abstract method `processString`: must be implemented on subclasses of
   * Filter.
   * 
   * The `addOutputFile` callback accepts two arguments `(contents: string, outputRelativeFilename: string)`
   * this file must be called to generate any side-effect files and make sure they are handled properly with
   * the caching layer.
   *
   * The return value is written as the contents of the output file
   */
  abstract processString(contents: string, relativePath: string, addOutputFile: Function): string;

  /**
   * Virtual method `getDestFilePath`: determine whether the source file should
   * be processed, and optionally rename the output file when processing occurs.
   *
   * Return `null` to pass the file through without processing. Return
   * `relativePath` to process the file with `processString`. Return a
   * different path to process the file with `processString` and rename it.
   *
   * By default, if the options passed into the `Filter` constructor contain a
   * property `extensions`, and `targetExtension` is supplied, the first matching
   * extension in the list is replaced with the `targetExtension` option's value.
   */
  virtual getDestFilePath(relativePath: string): string;
}
```

### Options

* `extensions`: An array of file extensions to process, e.g. `['md', 'markdown']`.
* `targetExtension`: The file extension of the corresponding output files, e.g.
  `'html'`.
* `inputEncoding`: The character encoding used for reading input files to be
  processed (default: `'utf8'`). For binary files, pass `null` to receive a
  `Buffer` object in `processString`.
* `outputEncoding`: The character encoding used for writing output files after
  processing (default: `'utf8'`). For binary files, pass `null` and return a
  `Buffer` object from `processString`.
* `name`, `annotation`: Same as
  [broccoli-plugin](https://github.com/broccolijs/broccoli-plugin#new-plugininputnodes-options);
  see there.

All options except `name` and `annotation` can also be set on the prototype
instead of being passed into the constructor.

### Example Usage

```js
var MultiFilter = require('broccoli-multi-filter');

Awk.prototype = Object.create(MultiFilter.prototype);
Awk.prototype.constructor = Awk;
function Awk(inputNode, search, replace, options) {
  options = options || {};
  MultiFilter.call(this, inputNode, {
    annotation: options.annotation
  });
  this.keepOriginal = options.keepOriginal;
  this.search = search;
  this.replace = replace;
}

Awk.prototype.extensions = ['txt'];
Awk.prototype.targetExtension = 'txt';

Awk.prototype.processString = function(content, relativePath, addOutputFile) {
  // Record the original content, but this could be a sourcemap file or any other side-effect.
  // This can also be called multiple times -- once for each non-primary file.
  if (this.keepOriginal) {
    addOutputFile(content, relativePath + ".original");
  }
  return content.replace(this.search, this.replace);
};
```

In `Brocfile.js`, use your new `Awk` plugin like so:

```
var node = new Awk('docs', 'ES6', 'ECMAScript 2015');

module.exports = node;
```

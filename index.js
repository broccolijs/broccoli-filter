'use strict';

var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var Promise = require('rsvp').Promise;
var Plugin = require('broccoli-plugin');
var helpers = require('broccoli-kitchen-sink-helpers');
var walkSync = require('walk-sync');
var mapSeries = require('promise-map-series');
var copyDereferenceSync = require('copy-dereference').sync;
var Cache = require('./lib/cache');
var debugGenerator = require('debug');
var keyForFile = require('./lib/key-for-file');

var FSTree = require('fs-tree-diff');

module.exports = Filter;

Filter.prototype = Object.create(Plugin.prototype);
Filter.prototype.constructor = Filter;

function Filter(inputTree, options) {
  if (!this || !(this instanceof Filter) ||
      Object.getPrototypeOf(this) === Filter.prototype) {
    throw new TypeError('Filter is an abstract class and must be sub-classed');
  }

  var name = 'broccoli-filter:' + (this.constructor.name);
  if (this.description) {
    name += ' > [' + this.description + ']';
  }

  this._debug = debugGenerator(name);

  Plugin.call(this, [inputTree], {
    fsFacade: true
  });

  /* Destructuring assignment in node 0.12.2 would be really handy for this! */
  if (options) {
    if (options.extensions != null)
      this.extensions = options.extensions;
    if (options.targetExtension != null)
      this.targetExtension = options.targetExtension;
    if (options.inputEncoding != null)
      this.inputEncoding = options.inputEncoding;
    if (options.outputEncoding != null)
      this.outputEncoding = options.outputEncoding;
  }

  this._cache = new Cache();


  //newly added
  //this._in = this._out = undefined;
}

// //newly added
// Object.defineProperty(Filter.prototype, 'in', {
//   get() {
//     if (this._in) {
//       return this._in;
//     }
//     this._in = (new FSTree({
//       root: this.inputPaths[0],
//     }));
//     return this._in;
//   }
// });
//
// // should be moved to broccoli-plugin
// Object.defineProperty(Filter.prototype, 'out', {
//   get() {
//     if (this._out) {
//       return this._out;
//     }
//     this._out = (new FSTree({
//       root: this.outputPath
//     }));
//     return this._out;
//   }
// });


Filter.prototype.build = function build() {
  var self = this;
  var srcDir = this.inputPaths[0];
  var destDir = this.outputPath;
  var paths = walkSync(srcDir);

  // this._in = undefined;
  // this._out = undefined;

  // this.out.start();
  // this.in.start();

  this._cache.deleteExcept(paths).forEach(function (key) {
   fs.unlinkSync(this.cachePath + '/' + key);
  }, this);

  var self = this;

  return mapSeries(paths, function rebuildEntry(relativePath) {
    if (relativePath.slice(-1) === '/') {
      self.out.mkdirpSync(relativePath);
    } else {
      if (self.canProcessFile(relativePath)) {
        return self.processAndCacheFile(srcDir, destDir, relativePath);
      } else {
        var srcPath = srcDir + '/' + relativePath;
        self.out.symlinkSync(srcPath, relativePath);
      }
    }
  })
  // }).then(function() {
  //   self.in.stop();
  //   self.out.stop();
  // });
};

Filter.prototype.canProcessFile =
    function canProcessFile(relativePath) {
  return !!this.getDestFilePath(relativePath);
};

Filter.prototype.getDestFilePath = function getDestFilePath(relativePath) {
  if (this.extensions == null) return relativePath;

  for (var i = 0, ii = this.extensions.length; i < ii; ++i) {
    var ext = this.extensions[i];
    if (relativePath.slice(-ext.length - 1) === '.' + ext) {
      if (this.targetExtension != null) {
        relativePath =
            relativePath.slice(0, -ext.length) + this.targetExtension;
      }
      return relativePath;
    }
  }
  return null;
}

Filter.prototype.processAndCacheFile =
    function processAndCacheFile(srcDir, destDir, relativePath) {
  var self = this;
  var cacheEntry = this._cache.get(relativePath);
  var outputRelativeFile = self.getDestFilePath(relativePath);

  if (cacheEntry) {
    var hashResult = hash(srcDir, cacheEntry.inputFile);

    if (cacheEntry.hash.hash === hashResult.hash) {
      this._debug('cache hit: %s', relativePath);

      return symlinkOrCopyFromCache(cacheEntry, destDir, outputRelativeFile, this.out);
    } else {
      this._debug('cache miss: %s \n  - previous: %o \n  - next:     %o ', relativePath, cacheEntry.hash.key, hashResult.key);
    }

  } else {
    this._debug('cache prime: %s', relativePath);
  }

  return Promise.resolve().
      then(function asyncProcessFile() {
        return self.processFile(srcDir, destDir, relativePath);
      }).
      then(copyToCache,
      // TODO(@caitp): error wrapper is for API compat, but is not particularly
      // useful.
      // istanbul ignore next
      function asyncProcessFileErrorWrapper(e) {
        if (typeof e !== 'object' || e === null) e = new Error('' + e);
        e.file = relativePath;
        e.treeDir = srcDir;
        throw e;
      })

  function copyToCache() {
    var entry = {
      hash: hash(srcDir, relativePath),
      inputFile: relativePath,
      cacheFile: self.cachePath + '/' + outputRelativeFile
    };


    if (fs.existsSync(entry.cacheFile)) {
      fs.unlinkSync(entry.cacheFile);
    } else {
      mkdirp.sync(path.dirname(entry.cacheFile));
    }

    copyDereferenceSync(destDir + '/' + outputRelativeFile, entry.cacheFile);
    return self._cache.set(relativePath, entry);
  }
};

Filter.prototype.processFile =
    function processFile(srcDir, destDir, relativePath) {
  var self = this;
  var inputEncoding = this.inputEncoding;
  var outputEncoding = this.outputEncoding;
  if (inputEncoding === void 0) inputEncoding = 'utf8';
  if (outputEncoding === void 0) outputEncoding = 'utf8';


  var contents = this.in[0].readFileSync(relativePath, {encoding : inputEncoding});

  return Promise.resolve(this.processString(contents, relativePath)).then(function asyncOutputFilteredFile(outputString) {
        var outputPath = self.getDestFilePath(relativePath);
        if (outputPath == null) {
          throw new Error('canProcessFile("' + relativePath + '") is true, but getDestFilePath("' + relativePath + '") is null');
        }

        self.out.mkdirpSync(path.dirname(outputPath));
        self.out.writeFileSync(outputPath,outputString, {
          encoding: outputEncoding
        });
      });
};

Filter.prototype.processString =
    function unimplementedProcessString(contents, relativePath) {
  throw new Error(
      'When subclassing broccoli-filter you must implement the ' +
      '`processString()` method.');
};

function hash(src, filePath) {
  var path = src + '/' + filePath;
  var key = keyForFile(path);

  return {
    key: key,
    hash: helpers.hashStrings([
      path,
      key.size,
      key.mode,
      key.mtime
    ])
  };
}

function symlinkOrCopyFromCache(entry, dest, relativePath, out) {
  try {
    out.symlinkSync(entry.cacheFile, relativePath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // assume that the destination directory is missing create it and retry
      qout.mkdirpSync(path.dirname(relativePath));
      self.out.symlinkSync(entry.cacheFile, relativePath);

    } else {
      throw err;
    }
  }
}

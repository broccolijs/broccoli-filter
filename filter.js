
'use strict';

var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var Promise = require('rsvp').Promise;
var helpers = require('broccoli-kitchen-sink-helpers');
var walkSync = require('walk-sync');
var mapSeries = require('promise-map-series');
var symlinkOrCopySync = require('symlink-or-copy').sync;
var copyDereferenceSync = require('copy-dereference').sync;
var Cache = require('./cache');

module.exports = Filter;

function Filter(inputTree, options) {
  if (!this || !(this instanceof Filter) ||
      Object.getPrototypeOf(this) === Filter.prototype) {
    throw new TypeError('Filter is an abstract class and must be sub-classed');
  }
  this.inputTree = inputTree;

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
  this._canProcessCache = Object.create(null);
  this._destFilePathCache = Object.create(null);
}

Filter.prototype.rebuild = function() {
  var self = this;
  var srcDir = this.inputPath;
  var destDir = this.outputPath;
  var paths = walkSync(srcDir);

  this._cache.deleteExcept(paths).forEach(function(key) {
    fs.unlinkSync(this.cachePath + '/' + key);
  }, this);

  return mapSeries(paths, function rebuildEntry(relativePath) {
    var destPath = destDir + '/' + relativePath;
    if (relativePath.slice(-1) === '/') {
      mkdirp.sync(destPath);
    } else {
      if (internalCanProcessFile(self, relativePath)) {
        return self.processAndCacheFile(srcDir, destDir, relativePath);
      } else {
        var srcPath = srcDir + '/' + relativePath;
        symlinkOrCopySync(srcPath, destPath);
      }
    }
  });
};

Filter.prototype.canProcessFile =
    function canProcessFile(relativePath) {
  if (this.extensions == null || !this.extensions.length) return false;
  for (var i = 0, ii = this.extensions.length; i < ii; ++i) {
    var ext = this.extensions[i];
    if (relativePath.slice(-ext.length - 1) === '.' + ext) {
      return true;
    }
  }
  return false;
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
  return relativePath;
}

Filter.prototype.processAndCacheFile =
    function processAndCacheFile(srcDir, destDir, relativePath) {
  var self = this;
  var cacheEntry = this._cache.get(relativePath);

  if (cacheEntry !== void 0 &&
      cacheEntry.hash === hash(srcDir, cacheEntry.inputFile)) {
    return symlinkOrCopyFromCache(cacheEntry, destDir, relativePath);
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
        if (typeof e !== 'object') e = new Error('' + e);
        e.file = relativePath;
        e.treeDir = srcDir;
        throw e;
      })

  function copyToCache() {
    var entry = {
      hash: hash(srcDir, relativePath),
      inputFile: relativePath,
      outputFile: destDir + '/' + internalGetDestFilePath(self, relativePath),
      cacheFile: self.cachePath + '/' + relativePath
    };

    if (fs.existsSync(entry.cacheFile)) {
      fs.unlinkSync(entry.cacheFile);
    } else {
      mkdirp.sync(path.dirname(entry.cacheFile));
    }

    copyDereferenceSync(entry.outputFile, entry.cacheFile);

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
  var contents = fs.readFileSync(
      srcDir + '/' + relativePath, { encoding: inputEncoding });

  return Promise.resolve(this.processString(contents, relativePath)).
      then(function asyncOutputFilteredFile(outputString) {
        var outputPath = internalGetDestFilePath(self, relativePath);
        outputPath = destDir + '/' + outputPath;
        mkdirp.sync(path.dirname(outputPath));
        fs.writeFileSync(outputPath, outputString, {
          encoding: outputEncoding
        });
      });
};

Filter.prototype.processString =
    function unimplementedProcessString(contents, relativePath) {
  throw new Error(
      'When subclassing cauliflower-filter you must implement the ' +
      '`processString()` method.');
};


function hash(src, filePath) {
  return helpers.hashTree(src + '/' + filePath);
}

function symlinkOrCopyFromCache(entry, dest, relativePath) {
  mkdirp.sync(path.dirname(entry.outputFile));

  symlinkOrCopySync(entry.cacheFile, dest + '/' + relativePath);
}

function memoize(func, cacheName) {
  if (typeof func !== 'function') throw new TypeError('Expected a function');
  function memoized(self, key) {
    var cache = self[cacheName] || (self[cacheName] = Object.create(null));
    var entry = cache[key];
    if (entry !== void 0) return entry;

    var args = [];
    for (var i = 1, ii = arguments.length; i < ii; ++i) args.push(arguments[i]);
    return cache[key] = func.apply(self, args);
  }
  return memoized;
}

var internalCanProcessFile = memoize(function canProcessFile(relativePath) {
  return !!this.canProcessFile(relativePath);
}, '_canProcessCache');

var internalGetDestFilePath = memoize(function getDestFilePath(relativePath) {
  var entry = this.getDestFilePath(relativePath);
  // TODO(@caitp): Is it even worth normalizing this?
  if (entry !== null && typeof entry !== 'string') entry = null;
  return entry;
}, '_destFilePathCache');

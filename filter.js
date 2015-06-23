
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

module.exports = Filter;

function Filter(inputTree, options) {
  if (!this || !(this instanceof Filter) ||
      Object.getPrototypeOf(this) === Filter.prototype) {
    throw new TypeError('Filter is an abstract class and must be sub-classed');
  }
  this.inputTree = inputTree;

  /* Destruecturing assignment in node 0.12.2 would be really handy for this! */
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

  this._cache = Object.create(null);
  this._canProcessCache = Object.create(null);
  this._destFilePathCache = Object.create(null);
  this._cacheIndex = 0;
}

Filter.prototype.rebuild = function() {
  var self = this;
  var srcDir = this.inputPath;
  var destDir = this.outputPath;
  var paths = walkSync(srcDir);
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
  var cacheEntry = this._cache[relativePath];

  if (cacheEntry !== void 0 &&
      cacheEntry.hash === hash(cacheEntry.inputFiles)) {
    return symlinkOrCopyFromCache(cacheEntry);
  }

  return Promise.resolve().
      then(function asyncProcessFile() {
        return self.processFile(srcDir, destDir, relativePath);
      }).
      then(
      function asyncCopyToCache(cacheInfo) {
        copyToCache(cacheInfo);
      },
      // TODO(@caitp): error wrapper is for API compat, but is not particularly
      // useful.
      // istanbul ignore next
      function asyncProcessFileErrorWrapper(e) {
        if (typeof e !== 'object') e = new Error('' + e);
        e.file = relativePath;
        e.treeDir = srcDir;
        throw e;
      });

  function hash(filePaths) {
    return filePaths.map(function hashSubTree(filePath) {
      return helpers.hashTree(srcDir + '/' + filePath);
    }).join(',');
  }

  function symlinkOrCopyFromCache(cacheEntry) {
    var outputFiles = cacheEntry.outputFiles;
    var cacheFiles = cacheEntry.cacheFiles;
    for (var i = 0, ii = outputFiles.length; i < ii; ++i) {
      var dest = destDir + '/' + outputFiles[i];
      mkdirp.sync(path.dirname(dest));
      symlinkOrCopySync(self.cachePath + '/' + cacheFiles[i], dest);
    }
  }

  function copyToCache(cacheInfo) {
    cacheInfo = cacheInfo || {};
    var inputFiles = cacheInfo.inputFiles || [relativePath];
    var outputFiles =
        cacheInfo.outputFiles || [internalGetDestFilePath(self, relativePath)];
    var cacheFiles = [];
    for (var i = 0, ii = outputFiles.length; i < ii; ++i) {
      var cacheFile = '' + (self._cacheIndex++);
      cacheFiles.push(cacheFile);

      var outputPath = destDir + '/' + outputFiles[i];
      var cachePath = self.cachePath + '/' + cacheFile;
      copyDereferenceSync(outputPath, cachePath);
    }
    var result = self._cache[relativePath] = {
      hash: hash(inputFiles),
      inputFiles: inputFiles,
      outputFiles: outputFiles,
      cacheFiles: cacheFiles
    };
    return result;
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

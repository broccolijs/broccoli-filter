
'use strict';

var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var Promise = require('rsvp').Promise;
var helpers = require('broccoli-kitchen-sink-helpers');
var walkSync = require('walk-sync');
var mapSeries = require('promise-map-series');
var symlinkOrCopySync = require('symlink-or-copy').sync;

module.exports = Filter;

function Filter(inputTree, options) {
  if (!this || !(this instanceof Filter) ||
      Object.getPrototypeOf(this) === Filter.prototype) {
    throw new TypeError('Filter is an abstract class and must be sub-classed');
  }

  /* Destruecturing assignment in node 0.12.2 would be really handy for this! */
  options = options || {};
  this.extensions = options.extensions;
  this.targetExtension = options.targetExtension;
  this.inputEncoding = options.inputEncoding;
  this.outputEnoding = options.outputEncoding;
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
      console.log('Filter#rebuild creating "' + destPath + '"');
      mkdirp.sync(destPath);
    } else {
      if (this._canProcessFile(relativePath)) {
        return this.processAndCacheFile(srcDir, destDir, relativePath);
      } else {
        var srcPath = srcDir + '/' + relativePath;
        symlinkOrCopySync(srcPath, destPath);
      }
    }
  });
};

Filter.prototype._canProcessFile =
    function internalCanProcessFile(relativePath) {
  var cache = this._canProcessCache;
  var entry = cache[relativePath];
  if (entry !== void 0) return entry;
  return cache[relativePath] = !!this.canProcessFile(relativePath);
};

Filter.prototype.canProcessFile =
    function canProcessFile(relativePath) {
  return this._getDestFilePath(relativePath) !== null;
};

Filter.prototype._getDestFilePath = function internalGetDestFilePath(relativePath) {
  var cache = this._destFilePathCache;
  var entry = cache[relativePath];
  if (entry !== void 0) return entry;
  entry = this.getDestFilePath(relativePath);

  // TODO(@caitp): Is it even worth normalizing this?
  if (entry !== null && typeof entry !== 'string') entry = null;

  return cache[relativePath] = entry;
};

Filter.prototype.getDestFilePath = function getDestFilePath(relativePath) {
  /* Just symlink if this file isn't intended to be processed */
  if (!this.extensions) return null;

  for (var i = 0, ii = this.extensions.length; i < ii; ++i) {
    var ext = this.extensions[i];
    if (relativePath.slice(-ext.length - 1) === '.' + ext) {
      if (this.targetExtension !== 0) {
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
        cacheInfo.outputFiles || [self._getDestFilePath(relativePath)];
    var cacheFiles = [];
    for (var i = 0, ii = outputFiles.length; i < ii; ++i) {
      var cacheFile = '' + (self._cacheIndex++);
      cacheFiles.push(cacheFile);

      helpers.copyPreserveSync(
          destDir + '/' + outputFiles[i], self.cachePath + '/' + cacheFile);
    }
    return self._cache[relativePath] = {
      hash: hash(inputFiles),
      inputFiles: inputFiles,
      outputFiles: outputFiles,
      cacheFiles: cacheFiles
    };
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
        var outputPath = self._getDestFilePath(relativePath);
        fs.writeFileSync(
            destDir + '/' + outputPath, outputString,
            { encoding: outputEncoding });
      });
};

Filter.prototype.processString =
    function unimplementedProcessString(contents, relativePath) {
  throw new Error(
      'When subclassing cauliflower-filter you must implement the ' +
      '`processString()` method.');
};

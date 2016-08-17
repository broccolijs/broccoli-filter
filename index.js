'use strict';

var fs = require('fs');
var path = require('path');
var mkdirpBulk = require('mkdirp-bulk');
var mkdirp = require('mkdirp');
var Promise = require('rsvp').Promise;
var Plugin = require('broccoli-plugin');
var helpers = require('broccoli-kitchen-sink-helpers');
var walkSync = require('walk-sync');
var mapSeries = require('promise-map-series');
var symlinkOrCopySync = require('symlink-or-copy').sync;
var copyDereferenceSync = require('copy-dereference').sync;
var Cache = require('./lib/cache');
var debugGenerator = require('debug');
var keyForFile = require('./lib/key-for-file');

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

  Plugin.call(this, [inputTree]);

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

Filter.prototype._resetStats = function() {
  this._stats = {
    paths: 0,
    stale: 0,
    mkdirp: 0,
    mkdirpCache: 0,
    processed: 0,
    unprocessed: 0,
    hits: 0,
    miss: 0,
    prime: 0,
    hash: 0,
    processedTime: 0
  };
};

Filter.prototype.build = function build() {
  var self = this;
  var start = new Date();
  this._resetStats();
  var srcDir = this.inputPaths[0];
  var destDir = this.outputPath;
  var paths = walkSync(srcDir).filter(Boolean);

  self._stats.paths = paths.length;
  self._stats.walkSyncTime = new Date() - start;

  this._cache.deleteExcept(paths).forEach(function(key) {
    self._stats.stale++;
    fs.unlinkSync(this.cachePath + '/' + key);
  }, this);

  self._stats.mkdirp += mkdirpBulk.sync(paths.map(function(p) {
    return self.outputPath + '/' + p;
  }));

  if (this._cacheDirsPrimed === undefined) {
    this._cacheDirsPrimed = true;
    self._stats.mkdirp += mkdirpBulk.sync(paths.map(function(p) {
      return self.cachePath + '/' + p;
    }));
  }

  return mapSeries(paths, function rebuildEntry(relativePath) {
    var destPath = destDir + '/' + relativePath;
    if (relativePath.slice(-1) === '/') {
    } else {
      if (self.canProcessFile(relativePath)) {
        self._stats.processed++;
        return self.processAndCacheFile(srcDir, destDir, relativePath);
      } else {
        self._stats.unprocessed++;
        var srcPath = srcDir + '/' + relativePath;
        symlinkOrCopySync(srcPath, destPath);
      }
    }
  }).finally(function() {
    self._cacheDirsPrimed = false;
    self._debug('build %o in %dms', self._stats, new Date() - start);
  });
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
  var start = new Date();
  var self = this;
  var cacheEntry = this._cache.get(relativePath);
  var outputRelativeFile = self.getDestFilePath(relativePath);
  var result;

  if (cacheEntry) {
    this._stats.hash++;
    var hashResult = hash(srcDir, cacheEntry.inputFile);

    if (cacheEntry.hash.hash === hashResult.hash) {
      this._stats.hits++;

      symlinkOrCopySync(cacheEntry.cacheFile, destDir + '/' + outputRelativeFile);
      this._stats.processedTime += new Date() - start;
      return result;
    } else {
      this._stats.miss++;
    }

  } else {
    this._stats.prime++;
  }

  return Promise.resolve().
      then(function asyncProcessFile() {
        return self.processFile(srcDir, destDir, relativePath);
      }).
      then(linkFromCache,
      // TODO(@caitp): error wrapper is for API compat, but is not particularly
      // useful.
      // istanbul ignore next
      function asyncProcessFileErrorWrapper(e) {
        if (typeof e !== 'object' || e === null) e = new Error('' + e);
        e.file = relativePath;
        e.treeDir = srcDir;
        throw e;
      }).finally(function() {
        self._stats.processedTime += new Date() - start;
      });

  function linkFromCache() {
    self._stats.hash++;

    var entry = {
      hash: hash(srcDir, relativePath),
      inputFile: relativePath,
      outputFile: destDir + '/' + outputRelativeFile,
      cacheFile: self.cachePath + '/' + outputRelativeFile
    };

    if (fs.existsSync(entry.outputFile)) {
      fs.unlinkSync(entry.outputFile);
    } else if (self._cacheDirsPrimed === false) {
      self._stats.mkdirpCache++;
      mkdirp.sync(path.dirname(entry.cacheFile));
    }

    symlinkOrCopySync(entry.cacheFile, entry.outputFile);

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
        var outputPath = self.getDestFilePath(relativePath);
        if (outputPath == null) {
          throw new Error('canProcessFile("' + relativePath + '") is true, but getDestFilePath("' + relativePath + '") is null');
        }
        outputPath = self.cachePath + '/' + outputPath;
        fs.writeFileSync(outputPath, outputString, {
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

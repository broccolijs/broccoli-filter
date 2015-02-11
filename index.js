var fs = require('fs')
var path = require('path')
var mkdirp = require('mkdirp')
var Promise = require('rsvp').Promise
var quickTemp = require('quick-temp')
var helpers = require('broccoli-kitchen-sink-helpers')
var walkSync = require('walk-sync')
var mapSeries = require('promise-map-series')


module.exports = Filter
function Filter (inputTree, options) {
  if (!inputTree) {
    throw new Error('broccoli-filter must be passed an inputTree, instead it received `undefined`');
  }
  this.inputTree = inputTree
  options = options || {}
  if (options.extensions != null) this.extensions = options.extensions
  if (options.targetExtension != null) this.targetExtension = options.targetExtension
  if (options.inputEncoding !== undefined) this.inputEncoding = options.inputEncoding
  if (options.outputEncoding !== undefined) this.outputEncoding = options.outputEncoding
}

Filter.prototype.rebuild = function () {
  var self = this

  var paths = walkSync(this.inputPath)
    return mapSeries(paths, function (relativePath) {
      if (relativePath.slice(-1) === '/') {
        mkdirp.sync(self.outputPath + '/' + relativePath)
      } else {
        if (self.canProcessFile(relativePath)) {
          return self.processAndCacheFile(self.inputPath, self.outputPath, relativePath)
        } else {
          helpers.copyPreserveSync(
            self.inputPath + '/' + relativePath, self.outputPath + '/' + relativePath)
        }
      }
    })
}

// Compatibility with Broccoli < 0.14
// See https://github.com/broccolijs/broccoli/blob/master/docs/new-rebuild-api.md
Filter.prototype.read = function (readTree) {
  var self = this

  quickTemp.makeOrRemake(this, 'outputPath')
  quickTemp.makeOrReuse(this, 'cachePath')
  this.needsCleanup = true

  return readTree(this.inputTree)
    .then(function (inputPath) {
      self.inputPath = inputPath
      return self.rebuild()
    })
    .then(function () {
      return self.outputPath
    })
}

Filter.prototype.cleanup = function () {
  if (this.needsCleanup) {
    quickTemp.remove(this, 'outputPath')
    quickTemp.remove(this, 'cachePath')
  }
}

Filter.prototype.canProcessFile = function (relativePath) {
  return this.getDestFilePath(relativePath) != null
}

Filter.prototype.getDestFilePath = function (relativePath) {
  for (var i = 0; i < this.extensions.length; i++) {
    var ext = this.extensions[i]
    if (relativePath.slice(-ext.length - 1) === '.' + ext) {
      if (this.targetExtension != null) {
        relativePath = relativePath.slice(0, -ext.length) + this.targetExtension
      }
      return relativePath
    }
  }
  return null
}

// To do: Get rid of the srcDir/destDir args because we now have inputPath/outputPath
// https://github.com/search?q=processAndCacheFile&type=Code&utf8=%E2%9C%93

Filter.prototype.processAndCacheFile = function (srcDir, destDir, relativePath) {
  var self = this

  this._cache = this._cache || {}
  this._cacheIndex = this._cacheIndex || 0
  var cacheEntry = this._cache[relativePath]
  if (cacheEntry != null && cacheEntry.hash === hash(cacheEntry.inputFiles)) {
    copyFromCache(cacheEntry)
  } else {
    return Promise.resolve()
      .then(function () {
        return self.processFile(srcDir, destDir, relativePath)
      })
      .catch(function (err) {
        // Augment for helpful error reporting
        err.file = relativePath
        err.treeDir = srcDir
        throw err
      })
      .then(function (cacheInfo) {
        copyToCache(cacheInfo)
      })
  }

  function hash (filePaths) {
    return filePaths.map(function (filePath) {
      return helpers.hashTree(srcDir + '/' + filePath)
    }).join(',')
  }

  function copyFromCache (cacheEntry) {
    for (var i = 0; i < cacheEntry.outputFiles.length; i++) {
      var dest = destDir + '/' + cacheEntry.outputFiles[i]
      mkdirp.sync(path.dirname(dest))
      // We may be able to link as an optimization here, because we control
      // the cache directory; we need to be 100% sure though that we don't try
      // to hardlink symlinks, as that can lead to directory hardlinks on OS X
      helpers.copyPreserveSync(
        self.cachePath + '/' + cacheEntry.cacheFiles[i], dest)
    }
  }

  function copyToCache (cacheInfo) {
    var cacheEntry = {
      inputFiles: (cacheInfo || {}).inputFiles || [relativePath],
      outputFiles: (cacheInfo || {}).outputFiles || [self.getDestFilePath(relativePath)],
      cacheFiles: []
    }
    for (var i = 0; i < cacheEntry.outputFiles.length; i++) {
      var cacheFile = (self._cacheIndex++) + ''
      cacheEntry.cacheFiles.push(cacheFile)
      helpers.copyPreserveSync(
        destDir + '/' + cacheEntry.outputFiles[i],
        self.cachePath + '/' + cacheFile)
    }
    cacheEntry.hash = hash(cacheEntry.inputFiles)
    self._cache[relativePath] = cacheEntry
  }
}

Filter.prototype.processFile = function (srcDir, destDir, relativePath) {
  var self = this
  var inputEncoding = (this.inputEncoding === undefined) ? 'utf8' : this.inputEncoding
  var outputEncoding = (this.outputEncoding === undefined) ? 'utf8' : this.outputEncoding
  var string = fs.readFileSync(srcDir + '/' + relativePath, { encoding: inputEncoding })
  return Promise.resolve(self.processString(string, relativePath))
    .then(function (outputString) {
      var outputPath = self.getDestFilePath(relativePath)
      fs.writeFileSync(destDir + '/' + outputPath, outputString, { encoding: outputEncoding })
    })
}

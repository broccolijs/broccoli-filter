var fs = require('fs')
var path = require('path')
var mkdirp = require('mkdirp')
var Promise = require('rsvp').Promise
var quickTemp = require('quick-temp')
var Writer = require('broccoli-writer')
var helpers = require('broccoli-kitchen-sink-helpers')
var walkSync = require('walk-sync')
var mapSeries = require('promise-map-series')
var symlinkOrCopySync = require('symlink-or-copy').sync


module.exports = Filter
Filter.prototype = Object.create(Writer.prototype)
Filter.prototype.constructor = Filter
function Filter (inputTree, options) {
  this.inputTree = inputTree
  this._hashTreeOptions = { digestCache: {} };
  this._oldCacheDirs = {};
  options = options || {}
  if (options.extensions != null) this.extensions = options.extensions
  if (options.targetExtension != null) this.targetExtension = options.targetExtension
  // We could allow for overwriting this.getDestFilePath as well; just need an
  // option name that communicates the meaning
  // We could allow for setting the encoding to something other than utf8
}

Filter.prototype.getCacheDir = function () {
  return quickTemp.makeOrReuse(this, 'tmpCacheDir')
}

Filter.prototype.getCachedFilepath = function (relativePath, hashOfInput) {
  return this.getDestFilePath(relativePath) + '--' + hashOfInput;
}

Filter.prototype.write = function (readTree, destDir) {
  var self = this

  return readTree(this.inputTree).then(function (srcDir) {
    return self.processAllFilesIn(srcDir, destDir);
  })
}

Filter.prototype.processAllFilesIn = function(srcDir, destDir) {
  var self = this
  var paths = walkSync(srcDir)

  return mapSeries(paths, function (relativePath) {
    if (relativePath.slice(-1) === '/') {
      mkdirp.sync(destDir + '/' + relativePath)
    } else {
      if (self.canProcessFile(relativePath)) {
        return self.processAndCacheFile(srcDir, destDir, relativePath)
      } else {
        symlinkOrCopySync(srcDir + '/' + relativePath, destDir + '/' + relativePath)
      }
    }
  })
}

Filter.prototype.cleanup = function () {
  quickTemp.remove(this, 'tmpCacheDir')
  Writer.prototype.cleanup.call(this)
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

Filter.prototype.getHashForInput = function(srcDir, relativePath) {
  return helpers.hashTree(srcDir + '/' + relativePath, this._hashTreeOptions);
}

Filter.prototype.getCacheEntryForPathAndHash = function(relativePath, hashOfInput) {
  this._cache = this._cache || {}
  this._cache[relativePath] = this._cache[relativePath] || {};

  return this._cache[relativePath][hashOfInput];
}

Filter.prototype.processAndCacheFile = function (srcDir, destDir, relativePath) {
  var self = this,
      hashOfInput = this.getHashForInput(srcDir, relativePath),
      cacheEntry = this.getCacheEntryForPathAndHash(relativePath, hashOfInput)

  if (cacheEntry != null) {
    symlinkOrCopyFromCache(cacheEntry)
  } else {
    return Promise.resolve()
      .then(function () {
        return self.processFile(srcDir, relativePath, hashOfInput);
      })
      .catch(function (err) {
        // Augment for helpful error reporting
        err.file = relativePath
        err.treeDir = srcDir
        throw err
      })
      .then(function (cacheInfo) {
        var cacheEntry = self.buildCacheEntry(cacheInfo, relativePath, hashOfInput);
        self._cache[relativePath][hashOfInput] = cacheEntry;
        symlinkOrCopyFromCache(cacheEntry)
      })
  }

  function symlinkOrCopyFromCache (cacheEntry) {
    for (var i = 0; i < cacheEntry.outputFiles.length; i++) {
      var cachedSource = self.getCacheDir() + '/' + cacheEntry.cachedFiles[i],
          dest = destDir + '/' + cacheEntry.outputFiles[i];

      mkdirp.sync(path.dirname(dest))

      // We may be able to link as an optimization here, because we control
      // the cache directory; we need to be 100% sure though that we don't try
      // to hardlink symlinks, as that can lead to directory hardlinks on OS X
      symlinkOrCopySync(cachedSource, dest)
    }
  }
};


Filter.prototype.buildCacheEntry = function (cacheInfo, relativePath, hashOfInput) {
  cacheInfo = cacheInfo || {};

  // Prevent previously allowable behavior?
  if (cacheInfo.inputFiles && cacheInfo.inputFiles.length > 1) {
    throw new Error("broccoli-filter cannot handle more than one input file");
  } else if (cacheInfo.inputFiles && cacheInfo.inputFiles[0] != relativePath) {
    throw new Error("broccoli-filter doesn't know how to handle input file not matching the currently processed relativePath");
  }

  var cacheEntry = {
    inputFile: relativePath,
    inputFileHash: hashOfInput,

    cachedFiles: cacheInfo.cachedFiles || [self.getCachedFilepath(relativePath, hashOfInput)],
    outputFiles: cacheInfo.outputFiles || [self.getDestFilePath(relativePath)]
  }

  return cacheEntry;
};

Filter.prototype.processFile = function (srcDir, relativePath, hashOfInput) {
  var self = this
  var string = fs.readFileSync(srcDir + '/' + relativePath, { encoding: 'utf8' });

  return Promise.resolve(self.processString(string, relativePath, srcDir))
    .then(function (outputString) {
      var cacheFileDest = self.getCachedFilepath(relativePath, hashOfInput);

      mkdirp.sync(self.getCacheDir() + '/' + path.dirname(cacheFileDest));
      fs.writeFileSync(self.getCacheDir() + '/' + cacheFileDest, outputString, { encoding: 'utf8' })

      return {
        cachedFiles: [cacheFileDest],
        outputFiles: [self.getDestFilePath(relativePath)]
      }
    })
}

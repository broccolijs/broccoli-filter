var fs = require('fs')
var path = require('path')
var rsvp = require('rsvp')
var Promise = rsvp.Promise
var mkdir = rsvp.denodeify(fs.mkdir)
var quickTemp = require('quick-temp')
var Writer = require('broccoli-writer')
var helpers = require('broccoli-kitchen-sink-helpers')
var symlinkOrCopy = rsvp.denodeify(require('symlink-or-copy'))
var dirToTree = require('dir-to-tree')

module.exports = Filter
Filter.prototype = Object.create(Writer.prototype)
Filter.prototype.constructor = Filter
function Filter (inputTree, options) {
  this.inputTree = inputTree
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

Filter.prototype.write = function (readTree, destDir) {
  var self = this
  return readTree(this.inputTree).then(function (srcDir) {
    var root = dirToTree.sync(srcDir)
    self.markProcessable(root)
    return self.processNode(srcDir, destDir, root)
  })
}

Filter.prototype.cleanup = function () {
  quickTemp.remove(this, 'tmpCacheDir')
  Writer.prototype.cleanup.call(this)
}

//This function recursively figures out if each node in the tree contains
//children that needs to be processed/filtered. If we have directories that do
//not contain any files to be filtered, we can simply symlink the entire
//directory.
Filter.prototype.markProcessable = function(node) {
  var self = this
  node.processable = false
  node.children.forEach(function(child) {
    if (child.children) {
      self.markProcessable(child)
    } else {
      child.processable = self.canProcessFile(child.relativePath)
    }
    if (child.processable) {
      node.processable = true
    }
  })
}

Filter.prototype.processNode = function(srcDir, destDir, node) {
  var self = this
  if (node.processable) {
    return mkdir(destDir + '/' + node.relativePath)
      .catch(function(e) {
        if (e.code !== 'EEXIST') {
          throw e
        }
      })
      .then(function() {
        return Promise.all(node.children.map(function(child) {
          if (child.children) {
            return self.processNode(srcDir, destDir, child)
          } else {
            if (child.processable) {
              return self.processAndCacheFile(srcDir, destDir, child.relativePath)
            } else {
              return symlinkOrCopy.sync(srcDir + '/' + child.relativePath, destDir + '/' + child.relativePath)
            }
          }
        }))
      })
  } else {
    return symlinkOrCopy.sync(srcDir + '/' + node.relativePath, destDir + '/' + node.relativePath)
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

      // We may be able to link as an optimization here, because we control
      // the cache directory; we need to be 100% sure though that we don't try
      // to hardlink symlinks, as that can lead to directory hardlinks on OS X
      symlinkOrCopy.sync(self.getCacheDir() + '/' + cacheEntry.cacheFiles[i], dest)
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
        self.getCacheDir() + '/' + cacheFile)
    }
    cacheEntry.hash = hash(cacheEntry.inputFiles)
    self._cache[relativePath] = cacheEntry
  }
}

Filter.prototype.processFile = function (srcDir, destDir, relativePath) {
  var self = this
  var string = fs.readFileSync(srcDir + '/' + relativePath, { encoding: 'utf8' })
  return Promise.resolve(self.processString(string, relativePath))
    .then(function (outputString) {
      var outputPath = self.getDestFilePath(relativePath)
      fs.writeFileSync(destDir + '/' + outputPath, outputString, { encoding: 'utf8' })
    })
}

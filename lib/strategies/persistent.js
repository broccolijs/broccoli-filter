'use strict';

var md5Hex = require('md5-hex');
var PersistentCache = require('async-disk-cache');
var hashForDep = require('hash-for-dep');

module.exports = {

  _peristentCache: {},

  init: function(ctx) {
    if (!ctx.constructor.cacheKey) {
      ctx.constructor.cacheKey = this.cacheKey(ctx);
    }

    this._peristentCache = new PersistentCache(ctx.constructor.cacheKey, {
      compression: 'deflate'
    });
  },

  cacheKey: function(ctx) {
    return hashForDep(ctx.baseDir());
  },

  processString: function(ctx, contents, relativePath) {
    var key = ctx.cacheKeyProcessString(contents, relativePath);
    return this._peristentCache.get(key).then(function(entry) {
      var result;

      if (entry.isCached) {
        result = {
          string: entry.value,
          key: key
        };
      } else {
        result = {
          string: ctx.processString(contents, relativePath),
          key: key
        };
      }

      return result;
    });
  },

  done: function(ctx, result) {
    return this._peristentCache.set(result.key, result.string);
  }
};

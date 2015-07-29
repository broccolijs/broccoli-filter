'use strict';

var chai = require('chai');
var expect = chai.expect;
var keyForFile = require('../key-for-file');

describe('keyForFile', function () {
  describe('when given a path to a directory', function () {
    it('throws an error', function () {
      expect(function () {
        keyForFile('./test/fixtures/directory');
      }).to.throw(/cannot diff directory/i);
    });
  });

  describe('when given an invalid path', function () {
    it('throws an error', function () {
      expect(function () {
        keyForFile('./unlikely/to/be/a/real/path');
      }).to.throw();
    });
  });

  describe('when given a path to a file', function () {
    it('returns the cache key parts in an object literal', function () {
      var key = keyForFile('./test/fixtures/file.js');
      expect(Object.keys(key)).to.deep.equal(['mode', 'mtime', 'size']);
      expect(key.mode).to.be.a('number');
      expect(key.mtime).to.be.a('number');
      // windows line endings add a byte
      expect(key.size).to.be.within(8,9);
    });
  });
});

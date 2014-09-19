/* global describe, it, require */

var Filter    = require('../index');
var broccoli  = require('broccoli');
var expect    = require('expect.js');
var sinon     = require('sinon');
var ms        = require('mocha-subject');
var RSVP      = require('rsvp');
var quickTemp = require('quick-temp')
var path      = require('path');
var fs        = require('fs');

ms.infect();

DummyFilter.prototype = Object.create(Filter.prototype)
DummyFilter.prototype.constructor = DummyFilter
function DummyFilter (inputTree, options) {
  if (!(this instanceof DummyFilter)) return new DummyFilter(inputTree, options)
  Filter.call(this, inputTree, options)
  this.options = options || {}
}

DummyFilter.prototype.processString = function(string, relativePath) {
  return string;
};

describe('broccoli-filter', function() {
  var sourcePath = 'tests/fixtures',
      builder;

  subject('filter', function() {
    return new DummyFilter(sourcePath, {extensions: ['js']});
  });

  afterEach(function() {
    if (builder) {
      builder.cleanup();
    }
  });

  var buildTree = function(inputTree) {
    builder = new broccoli.Builder(inputTree);
    return builder.build();
  };

  it('throws an error if no extensions provided', function() {
    var fn = function() {
      new DummyFilter(sourcePath);
    };

    expect(fn).to.throwError(/provide extensions/);
  });


  describe('write', function() {
    var destDir, readIt;
    beforeEach(function() {
      destDir = quickTemp.makeOrReuse(this.filter, 'tmpDestDir');
      readIt = sinon.stub().returns(RSVP.resolve(sourcePath));
      return this.filter.write(readIt, destDir)
    });

    afterEach(function() {
      quickTemp.remove(this.filter, 'tmpDestDir');
      this.filter.cleanup();
    });

    it('reads the tree', function() {
      expect(readIt.calledOnce).to.be.ok();
      expect(readIt.calledWith(sourcePath)).to.be.ok();
    });

    it('makes directories in destDir', function() {
      var subPath = path.join(destDir, 'sub');
      expect(fs.statSync(subPath).isDirectory()).to.be.ok();
    });
  });

  describe('getDestFilePath', function() {
    it('is null if the filter does not have extensions', function() {
      this.filter.extensions = [];

      expect(this.filter.getDestFilePath('foo.js')).to.be(null);
    });

    it("is same relativePath as provided if extensions but no targetExtension", function() {
      this.filter.extensions = ['js'];

      expect(this.filter.getDestFilePath('foo.js')).to.be('foo.js');
    });

    it("is same relativePath but with targetExtension in place of extension", function() {
      this.filter.extensions = ['coffee'];
      this.filter.targetExtension = 'js';

      expect(this.filter.getDestFilePath('foo.coffee')).to.be('foo.js');
    })
  });
});

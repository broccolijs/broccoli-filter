'use strict';

var chai = require('chai');
var expect = chai.expect;
var sinon = require('sinon');
var broccoliTestHelpers = require('broccoli-test-helpers');
var makeTestHelper = broccoliTestHelpers.makeTestHelper;
var cleanupBuilders = broccoliTestHelpers.cleanupBuilders;

var inherits = require('util').inherits;
var _mockfs = require('mock-fs');
var fs = require('fs');
var mkdirp = require('mkdirp');
var path = require('path');
var Builder = require('broccoli').Builder;
var Filter = require('../filter.js');
var minimatch = require('minimatch');

function ReplaceFilter(inputTree, options) {
  if (!this) return new ReplaceFilter(inputTree, options);
  options = options || {};
  Filter.call(this, inputTree, options);
  this._glob = options.glob;
  this._search = options.search;
  this._replacement = options.replace;
}

inherits(ReplaceFilter, Filter);

ReplaceFilter.prototype.canProcessFile = function(relativePath) {
  if (this._glob === void 0) {
    return Filter.prototype.canProcessFile.call(this, relativePath);
  }
  return minimatch(relativePath, this._glob);
};

ReplaceFilter.prototype.processString = function(contents, relativePath) {
  var result = contents.replace(this._search, this._replacement);
  return result;
};

function IncompleteFilter(inputTree, options) {
  if (!this) return new IncompleteFilter(inputTree, options);
  Filter.call(this, inputTree, options);
}

inherits(IncompleteFilter, Filter);

describe('Filter', function() {
  function mockfs(config) {
    config.tmp = _mockfs.directory();
    return _mockfs(config);
  }
  mockfs.file = _mockfs.file;
  mockfs.directory = _mockfs.directory;
  mockfs.symlink = _mockfs.symlink;
  mockfs.restore = function() { return _mockfs.restore(); }

  function makeBuilder(plugin, dir, prepSubject) {
    return makeTestHelper({
      subject: plugin,
      fixturePath: dir,
      prepSubject: prepSubject
    });
  }

  afterEach(function() {
    cleanupBuilders();
    mockfs.restore();
  });

  function read(relativePath, encoding) {
    encoding = encoding === void 0 ? 'utf8' : encoding;
    return fs.readFileSync(relativePath, encoding);
  }

  function write(relativePath, contents, encoding) {
    encoding = encoding === void 0 ? 'utf8' : encoding;
    mkdirp.sync(path.dirname(relativePath));
    fs.writeFileSync(relativePath, contents, {
      encoding: encoding
    });
  }

  it('should throw if called as a function', function() {
    expect(function() {
      return Filter();
    }).to.throw(TypeError, /abstract class and must be sub-classed/);
  });


  it('should throw if called on object which does not a child class of Filter',
      function() {
    expect(function() {
      return Filter.call({});
    }).to.throw(TypeError, /abstract class and must be sub-classed/);

    expect(function() {
      return Filter.call([]);
    }).to.throw(TypeError, /abstract class and must be sub-classed/);

    expect(function() {
      return Filter.call(global);
    }).to.throw(TypeError, /abstract class and must be sub-classed/);
  });


  it('should throw if base Filter class is new-ed', function() {
    expect(function() {
      return new Filter();
    }).to.throw(TypeError, /abstract class and must be sub-classed/);
  });


  it('should throw if `processString` is not implemented', function() {
    expect(function() {
      new IncompleteFilter('.').processString('foo', 'fake_path');
    }).to.throw(Error, /must implement/);
  });


  it('should process files with extensions included in `extensions` list by ' +
     'default', function() {
    function MyFilter(inputTree, options) {
      if (!this) return new MyFilter(inputTree, options);
      Filter.call(this, inputTree, options);
    }
    inherits(MyFilter, Filter);
    var filter = MyFilter('.', { extensions: ['c', 'cc', 'js']});
    expect(filter.canProcessFile('foo.c')).to.equal(true);
    expect(filter.canProcessFile('test.js')).to.equal(true);
    expect(filter.canProcessFile('blob.cc')).to.equal(true);
    expect(filter.canProcessFile('twerp.rs')).to.equal(false);
  });


  it('should replace matched extension with targetExtension by default',
      function() {
    function MyFilter(inputTree, options) {
      if (!this) return new MyFilter(inputTree, options);
      Filter.call(this, inputTree, options);
    }
    inherits(MyFilter, Filter);
    var filter = MyFilter('.', {
      extensions: ['c', 'cc', 'js'],
      targetExtension: 'zebra'
    });
    expect(filter.getDestFilePath('foo.c')).to.equal('foo.zebra');
    expect(filter.getDestFilePath('test.js')).to.equal('test.zebra');
    expect(filter.getDestFilePath('blob.cc')).to.equal('blob.zebra');
    expect(filter.getDestFilePath('twerp.rs')).to.equal('twerp.rs');
  });


  it('should processString only when canProcessFile returns true',
      function() {
    var disk = {
      'dir/a/README.md': mockfs.file({content: 'Nicest dogs in need of homes',
                                      mtime: new Date(1000)}),
      'dir/a/foo.js': mockfs.file({content: 'Nicest dogs in need of homes',
                                   mtime: new Date(1000)})
    };
    mockfs(disk);
    var builder = makeBuilder(ReplaceFilter, '.', function(awk) {
      sinon.spy(awk, 'processString');
      return awk;
    });
    return builder('dir', {
      glob: '**/*.md',
      search: 'dogs',
      replace: 'cats'
    }).then(function(results) {
      var awk = results.subject;
      expect(read(awk.outputPath + '/a/README.md')).
          to.equal('Nicest cats in need of homes');
      expect(read(awk.outputPath + '/a/foo.js')).
          to.equal('Nicest dogs in need of homes');
      expect(awk.processString.callCount).to.equal(1);
    });
  });


  it('should cache status of canProcessFile', function() {
    var disk = {
      'dir/a/README.md': mockfs.file({content: 'Nicest dogs in need of homes',
                                      mtime: new Date(1000)}),
      'dir/a/foo.js': mockfs.file({content: 'Nicest dogs in need of homes',
                                   mtime: new Date(1000)})
    };
    mockfs(disk);
    var builder = makeBuilder(ReplaceFilter, '.', function(awk) {
      sinon.spy(awk, 'canProcessFile');
      return awk;
    });

    return builder('dir', {
      glob: '**/*.md',
      search: 'dogs',
      replace: 'cats'
    }).then(function(results) {
      var awk = results.subject;

      expect(read(awk.outputPath + '/a/README.md')).
          to.equal('Nicest cats in need of homes');
      expect(read(awk.outputPath + '/a/foo.js')).
          to.equal('Nicest dogs in need of homes');

      expect(awk.canProcessFile.callCount).to.equal(2);

      write('dir/a/CONTRIBUTING.md', 'All dogs go to heaven!');

      return results.builder();
    }).then(function(results) {
      var awk = results.subject;
      expect(read(awk.outputPath + '/a/README.md')).
          to.equal('Nicest cats in need of homes');
      expect(read(awk.outputPath + '/a/foo.js')).
          to.equal('Nicest dogs in need of homes');
      expect(read(awk.outputPath + '/a/CONTRIBUTING.md')).
          to.equal('All cats go to heaven!');
      expect(awk.canProcessFile.callCount).to.equal(3);

      return results.builder();
    }).then(function(results) {
      var awk = results.subject;
      expect(awk.canProcessFile.callCount).to.equal(3);
    });
  });


  it('should not overwrite core options if they are not present', function() {
    function F(inputTree, options) { Filter.call(this, inputTree, options); }
    inherits(F, Filter);
    F.prototype.extensions = ['js', 'rs'];
    F.prototype.targetExtension = 'glob';
    F.prototype.inputEncoding = 'latin1';
    F.prototype.outputEncoding = 'shift-jis';
    expect(new F('.').extensions).to.eql(['js', 'rs']);
    expect(new F('.').targetExtension).to.equal('glob');
    expect(new F('.').inputEncoding).to.equal('latin1');
    expect(new F('.').outputEncoding).to.equal('shift-jis');

    expect(new F('.', { extensions: ['x'] }).extensions).
        to.eql(['x']);
    expect(new F('.', { targetExtension: 'c' }).targetExtension).
        to.equal('c');
    expect(new F('.', { inputEncoding: 'utf8'} ).inputEncoding).
        to.equal('utf8');
    expect(new F('.', { outputEncoding: 'utf8' }).outputEncoding).
        to.equal('utf8');
  });

  describe('proccesFile', function() {
    beforeEach(function() {
      sinon.spy(fs, 'mkdirSync');
    });

    afterEach(function() {
      fs.mkdirSync.restore();
    });

    it('should not effect the current cwd', function() {
      var disk = {
        'dir/a/README.md': mockfs.file({content: 'Nicest dogs in need of homes',
                                        mtime: new Date(1000)}),
        'dir/a/foo.js': mockfs.file({content: 'Nicest dogs in need of homes',
                                     mtime: new Date(1000)}),
        'dir/a/bar/bar.js': mockfs.file({content: 'Dogs... who needs dogs?',
                                     mtime: new Date(1000)})
      };

      mockfs(disk);

      var builder = makeBuilder(ReplaceFilter, '.', function(awk) {
        sinon.spy(awk, 'canProcessFile');
        return awk;
      });

      return builder('dir', {
        glob: '**/*.js',
        search: 'dogs',
        replace: 'cats'
      }).then(function(results) {
        expect(fs.mkdirSync.calledWith(path.join(process.cwd(), 'a'), 493)).to.eql(false);
        expect(fs.mkdirSync.calledWith(path.join(process.cwd(), 'a', 'bar'), 493)).to.eql(false);
      });
    });
  });
});

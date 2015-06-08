'use strict';

var inherits = require('util').inherits;
var mockfs = require('mock-fs');
var fs = require('fs');
var Builder = require('broccoli').Builder;
var Filter = require('./filter.js');

describe('Filter', function() {
  var builder;

  beforeEach(function() {
    builder = void 0;
  });

  afterEach(function(done) {
    done();
    if (builder === void 0) return done();
    //builder.cleanup().then(done, done);
  });

  function read(relativePath, encoding) {
    encoding = encoding === void 0 ? 'utf8' : encoding;
    return fs.readFileSync(relativePath, encoding);
  }

  it('should throw if called as a function', function() {
    expect(function() {
      return Filter();
    }).toThrowError(
        TypeError, 'Filter is an abstract class and must be sub-classed');
  });


  it('should throw if called on object which does not a child class of Filter',
      function() {
    expect(function() {
      return Filter.call({});
    }).toThrowError(
        TypeError, 'Filter is an abstract class and must be sub-classed');

    expect(function() {
      return Filter.call([]);
    }).toThrowError(
        TypeError, 'Filter is an abstract class and must be sub-classed');

    expect(function() {
      return Filter.call(global);
    }).toThrowError(
        TypeError, 'Filter is an abstract class and must be sub-classed');
  });


  it('should throw if base Filter class is new-ed', function() {
    expect(function() {
      return new Filter();
    }).toThrowError(
        TypeError, 'Filter is an abstract class and must be sub-classed');
  });


  function ReplaceFilter(inputTree, options) {
    if (!this) return new ReplaceFilter(inputTree, options);
    options = options || {};
    Filter.call(this, options);
    this._glob = options.glob;
    this._search = options.search;
    this._replacement = options.replace;
  }

  ReplaceFilter.prototype.canProcessFile = function(relativePath) {
    if (this._glob === void 0) {
      return Filter.prototype.canProcessFile.call(this, relativePath);
    }
    return minimatch(relativePath, this._glob);
  };

  ReplaceFilter.prototype.processString = function(contents, relativePath) {
    return contents.replace(this._search, this._replacement)
  };

  inherits(ReplaceFilter, Filter);


  it('should processString only when canProcessFile returns true',
      function(done) {
    var disk = {
      'dir/README.md': mockfs.file({contents: 'Nicest dogs in need of homes',
                                    mtime: new Date(1000)}),
      'dir/foo.js': mockfs.file({contents: 'Nicest dogs in need of homes',
                                 mtime: new Date(1000)})
    };
    mockfs(disk);
    var awk = ReplaceFilter('.', {
      glob: '*.md',
      search: 'dogs',
      replace: 'cats'
    });

    builder = new Builder(awk);

    builder.
        build().
        then(function() {
      expect(read(tree.outputPath + '/dir/README.md')).
          toBe('Nicest cats in need of homes');
      expect(read(tree.outputPath + '/dir/foo.js')).
          toBe('Nicest dogs in need of homes');
      done();
    }, done);
  });


  it('should cache status of canProcessFile', function(done) {
    var disk = {
      'dir/README.md': mockfs.file({contents: 'Nicest dogs in need of homes',
                                    mtime: new Date(1000)}),
      'dir/foo.js': mockfs.file({contents: 'Nicest dogs in need of homes',
                                 mtime: new Date(1000)})
    };
    mockfs(disk);

    var awk = ReplaceFilter('.', {
      glob: '*.md',
      search: 'dogs',
      replace: 'cats'
    });
    spyOn(awk, 'canProcessFile').and.callThrough();

    builder = new Builder(awk);

    builder.
        build().
        then(function() {
          expect(read(tree.outputPath + '/dir/README.md')).
              toBe('Nicest cats in need of homes');
          expect(read(tree.outputPath + '/dir/foo.js')).
              toBe('Nicest dogs in need of homes');
          expect(awk.canProcessFile.calls.count()).toBe(2);
          disk['dir/CONTRIBUTING.md'] = mockfs.file({
              contents: 'All dogs go to heaven!', mtime: new Date(1000)});
          mockfs(disk);
          builder.build().
              then(function() {
                expect(read(tree.outputPath + '/dir/README.md')).
                    toBe('Nicest cats in need of homes');
                expect(read(tree.outputPath + '/dir/foo.js')).
                    toBe('Nicest dogs in need of homes');
                expect(read(tree.outputPath + '/dir/CONTRIBUTING.md')).
                    toBe('All cats go to heaven!');
                expect(awk.canProcessFile.calls.count()).toBe(3);
              }, done);
        }, done);
  });
});

var istanbul = require('istanbul');
var coveralls = require('coveralls');
var spawn = require('child_process').spawn;
var stream = require('stream');
var path = require('path');
var fs = require('fs');
var SCRIPTS_DIR = __dirname;
var ROOT_DIR = path.join(SCRIPTS_DIR, '..');
var NODE_MODULES = path.join(ROOT_DIR, 'node_modules');
var BIN_DIR = path.join(NODE_MODULES, '.bin');

function bin(name) {
  return path.join(BIN_DIR, name);
}

function f(p) {
  return path.join(ROOT_DIR, p);
}

function o(opt, val) {
  return opt + '=' + val;
}

spawn(bin('istanbul'), [
    'cover', bin('minijasminenode2'), f('test.js'),
    o('--config', f('scripts/istanbul.yml'))], {
  stdio: 'inherit',
  cwd: ROOT_DIR
}).on('exit', function(code) {
  if (code) return process.exit(code);
  var lcov = fs.readFileSync(f('coverage/lcov.info'), { encoding: 'utf8' });
  var readable = new stream.Readable();
  readable._read = function() {};
  readable.push(lcov);
  readable.push(null);
  var proc = spawn(bin('coveralls'), [], {
      stdio: ['pipe', 'inherit', 'inherit']
    });
  readable.pipe(proc.stdin);
  proc.on('exit', function(code) {
    process.exit(0);
  });
});

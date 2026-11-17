// Lets the example use the package straight from ../src, with a single copy
// of react and react-native (the ones installed in example/node_modules).
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const packageRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [packageRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.disableHierarchicalLookup = true;
config.resolver.extraNodeModules = {
  'react-native-turnstile-bridge': packageRoot,
};
// Never bundle the package's own dev copies of these.
config.resolver.blockList = [
  new RegExp(`${escape(path.join(packageRoot, 'node_modules'))}[\\\\/](react|react-native|react-native-webview)[\\\\/].*`),
  new RegExp(`${escape(path.join(packageRoot, 'lib'))}[\\\\/].*`),
];

function escape(value) {
  return value.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');
}

module.exports = config;

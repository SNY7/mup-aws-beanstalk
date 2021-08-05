import archiver from 'archiver';
import fs from 'fs';
import ejs from 'ejs';
import path from 'path';
import { round } from 'lodash';
import { getNodeVersion, logStep, names } from './utils';

function copy(source, destination, vars = {}) {
  let contents = fs.readFileSync(source).toString();

  contents = ejs.render(contents, vars);

  fs.writeFileSync(destination, contents);
}

export function copyFolderSync(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  fs.readdirSync(src).forEach((dirent) => {
    const [srcPath, destPath] = [src, dest].map(dirPath => path.join(dirPath, dirent));
    const stat = fs.lstatSync(srcPath);

    switch (true) {
      case stat.isFile():
        console.log(` ... copying  ${srcPath} ${destPath}`);
        fs.copyFileSync(srcPath, destPath);
        break;
      case stat.isDirectory():
        copyFolderSync(srcPath, destPath);
        break;
      default:
        break;
    }
  });
}

export function injectFiles(api, name, version, appConfig) {
  const {
    yumPackages,
    forceSSL,
    gracefulShutdown,
    buildOptions,
    longEnvVars,
    additionalFiles,
    path: appPath
  } = appConfig;
  const bundlePath = buildOptions.buildLocation;
  const {
    bucket
  } = names({ app: appConfig });

  let sourcePath = api.resolvePath(__dirname, './assets/package.json');
  let destPath = api.resolvePath(bundlePath, 'bundle/package.json');
  copy(sourcePath, destPath, {
    name,
    version
  });

  sourcePath = api.resolvePath(__dirname, './assets/npmrc');
  destPath = api.resolvePath(bundlePath, 'bundle/.npmrc');
  copy(sourcePath, destPath);

  sourcePath = api.resolvePath(__dirname, './assets/start.sh');
  destPath = api.resolvePath(bundlePath, 'bundle/start.sh');
  copy(sourcePath, destPath);

  try {
    fs.mkdirSync(api.resolvePath(bundlePath, 'bundle/.ebextensions'));
    fs.mkdirSync(api.resolvePath(bundlePath, 'bundle/.platform/nginx/conf.d'), { recursive: true });
  } catch (e) {
    if (e.code !== 'EEXIST') {
      console.log(e);
    }
  }

  const { nodeVersion, npmVersion } = getNodeVersion(api, bundlePath);
  sourcePath = api.resolvePath(__dirname, './assets/node.yaml');
  destPath = api.resolvePath(bundlePath, 'bundle/.ebextensions/node.config');
  copy(sourcePath, destPath, { nodeVersion, npmVersion });

  sourcePath = api.resolvePath(__dirname, './assets/nginx.yaml');
  destPath = api.resolvePath(bundlePath, 'bundle/.ebextensions/nginx.config');
  copy(sourcePath, destPath, { forceSSL });

  // sourcePath = api.resolvePath(__dirname, './assets/proxy.conf');
  // destPath = api.resolvePath(bundlePath, 'bundle/.platform/nginx/conf.d/proxy.conf');
  // fs.copyFileSync(sourcePath, destPath);

  if (yumPackages) {
    sourcePath = api.resolvePath(__dirname, './assets/packages.yaml');
    destPath = api.resolvePath(bundlePath, 'bundle/.ebextensions/packages.config');
    copy(sourcePath, destPath, { packages: yumPackages });
  }

  if (gracefulShutdown) {
    sourcePath = api.resolvePath(__dirname, './assets/graceful_shutdown.yaml');
    destPath = api.resolvePath(bundlePath, 'bundle/.ebextensions/graceful_shutdown.config');
    copy(sourcePath, destPath);
  }

  if (longEnvVars) {
    sourcePath = api.resolvePath(__dirname, './assets/env.yaml');
    destPath = api.resolvePath(bundlePath, 'bundle/.ebextensions/env.config');
    copy(sourcePath, destPath, {
      bucketName: bucket
    });
  }

  if (additionalFiles) {
    sourcePath = api.resolvePath(__dirname, './assets/addfiles.yaml');
    destPath = api.resolvePath(bundlePath, 'bundle/.ebextensions/addfiles.config');
    copy(sourcePath, destPath, { additionalFiles });
  }

  sourcePath = api.resolvePath(__dirname, './assets/health-check.js');
  destPath = api.resolvePath(bundlePath, 'bundle/health-check.js');
  copy(sourcePath, destPath);

  const customConfigPath = api.resolvePath(api.getBasePath(), `${appPath}/.ebextensions`);
  const customConfig = fs.existsSync(customConfigPath);
  if (customConfig) {
    console.log(`  Copying custom config files from ${appPath}/.ebextensions`);
    fs.readdirSync(customConfigPath).forEach((file) => {
      sourcePath = api.resolvePath(customConfigPath, file);
      destPath = api.resolvePath(bundlePath, `bundle/.ebextensions/${file}`);
      copy(sourcePath, destPath);
    });
  }

  console.log(`  Copying custom config files from ${appPath}/.platform`);
  copyFolderSync(api.resolvePath(api.getBasePath(), `${appPath}/.platform`), api.resolvePath(bundlePath, 'bundle/.platform'));
}

export function archiveApp(buildLocation, api) {
  const bundlePath = api.resolvePath(buildLocation, 'bundle.zip');

  try {
    fs.unlinkSync(bundlePath);
  } catch (e) {
    // empty
  }

  return new Promise((resolve, reject) => {
    logStep('=> Archiving Bundle');
    const sourceDir = api.resolvePath(buildLocation, 'bundle');

    const output = fs.createWriteStream(bundlePath);
    const archive = archiver('zip', {
      gzip: true,
      gzipOptions: {
        level: 9
      }
    });

    archive.pipe(output);
    output.once('close', resolve);

    archive.once('error', (err) => {
      logStep('=> Archiving failed:', err.message);
      reject(err);
    });

    let nextProgress = 0.1;
    archive.on('progress', ({ entries }) => {
      try {
        const progress = entries.processed / entries.total;

        if (progress > nextProgress) {
          console.log(`  ${round(Math.floor(nextProgress * 100), -1)}% Archived`);
          nextProgress += 0.1;
        }
      } catch (e) {
        console.log(e);
      }
    });

    archive.directory(sourceDir, false).finalize();
  });
}

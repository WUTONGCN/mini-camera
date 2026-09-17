const { spawn } = require('node:child_process');

function buildLaunchEnv(env = process.env) {
  const nextEnv = { ...env };
  delete nextEnv.ELECTRON_RUN_AS_NODE;
  return nextEnv;
}

function buildLaunchArgs(extraArgs = []) {
  return ['.', ...extraArgs];
}

function launch(extraArgs = process.argv.slice(2)) {
  const child = spawn(require('electron'), buildLaunchArgs(extraArgs), {
    stdio: 'inherit',
    windowsHide: false,
    env: buildLaunchEnv()
  });

  child.on('error', (error) => {
    console.error(error);
    process.exit(1);
  });

  child.on('close', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

if (require.main === module) {
  launch();
}

module.exports = {
  buildLaunchArgs,
  buildLaunchEnv,
  launch
};

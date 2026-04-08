const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';
const isWindows = process.platform === 'win32';

function shell() {
  if (process.env.SHELL) return process.env.SHELL;
  if (isWindows) return 'powershell.exe';
  if (isMac) return '/bin/zsh';
  return '/bin/bash';
}

function findBinary(name) {
  try {
    const cmd = isWindows ? `where ${name}` : `which ${name}`;
    return execSync(cmd, { encoding: 'utf-8' }).trim().split('\n')[0];
  } catch {
    return null;
  }
}

function pandocTemplatePaths() {
  const home = os.homedir();
  const common = path.join(home, '.pandoc', 'templates', 'Eisvogel.latex');
  if (isMac) {
    return [
      common,
      path.join(home, 'Library', 'Application Support', 'pandoc', 'templates', 'Eisvogel.latex'),
    ];
  }
  return [
    path.join(home, '.local', 'share', 'pandoc', 'templates', 'Eisvogel.latex'),
    common,
  ];
}

function pandocTemplateInstallDir() {
  const home = os.homedir();
  if (isMac) {
    return path.join(home, '.pandoc', 'templates');
  }
  return path.join(home, '.local', 'share', 'pandoc', 'templates');
}

function configDir(appName) {
  if (isMac) {
    return path.join(os.homedir(), 'Library', 'Application Support', appName);
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdgConfig, appName);
}

function installHint(tool) {
  const hints = {
    pandoc: {
      darwin: 'brew install pandoc',
      linux: 'sudo apt install pandoc',
    },
    pandoc_pdf: {
      darwin: 'brew install pandoc mactex-no-gui',
      linux: 'sudo apt install pandoc texlive-xetex texlive-fonts-recommended texlive-latex-extra',
    },
    weasyprint: {
      darwin: 'brew install weasyprint',
      linux: 'pip3 install weasyprint',
    },
    java: {
      darwin: 'brew install openjdk',
      linux: 'sudo apt install default-jre',
    },
    imagemagick: {
      darwin: 'brew install imagemagick',
      linux: 'sudo apt install imagemagick',
    },
  };

  const platformKey = isMac ? 'darwin' : 'linux';
  const toolHints = hints[tool];
  if (!toolHints) return `Install ${tool} manually.`;
  return toolHints[platformKey] || `Install ${tool} manually.`;
}

function externalTerminalCommand(workDir) {
  if (isMac) {
    return { cmd: 'open', args: ['-a', 'Terminal', workDir] };
  }
  return { cmd: 'gnome-terminal', args: ['--working-directory', workDir] };
}

module.exports = {
  isMac,
  isLinux,
  isWindows,
  shell,
  findBinary,
  pandocTemplatePaths,
  pandocTemplateInstallDir,
  configDir,
  installHint,
  externalTerminalCommand,
};

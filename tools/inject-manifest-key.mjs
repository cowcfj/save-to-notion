import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const options = {
    source: '',
    target: '',
    keyFile: '',
  };

  for (const arg of argv) {
    const [rawKey, ...rawValueParts] = arg.split('=');
    const value = rawValueParts.join('=');
    switch (rawKey) {
      case '--source':
        options.source = path.resolve(value);
        break;
      case '--target':
        options.target = path.resolve(value);
        break;
      case '--key-file':
        options.keyFile = path.resolve(value);
        break;
      default:
        throw new Error(`未知參數：${arg}`);
    }
  }

  if (!options.source || !options.target) {
    throw new Error('必須提供 --source 與 --target');
  }

  return options;
}

function readPublicKey(keyFile) {
  if (!keyFile || !fs.existsSync(keyFile)) {
    return null;
  }

  const key = fs.readFileSync(keyFile, 'utf8').trim();
  return key.length > 0 ? key : null;
}

function main() {
  const { source, target, keyFile } = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(fs.readFileSync(source, 'utf8'));
  const publicKey = readPublicKey(keyFile);

  if (publicKey) {
    manifest.key = publicKey;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  console.error(`❌ inject manifest key failed: ${error.message}`);
  process.exit(1);
}

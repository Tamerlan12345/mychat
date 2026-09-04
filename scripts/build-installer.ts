/**
 * Automated Desktop Installer Build Script & Packaging Pipeline
 *
 * Enforces Zero-Trust credential security checks, compiles Next.js and Electron
 * assets, executes electron-builder for Windows NSIS (.exe), and verifies
 * output artifact integrity (size and SHA256 checksum).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { spawnSync } from 'child_process';
import * as dotenv from 'dotenv';

// ANSI color helpers for clean console output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  bgRed: '\x1b[41m',
  white: '\x1b[37m',
};

interface BuildOptions {
  isDir: boolean;
  isDryRun: boolean;
  skipNext: boolean;
  skipElectron: boolean;
}

function parseCliArgs(): BuildOptions {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${colors.bold}${colors.cyan}Centras Chat - Desktop Installer Builder${colors.reset}

Usage:
  npx tsx scripts/build-installer.ts [options]

Options:
  --dir            Build unpacked directory instead of NSIS installer (fast testing)
  --dry-run        Validate environment and print execution plan without compiling
  --skip-next      Skip Next.js production compilation (use existing .next)
  --skip-electron  Skip Electron TypeScript compilation (use existing dist-electron)
  --help, -h       Show this help message
`);
    process.exit(0);
  }

  return {
    isDir: args.includes('--dir'),
    isDryRun: args.includes('--dry-run'),
    skipNext: args.includes('--skip-next'),
    skipElectron: args.includes('--skip-electron'),
  };
}

/**
 * Step 0: Load environment variables with explicit priority
 */
function loadEnvironment(): { loadedFiles: string[] } {
  const rootDir = process.cwd();
  const envFiles = [
    '.env.production.local',
    '.env.production',
    '.env.local',
    '.env',
  ];

  const loadedFiles: string[] = [];

  for (const file of envFiles) {
    const fullPath = path.join(rootDir, file);
    if (fs.existsSync(fullPath)) {
      dotenv.config({ path: fullPath, override: false });
      loadedFiles.push(file);
    }
  }

  return { loadedFiles };
}

/**
 * Safely parse and decode a JWT payload without verifying signature
 */
function parseJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.trim().split('.');
    if (parts.length !== 3) {
      return null;
    }
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = Buffer.from(base64, 'base64').toString('utf-8');
    const payload = JSON.parse(jsonStr);
    return typeof payload === 'object' && payload !== null ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Step 1: Zero-Trust Credential Leak Scanner
 * Inspects all NEXT_PUBLIC_* variables to ensure no secrets or database credentials leak.
 */
function runZeroTrustSecurityScan(): void {
  console.log(`\n${colors.bold}${colors.blue}[SECURITY] Running Zero-Trust credential leak scan...${colors.reset}`);

  const violations: Array<{ key: string; reason: string }> = [];
  const sensitivePatterns = [
    /service_role/i,
    /postgres(ql)?:\/\//i,
    /-----BEGIN (RSA )?PRIVATE KEY-----/i,
    /db_password/i,
    /database_url/i,
  ];

  const knownSecrets = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.DATABASE_URL,
    process.env.TELEGRAM_BOT_TOKEN,
    process.env.TELEGRAM_WEBHOOK_SECRET,
    process.env.TELEGRAM_WORKER_SECRET,
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY,
  ].filter((v): v is string => typeof v === 'string' && v.trim().length > 0);

  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('NEXT_PUBLIC_') || typeof value !== 'string') {
      continue;
    }

    const trimmedValue = value.trim();
    if (!trimmedValue) {
      continue;
    }

    // 1. Check if variable name suspiciously indicates a secret
    if (/(SECRET|PASSWORD|SERVICE_ROLE|PRIVATE_KEY)/i.test(key)) {
      violations.push({
        key,
        reason: 'Public variable name explicitly contains sensitive keyword (SECRET/PASSWORD/SERVICE_ROLE/PRIVATE_KEY)',
      });
      continue;
    }

    // 2. Check value against sensitive substrings
    for (const pattern of sensitivePatterns) {
      if (pattern.test(trimmedValue)) {
        violations.push({
          key,
          reason: `Value matches forbidden sensitive pattern (${pattern.toString()})`,
        });
        break;
      }
    }

    // 3. Inspect JWT tokens for administrative service_role payload
    const jwtPayload = parseJwtPayload(trimmedValue);
    if (jwtPayload) {
      if (jwtPayload.role === 'service_role' || JSON.stringify(jwtPayload).includes('service_role')) {
        violations.push({
          key,
          reason: 'JWT payload contains administrative "service_role" claim! Only "anon" role is permitted in public variables.',
        });
      }
    }

    // 4. Verify value does not match any known server-only secret
    for (const secret of knownSecrets) {
      if (trimmedValue === secret.trim()) {
        violations.push({
          key,
          reason: 'Public variable value is identical to a server-side secret key!',
        });
        break;
      }
    }
  }

  if (violations.length > 0) {
    console.error(`\n${colors.bgRed}${colors.white}${colors.bold} [FATAL SECURITY ERROR] ZERO-TRUST SCAN FAILED ${colors.reset}`);
    console.error(`${colors.red}Found ${violations.length} credential leak violation(s) in NEXT_PUBLIC_* variables:${colors.reset}\n`);

    for (const v of violations) {
      console.error(`  ${colors.bold}• Variable:${colors.reset} ${colors.yellow}${v.key}${colors.reset}`);
      console.error(`    ${colors.bold}Violation:${colors.reset} ${v.reason}\n`);
    }

    console.error(`${colors.red}Build aborted to prevent baking administrative credentials into the desktop installer.${colors.reset}`);
    console.error(`${colors.yellow}Fix: Keep administrative secrets in server environment variables without NEXT_PUBLIC_ prefix.${colors.reset}\n`);
    process.exit(1);
  }

  console.log(`${colors.green}✓ Zero-Trust scan passed: No secret keys or database credentials found in public variables.${colors.reset}`);

  // Log non-sensitive configuration status
  const targetUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '(none - built-in mock mode)';
  const hasAnonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  console.log(`  • Target Server:   ${colors.cyan}${targetUrl}${colors.reset}`);
  console.log(`  • Anon Key Status: ${hasAnonKey ? colors.green + 'Configured' : colors.yellow + 'Not set (Mock demo)'}${colors.reset}`);
}

/**
 * Step 2: Ensure required directories exist
 */
function ensureRequiredDirectories(): void {
  const dirs = [
    path.resolve(process.cwd(), 'public'),
    path.resolve(process.cwd(), 'build'),
    path.resolve(process.cwd(), 'dist-electron'),
    path.resolve(process.cwd(), 'dist-installer'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Ensure public has at least a .gitkeep so packaging never fails
  const gitkeep = path.resolve(process.cwd(), 'public', '.gitkeep');
  if (!fs.existsSync(gitkeep)) {
    fs.writeFileSync(gitkeep, '', 'utf-8');
  }
}

/**
 * Helper to run shell commands synchronously with standard IO
 */
function runCommand(command: string, args: string[], stepName: string): void {
  console.log(`\n${colors.bold}${colors.blue}[${stepName}]${colors.reset} Executing: ${colors.cyan}${command} ${args.join(' ')}${colors.reset}`);

  const isWindows = process.platform === 'win32';
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: isWindows,
  });

  if (result.error) {
    console.error(`${colors.red}[${stepName}] Process execution failed:${colors.reset}`, result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`${colors.red}[${stepName}] Command failed with exit code ${result.status}${colors.reset}`);
    process.exit(result.status ?? 1);
  }

  console.log(`${colors.green}✓ [${stepName}] Completed successfully.${colors.reset}`);
}

/**
 * Step 5: Verify output artifact, calculate SHA256 checksum and size
 */
function verifyArtifact(isDir: boolean): void {
  const distDir = path.resolve(process.cwd(), 'dist-installer');

  if (isDir) {
    const unpackedExe = path.join(distDir, 'win-unpacked', 'Centras Chat.exe');
    if (!fs.existsSync(unpackedExe)) {
      console.error(`${colors.red}Error: Unpacked executable not found at ${unpackedExe}${colors.reset}`);
      process.exit(1);
    }
    const stat = fs.statSync(unpackedExe);
    console.log(`\n${colors.bold}${colors.green}======================================================${colors.reset}`);
    console.log(`${colors.bold}${colors.green}  DESKTOP UNPACKED BUILD SUCCESSFUL                   ${colors.reset}`);
    console.log(`${colors.bold}${colors.green}======================================================${colors.reset}`);
    console.log(`  Path: ${colors.cyan}${unpackedExe}${colors.reset}`);
    console.log(`  Executable Size: ${colors.yellow}${(stat.size / (1024 * 1024)).toFixed(2)} MB${colors.reset}`);
    console.log(`${colors.bold}${colors.green}======================================================${colors.reset}\n`);
    return;
  }

  if (!fs.existsSync(distDir)) {
    console.error(`${colors.red}Error: Output directory ${distDir} does not exist.${colors.reset}`);
    process.exit(1);
  }

  const files = fs.readdirSync(distDir);
  const exeFiles = files
    .filter((f) => f.endsWith('.exe') && !f.startsWith('__uninstaller'))
    .map((f) => ({
      name: f,
      fullPath: path.join(distDir, f),
      stat: fs.statSync(path.join(distDir, f)),
    }))
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

  if (exeFiles.length === 0) {
    console.error(`${colors.red}Error: No installer .exe found in ${distDir}${colors.reset}`);
    process.exit(1);
  }

  console.log(`\n${colors.bold}${colors.green}======================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.green}       CENTRAS CHAT DESKTOP ARTIFACTS GENERATED SUCCESSFULLY          ${colors.reset}`);
  console.log(`${colors.bold}${colors.green}======================================================================${colors.reset}`);
  for (const installer of exeFiles) {
    const fileBuffer = fs.readFileSync(installer.fullPath);
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const sizeMb = (installer.stat.size / (1024 * 1024)).toFixed(2);
    console.log(`  ${colors.bold}Artifact Type:${colors.reset} ${installer.name.includes('Setup') ? 'NSIS Setup Wizard' : 'Portable Standalone (.exe)'}`);
    console.log(`  ${colors.bold}File Name:${colors.reset}     ${colors.white}${installer.name}${colors.reset}`);
    console.log(`  ${colors.bold}File Size:${colors.reset}     ${colors.yellow}${sizeMb} MB (${installer.stat.size.toLocaleString()} bytes)${colors.reset}`);
    console.log(`  ${colors.bold}SHA-256:${colors.reset}       ${colors.magenta}${hash}${colors.reset}`);
    console.log(`  ----------------------------------------------------------------------`);
  }
  console.log(`${colors.bold}${colors.green}======================================================================${colors.reset}\n`);
}

/**
 * Main build pipeline orchestrator
 */
async function main(): Promise<void> {
  const options = parseCliArgs();

  console.log(`${colors.bold}${colors.cyan}======================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  Centras Chat Desktop Installer Build Pipeline       ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}======================================================${colors.reset}`);

  // Step 0: Environment configuration
  const { loadedFiles } = loadEnvironment();
  if (loadedFiles.length > 0) {
    console.log(`Loaded environment file(s): ${colors.cyan}${loadedFiles.join(', ')}${colors.reset}`);
  } else {
    console.log(`${colors.yellow}Notice: No .env files found. Building with default mock/demo environment.${colors.reset}`);
  }

  // Step 1: Zero-Trust Security Scan
  runZeroTrustSecurityScan();

  // Step 2: Ensure directories
  ensureRequiredDirectories();

  if (options.isDryRun) {
    console.log(`\n${colors.bold}${colors.yellow}[DRY-RUN] Verification complete. The following commands would execute:${colors.reset}`);
    if (!options.skipNext) console.log(`  1. npx next build`);
    if (!options.skipElectron) console.log(`  2. npx tsc -p electron/tsconfig.json`);
    const builderArgs = ['electron-builder', '--win', '--x64'];
    if (options.isDir) builderArgs.push('--dir');
    console.log(`  3. npx ${builderArgs.join(' ')}`);
    console.log(`\n${colors.green}Dry-run successful.${colors.reset}\n`);
    return;
  }

  // Step 3: Next.js Production Compilation
  if (options.skipNext) {
    console.log(`\n${colors.yellow}[STEP 1/3] Skipping Next.js build (--skip-next passed)${colors.reset}`);
  } else {
    console.log(`\n${colors.bold}[STEP 1/3] Compiling Next.js production build...${colors.reset}`);
    runCommand('npx', ['next', 'build'], 'Next.js Build');
  }

  // Step 4: Electron TypeScript Compilation
  if (options.skipElectron) {
    console.log(`\n${colors.yellow}[STEP 2/3] Skipping Electron TypeScript compilation (--skip-electron passed)${colors.reset}`);
  } else {
    console.log(`\n${colors.bold}[STEP 2/3] Compiling Electron main and preload TypeScript...${colors.reset}`);
    runCommand('npx', ['tsc', '-p', 'electron/tsconfig.json'], 'Electron TypeScript Build');
  }

  // Step 5: Packaging with electron-builder
  console.log(`\n${colors.bold}[STEP 3/3] Packaging desktop installer with electron-builder...${colors.reset}`);
  const builderArgs = ['electron-builder', '--win', '--x64'];
  if (options.isDir) {
    builderArgs.push('--dir');
  }
  runCommand('npx', builderArgs, 'electron-builder');

  // Step 6: Artifact verification & checksum calculation
  verifyArtifact(options.isDir);
}

main().catch((err) => {
  console.error(`${colors.red}Unhandled error in build pipeline:${colors.reset}`, err);
  process.exit(1);
});

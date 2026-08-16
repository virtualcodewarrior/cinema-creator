// Fetches the sd.cpp (sd-cli) binary from stable-diffusion.cpp GitHub releases
// and installs it into the AI Cinema data directory (<AI_CINEMA_HOME>/bin).
//
// Usage: deno run --allow-all deno/scripts/fetch-binary.ts
// Skips the download if the binary is already present.

import { loadConfig } from "../lib/config.ts";
import { downloadFile } from "../storage/downloads.ts";

const RELEASE_API = "https://api.github.com/repos/leejet/stable-diffusion.cpp/releases/latest";

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

let BIN_DIR = "";

function fail(message: string): never {
  console.error(`[fetch-binary] ERROR: ${message}`);
  if (BIN_DIR) {
    console.error("[fetch-binary] You can also download the zip manually from");
    console.error("[fetch-binary] https://github.com/leejet/stable-diffusion.cpp/releases");
    console.error(`[fetch-binary] and extract it into ${BIN_DIR} (see README.md).`);
  }
  Deno.exit(1);
}

function pickAsset(assets: GitHubAsset[]): GitHubAsset {
  const { os, arch } = Deno.build;

  const winArch = arch === "x86_64" ? "x64" : arch;
  const matches = assets.filter((a) => {
    const name = a.name;
    if (!name.startsWith("sd-") || !name.endsWith(".zip")) return false;
    if (os === "linux") return name.includes("-bin-Linux-") && name.includes(arch);
    if (os === "darwin") return name.includes("-bin-Darwin-") && name.includes(arch);
    if (os === "windows") return name.includes("-bin-win-") && name.endsWith(`${winArch}.zip`);
    return false;
  });

  if (matches.length === 0) {
    fail(
      `No prebuilt release found for ${os} ${arch}. ` +
        "Build sd.cpp yourself (https://github.com/leejet/stable-diffusion.cpp) " +
        `and place the "sd-cli${
          os === "windows" ? ".exe" : ""
        }" binary plus its shared libraries in the bin directory.`,
    );
  }

  // Prefer the plain CPU build over accelerator variants (-vulkan, -rocm, -cuda).
  const plain = matches.find((a) => !/-(vulkan|cuda\d*|rocm[\d.]*)/i.test(a.name));
  return plain ?? matches[0];
}

async function run(cmd: string, args: string[]): Promise<void> {
  const proc = new Deno.Command(cmd, { args, stdout: "inherit", stderr: "piped" }).spawn();
  const statusPromise = proc.status;
  const stderrPromise = new Response(proc.stderr).text().catch(() => "");
  const status = await statusPromise;
  if (!status.success) {
    const stderr = (await stderrPromise).trim();
    throw new Error(`${cmd} ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
  }
}

async function download(url: string, destPath: string): Promise<void> {
  let lastPct = -1;
  await downloadFile(
    url,
    destPath,
    (p) => {
      const pct = Math.min(100, Math.floor(p * 100));
      if (pct !== lastPct) {
        lastPct = pct;
        console.log(`[fetch-binary] Downloading... ${pct}%`);
      }
    },
  );
}

async function main(): Promise<void> {
  const config = loadConfig();
  const binDir = `${config.dataDir}/bin`;
  BIN_DIR = binDir;
  const binaryName = Deno.build.os === "windows" ? "sd-cli.exe" : "sd-cli";
  const binaryPath = `${binDir}/${binaryName}`;

  try {
    await Deno.stat(binaryPath);
    console.log(`[fetch-binary] sd.cpp binary already present at ${binaryPath} — nothing to do.`);
    // Clean up a zip left behind by an interrupted run.
    try {
      await Deno.remove(`${binDir}/sd-cli-bin.zip`);
    } catch {
      // Ignore.
    }
    return;
  } catch {
    // Not installed yet, proceed.
  }

  console.log(
    `[fetch-binary] Fetching latest stable-diffusion.cpp release for ${Deno.build.os}/${Deno.build.arch} ...`,
  );
  const releaseResponse = await fetch(RELEASE_API);
  if (!releaseResponse.ok) {
    fail(`Could not fetch release info (HTTP ${releaseResponse.status}). Is GitHub reachable?`);
  }
  const release = (await releaseResponse.json()) as { tag_name: string; assets: GitHubAsset[] };
  const asset = pickAsset(release.assets);
  const sizeMB = (asset.size / 1048576).toFixed(0);
  console.log(`[fetch-binary] Release ${release.tag_name} — ${asset.name} (~${sizeMB} MB)`);

  try {
    await Deno.mkdir(binDir, { recursive: true });
  } catch {
    // Already exists.
  }

  // A failed/interrupted run leaves sd-cli-bin.zip(.part) behind so the
  // next run resumes the download instead of starting over.
  const zipPath = `${binDir}/sd-cli-bin.zip`;
  await download(asset.browser_download_url, zipPath);
  console.log("[fetch-binary] Extracting...");
  try {
    await run("unzip", ["-o", zipPath, "-d", binDir]);
  } catch {
    // unzip may not exist (e.g. Windows); fall back to tar (bsdtar handles zip).
    await run("tar", ["-xf", zipPath, "-C", binDir]);
  }
  await Deno.remove(zipPath);

  let installed: boolean;
  try {
    await Deno.stat(binaryPath);
    installed = true;
  } catch {
    installed = false;
  }
  if (!installed) {
    fail(`Download finished but ${binaryPath} was not found after extraction.`);
  }

  if (Deno.build.os !== "windows") {
    await new Deno.Command("chmod", { args: ["755", binaryPath] }).output();
  }

  console.log(`[fetch-binary] Installed ${binaryPath}`);
  console.log("[fetch-binary] Done. Model weights are downloaded separately via the app (Settings → Models).");
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));

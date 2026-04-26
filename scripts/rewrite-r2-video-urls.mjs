import { resolveR2Config } from "./lib/config.mjs";
import { buildMirrorVideoUrl, loadMirrorManifest, writeMirrorManifest } from "./lib/video-source.mjs";

function main() {
  const r2Config = resolveR2Config({ requirePublicUrl: true });
  const manifest = loadMirrorManifest(r2Config.manifestPath);
  let rewritten = 0;

  for (const item of Object.values(manifest.items || {})) {
    if (!item?.objectKey) {
      continue;
    }

    const nextUrl = buildMirrorVideoUrl(r2Config.publicUrlBase, item.objectKey);

    if (item.mirrorVideoUrl !== nextUrl) {
      item.mirrorVideoUrl = nextUrl;
      rewritten += 1;
    }
  }

  writeMirrorManifest(r2Config.manifestPath, manifest);
  console.log(`Rewrote ${rewritten} R2 mirror URLs to ${r2Config.publicUrlBase}`);
  console.log(`Manifest: ${r2Config.manifestPath}`);
}

main();

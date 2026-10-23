import { lstat, mkdir, readlink, realpath, rename, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const root = await realpath(new URL("..", import.meta.url).pathname);
const names = ["eatclub", "flights"];
const bases = [
  join(homedir(), "skills"),
  join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "skills"),
  join(homedir(), ".claude", "skills"),
];
for (const base of bases) {
  await mkdir(base, { recursive: true });
  for (const name of names) {
    const target = join(root, "skills", name),
      dest = join(base, name);
    const existing = await lstat(dest).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return null;
    });
    if (existing?.isSymbolicLink() && resolve(base, await readlink(dest)) === target) continue;
    if (existing) {
      const backup = `${dest}.backup-${Date.now()}`;
      await rename(dest, backup);
      console.error(`Backed up ${dest} to ${backup}`);
    }
    await symlink(target, dest, "dir");
    console.log(`${dest} -> ${target}`);
  }
}

import { lstat, mkdir, readdir, readlink, realpath, rename, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const root = await realpath(new URL("..", import.meta.url).pathname);
const names: string[] = [];
for (const entry of await readdir(join(root, "skills"), { withFileTypes: true })) {
  if (entry.isDirectory() && (await Bun.file(join(root, "skills", entry.name, "SKILL.md")).exists()))
    names.push(entry.name);
}
const backups = join(homedir(), ".local", "state", "skills", "backups");
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
      await mkdir(backups, { recursive: true });
      const backup = join(backups, `${base.replaceAll("/", "_")}-${name}-${Date.now()}`);
      await rename(dest, backup);
      console.error(`Backed up ${dest} to ${backup}`);
    }
    await symlink(target, dest, "dir");
    console.log(`${dest} -> ${target}`);
  }
}

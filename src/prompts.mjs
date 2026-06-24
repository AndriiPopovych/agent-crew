import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { OPT_ROLES } from "./config.mjs";

export function parseYesNo(answer, dflt) {
  const a = answer.trim().toLowerCase();
  if (a === "") return dflt;
  return a === "y" || a === "yes";
}

export function parseRoleToggles(csv) {
  const chosen = new Set(
    csv
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return Object.fromEntries(OPT_ROLES.map((r) => [r, chosen.has(r)]));
}

export async function runInitPrompts(detected) {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    console.log(`\nВиявлено: ${detected.runtime.package_manager} · порт ${detected.devserver.port}`);
    console.log(`Команди: dev='${detected.commands.dev}' build='${detected.commands.build}'`);
    const ok = parseYesNo(await rl.question("Прийняти ці команди/порт? [Y/n] "), true);
    let commands = detected.commands;
    let port = detected.devserver.port;
    if (!ok) {
      commands = { ...commands };
      commands.dev = (await rl.question(`dev [${commands.dev}]: `)) || commands.dev;
      commands.build = (await rl.question(`build [${commands.build}]: `)) || commands.build;
      const p = await rl.question(`port [${port}]: `);
      if (p.trim()) port = Number(p);
    }
    const roles = parseRoleToggles(
      await rl.question("Опц. ролі (через кому: ux,architect,techwriter) [порожньо = жодної]: ")
    );
    const language = (await rl.question("Мова агентів [ua]: ")).trim() || "ua";
    return { commands, port, roles, language };
  } finally {
    rl.close();
  }
}

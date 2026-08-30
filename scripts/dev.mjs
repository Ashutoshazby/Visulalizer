import { spawn } from "node:child_process";

const processes = [
  spawn(process.execPath, ["--openssl-legacy-provider", "server/index.js"], { stdio: "inherit" }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "0.0.0.0"], { stdio: "inherit" })
];

const stop = () => {
  for (const child of processes) child.kill();
};

process.on("SIGINT", () => {
  stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stop();
  process.exit(0);
});

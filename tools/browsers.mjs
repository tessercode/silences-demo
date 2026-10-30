// The browser engine for the Playwright tools: --browser=chromium (default), firefox or webkit (Safari's
// engine). Returns the launcher and the arguments with the flag removed.
import * as pw from "playwright";

export function browserFromArgs(argv = process.argv.slice(2)) {
  const flag = argv.find((a) => a.startsWith("--browser="));
  const name = flag ? flag.split("=")[1] : "chromium";
  if (!["chromium", "firefox", "webkit"].includes(name)) throw new Error(`unknown browser ${name}`);
  return { name, engine: pw[name], args: argv.filter((a) => a !== flag) };
}

#!/usr/bin/env node

// #vi: filetype=js
const fs = require("fs");
const cproc = require("child_process");
(async () => {
  try {
    let ps = await cproc.spawnSync("sort", [
      "-u",
      process.env.HOME + "/bin/manifest.txt",
    ]);
    let files = ps.stdout.toString().split("\n").filter(String);
    let output = JSON.stringify({ files }, null, 2);
    await fs.writeFileSync("./manifest.json", output + "\n");
    console.log(`[+] wrote ${files.length} file name(s) to ./manifest.json`);
  } catch (e) {
    console.error("-- error --");
    console.error(`exception: `, e);
    console.error("-----------");
  }
  {
    let ps = require("./manifest.json");
    let files = ps.files;
    let base_dir = process.env.HOME + "/bin/";
    for (const fn of ps.files) {
      let cpout = await cproc.spawnSync("cp", [base_dir + fn, "./" + fn]);
      if (
        cpout.stderr?.toString &&
        cpout.stderr.toString().replace(/^\s+\s+$/, "").length
      ) {
        console.error(
          `error: '${cpout.stderr.toString()}' when processing: '${base_dir}${fn}'`
        );
      } else {
        console.info(`[+] Copied ${fn}`);
      }
    }
  }
})();

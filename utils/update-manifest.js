#!/usr/bin/env node

// #vi: filetype=js
const fs = require("fs");
const cproc = require("child_process");
const script_dir = __dirname;
(async () => {
  try {
    let ps = await cproc.spawnSync("sort", [
      "-u",
      process.env.HOME + "/bin/manifest.txt",
    ]);
    let files = ps.stdout.toString().split("\n").filter(String);
    let output = JSON.stringify({ files }, null, 2);
    await fs.writeFileSync(`${script_dir}/manifest.json`, output + "\n");
    console.log(
      `[+] wrote ${files.length} file name(s) to ${script_dir}/manifest.json`
    );
  } catch (e) {
    console.error("-- error --");
    console.error(`exception: `, e);
    console.error("-----------");
  }
  {
    /**
     * This copies all files regardless of extension. Though they do have to exist
     * inside the manifest.json. It copies it to the util directory in the psend
     * repo.
     */
    let ps = require(`${script_dir}/manifest.json`);
    let files = ps.files;
    let base_dir = process.env.HOME + "/bin/";
    for (const fn of ps.files) {
      let cpout = await cproc.spawnSync("cp", [
        base_dir + fn,
        `${script_dir}/${fn}`,
      ]);
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
  {
    /**
     * A script to generate listtransactions output
     */
    let SCRIPT = [
      "#!/bin/bash",
      "pushd $PWD",
      "# han, luke, chewie, psend, foobar",
      "#",
      "cd ~/docs/",
      "for u in df dh dl dp dche; do ",
      '~/bin/"$u"tx.sh 2000 > ~/docs/"$u"-txn-staged.json',
      "done",
      "cd ~/docs/",
      "git add ./*-txn-staged.json",
      'git commit -m "chore: update staged txns"',
      "popd",
    ].join("\n");
    await fs.writeFileSync("/tmp/foo", SCRIPT);
    await cproc.spawnSync("chmod", ["+x", "/tmp/foo"]);
    let ps = await cproc.spawnSync("/tmp/foo");
    console.debug(ps.stdout.toString());
    console.debug(ps.stderr.toString());
  }
  async function get_priv_key(fileName,address){
    let file = process.env.HOME + '/bin/' + fileName.substr(0,2);
    if(fileName.substr(0,2) === 'dc'){
      file = process.env.HOME + '/bin/dche';
    }
    let ps = await cproc.spawnSync(file,['dumpprivkey',address]);
    let privateKey = ps.stdout.toString();
    let script = file;
    if(privateKey.length){
      return privateKey;
    }
    //console.info(`[+] ${script} private key for "${address}": '${privateKey}'`);
    if(ps.stderr?.toString && ps.stderr.toString().replace(/^\s+\s+$/,'').length){
      console.error(`Exception: '${ps.stderr.toString()}'`);
    }
  }
  {
    /**
     * Process all files in ~/docs/*-denominations.json
     */

    let dir = process.env.HOME + "/docs";
    let { readdir } = require("fs/promises");
    let files = await readdir(dir);
    let keep = [];
    let sorted = {};
    for (const file of files) {
      if (file.match(/^[a-z]{2}\-txn\-staged\.json$/) || file.match(/^dche\-txn\-staged\.json$/)) {
        sorted = {};
        let finalName = `${dir}/${file.substr(0, 2)}-denominations.json`;
        if(file.substr(0,4) === 'dche'){
          finalName = `${dir}/${file.substr(0,4)}-denominations.json`;
        }
        let fullName = `${dir}/${file}`;
        let contents = require(fullName);
        keep = [];
        for (let entry of contents) {
          if (entry.category === "receive" && entry.amount === 1.00001) {
            if (typeof sorted[entry.address] === "undefined") {
              sorted[entry.address] = {
                transactions: [],
                privateKey: await get_priv_key(
                  file,
                  entry.address
                ),
              };
            }
            sorted[entry.address].transactions.push({
              txid: entry.txid,
              vout: entry.vout,
              amount: entry.amount,
              confirmations: entry.confirmations,
            });
          }
        }
        await fs.writeFileSync(finalName, JSON.stringify(sorted, null, 2));
        console.info(
          `[+] Wrote ${
            JSON.stringify(sorted, null, 2).length
          } bytes to ${finalName}`
        );
      }
    }
  }
  {
    /**
     * A script to generate listtransactions output
     */
    let SCRIPT = [
      "#!/bin/bash",
      "cd ~/docs/",
      "for u in df dh dl dp dche; do ",
      '   git add ~/docs/"$u"-denominations.json',
      "done",
      'git commit -m "chore: update denominations json"',
    ].join("\n");
    await fs.writeFileSync("/tmp/foo", SCRIPT);
    await cproc.spawnSync("chmod", ["+x", "/tmp/foo"]);
    let ps = await cproc.spawnSync("/tmp/foo");
    console.debug(ps.stdout.toString());
    console.debug(ps.stderr.toString());
  }
})();

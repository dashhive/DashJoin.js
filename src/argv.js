#!/usr/bin/env node
"use strict";
let Lib = {};
module.exports = Lib;
Lib.extractOption = function(opt, capture = false) {
  /**
   * opt should be something like: 'instance-name'.
   * Then extractOption would look in process.argv for
   * --instance-name.
   *
   * if capture is truth-y, extractOption will look for
   * --instance-name=N and will return a the value of N
   *
   */
  for (const arg of process.argv) {
    let regex = "^--" + opt;
    if (capture) {
      let regex = "^--" + opt + "=(.*)$";
      let match = arg.match(regex);
      if (match) {
        return match[1];
      }
    }
    let match = arg.match(regex);
    if (match) {
      return match;
    }
  }
  return null;
}

let Lib = {};
module.exports = Lib;

const crypto = require('crypto');
Lib.GetRandInt = function (max) {
	return crypto.randomInt(max);
};

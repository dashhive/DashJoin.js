/**
 * A port of DASH core's CCoinJoinClientManager
 */

let Lib = {};
module.exports = Lib;
const crypto = window.crypto || require('crypto');

Lib.getRandomIntInclusive = function(min, max) {
	    const randomBuffer = new Uint32Array(1);

	    crypto.getRandomValues(randomBuffer);

	    let randomNumber = randomBuffer[0] / (0xffffffff + 1);

	    min = Math.ceil(min);
	    max = Math.floor(max);
	    return Math.floor(randomNumber * (max - min + 1)) + min;
};

Lib.GetRandInt = function(max){
	return Lib.getRandomIntInclusive(1,max);
};

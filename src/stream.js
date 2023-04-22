/**
 * A port of DASH core's CoinJoin client
 */


let Lib = {};
module.exports = Lib;
// std::map<const std::string, std::shared_ptr<CCoinJoinClientManager>> coinJoinClientManagers;
Lib.NetMsgType = require('net-msg.js').NetMsgType;

Lib.CDataStream = {};
//typedef CSerializeData vector_type;
// Orig: vector_type vch;
Lib.vch = require('vector.js');

//Orig: unsigned int nReadPos;
Lib.nReadPos = 0;
// Orig: int nType;
Lib.nType = 0;
// Orig: int nVersion;
Lib.nVersion;

Lib.Init = function(nTypeIn, nVersionIn) {
		Lib.nReadPos = 0;
		Lib.nType = nTypeIn;
		Lib.nVersion = nVersionIn;
};

Lib.read = function (obj) {
	/**
	 * Orig:
    template<typename T>
    CDataStream& operator>>(T&& obj)
    {
        // Unserialize from this stream
        ::Unserialize(*this, obj);
        return (*this);
    }
		*/
};

/**
 * A port of DASH core's CCoinJoinClientManager
 */

let HardDrive = {
	GetDataDir: function(){
		return './';//FIXME
	},
	CheckDiskSpace: function(dir) {
		/**
		 * TODO: FIXME: if not enough space, return false
		 */
		return true; //FIXME
	},
};

module.exports = HardDrive;

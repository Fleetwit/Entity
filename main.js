var colonyClass 		= require('./colony').colony;
var Fleet 				= require('./fleet').fleet;

var portUpdater = -30;

/*
	Start the colony
*/
var colony 				= new colonyClass();
colony.range 			= [8080,8084];
colony.portUpdater		= portUpdater;
colony.connect(function(instance) {
	/*
		Start the server
	*/
	
	var server 			= new Fleet();
	colony.sInstance 	= server;
	server.max			= 2;	// max user per instance
	server.port			= instance.port+portUpdater;
	server.host			= instance.host;
	server.colony 		= colony;
	server.init();
});

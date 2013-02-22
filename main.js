var colonyClass 	= require('./colony').colony;

var colony 		= new colonyClass();
colony.range 	= [8081,8084];
colony.connect();
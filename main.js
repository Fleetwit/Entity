var colonyClass 		= require('./colony').colony;
var Fleet 				= require('./fleet').fleet;
var mysql				= require('mysql');

console.log("Starting server for race #"+process.argv[2]);
console.log('Connecting to Database...');
var sqlInstance = mysql.createConnection({
	host     : 'localhost',
	user     : 'root',
	password : '',
	database : 'fleetwit'
});

sqlInstance.connect(function(err) {
	console.log("MySQL: Connected.");
	server_init();
});


function server_init() {
	var raceid 		= process.argv[2];
	var portUpdater = -30;
	
	var raceData;
	
	/*
		Get race infos
	*/
	sqlInstance.query('select * from races where id='+raceid, function(err, rows, fields) {
		if (err) throw err;
		raceData = rows[0];
		console.log('Race: ', raceData.title);
		console.log('Start (timestamp): ', raceData.start_time);
		console.log('Start (String): ', new Date(raceData.start_time*1000));
		console.log('Max Players: ', raceData.maxplayers);
		
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
			server.max			= 500;	// max user per instance
			server.port			= instance.port+portUpdater;
			server.host			= instance.host;
			server.sql			= sqlInstance;
			server.colony 		= colony;
			server.raceData		= raceData;
			server.init();
		});
	});
	
}


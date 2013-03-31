var colonyClass 		= require('./colony').colony;
var Fleet 				= require('./fleet').fleet;
var mysql				= require('mysql');
var chatserver 			= require('./chatserver').chatserver;
var http 				= require('http');
var qs 					= require('querystring');


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
	var games;
	
	/*
		Get race infos
	*/
	sqlInstance.query('select * from races where id='+raceid, function(err, rows, fields) {
		if (err) throw err;
		raceData = rows[0];
		console.log('Time: ',  new Date());
		console.log('Race: ', raceData.title);
		console.log('Start (timestamp): ', raceData.start_time);
		console.log('Start (String): ', new Date(raceData.start_time*1000));
		console.log('Max Players: ', raceData.maxplayers);
		
		sqlInstance.query('select g.name, g.classname,g.id, a.settings from games as g, races_games_assoc as a where g.id=a.gid and a.rid='+raceData.id, function(err, rows, fields) {
			if (err) throw err;
			games = rows;
			
			console.log("games",games);
			
			/*
				Start the chat
			*/
			var chat = new chatserver(sqlInstance);
			chat.init();
			
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
				server.games		= games;
				server.init();
				
				// Create admin interface
				http.createServer(function (req, httpserver) {
					console.log("****************************************************************");
					
					httpserver.writeHead(200, {"Content-Type": "application/json"});
					var querystring = req.url.split("?");
					var arg;
					if (querystring.length > 1) {
						arg = qs.parse(querystring[1]);
					} else {
						arg = qs.parse(req.url);
					}
					if (arg.reboot) {
						server.server.broadcast({
							system: {
								reboot:	true
							}
						},[]);
						httpserver.write(JSON.stringify({rebooted: true}));
					} else {
						httpserver.write("Query unrecognized.");
					}
					httpserver.end();
					
				}).listen(8600);
			});
		});
		
	});
	
}


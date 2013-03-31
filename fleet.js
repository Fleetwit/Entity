var simpleserver 		= require('./simpleserver').simpleserver;
var simpleclient 		= require('./simpleclient').simpleclient;


function fleet() {
	this.colony 	= false;	// no colony yet
	this.port		= 0;		// port
	this.host		= "";		// Hostname
	this.max		= 2000;		// Max number of users per server. if more users connect, they will be sent to another serer instance.
	this.serverChangeRequests = {};	// used to track server change requests (when a server is full)
	this.users		= {};
	this.perlevel	= {};
}
// Receiving data from the Colony
fleet.prototype.onReceive = function(data) {
	if (data.available && data.available === true && !this.serverChangeRequests[data.uuid]) {
		this.log("Found a server:", data);
		// Save the fact that we just received an available server (so that other servers who aare available will be ignored, to not send the same user to more than one server. First to answer get the user.)
		this.serverChangeRequests[data.uuid] = data;
		this.server.send(data.uuid, {
			serverchange:	{
				host:	data.host,
				port:	data.port
			}
		});
	}
};
fleet.prototype.init = function() {
	var scope = this;
	var i;
	if (!this.colony) {
		this.log("You are not part of a colony yet");
		return false;
	}
	
	// Tell the colony what is the max number of users we can accept
	this.colony.max = this.max;
	
	this.log("Starting server on port "+this.port);
	
	// Share the number of online users
	this.onlineCount	= this.colony.share("online", 0);
	if (this.onlineCount === false) {
		this.onlineCount	= this.colony.shared["online"];
		this.log("We already have this var in memory: ",this.onlineCount.value);
	}
	
	// Share the number of users on each level
	for (i=0;i<this.games.length;i++) {
		this.perlevel[i]		= this.colony.share("level_"+i, 0);
		if (this.perlevel[i] === false) {
			this.perlevel[i]	= this.colony.shared["level_"+i];
			this.log("We already have this var in memory: ",this.perlevel[i].value);
		}
	}
	
	// Share the user list
	this.users	= this.colony.share("users", {});
	if (this.users === false) {
		this.users			= this.colony.shared["users"];
		this.log("We already have this var in memory: ",this.users.value);
	}
	
	this.server = new simpleserver(this.port, {
		alias:		"SERVER@FLEET:"+this.port,	// To display on the console
		onConnect:	function(client) {
			scope.log("Connected.","Client ID:" + client.uid, "Online on this instance:" + scope.server.ocount);
			
			// Save the current number of online user.
			// The Entity needs to be able to know how many users are online, to know if it can volunteer to receive more users.
			scope.colony.ocount = scope.server.ocount;
			
			// Update the shared memory (total number of online users accross the colony)
			scope.onlineCount.add(1);
			
			// Check if there is still place on this server
			if (scope.server.ocount > scope.max) {
				scope.log("Max number of users reached. Sending user to another server...");
				// Tell the rest of the colony we are full. Any available entity will volunteer to receive the user.
				scope.colony.broadcast({
					full:	true,
					uuid:	client.uid	// sending the user's UUIDv4, to know who is available for him
				});
				return true;
			}
			
			// Send auth request: Auth and update on the number of users online
			scope.server.send(client.uid, [
				"auth",
				{
					online:	scope.onlineCount.value
				}
			]);
		},
		onReceive:	function(client, data) {
			//scope.log("Message from #"+client.uid+":", data);
			switch (data) {
				case "ping":
					scope.server.send(client.uid, "pong");
				break;
				default:
					if (data.auth) {
						// If the user provides an authtoken
						if (data.auth.demo) {
							scope.demomode	= true;
						} else {
							scope.demomode	= false;
						}
						if (data.auth.authtoken) {
							// Save the authtoken
							client.authtoken	= data.auth.authtoken;
							// Check Auth Token validity in the database
							scope.sql.query("select * from authtokens where token='"+client.authtoken+"' and validity > "+(new Date().getTime()/1000), function(err, rows, fields) {
								if (err) throw err;
								if (rows.length > 0 && rows[0].id > 0) {
									scope.info("Auth Token validated: ","UID: \t\t"+rows[0].uid,"Token: \t"+rows[0].token,"Validity: \t"+new Date(rows[0].validity*1000).toISOString());
									scope.info(new Date(),new Date(scope.raceData.start_time*1000));
									// register the user
									var tmpObject = {};
									tmpObject[client.uid] = {
										token:		client.uid,
										uid:		rows[0].uid,
										authtoken:	rows[0].token,
										validity:	rows[0].validity,
										level:		0
									};
									scope.users.push(tmpObject);
									
									// Check if the user is registered to the race
									scope.sql.query("select * from races_registrations where uid='"+rows[0].uid+"' and rid="+scope.raceData.id, function(err, rows, fields) {
										if (err) throw err;
										if (rows.length > 0 && rows[0].id > 0) {
											// register the user on the race
											// Is the user already in the database, meaning he already played?
											scope.sql.query("select * from races_scores where rid='"+scope.raceData.id+"' and uid='"+scope.users.value[client.uid].uid+"'", function(err, rows, fields) {
												if (rows.length == 0) {
													// register the user's participation
													scope.sql.query("insert into races_scores (rid,uid,start_time) values ('"+scope.raceData.id+"','"+scope.users.value[client.uid].uid+"','"+Math.round(new Date().getTime()/1000)+"')", function(err, rows, fields) {
														// Send to the client his UID (UUIDv4)
														scope.server.send(client.uid, {
															uid:		client.uid,
															start:		scope.raceData.start_time,
															seconds:	Math.floor((new Date(scope.raceData.start_time*1000)-new Date())/1000),
															mseconds:	(new Date(scope.raceData.start_time*1000)-new Date())
														});
														// Broadcast the updated number of online users
														scope.server.broadcast({
															online:		scope.onlineCount.value
														}, [client.uid]);
													});
												} else {
													// Check if the user is just reconnecting from a lost connection
													scope.sql.query("select * from races_scores where rid='"+scope.raceData.id+"' and uid='"+scope.users.value[client.uid].uid+"' and score=0", function(err, rows, fields) {
														scope.log("######################################################","select * from races_scores where rid='"+scope.raceData.id+"' and uid='"+scope.users.value[client.uid].uid+"' and score=0",rows);
														if (rows.length == 0 && !data.auth.demo) {
															// User was registered and already has a score for this race
															scope.server.send(client.uid, {
																played:		true
															});
															scope.server.close(client.uid);
														} else {
															// user is reconnecting, we need to let him play
															scope.server.send(client.uid, {
																welcomeback:true,
																uid:		client.uid,
																start:		scope.raceData.start_time,
																seconds:	Math.floor((new Date(scope.raceData.start_time*1000)-new Date())/1000),
																mseconds:	(new Date(scope.raceData.start_time*1000)-new Date())
															});
															// Broadcast the updated number of online users
															scope.server.broadcast({
																online:		scope.onlineCount.value
															}, [client.uid]);
														}
													});
													
												}
											});
										} else {
											scope.server.send(client.uid, {
												notregistered:		true
											});
											scope.server.close(client.uid);
										}
									});
									
								} else {
									// Send the 'invalid_token' error to the user
									scope.server.send(client.uid, {
										invalid_token:		client.authtoken
									});
								}
							});
							
						}
					}
					if (data.available && data.available === true) {
						if (data.uuid = client.uid) {
							// this is for us
							
						}
					}
					if (data.setlevel != undefined) {
						var perlevel_update = {};	// buffer for the broadcast
						
						// Update the user count on each level
						if (data.setlevel > 0) {
							scope.perlevel[data.setlevel-1].substract(1);
							perlevel_update[data.setlevel-1] = scope.perlevel[data.setlevel-1].value;
						}
						scope.perlevel[data.setlevel].add(1);
						perlevel_update[data.setlevel] = scope.perlevel[data.setlevel].value;
						scope.users.setsub({
							label:	client.uid,
							prop:	"level",
							value:	data.setlevel
						});
						
						// Braodcast the new user count
						scope.server.broadcast({
							perlevel:	perlevel_update
						});
					}
					if (data.scoredump) {
						var perlevel_update = {};	// buffer for the broadcast
						
						var totalscore = 0;
						for (i in data.scoredump) {
							if (!isNaN(data.scoredump[i].score)) {
								totalscore += data.scoredump[i].score;
							}
						}
						// unregister from this level
						if (scope.perlevel[data.quitlevel] && scope.perlevel[data.quitlevel].substract) {
							scope.perlevel[data.quitlevel].substract(1);
						
							perlevel_update[data.quitlevel] = scope.perlevel[data.quitlevel].value;
							
							scope.server.broadcast({
								perlevel:	perlevel_update
							});
						}
						
						
						scope.info("SCORE SENT: ", totalscore);
						// Register the score
						if (!scope.demomode) {
							scope.sql.query("update races_scores set score="+totalscore+", log='"+JSON.stringify(data.scoredump)+"', end_time='"+Math.round(new Date().getTime()/1000)+"' where uid="+scope.users.value[client.uid].uid+" and rid="+scope.race.id, function(err, rows, fields) {
								
							});
						} else {
							scope.info("User in demo mode. Score won't be saved.");
						}
						
					}
				break;
			}
		},
		onQuit:	function(client) {
			scope.log("Client Quit:", client.uid);
			// remove the user from the list
			scope.log("**********************************************************************");
			scope.log("**********************************************************************");
			
			if (scope.users.value[client.uid].level && scope.perlevel[scope.users.value[client.uid].level]) {
				scope.perlevel[scope.users.value[client.uid].level].substract(1);
			}
			
			scope.users.remove(client.uid);
			
			scope.onlineCount.substract(1);
			scope.server.broadcast({
				online:		scope.onlineCount.value
			});
			// Save the current number of online user.
			// The Entity needs to be able to know how many users are online, to know if it can volunteer to receive more users.
			scope.colony.ocount = scope.server.ocount;
		}
	});
};
fleet.prototype.log = function(){
	var red, blue, reset;
	red   	= '\u001b[31m';
	blue  	= '\u001b[34m';
	green  	= '\u001b[32m';
	reset 	= '\u001b[0m';
	console.log(green+"<FLEET>");
	for (i in arguments) {
		console.log(reset, arguments[i],reset);
	}
};
fleet.prototype.info = function(){
	var red, blue, reset;
	red   	= '\u001b[31m';
	blue  	= '\u001b[34m';
	green  	= '\u001b[32m';
	reset 	= '\u001b[0m';
	console.log(green+"<FLEET>");
	for (i in arguments) {
		console.log(blue, arguments[i],reset);
	}
};


exports.fleet = fleet;
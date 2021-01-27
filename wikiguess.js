/**
 * Server-side logic
 */
var io; // Reference to the Socket.io library
var gameSocket; // Reference to the Socket.io object for the connected client
var gameData = {};
var connections = {}; // Keep track of all socket connections, as well as the room they are in

/* CONSTANTS */
const MAX_PLAYERS = 10;
/*
gameData is a json that contains the status of all ongoing games (Time Trials, Public, and Private)
Hopefully, it will be periodically backed up to a database, but for quick access it is also stored locally
It is first indexed by the room-id. In the case of a Public or Private game, this would be a 4-digit CODE.

*/

// DATABASE CONNECTION
const MongoClient = require('mongodb').MongoClient;
const uri = "mongodb+srv://mjerdee:doorknob2468!@cluster0.zmzmc.mongodb.net/Cluster0?retryWrites=true&w=majority"
const client = new MongoClient(uri, options={useUnifiedTopology: true});

/**
 * Called the first time wikiguess.js is used (only once)
 * in order to initially connect to the MongoDB cluster
 */
async function main(){
  try {
    // Connect to the MongoDB cluster
    await client.connect();
    console.log('MongoDB Connected')
  } finally {
    // Close the connection to the MongoDB cluster (maybe eventually?)
  }
}
main().catch(console.error) // Unsure what this is about tbh

/**
 * This function is called by index.js to initialize a new game instance.
 * Binds various Socket.IO messages sent by the client (app.js)
 * to server-side functions in this file.
 *
 * @param sio The Socket.IO library
 * @param socket The socket object for the connected client.
 */
exports.initGame = function(sio, socket, address){
  // Saves the Socket.IO arguments to the global variables
  io = sio; 
  gameSocket = socket;
  connections[socket.id] = {'room':'none','socket':socket}
  console.log('Added ' + socket.id) 
  console.log(Object.keys(connections))
  gameSocket.emit('connected', {'address': address}); // Tell client server is live
  gameSocket.on('disconnect', disconnect);
  // General Events (API)
  gameSocket.on('submitFeedback', submitFeedback);
  gameSocket.on('newQuestion', newQuestion); // Emitted by the client-side App.newQuestion()
  gameSocket.on('submitAnswer', submitAnswer); // Emitted by the client-side App.newQuestion()
  // Landing Events
  gameSocket.on('hostGame', hostGame); 
  gameSocket.on('joinGame', joinGame); 
  // Debug Events
  // Routing
  gameSocket.on('handleLanding',handleLanding)
}
function disconnect(){ // This isn't a great way to do this, but having trouble identifying where the disconnect event came from.
  for (let [key, value] of Object.entries(connections)) {
    if(!value.socket.connected){
      console.log(`Removed ${key}`)
      if(value.room != 'none'){
        if(Object.keys(gameData).includes(value.room)){
          for(var i = 0; i < gameData[value.room].players.length; i++){
            if(gameData[value.room].players[i].socket_id == key && gameData[value.room].players[i].present){
              gameData[value.room].players[i].present = false
              io.to(value.room).emit('updatePlayerState',{'gameState':gameData[value.room]})
              console.log(`Notified the room ${value.room}`)
            }
          }
        }else{
          console.log(`No room ${value.room} to notify`)
        }
      }
      delete connections[key]
    }
  }
}
/**API
 * Functions called by all sorts of screens 
 */
/**
 * @returns Random question drawn from database
 */
async function getQuestionById(question_id){
  var result = {}
  try {
    result = await client.db("wiki-guess").collection("questions").findOne({ _id: question_id });
  } catch (error) {
    console.error(error);
  } 
  return result
}
async function randomQuestion(){
  /** Sample Question:
   * _id:45
question_uuid:"5858d9d2-5179-4ad3-993c-8c0f09cd8bc1"
article_uuid:713
title:"Android (robot)"
sent_index:71
question:"An android is a robot or other artificial being designed to resemble a..."
num_answer:400
plain_answer:400
question_topics:"{47: 0.23409678, 34: 0.17905709, 4: 0.173421}"
article_topics:"{10: 0.23318933}"
interactions:"[]" 
   */
  const NUM_QUESTIONS = 100000
  var question_id = Math.floor(Math.random()*NUM_QUESTIONS);
  return await getQuestionById(question_id)
}
/* GENERAL FUNCTIONS */
async function newQuestion(data){
  const question = await randomQuestion();
  await io.to(data.socket_id).emit('newQuestionResponse',{'question': question})
}
/**
 * Function to call when writing feedback to the database
 * @param data contains question_id,user,mode,guess,feedback 
 */
async function submitFeedback(data){
  try {
    var msec = Date.now();
    var date = new Date(msec);
    await client.db("wiki-guess").collection("questions").updateOne(
      { _id: data.question_id },
      {
        $push: {
          interactions: { 'user':data.user,
                          'date': date,
                          'mode':data.mode,
                          'guess':data.guess,
                          'feedback':data.feedback
                        } 
        }
      },
      {upsert : true}
    );
  }catch(e){
    console.log(e);
  }
}
async function submitAnswer(data){
  const question = await getQuestionById(data.question_id);
  var guess = data.guess;
  if(question.num_answer >= 10**6){ // given unit was millions
    guess = guess * 10**6;
  }
  var ratio = guess/question.num_answer;
  if(ratio <= 0){
    ratio = 10**3;
  }
  const score = Math.round(Math.max(100 - 100*Math.abs(Math.log10(ratio)),0));
  io.to(data.socket_id).emit('submitAnswerResponse',{'question': question, 'score': score})
}
// LANDING EVENTS
function hostGame(data){
  const code = generateCode()
  if(code != ""){
    var name = data.name
    if(name == ""){
      name = 'Player 1'
    }
    gameData[code] = {'code':code, // Room code
                      'scoreMode':data.score_mode,
                      'questionNumber':1, // Which question the lobby is on
                      'maxQuestions':data.question_number, // Total number of questions
                      'maxTime':data.question_time, // Maximum alloted time for each question (s)
                      'questionTimer':data.question_time, // Time remaining for current question (s)
                      'chooseTimer':8, // Time remaining to choose title (s)
                      'questionId':0, // 
                      'question':'',
                      'gamePhase':'waiting',
                      'chooser':0,
                      'players':[{'id':0, // Information displayed on the player panel
                                  'present':true,
                                  'socket_id':data.socket_id,
                                  'name':name,
                                  'score':0,
                                  'status':'Host',
                                  'guess':0,
                                  'questionScore':'',
                                  'role':'host'}
                                ]
                      };
    addToGame(data.socket_id,code,gameData[code],0)
  }else{
    console.log('Lobbies Full')
    io.to(data.socket_id).emit('joinGameResponse',{'response':'lobbies_full'})
  }
  console.log('Current Rooms: '+ Object.keys(gameData))
}
function addToGame(socket_id,code,gameState,playerId){
  if(Object.keys(connections).includes(socket_id)){
    connections[socket_id].socket.join(code)
    connections[socket_id].room = code
  }else{
    console.log('missing '+socket_id) 
    console.log('connectedIds '+Object.keys(connections))
  }
  io.to(socket_id).emit('joinGameResponse',{'response':'success','code':code,'gameState':gameState,'playerId':playerId})
  io.to(code).emit('updatePlayerState',{'gameState':gameState})
  if(Object.keys(gameData).includes(socket_id)){
    connections[socket_id].room = code
  }
}
function generateCode(){
  alphabet = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
  // console.log(data)
  // Generate random code
  var code = "";
  const MAX_TRIES = 10;
  for(var t = 0; t < MAX_TRIES; t++){
    var tempCode = "";
    for(var l = 0; l < 4; l++){
      tempCode += alphabet[Math.floor(Math.random()*26)];
    }
    if(!Object.keys(gameData).includes(tempCode)){
      code = tempCode;
      break;
    }
  }
  return code
}
function joinGame(data){
  if(Object.keys(gameData).includes(data.code)){
    var playerId = -1;
    var playerIds = [];
    var available = false
    for(var i = 0; i < gameData[data.code].players.length; i++){
      playerIds.push(gameData[data.code].players[i].id)
    }
    for(var id = 0; id < MAX_PLAYERS; id++){ // Check for an available id
      if(!playerIds.includes(id)){
        playerId = id
        break
      }
    }
    if(playerId >= 0){
      var name = data.name
      if(name == ''){ // Give Player a name with id
        name = 'Player ' + (playerId+1)
      }
      gameData[data.code].players.push({
                                          'id':playerId, // Information displayed on the player panel
                                          'present':true,
                                          'socket_id':data.socket_id,
                                          'name':name,
                                          'score':0,
                                          'status':'...',
                                          'guess':0,
                                          'questionScore':'',
                                          'role':'player'
                                        })
      addToGame(data.socket_id,data.code,gameData[data.code],playerId)
    }else{
      io.to(data.socket_id).emit('joinGameResponse',{'response':'lobby_full'})
    }
  }else{
    io.to(data.socket_id).emit('joinGameResponse',{'response':'invalid_code'})
  }
}
// DEBUG MODE

// ROUTING
/**
 * Do server-side tasks that must be done when a new user joins (including other modes in case of refresh)
 * @param data Socket.IO json with mode, user_id 
 */
async function handleLanding(data){
  console.log(data)
  switch(data.mode){
    case 'landing':
    case 'debug':
      break;
    case 'game':
      if(Object.keys(gameData).includes(data.code)){
        for(var i = 0; i < gameData[data.code].players.length; i++){
          console.log(`Stored game_id ${gameData[data.code].players[i].socket_id} Given game_id ${data.game_socket_id} socket_id ${data.socket_id} present ${gameData[data.code].players[i].present}`)
          if(gameData[data.code].players[i].socket_id == data.game_socket_id && !gameData[data.code].players[i].present){
            gameData[data.code].players[i].present = true // Player is now present
            addToGame(data.socket_id,data.code,gameData[data.code],gameData[data.code].players[i].id) // Add player to game
            gameData[data.code].players[i].socket_id = data.socket_id // Update stored socket id to the new socket id
            console.log(`Updated stored game_id to ${gameData[data.code].players[i].socket_id}`)
          }
        }
      }else{
        console.log(`No room ${data.code}`)
      }
      break
  }
}

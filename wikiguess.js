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
  // Game Events
  gameSocket.on('startGame',startGame);
  gameSocket.on('chooseOption',chooseOption);
  // Routing
  gameSocket.on('handleLanding',handleLanding)
}
async function disconnect(){ // This isn't a great way to do this, but having trouble identifying where the disconnect event came from.
  for (let [key, value] of Object.entries(connections)) {
    if(!value.socket.connected){
      delete connections[key]
      if(value.room != 'none'){
        playerAbsent(value.room, key)
        await tieLooseEnds(value.room,key)
      }
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
  switch(data.mode){
    case 'landing':
      const question = await getQuestionById(data.question_id);
      var guess = data.guess;
      if(question.num_answer >= 10**6){ // given unit was millions
        guess = guess * 10**6;
      }
      var ratio = guess/question.num_answer;
      if(ratio <= 0){
        ratio = 10**3;
      }
      const questionScore = Math.round(Math.max(100 - 100*Math.abs(Math.log10(ratio)),0));
      io.to(data.socket_id).emit('showAnswer',{'question':question,'questionScore':questionScore})
      break
    case 'game':
      if(Object.keys(gameData).includes(data.code)){
        var player =  gameData[data.code].players[data.playerId]
        player.guess = data.guess
        gameData[data.code].players[data.playerId].status = 'Guessed' // Full for the assignment
        var res = await checkFinishedGuessing(data.code)
        console.log(res)
        if(!res){
          io.to(data.code).emit('updatePlayerState',{'gameState':gameData[data.code]}) // Only need to update the player list
        }
      }else{
        io.to(data.socket_id).emit('goLanding')
      }
      break
  }
}
async function checkFinishedGuessing(code){
  var finishedGuessing = true
  if(Object.keys(gameData).includes(code)){
    for(var i = 0; i < gameData[code].players.length; i++){ // Check if all present players have guessed
      if(gameData[code].players[i].present && gameData[code].players[i].status != 'Guessed'){
        console.log(`${gameData[code].players[i].name}, ${gameData[code].players[i].present}, ${gameData[code].players[i].status}`)
        finishedGuessing = false
      }
    }
    if(finishedGuessing){
      await advanceGamePhase(code)
      io.to(code).emit('updateGameState',{'gameState':gameData[code]})
    }
  }
  console.log(`Checked room ${code}, ${finishedGuessing}`)
  return finishedGuessing
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
                      'question':'',
                      'gamePhase':'waiting',
                      'chooser':-1,
                      'choices':[{'title':'Question 1','id':1}, {'title':'Question 2','id':2}, {'title':'Question 3','id':3}],
                      'players':[{'id':0, // Information displayed on the player panel
                                  'present':true,
                                  'socket_id':data.socket_id,
                                  'name':name,
                                  'score':0,
                                  'status':'Host',
                                  'guess':-1,
                                  'questionScore':-1,
                                  'role':'host'}
                                ]
                      };
    addToGame(data.socket_id,code,gameData[code],0)
  }else{
    console.log('Lobbies Full')
    io.to(data.socket_id).emit('joinGameResponse',{'response':'lobbies_full'})
  }
}
function addToGame(socket_id,code,gameState,playerId){
  if(Object.keys(connections).includes(socket_id)){
    connections[socket_id].socket.join(code)
    connections[socket_id].room = code
  }else{
    console.log('missing '+socket_id) 
    console.log(Object.keys(connections))
  }
  io.to(socket_id).emit('joinGameResponse',{'response':'success','code':code,'gameState':gameState,'playerId':playerId})
  io.to(code).emit('updateGameState',{'gameState':gameState})
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
    if(!playerPresent(data.code,data.socket_id,data.game_socket_id)){
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
                                            'guess':-1,
                                            'questionScore':-1,
                                            'role':'player'
                                          })
        addToGame(data.socket_id,data.code,gameData[data.code],playerId)
      }else{
        io.to(data.socket_id).emit('joinGameResponse',{'response':'lobby_full'})
      }
    }
  }else{
    io.to(data.socket_id).emit('joinGameResponse',{'response':'invalid_code'})
  }
}
// DEBUG MODE

// GAME EVENTS
async function startGame(data){
  await advanceGamePhase(data.code)
  io.to(data.code).emit('updateGameState',{'gameState':gameData[data.code]})
}
async function chooseOption(data){
  await advanceGamePhase(data.code,data.option)
  io.to(data.code).emit('updateGameState',{'gameState':gameData[data.code]})
}
async function advanceGamePhase(code,option=1){
  console.log(`code ${code}, phase ${gameData[code].gamePhase}`)
  switch(gameData[code].gamePhase){
    case 'waiting': // Also called to reset round
      for(var i = 0; i < gameData[code].players.length; i++){ // Find available chooser
        if(gameData[code].players[i].present){
          gameData[code].chooser = i
          break
        }
      }
      await populateChoices(code)
      gameData[code].gamePhase = 'choosing'
      startChooseTimer(code)
      break
    case 'choosing':
      if(gameData[code].questionNumber != 1){ // If it isn't the first question, tell the clients to submit their feedback at this point
        io.to(code).emit('submitFeedback')
      }
      gameData[code].question = await getQuestionById(gameData[code].choices[option-1].id) // Get Question
      
      // Reset guesses, questionScore, status 
      for(var i = 0; i < gameData[code].players.length; i++){
        if(gameData[code].players[i].present){
          gameData[code].players[i].status = '...'
          gameData[code].players[i].questionScore = -1
          gameData[code].players[i].guess = -1
        }
      }
      gameData[code].gamePhase = 'guessing'
      startQuestionTimer(code)
      break
    case 'guessing':
      io.to(code).emit('showAnswer',{'gameState':gameData[code]})
      gameData[code].questionNumber++
      calculateScore(code)
      if(gameData[code].questionNumber > gameData[code].maxQuestions){
        endGame(code)
        gameData[code].gamePhase = 'over'
      }else{
        gameData[code].gamePhase = 'waiting' // Go back to waiting
        await populateChoices(code)
        for(var i = 1; i <= gameData[code].players.length; i++){ // Find new chooser
          var looped_i = (gameData[code].chooser + i) % gameData[code].players.length
          if(gameData[code].players[looped_i].present){
            gameData[code].chooser = looped_i
            break
          }
        }
        gameData[code].gamePhase = 'choosing'
        startChooseTimer(code)
      }
      break
  }
}
function calculateScore(code){
  const POINT_DISTRIBUTION = [30,25,20,16,12,9,6,4,2,1]
  const answer = gameData[code].question.num_answer
  var diffs = new Array(gameData[code].players.length);
  var scores = new Array(gameData[code].players.length);
  var numPresent = 0
  for(var i = 0; i < gameData[code].players.length; i++){
    if(gameData[code].players[i].present){
      numPresent++
      var guess = gameData[code].players[i].guess;
      if(guess != -1){
        if(answer >= 10**6){ // given unit was millions
          guess *= 10**6;
        }
        console.log(`Player ${i}, guess ${guess}, answer ${answer}`)
        switch(gameData[code].scoreMode){ // Score differently based on the selected scoring mode
          case 'normal':
            ratio = guess/answer
            if(ratio <= 0){ // Watch out for strange inputs
              ratio = 100
            }
            scores[i] = Math.round(Math.max(100 - 100*Math.abs(Math.log10(ratio)),0)) // Log formula
            break
          case 'closest':
            diffs[i] = Math.abs(answer - guess)
            break
          case 'under':
            if(guess > answer){
              diffs[i] = -1
            }else{
              diffs[i] = answer - guess
            }
            break
        }
      }
    }
  }
  /* diffs -> scores
  items.sort(function(first, second) {
    return second[1] - first[1];
  });
  */
  // Write scores to gameData
  for(var i = 0; i < gameData[code].players.length; i++){
    if(gameData[code].players[i].present){
      if(gameData[code].players[i].guess != -1){
        if(answer >= 10**6){ // given unit was millions
          gameData[code].players[i].status = gameData[code].players[i].guess + 'mil'
        }else{
          gameData[code].players[i].status = gameData[code].players[i].guess
        }
        gameData[code].players[i].questionScore = scores[i]
        gameData[code].players[i].score += scores[i]
      }else{
        gameData[code].players[i].status = 'None'
        gameData[code].players[i].questionScore = 0
        gameData[code].players[i].score += 0
      }
    }
  }
}
function endGame(code){
  io.to(code).emit('gameOver',{'gameState':gameData[code]})
}
async function populateChoices(code){
  for(var i = 0; i < 3; i++){
    var question = await randomQuestion()
    gameData[code].choices[i] = {'title':question.title,'id':question._id}
  }
}
async function startQuestionTimer(code){
  io.to(code).emit('startQuestionTimer',{'maxTime':gameData[code].maxTime})
  var timer = setInterval(countItDown,1000);
  var timeLeft = gameData[code].maxTime
  // Decrement the displayed timer value on each 'tick'
  async function countItDown(){
    timeLeft -= 1
    if(Object.keys(gameData).includes(code)){
      if(gameData[code].gamePhase == 'guessing'){
        if(timeLeft == 10){
          io.to(code).emit('resyncQuestionTimer')
        }
        if(timeLeft == 0){ // Force Guess
            io.to(code).emit('forceGuess')
        }
        if(timeLeft < 0){
          clearInterval(timer);
          await advanceGamePhase(code);
          io.to(code).emit('updateGameState',{'gameState':gameData[code]})
          return;
        }
      }else{
        clearInterval(timer);
        return;
      }
    }else{
      clearInterval(timer);
      return;
    }
  }
}
async function startChooseTimer(code){
  const CHOOSE_TIME = 15
  io.to(gameData[code].players[gameData[code].chooser].socket_id).emit('startChooseTimer',{'chooseTime': CHOOSE_TIME})
  var timer = setInterval(countItDown,1000);
  var timeLeft = CHOOSE_TIME
  // Decrement the displayed timer value on each 'tick'
  async function countItDown(){
    timeLeft -= 1
    if(Object.keys(gameData).includes(code)){
      if(gameData[code].gamePhase == 'choosing'){
        if(timeLeft <= 0){ // Force Choose
          await chooseOption({'code':code,'option':Math.ceil(Math.random()*3)})
          io.to(code).emit('updateGameState',{'gameState':gameData[code]})
        }
      }else{
        clearInterval(timer);
        return;
      }
    }else{
      clearInterval(timer);
      return;
    }
  }
}
// ROUTING
/**
 * Do server-side tasks that must be done when a new user joins (including other modes in case of refresh)
 * @param data Socket.IO json with mode, user_id 
 */
async function handleLanding(data){
  console.log(data)
  switch(data.mode){
    case 'landing':
      playerAbsent(data.code,data.socket_id)
      await tieLooseEnds(data.code,data.socket_id)
      break;
    case 'debug':
      break;
    case 'game':
      var res = playerPresent(data.code,data.socket_id,data.game_socket_id)
      if(!res){
        io.to(data.socket_id).emit('goLanding')
      }
      break
  }
}
async function tieLooseEnds(code,socket_id){
  if(Object.keys(gameData).includes(code)){
    if(gameData[code].players[gameData[code].chooser].socket_id == socket_id){ // If this socket_id belongs to the current chooser..
      chooseOption({'code':code,'option':1}) // Just choose option 1
    }
  }
  await checkFinishedGuessing(code)
}
/**
 * Make former player present again. Return true if there was an existing player
 * @param {*} code game code
 * @param {*} socket_id new player socket
 * @param {*} game_socket_id Security check
 */
function playerPresent(code, socket_id, game_socket_id){
  console.log(`playerPresent(${code},${socket_id},${game_socket_id})`)
  if(Object.keys(gameData).includes(code)){
    for(var i = 0; i < gameData[code].players.length; i++){
      if(gameData[code].players[i].socket_id == game_socket_id && !gameData[code].players[i].present){
        gameData[code].players[i].present = true // Player is now present
        addToGame(socket_id,code,gameData[code],gameData[code].players[i].id) // Add player to game
        gameData[code].players[i].socket_id = socket_id // Update stored socket id to the new socket id
        return true
      }
    }
  }else{
    console.log(`No room ${code}`)
  }
  return false
}
async function playerAbsent(code, socket_id){
  console.log(`playerAbsent(${code},${socket_id})`)
  var closeGame = false
  if(Object.keys(gameData).includes(code)){
    for(var i = 0; i < gameData[code].players.length; i++){
      if(gameData[code].players[i].socket_id == socket_id && gameData[code].players[i].present){
        gameData[code].players[i].present = false
        if(gameData[code].players[i].role == 'host'){
          closeGame = true
          for(var j = 0; j < gameData[code].players.length; j++){
            if(i != j && gameData[code].players[j].present){
              gameData[code].players[j].role = 'host' // New Host
              gameData[code].players[j].status = 'Host'
              gameData[code].players[i].role = 'player'
              gameData[code].players[i].status = '...'
              closeGame = false
              break
            }
          }
        }
      }
    }
    if(!closeGame){
      io.to(code).emit('updatePlayerState',{'gameState':gameData[code]})
      console.log(`Notified the room ${code}`)
    }else{
      delete gameData[code]
      console.log(`Closed room ${code}`)
    }
  }else{
    console.log(`No room ${code} to notify`)
  }
  return closeGame
}